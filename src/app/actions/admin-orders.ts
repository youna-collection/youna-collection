"use server";

import { revalidatePath, updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { CATALOG_TAG } from "@/lib/catalog";
import { notifyOrderShipped, notifyRefund } from "@/lib/email/order-emails";
import { formatPrice } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-display";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

/** Traitement des commandes par l'admin. La base vérifie elle aussi le rôle admin. */

export type OrderActionResult = { ok: true; message?: string } | { ok: false; error: string };

function refresh(orderNumber?: number) {
  revalidatePath("/admin/commandes");
  revalidatePath("/admin");
  if (orderNumber) revalidatePath(`/admin/commandes/${orderNumber}`);
}

// Changements de statut permis (le retour en arrière corrige une erreur de clic).
const TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ["preparing", "shipped", "delivered"],
  preparing: ["paid", "shipped", "delivered"],
  shipped: ["preparing", "delivered"],
  delivered: ["shipped"],
};

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Le lien de suivi doit commencer par https://");

const statusSchema = z.object({
  orderId: z.uuid(),
  from: z.enum(["paid", "preparing", "shipped", "delivered"]),
  to: z.enum(["paid", "preparing", "shipped", "delivered"]),
  trackingNumber: z.string().trim().max(60).optional(),
  trackingUrl: httpsUrl.optional(),
  notify: z.boolean().optional(),
});

export async function setOrderStatus(input: z.input<typeof statusSchema>): Promise<OrderActionResult> {
  await requireAdmin();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  const { orderId, from, to, trackingNumber, trackingUrl, notify } = parsed.data;
  if (!TRANSITIONS[from]?.includes(to)) return { ok: false, error: "Ce changement de statut n'est pas possible." };

  const now = new Date().toISOString();
  const patch: Record<string, string | null> = { status: to };
  if (to === "shipped" || to === "delivered") {
    if (from === "paid" || from === "preparing") patch.shipped_at = now;
    if (trackingNumber !== undefined) patch.tracking_number = trackingNumber || null;
    if (trackingUrl !== undefined) patch.tracking_url = trackingUrl || null;
  }
  if (to === "delivered") patch.delivered_at = now;
  if (to === "paid" || to === "preparing") patch.shipped_at = null;
  if (to !== "delivered") patch.delivered_at = null;

  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").update(patch).eq("id", orderId).eq("status", from).select("order_number").maybeSingle();
  if (error) return { ok: false, error: "Le statut n'a pas pu être changé." };
  if (!data) return { ok: false, error: "La commande a changé entre-temps : rechargez la page." };
  // E-mail d'expédition envoyé après la réponse, pour ne pas faire attendre l'admin.
  if (notify && to === "shipped" && (from === "paid" || from === "preparing")) after(() => notifyOrderShipped(orderId));
  refresh(data.order_number as number);
  return { ok: true };
}

const trackingSchema = z.object({ orderId: z.uuid(), trackingNumber: z.string().trim().max(60), trackingUrl: httpsUrl });

export async function saveTracking(input: z.input<typeof trackingSchema>): Promise<OrderActionResult> {
  await requireAdmin();
  const parsed = trackingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ tracking_number: parsed.data.trackingNumber || null, tracking_url: parsed.data.trackingUrl || null })
    .eq("id", parsed.data.orderId)
    .select("order_number")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Le suivi n'a pas pu être enregistré." };
  refresh(data.order_number as number);
  return { ok: true, message: "Suivi enregistré." };
}

const noteSchema = z.object({ orderId: z.uuid(), body: z.string().trim().min(1).max(2000) });

export async function addOrderNote(input: z.input<typeof noteSchema>): Promise<OrderActionResult> {
  const profile = await requireAdmin();
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Écrivez une note (2000 caractères au plus)." };
  const supabase = await createClient();
  const { error } = await supabase.from("order_notes").insert({ order_id: parsed.data.orderId, body: parsed.data.body, author_id: profile.id });
  if (error) return { ok: false, error: "La note n'a pas pu être ajoutée." };
  const { data } = await supabase.from("orders").select("order_number").eq("id", parsed.data.orderId).single();
  refresh(data?.order_number as number | undefined);
  return { ok: true };
}

const refundSchema = z.object({
  orderId: z.uuid(),
  amountCents: z.number().int().min(1).max(10_000_000),
  method: z.enum(["stripe", "manual"]),
  reason: z.string().trim().max(300),
  items: z.array(z.object({ order_item_id: z.uuid(), quantity: z.number().int().min(1).max(1000) })).max(100),
});

export type RefundPayload = z.input<typeof refundSchema>;

const REFUND_ERRORS: Record<string, string> = {
  montant_invalide: "Le montant dépasse ce qui reste à rembourser.",
  quantite_trop_grande: "Vous remettez en stock plus d'articles que la commande n'en contient.",
  ligne_invalide: "Articles à remettre en stock invalides.",
};

/**
 * Rembourse une commande. Avec Stripe, la cliente est remboursée sur sa carte d'abord, puis le
 * remboursement est noté. Un nouvel essai après une erreur ne rembourse jamais deux fois :
 * la même demande renvoie le même remboursement Stripe, que la base ne note qu'une fois.
 */
export async function refundOrder(input: RefundPayload): Promise<OrderActionResult> {
  await requireAdmin();
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Vérifiez le montant et les articles." };
  const { orderId, amountCents, method, reason, items } = parsed.data;

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("order_number, total_cents, refunded_cents, stripe_payment_intent_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Commande introuvable." };
  const remaining = (order.total_cents as number) - (order.refunded_cents as number);
  if (amountCents > remaining) return { ok: false, error: `Il reste au plus ${formatPrice(remaining)} à rembourser.` };

  // Vérifie les remises en stock avant de toucher à l'argent de la cliente.
  if (items.length) {
    const [{ data: lines }, { data: previous }] = await Promise.all([
      supabase.from("order_items").select("id, quantity").eq("order_id", orderId),
      supabase.from("refunds").select("restocked").eq("order_id", orderId),
    ]);
    const left = new Map((lines ?? []).map((l) => [l.id as string, l.quantity as number]));
    for (const r of previous ?? []) {
      for (const e of r.restocked as { order_item_id: string; quantity: number }[]) left.set(e.order_item_id, (left.get(e.order_item_id) ?? 0) - e.quantity);
    }
    for (const item of items) {
      const available = left.get(item.order_item_id);
      if (available === undefined || item.quantity > available) return { ok: false, error: REFUND_ERRORS.quantite_trop_grande };
      left.set(item.order_item_id, available - item.quantity);
    }
  }

  let stripeRefundId: string | null = null;
  if (method === "stripe") {
    if (!order.stripe_payment_intent_id) return { ok: false, error: "Cette commande n'a pas été payée par Stripe : choisissez « rendu en main propre »." };
    if (!isStripeConfigured) return { ok: false, error: "Stripe n'est pas configuré." };
    try {
      const refund = await getStripe().refunds.create(
        {
          payment_intent: order.stripe_payment_intent_id as string,
          amount: amountCents,
          reason: "requested_by_customer",
          metadata: { order_number: String(order.order_number) },
        },
        { idempotencyKey: `refund-${orderId}-${order.refunded_cents}-${amountCents}` },
      );
      if (refund.status === "failed" || refund.status === "canceled") {
        return { ok: false, error: "Stripe a refusé le remboursement. Vérifiez dans votre tableau de bord Stripe." };
      }
      stripeRefundId = refund.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      console.error("Remboursement Stripe", order.order_number, message);
      return {
        ok: false,
        error: /already been refunded|exceeds/i.test(message)
          ? "Stripe indique que ce paiement est déjà remboursé (en tout ou en partie)."
          : "Stripe n'a pas pu faire le remboursement. Réessayez dans un instant.",
      };
    }
  }

  const { data: refundId, error } = await supabase.rpc("record_refund", {
    p_order_id: orderId,
    p_amount_cents: amountCents,
    p_items: items,
    p_reason: reason || null,
    p_stripe_refund_id: stripeRefundId,
  });
  if (error) {
    const code = Object.keys(REFUND_ERRORS).find((k) => error.message.includes(k));
    console.error("Enregistrement du remboursement", order.order_number, error.message);
    return {
      ok: false,
      error:
        stripeRefundId != null
          ? "La cliente a bien été remboursée par Stripe, mais l'enregistrement a échoué : appuyez de nouveau sur « Rembourser » (elle ne sera pas remboursée deux fois)."
          : code
            ? REFUND_ERRORS[code]
            : "Le remboursement n'a pas pu être enregistré.",
    };
  }

  if (typeof refundId === "string") after(() => notifyRefund(orderId, { id: refundId, amount_cents: amountCents, method }));
  if (items.length) updateTag(CATALOG_TAG);
  revalidatePath("/admin/stock");
  refresh(order.order_number as number);
  return { ok: true, message: `${formatPrice(amountCents)} remboursés.` };
}

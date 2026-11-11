"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { CATALOG_TAG } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";

/** Stock et ventes en boutique. La base vérifie elle aussi le rôle admin et refuse tout stock négatif. */

export type StockResult = { ok: true; stock: number } | { ok: false; error: string };
export type SaleResult = { ok: true; orderNumber: number } | { ok: false; error: string };

function refresh() {
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/stock");
  revalidatePath("/admin/produits");
}

const adjustSchema = z.object({
  variantId: z.uuid(),
  delta: z.number().int().min(-10000).max(10000).refine((d) => d !== 0),
  reason: z.enum(["manual", "return"]),
  note: z.string().trim().max(200).optional(),
});

/** Ajoute (ou retire) des pièces au stock d'une variante. */
export async function adjustStock(input: z.input<typeof adjustSchema>): Promise<StockResult> {
  await requireAdmin();
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Quantité invalide." };
  const { variantId, delta, reason, note } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_stock", {
    p_variant_id: variantId,
    p_delta: delta,
    p_reason: reason,
    p_note: note || null,
  });
  if (error) {
    return { ok: false, error: error.message.includes("stock_negatif") ? "Le stock ne peut pas devenir négatif." : "Le stock n'a pas pu être modifié." };
  }
  refresh();
  return { ok: true, stock: data as number };
}

const saleSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.uuid(),
        quantity: z.number().int().min(1).max(100),
        unitPriceCents: z.number().int().min(0).max(1_000_000),
        components: z.array(z.uuid()).max(20).default([]),
      }),
    )
    .min(1)
    .max(50),
  paymentMethod: z.enum(["especes", "carte", "virement", "autre"]),
  discountCents: z.number().int().min(0).max(1_000_000),
  customerName: z.string().trim().max(120),
  email: z.union([z.literal(""), z.email().max(254)]),
  soldAt: z.iso.datetime({ offset: true }).nullable(),
});

export type SalePayload = z.input<typeof saleSchema>;

export async function recordInPersonSale(input: SalePayload): Promise<SaleResult> {
  await requireAdmin();
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, error: field === "email" ? "L'adresse e-mail n'est pas valide." : "Vérifiez les articles et les montants." };
  }
  const sale = parsed.data;
  const soldAt = sale.soldAt ? new Date(sale.soldAt) : new Date();
  if (soldAt.getTime() > Date.now() + 5 * 60_000) return { ok: false, error: "La date de la vente ne peut pas être dans le futur." };

  const supabase = await createClient();
  const { data: orderId, error } = await supabase.rpc("record_in_person_sale", {
    p_items: sale.items.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      components: item.components,
    })),
    p_payment_method: sale.paymentMethod,
    p_email: sale.email || null,
    p_customer_name: sale.customerName || null,
    p_discount_cents: sale.discountCents,
    p_sold_at: soldAt.toISOString(),
  });

  if (error || !orderId) {
    const message = error?.message ?? "";
    if (message.includes("stock_insuffisant")) {
      const { data: variant } = await supabase
        .from("product_variants")
        .select("color_name, size, available, product:products ( name )")
        .eq("id", error?.details ?? "")
        .maybeSingle();
      const v = variant as unknown as { color_name: string | null; size: string | null; available: number; product: { name: string } | null } | null;
      const label = v ? [v.product?.name, v.color_name, v.size].filter(Boolean).join(" · ") : "un article";
      return {
        ok: false,
        error: `Pas assez de stock pour ${label}${v ? ` (${Math.max(v.available, 0)} disponible${v.available > 1 ? "s" : ""})` : ""}. Corrigez d'abord le stock si besoin.`,
      };
    }
    if (message.includes("remise_invalide")) return { ok: false, error: "La remise est plus grande que le total." };
    return { ok: false, error: "La vente n'a pas pu être enregistrée." };
  }

  const { data: order } = await supabase.from("orders").select("order_number").eq("id", orderId).single();
  refresh();
  revalidatePath("/admin/ventes");
  return { ok: true, orderNumber: (order?.order_number as number) ?? 0 };
}

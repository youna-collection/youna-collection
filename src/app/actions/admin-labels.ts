"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { cancelShipment, createShipment, findShippingOption, isSendcloudConfigured, SendcloudError } from "@/lib/sendcloud";
import { deliveryFor, labelWeightKg, missingForLabel, recipient } from "@/lib/sendcloud-rules";
import { createAdminClient } from "@/lib/supabase/admin";

/** Étiquettes Sendcloud depuis la fiche d'une commande (admin seulement). */

export type LabelResult = { ok: true; message: string } | { ok: false; error: string };

const input = z.object({ orderId: z.uuid() });

function refresh(orderNumber: number) {
  revalidatePath("/admin/commandes");
  revalidatePath(`/admin/commandes/${orderNumber}`);
}

const sendcloudMessage = (error: unknown) =>
  error instanceof SendcloudError
    ? error.status === 401 || error.status === 403
      ? "Sendcloud refuse la connexion : vérifiez les clés dans .env.local."
      : `Sendcloud : ${error.message}`
    : "Sendcloud ne répond pas. Réessayez dans un instant.";

export async function createLabel(raw: z.input<typeof input>): Promise<LabelResult> {
  await requireAdmin();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  if (!isSendcloudConfigured) return { ok: false, error: "Sendcloud n'est pas configuré (clés manquantes dans .env.local)." };

  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select(
      "id, order_number, source, status, email, carrier, shipping_address, relay_point, total_cents, sendcloud_shipment_id, items:order_items ( quantity, variant:product_variants ( weight_grams ) )",
    )
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Commande introuvable." };
  if (order.source !== "web") return { ok: false, error: "Les étiquettes se créent seulement pour les commandes du site." };
  if (!["paid", "preparing"].includes(order.status)) return { ok: false, error: "Cette commande n'est plus à envoyer." };
  if (order.sendcloud_shipment_id) return { ok: false, error: "Cette commande a déjà une étiquette." };

  const relay = order.relay_point as Record<string, string> | null;
  const delivery = deliveryFor(order.carrier, relay ? { shop_type: relay.shop_type ?? "servicepoint" } : null);
  if (!delivery) return { ok: false, error: "Pas d'étiquette pour ce mode de livraison (retrait sur place)." };
  const to = recipient({ email: order.email, shipping_address: order.shipping_address, relay_point: relay });
  const missing = missingForLabel(to);
  if (missing.length) return { ok: false, error: `Il manque dans la commande : ${missing.join(", ")}.` };
  const items = (order.items as unknown as { quantity: number; variant: { weight_grams: number } | null }[]).map((i) => ({
    quantity: i.quantity,
    weightGrams: i.variant?.weight_grams ?? 0,
  }));
  const weightKg = labelWeightKg(items);

  // Réserve la commande : un double clic ne crée pas deux étiquettes payantes.
  const { data: claimed } = await db
    .from("orders")
    .update({ label_requested_at: new Date().toISOString() })
    .eq("id", order.id)
    .is("sendcloud_shipment_id", null)
    .or(`label_requested_at.is.null,label_requested_at.lt."${new Date(Date.now() - 2 * 60_000).toISOString()}"`)
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "Une étiquette est déjà en cours de création : rechargez la page dans un instant." };

  try {
    const servicePointId = relay && delivery.carrier === "mondial_relay" ? relay.id : null;
    if (servicePointId && !/^\d+$/.test(servicePointId)) {
      throw new SendcloudError("ce point relais a été choisi avec l'ancienne carte : créez l'étiquette directement dans Sendcloud.", 0);
    }
    const option = await findShippingOption({ delivery, to, servicePointId, weightKg });
    if (!option) throw new SendcloudError("aucune offre disponible pour ce colis. Vérifiez que le transporteur est activé dans Sendcloud.", 0);
    const shipment = await createShipment({ orderNumber: order.order_number, optionCode: option.code, to, servicePointId, weightKg, totalCents: order.total_cents });
    await db
      .from("orders")
      .update({
        sendcloud_shipment_id: shipment.shipmentId,
        sendcloud_parcel_id: shipment.parcelId,
        shipping_option_code: option.code,
        tracking_number: shipment.trackingNumber,
        tracking_url: shipment.trackingUrl,
      })
      .eq("id", order.id);
    refresh(order.order_number);
    return { ok: true, message: `Étiquette créée (${option.name}).` };
  } catch (error) {
    await db.from("orders").update({ label_requested_at: null }).eq("id", order.id).is("sendcloud_shipment_id", null);
    refresh(order.order_number);
    return { ok: false, error: sendcloudMessage(error) };
  }
}

export async function cancelLabel(raw: z.input<typeof input>): Promise<LabelResult> {
  await requireAdmin();
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };

  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, status, sendcloud_shipment_id, tracking_number")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (!order?.sendcloud_shipment_id) return { ok: false, error: "Cette commande n'a pas d'étiquette." };
  if (!["paid", "preparing"].includes(order.status)) {
    return { ok: false, error: "Le colis est déjà marqué expédié : l'étiquette ne peut plus être annulée ici. Voyez avec Sendcloud." };
  }

  try {
    const result = await cancelShipment(order.sendcloud_shipment_id);
    await db
      .from("orders")
      .update({ sendcloud_shipment_id: null, sendcloud_parcel_id: null, shipping_option_code: null, label_requested_at: null, tracking_number: null, tracking_url: null })
      .eq("id", order.id);
    refresh(order.order_number);
    return {
      ok: true,
      message: result === "queued" ? "Annulation demandée : Sendcloud la confirmera sous peu." : "Étiquette annulée. Ne déposez pas l'ancien colis.",
    };
  } catch (error) {
    return { ok: false, error: sendcloudMessage(error) };
  }
}

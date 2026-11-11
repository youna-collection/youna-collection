import "server-only";
import { createAdminClient } from "../supabase/admin";
import { sendEmail, shopEmail } from "./send";
import { adminNewOrderEmail, adminSoldOutEmail, type EmailOrder, orderConfirmationEmail, orderRefundedEmail, orderShippedEmail } from "./templates";

/**
 * E-mails liés aux commandes. Chaque fonction peut être appelée plusieurs fois sans risque
 * (clé unique par e-mail) et n'échoue jamais : une commande ne doit pas dépendre d'un e-mail.
 */

const ORDER_SELECT = `id, order_number, email, user_id, source, carrier, subtotal_cents, discount_cents, shipping_cents, total_cents,
  promo_code, shipping_address, relay_point, tracking_number, tracking_url,
  items:order_items ( variant_id, product_name, variant_label, quantity, line_total_cents, components:order_item_components ( label, variant_id ) )`;

type LoadedOrder = Omit<EmailOrder, "items"> & {
  source: string;
  items: (Omit<EmailOrder["items"][number], "components"> & { variant_id: string | null; components: { label: string; variant_id: string | null }[] })[];
};

async function loadOrder(orderId: string): Promise<LoadedOrder | null> {
  const { data } = await createAdminClient().from("orders").select(ORDER_SELECT).eq("id", orderId).maybeSingle();
  return (data as unknown as LoadedOrder | null) ?? null;
}

async function safely(label: string, task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    console.error(`E-mails (${label})`, error instanceof Error ? error.message : error);
  }
}

/** Commande payée en ligne : confirmation à la cliente, alerte à la boutique, alerte de rupture. */
export async function notifyOrderPaid(orderId: string): Promise<void> {
  await safely("commande payée", async () => {
    const order = await loadOrder(orderId);
    if (!order || order.source !== "web" || !order.email) return;

    const confirmation = orderConfirmationEmail(order);
    await sendEmail({ kind: "order_confirmation", dedupeKey: `commande-confirmee:${order.id}`, to: order.email, orderId: order.id, ...confirmation });

    const shop = shopEmail();
    if (!shop) return;
    await sendEmail({ kind: "admin_new_order", dedupeKey: `alerte-commande:${order.id}`, to: shop, orderId: order.id, ...adminNewOrderEmail(order) });

    const ids = [...new Set(order.items.flatMap((i) => [i.variant_id, ...i.components.map((c) => c.variant_id)]).filter((id): id is string => Boolean(id)))];
    if (!ids.length) return;
    const { data: soldOut } = await createAdminClient()
      .from("product_variants")
      .select("color_name, size, product:products ( name )")
      .in("id", ids)
      .eq("track_stock", true)
      .lte("stock", 0);
    const labels = ((soldOut ?? []) as unknown as { color_name: string | null; size: string | null; product: { name: string } | null }[]).map((v) => ({
      label: [v.product?.name, v.color_name, v.size].filter(Boolean).join(" — "),
    }));
    if (labels.length) {
      await sendEmail({ kind: "admin_sold_out", dedupeKey: `alerte-epuise:${order.id}`, to: shop, orderId: order.id, ...adminSoldOutEmail(labels) });
    }
  });
}

/** Commande expédiée (ou prête pour un retrait) : un seul e-mail par commande. */
export async function notifyOrderShipped(orderId: string): Promise<void> {
  await safely("expédition", async () => {
    const order = await loadOrder(orderId);
    if (!order || order.source !== "web" || !order.email) return;
    await sendEmail({ kind: "order_shipped", dedupeKey: `commande-expediee:${order.id}`, to: order.email, orderId: order.id, ...orderShippedEmail(order) });
  });
}

/** Remboursement enregistré : un e-mail par remboursement. */
export async function notifyRefund(orderId: string, refund: { id: string; amount_cents: number; method: "stripe" | "manual" }): Promise<void> {
  await safely("remboursement", async () => {
    const order = await loadOrder(orderId);
    if (!order || order.source !== "web" || !order.email) return;
    await sendEmail({
      kind: "order_refunded",
      dedupeKey: `remboursement:${refund.id}`,
      to: order.email,
      orderId: order.id,
      ...orderRefundedEmail(order, refund),
    });
  });
}

import "server-only";
import type { OrderStatus } from "../order-display";
import { createClient } from "../supabase/server";

/** Lectures des commandes pour l'admin (sa session : les règles RLS lui montrent tout). */

export type OrderSource = "web" | "in_person" | "shopify_import";

export const SOURCE_LABELS: Record<OrderSource, string> = {
  web: "En ligne",
  in_person: "En boutique",
  shopify_import: "Shopify",
};

export const ORDER_FILTERS = [
  { value: "a-traiter", label: "À préparer", statuses: ["paid"] },
  { value: "preparation", label: "En préparation", statuses: ["preparing"] },
  { value: "expediees", label: "Expédiées", statuses: ["shipped"] },
  { value: "livrees", label: "Livrées", statuses: ["delivered"] },
  { value: "annulees", label: "Annulées / remboursées", statuses: ["cancelled", "refunded"] },
  { value: "toutes", label: "Toutes", statuses: [] },
] as const satisfies readonly { value: string; label: string; statuses: readonly OrderStatus[] }[];

export type OrderFilter = (typeof ORDER_FILTERS)[number]["value"];

type Address = Record<string, string> | null;

/** Nom de la cliente tel qu'indiqué dans la commande. */
export function customerName(address: Address): string | null {
  if (!address) return null;
  return [address.first_name, address.last_name].filter(Boolean).join(" ") || address.name || null;
}

export type AdminOrderRow = {
  id: string;
  order_number: number;
  created_at: string;
  status: OrderStatus;
  source: OrderSource;
  email: string | null;
  total_cents: number;
  refunded_cents: number;
  carrier: string | null;
  shipping_address: Address;
  item_count: number;
};

const PAGE_SIZE = 40;

export async function listAdminOrders(options: { filter: OrderFilter; q: string; source: string; page: number }) {
  const supabase = await createClient();
  const statuses = ORDER_FILTERS.find((f) => f.value === options.filter)?.statuses ?? [];
  let query = supabase
    .from("orders")
    .select("id, order_number, created_at, status, source, email, total_cents, refunded_cents, carrier, shipping_address, items:order_items ( quantity )", {
      count: "exact",
    })
    .order("created_at", { ascending: options.filter === "a-traiter" || options.filter === "preparation" })
    .range((options.page - 1) * PAGE_SIZE, options.page * PAGE_SIZE - 1);
  if (statuses.length) query = query.in("status", statuses);
  if (options.source === "web" || options.source === "in_person" || options.source === "shopify_import") query = query.eq("source", options.source);

  const q = options.q.trim();
  if (/^\d{1,9}$/.test(q)) {
    query = query.eq("order_number", Number(q));
  } else if (q) {
    // Recherche dans l'e-mail ou le nom (les caractères spéciaux de la syntaxe PostgREST sont retirés).
    const safe = q.replace(/[^\p{L}\p{N}@.\-' ]/gu, "").slice(0, 60);
    if (safe) {
      query = query.or(
        `email.ilike.%${safe}%,shipping_address->>last_name.ilike.%${safe}%,shipping_address->>first_name.ilike.%${safe}%,shipping_address->>name.ilike.%${safe}%`,
      );
    }
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Commandes : ${error.message}`);
  const orders = (data as unknown as (Omit<AdminOrderRow, "item_count"> & { items: { quantity: number }[] })[]).map(({ items, ...o }) => ({
    ...o,
    item_count: items.reduce((sum, i) => sum + i.quantity, 0),
  }));
  return { orders, total: count ?? 0, pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)) };
}

/** Nombre de commandes par statut, pour les onglets. */
export async function countOrdersByStatus(): Promise<Partial<Record<OrderStatus, number>>> {
  const supabase = await createClient();
  const statuses: OrderStatus[] = ["paid", "preparing", "shipped"];
  const counts = await Promise.all(
    statuses.map((status) => supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", status)),
  );
  return Object.fromEntries(statuses.map((s, i) => [s, counts[i].count ?? 0]));
}

export type AdminOrderItem = {
  id: string;
  variant_id: string | null;
  product_name: string;
  variant_label: string | null;
  sku: string | null;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
  components: { label: string; variant_id: string | null }[];
};

export type AdminOrder = AdminOrderRow & {
  user_id: string | null;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  promo_code: string | null;
  shipping_method_code: string | null;
  relay_point: Record<string, string> | null;
  billing_address: Address;
  tracking_number: string | null;
  tracking_url: string | null;
  stripe_payment_intent_id: string | null;
  payment_method: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  items: AdminOrderItem[];
  notes: { id: string; body: string; created_at: string }[];
  history: { id: string; from_status: OrderStatus | null; to_status: OrderStatus; changed_at: string }[];
  refunds: {
    id: string;
    amount_cents: number;
    method: "stripe" | "manual";
    reason: string | null;
    restocked: { order_item_id: string; quantity: number }[];
    credit_note_id: string | null;
    created_at: string;
  }[];
  invoices: { id: string; kind: "invoice" | "credit_note"; number: number; issued_at: string }[];
};

export async function getAdminOrder(orderNumber: number): Promise<AdminOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, created_at, status, source, email, user_id, subtotal_cents, discount_cents, shipping_cents, total_cents,
       refunded_cents, promo_code, shipping_method_code, carrier, shipping_address, billing_address, relay_point,
       tracking_number, tracking_url, stripe_payment_intent_id, payment_method, paid_at, shipped_at, delivered_at, cancelled_at,
       items:order_items ( id, variant_id, product_name, variant_label, sku, unit_price_cents, quantity, line_total_cents,
                           components:order_item_components ( label, variant_id ) ),
       notes:order_notes ( id, body, created_at ),
       history:order_status_history ( id, from_status, to_status, changed_at ),
       refunds ( id, amount_cents, method, reason, restocked, credit_note_id, created_at ),
       invoices ( id, kind, number, issued_at )`,
    )
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw new Error(`Commande : ${error.message}`);
  if (!data) return null;
  const order = data as unknown as Omit<AdminOrder, "item_count">;
  const byDate = <T extends { created_at?: string; changed_at?: string; issued_at?: string }>(a: T, b: T) =>
    (a.created_at ?? a.changed_at ?? a.issued_at ?? "").localeCompare(b.created_at ?? b.changed_at ?? b.issued_at ?? "");
  return {
    ...order,
    item_count: order.items.reduce((sum, i) => sum + i.quantity, 0),
    notes: [...order.notes].sort(byDate),
    history: [...order.history].sort(byDate),
    refunds: [...order.refunds].sort(byDate),
    invoices: [...order.invoices].sort((a, b) => a.number - b.number),
  };
}

export type ShopSettings = {
  legal_name: string | null;
  trade_name: string | null;
  legal_form: string | null;
  siret: string | null;
  vat_number: string | null;
  vat_mention: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  invoice_footer: string | null;
  maintenance_enabled: boolean;
  maintenance_title: string | null;
  maintenance_message: string | null;
  cart_reminders_enabled: boolean;
  cart_reminder_second: boolean;
  instagram_url: string | null;
  tiktok_url: string | null;
  snapchat_url: string | null;
  mediator_name: string | null;
  mediator_url: string | null;
};

export async function getShopSettings(): Promise<ShopSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shop_settings")
    .select(
      "legal_name, trade_name, legal_form, siret, vat_number, vat_mention, address_line1, address_line2, postal_code, city, country, email, phone, invoice_footer, maintenance_enabled, maintenance_title, maintenance_message, cart_reminders_enabled, cart_reminder_second, instagram_url, tiktok_url, snapchat_url, mediator_name, mediator_url",
    )
    .eq("id", 1)
    .maybeSingle<ShopSettings>();
  return data;
}

export const sellerComplete = (s: ShopSettings | null) => Boolean(s?.legal_name && s.siret && s.address_line1 && s.postal_code && s.city);

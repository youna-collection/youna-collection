import "server-only";
import type { OrderStatus } from "./order-display";
import { createClient } from "./supabase/server";

/** Toutes ces lectures passent par la session de la cliente : les règles RLS ne lui montrent que ses données. */

export type OrderSummary = {
  id: string;
  order_number: number;
  status: OrderStatus;
  total_cents: number;
  created_at: string;
  item_count: number;
};

export async function getMyOrders(limit?: number): Promise<OrderSummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("id, order_number, status, total_cents, created_at, items:order_items ( quantity )")
    .order("created_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(`Commandes : ${error.message}`);
  return (data as unknown as (Omit<OrderSummary, "item_count"> & { items: { quantity: number }[] })[]).map(({ items, ...order }) => ({
    ...order,
    item_count: items.reduce((total, item) => total + item.quantity, 0),
  }));
}

export type OrderDetail = {
  id: string;
  order_number: number;
  status: OrderStatus;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  total_cents: number;
  refunded_cents: number;
  source: "web" | "in_person" | "shopify_import";
  carrier: string | null;
  shipping_address: Record<string, string> | null;
  relay_point: Record<string, string> | null;
  tracking_number: string | null;
  tracking_url: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  items: {
    id: string;
    product_name: string;
    variant_label: string | null;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
    components: { label: string }[];
  }[];
  invoices: { id: string; kind: "invoice" | "credit_note"; number: number }[];
};

export async function getMyOrder(orderNumber: number): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, status, subtotal_cents, discount_cents, shipping_cents, total_cents, refunded_cents,
       source, carrier, shipping_address, relay_point, tracking_number, tracking_url, created_at, paid_at, shipped_at, delivered_at,
       items:order_items ( id, product_name, variant_label, quantity, unit_price_cents, line_total_cents,
                           components:order_item_components ( label ) ),
       invoices ( id, kind, number )`,
    )
    .eq("order_number", orderNumber)
    .maybeSingle<OrderDetail>();
  if (error) throw new Error(`Commande : ${error.message}`);
  return data;
}

export type Address = {
  id: string;
  label: string | null;
  first_name: string;
  last_name: string;
  line1: string;
  line2: string | null;
  postal_code: string;
  city: string;
  country: string;
  phone: string | null;
  is_default: boolean;
};

export async function getMyAddresses(): Promise<Address[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("addresses")
    .select("id, label, first_name, last_name, line1, line2, postal_code, city, country, phone, is_default")
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) throw new Error(`Adresses : ${error.message}`);
  return (data as Address[]).map((address) => ({ ...address, country: address.country.trim() }));
}

export async function getMyFavoriteIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("favorites").select("product_id").order("created_at", { ascending: false });
  if (error) throw new Error(`Favoris : ${error.message}`);
  return new Set(data.map((row) => row.product_id as string));
}

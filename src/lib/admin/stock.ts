import "server-only";
import { createClient } from "../supabase/server";

/** Historique du stock et ventes en boutique, lus avec la session de l'admin. */

export const STOCK_REASON_LABELS: Record<string, string> = {
  initial: "Création",
  manual: "Ajustement",
  order: "Commande en ligne",
  cancellation: "Annulation",
  return: "Retour",
  in_person_sale: "Vente en boutique",
  import: "Import Shopify",
};

export const PAYMENT_LABELS: Record<string, string> = {
  especes: "Espèces",
  carte: "Carte",
  virement: "Virement",
  autre: "Autre",
};

/** « Liquid Jersey · Noir · S » */
export function variantName(productName: string, variant: { color_name: string | null; size: string | null }) {
  return [productName, variant.color_name, variant.size].filter(Boolean).join(" · ");
}

export type StockMovement = {
  id: string;
  delta: number;
  stock_after: number;
  reason: string;
  note: string | null;
  created_at: string;
  variant_id: string;
  label: string;
  order_number: number | null;
};

type MovementRow = {
  id: string;
  delta: number;
  stock_after: number;
  reason: string;
  note: string | null;
  created_at: string;
  variant_id: string;
  variant: { color_name: string | null; size: string | null; product: { name: string } | null } | null;
  order: { order_number: number } | null;
};

export async function listStockMovements(variantId?: string, limit = 200): Promise<StockMovement[]> {
  const supabase = await createClient();
  let query = supabase
    .from("stock_movements")
    .select(
      `id, delta, stock_after, reason, note, created_at, variant_id,
       variant:product_variants ( color_name, size, product:products ( name ) ),
       order:orders ( order_number )`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (variantId) query = query.eq("variant_id", variantId);
  const { data, error } = await query;
  if (error) throw new Error(`Historique du stock : ${error.message}`);
  return (data as unknown as MovementRow[]).map(({ variant, order, ...row }) => ({
    ...row,
    label: variant ? variantName(variant.product?.name ?? "Produit supprimé", variant) : "Variante supprimée",
    order_number: order?.order_number ?? null,
  }));
}

export type InPersonSale = {
  id: string;
  order_number: number;
  created_at: string;
  total_cents: number;
  discount_cents: number;
  payment_method: string | null;
  email: string | null;
  customer_name: string | null;
  items: { product_name: string; variant_label: string | null; quantity: number; line_total_cents: number }[];
};

type SaleRow = Omit<InPersonSale, "customer_name"> & { shipping_address: { name?: string } | null };

export async function listInPersonSales(limit = 30): Promise<InPersonSale[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, order_number, created_at, total_cents, discount_cents, payment_method, email, shipping_address,
       items:order_items ( product_name, variant_label, quantity, line_total_cents )`,
    )
    .eq("source", "in_person")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Ventes en boutique : ${error.message}`);
  return (data as unknown as SaleRow[]).map(({ shipping_address, ...row }) => ({
    ...row,
    customer_name: shipping_address?.name ?? null,
  }));
}

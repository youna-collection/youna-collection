import { getCurrentProfile } from "@/lib/auth";
import { renderPackingSlips, type PackingOrder } from "@/lib/pdf/documents";
import { pdfResponse } from "@/lib/pdf/invoice-loader";
import { createClient } from "@/lib/supabase/server";

/**
 * Bons de préparation en PDF : ?n=2001 (une commande), ?n=2001,2002, ou ?a=preparer
 * (toutes les commandes payées pas encore expédiées, de la plus ancienne à la plus récente).
 */
export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return new Response("Introuvable.", { status: 404 });

  const url = new URL(request.url);
  const numbers = (url.searchParams.get("n") ?? "")
    .split(",")
    .filter((n) => /^\d{1,9}$/.test(n))
    .slice(0, 100)
    .map(Number);
  const toPrepare = url.searchParams.get("a") === "preparer";
  if (!numbers.length && !toPrepare) return new Response("Aucune commande demandée.", { status: 400 });

  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select(
      `order_number, created_at, email, carrier, shipping_method_code, shipping_address, relay_point,
       items:order_items ( product_name, variant_label, sku, quantity, components:order_item_components ( label ) )`,
    )
    .order("created_at")
    .limit(100);
  query = toPrepare ? query.in("status", ["paid", "preparing"]).neq("source", "in_person") : query.in("order_number", numbers);
  const { data, error } = await query;
  if (error) return new Response("Erreur de lecture des commandes.", { status: 500 });
  if (!data?.length) return new Response("Aucune commande à préparer.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const bytes = await renderPackingSlips(data as unknown as PackingOrder[]);
  const name = data.length === 1 ? `Bon-${data[0].order_number}.pdf` : `Bons-de-preparation-${new Date().toISOString().slice(0, 10)}.pdf`;
  return pdfResponse(bytes, name);
}

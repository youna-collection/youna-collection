import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Facture d'une commande : émise à la première demande (numéro suivant), puis toujours la même.
 * En POST (formulaire) pour qu'un simple lien ou un aperçu ne crée jamais de facture.
 */
export async function POST(request: Request, { params }: RouteContext<"/factures/commande/[numero]">) {
  const { numero } = await params;
  if (!/^\d{1,9}$/.test(numero)) return new Response("Commande introuvable.", { status: 404 });
  if (!(await getCurrentUser())) return new Response("Connectez-vous pour voir ce document.", { status: 401 });

  // Même site uniquement (protection contre les formulaires envoyés depuis un autre site).
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("Demande refusée.", { status: 403 });

  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("id").eq("order_number", Number(numero)).maybeSingle();
  if (!order) return new Response("Commande introuvable.", { status: 404 });

  const { data: invoiceId, error } = await supabase.rpc("issue_invoice", { p_order_id: order.id });
  if (error || !invoiceId) {
    const message = error?.message.includes("vendeur_incomplet")
      ? "La facture n'est pas encore disponible : les informations du vendeur ne sont pas complètes."
      : error?.message.includes("commande_annulee")
        ? "Cette commande a été annulée : elle n'a pas de facture."
        : error?.message.includes("commande_shopify")
          ? "Cette commande a été passée sur notre ancien site : sa facture a été envoyée par e-mail à l'époque."
          : "La facture n'a pas pu être créée. Réessayez plus tard.";
    return new Response(message, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.redirect(new URL(`/factures/${invoiceId as string}`, request.url), 303);
}

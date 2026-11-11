import "server-only";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import type Stripe from "stripe";
import { CATALOG_TAG } from "./catalog";
import { notifyOrderPaid } from "./email/order-emails";
import { createAdminClient } from "./supabase/admin";

/**
 * Transforme un paiement Stripe réussi en commande. Peut être appelé plusieurs fois
 * (webhook + page de confirmation) : la base ne crée la commande qu'une fois.
 * Renvoie l'identifiant de la commande, ou null si le paiement n'est pas (encore) encaissé.
 */
export async function fulfillSession(
  session: Stripe.Checkout.Session,
  { refreshCatalog = true }: { refreshCatalog?: boolean } = {},
): Promise<string | null> {
  const checkoutId = session.metadata?.checkout_id ?? session.client_reference_id;
  if (!checkoutId || session.payment_status !== "paid") return null;
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

  const { data, error } = await createAdminClient().rpc("fulfill_checkout", {
    p_checkout_id: checkoutId,
    p_stripe_session_id: session.id,
    p_payment_intent_id: paymentIntent,
    p_amount_total: session.amount_total ?? 0,
  });
  if (error) throw new Error(`Commande : ${error.message}`);
  // Le stock a changé : les fiches produits doivent le montrer (impossible pendant l'affichage
  // d'une page : la page de confirmation laisse ce soin au webhook, sinon le cache expire en 5 min).
  if (refreshCatalog) revalidateTag(CATALOG_TAG, "max");
  // Confirmation à la cliente et alertes à la boutique, après la réponse (une seule fois au total).
  const orderId = data as string;
  after(() => notifyOrderPaid(orderId));
  return orderId;
}

/** Remet en vente les articles d'un paiement abandonné ou expiré. */
export async function releaseSession(session: Stripe.Checkout.Session): Promise<void> {
  const checkoutId = session.metadata?.checkout_id ?? session.client_reference_id;
  if (!checkoutId) return;
  const { error } = await createAdminClient().rpc("release_checkout", { p_checkout_id: checkoutId });
  if (error) throw new Error(`Libération du stock : ${error.message}`);
}

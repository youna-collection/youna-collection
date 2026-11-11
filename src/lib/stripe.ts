import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export const isStripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

/**
 * Client Stripe, côté serveur uniquement. Une clé « live » (vrais paiements) est refusée
 * tant que STRIPE_ALLOW_LIVE=true n'a pas été ajouté volontairement, au lancement.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY doit être renseignée.");
  if (/^(sk|rk)_live_/.test(key) && process.env.STRIPE_ALLOW_LIVE !== "true") {
    throw new Error("Clé Stripe live refusée : ajouter STRIPE_ALLOW_LIVE=true au lancement.");
  }
  client ??= new Stripe(key);
  return client;
}

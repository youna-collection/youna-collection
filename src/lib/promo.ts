import { formatPrice } from "./format";

/** Calcul d'un code promo, partagé par le panier (affichage) et le serveur (montant réel). */

export type PromoType = "percent" | "fixed" | "free_shipping";
export type Promo = { code: string; type: PromoType; value: number };

export function applyPromo(promo: Promo | null, subtotalCents: number, shippingCents: number) {
  let discountCents = 0;
  let shipping = shippingCents;
  if (promo?.type === "percent") discountCents = Math.min(subtotalCents, Math.round((subtotalCents * promo.value) / 100));
  if (promo?.type === "fixed") discountCents = Math.min(subtotalCents, promo.value);
  if (promo?.type === "free_shipping") shipping = 0;
  return { discountCents, shippingCents: shipping, totalCents: subtotalCents - discountCents + shipping };
}

/** « −10 % », « −5,00 € », « Livraison offerte » */
export function promoLabel(promo: Pick<Promo, "type" | "value">): string {
  if (promo.type === "percent") return `−${promo.value} %`;
  if (promo.type === "fixed") return `−${formatPrice(promo.value)}`;
  return "Livraison offerte";
}

/** Message pour la cliente, à partir de l'erreur renvoyée par la base. */
export function promoError(message: string, detail?: string | null): string {
  if (message.includes("promo_pas_encore")) return "Ce code n'est pas encore valable.";
  if (message.includes("promo_expire")) return "Ce code a expiré.";
  if (message.includes("promo_epuise")) return "Ce code a déjà été utilisé le nombre de fois prévu.";
  if (message.includes("promo_minimum")) {
    const min = Number(detail);
    return Number.isFinite(min) && min > 0 ? `Ce code est valable dès ${formatPrice(min)} d'achat.` : "Le montant minimum n'est pas atteint.";
  }
  if (message.includes("promo_deja_utilise")) return "Vous avez déjà utilisé ce code.";
  return "Ce code n'existe pas.";
}

export const normalizePromoCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

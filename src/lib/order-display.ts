/** Libellés et suivi des commandes, communs à l'espace client et à l'admin. */

export type OrderStatus = "paid" | "preparing" | "shipped" | "delivered" | "cancelled" | "refunded";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  paid: "Payée",
  preparing: "En préparation",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
  refunded: "Remboursée",
};

/** Étapes montrées à la cliente, dans l'ordre. */
export const ORDER_STEPS: OrderStatus[] = ["paid", "preparing", "shipped", "delivered"];

export const CARRIER_LABELS: Record<string, string> = {
  mondial_relay: "Mondial Relay",
  colissimo: "Colissimo",
  pickup: "Retrait à Avenue 83",
};

/** Lien de suivi : celui saisi par l'admin, sinon celui du transporteur quand il ne dépend que du numéro. */
export function trackingLink(
  carrier: string | null,
  trackingNumber: string | null,
  trackingUrl: string | null,
  postalCode?: string | null,
): string | null {
  if (trackingUrl && /^https:\/\//.test(trackingUrl)) return trackingUrl;
  if (!trackingNumber) return null;
  if (carrier === "colissimo") return `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(trackingNumber)}`;
  // Mondial Relay demande le n° d'expédition et le code postal de livraison.
  if (carrier === "mondial_relay" && postalCode) {
    return `https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=${encodeURIComponent(trackingNumber)}&codePostal=${encodeURIComponent(postalCode)}`;
  }
  return null;
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Code postal de livraison : celui du point relais, sinon celui de l'adresse. */
export function deliveryPostalCode(relayPoint: Record<string, string> | null, address: Record<string, string> | null): string | null {
  return relayPoint?.postal_code || address?.postal_code || null;
}

export function formatDate(value: string | Date): string {
  return dateFormat.format(typeof value === "string" ? new Date(value) : value);
}

/** N° affiché d'une facture (F000012) ou d'un avoir (A000013). */
export const documentNumber = (kind: "invoice" | "credit_note", number: number) => `${kind === "invoice" ? "F" : "A"}${String(number).padStart(6, "0")}`;

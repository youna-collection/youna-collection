/** Règles du SAV, sans accès à la base : faciles à tester. */

export type TicketType = "return" | "exchange" | "complaint";
export type TicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";

export const TICKET_TYPES: TicketType[] = ["return", "exchange", "complaint"];
export const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "waiting_customer", "resolved", "closed"];

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  return: "Retour",
  exchange: "Échange",
  complaint: "Réclamation",
};

export const TICKET_TYPE_HINTS: Record<TicketType, string> = {
  return: "Renvoyer un article pour être remboursée.",
  exchange: "Changer un article contre une autre couleur ou taille.",
  complaint: "Colis abîmé, article manquant ou défectueux, autre souci.",
};

/** Libellés vus par la cliente. */
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Reçue",
  in_progress: "En cours",
  waiting_customer: "En attente de votre réponse",
  resolved: "Résolue",
  closed: "Fermée",
};

/** Libellés vus par l'admin. */
export const ADMIN_TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Nouvelle",
  in_progress: "En cours",
  waiting_customer: "En attente de la cliente",
  resolved: "Résolue",
  closed: "Fermée",
};

export const RETURN_WINDOW_DAYS = 14;
/** Sans date de livraison connue, on compte large : expédition + 7 jours d'acheminement. */
export const TRANSIT_ALLOWANCE_DAYS = 7;
export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MESSAGE_MAX = 4000;

const DAY = 24 * 60 * 60 * 1000;

type OrderDates = {
  status: string;
  shipped_at: string | null;
  delivered_at: string | null;
};

/** Dernier jour pour demander un retour ou un échange ; null si la commande n'est pas encore partie. */
export function returnDeadline(order: OrderDates): Date | null {
  if (order.delivered_at) return new Date(new Date(order.delivered_at).getTime() + RETURN_WINDOW_DAYS * DAY);
  if (order.shipped_at) return new Date(new Date(order.shipped_at).getTime() + (RETURN_WINDOW_DAYS + TRANSIT_ALLOWANCE_DAYS) * DAY);
  return null;
}

export type TypeAvailability = { type: TicketType; allowed: boolean; reason: string | null };

/** Quels types de demande la cliente peut ouvrir pour cette commande, et pourquoi pas les autres. */
export function ticketTypeAvailability(order: OrderDates, now = new Date()): TypeAvailability[] {
  const deadline = returnDeadline(order);
  let reason: string | null = null;
  if (order.status === "cancelled" || order.status === "refunded") reason = "Cette commande est annulée ou déjà remboursée.";
  else if (!deadline) reason = "Votre commande n'est pas encore expédiée.";
  else if (now > deadline) reason = `Le délai de ${RETURN_WINDOW_DAYS} jours après la livraison est dépassé.`;
  return TICKET_TYPES.map((type) =>
    type === "complaint" ? { type, allowed: true, reason: null } : { type, allowed: reason === null, reason },
  );
}

// --- Photos -------------------------------------------------------------------------------

/** Reconnaît le format d'après le contenu du fichier, pas d'après son nom. */
export function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

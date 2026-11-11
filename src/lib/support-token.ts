import { createHmac, timingSafeEqual } from "node:crypto";

// --- Lien d'accès sans compte -------------------------------------------------------------
// Jeton = n° interne de commande + date d'expiration + signature. La signature inclut l'e-mail
// de la commande : le lien ne marche que pour la personne qui a reçu l'e-mail.

export const LINK_VALIDITY_DAYS = 30;

function signature(secret: string, orderId: string, exp: number, email: string): string {
  return createHmac("sha256", secret).update(`sav-v1|${orderId}|${exp}|${email.toLowerCase()}`).digest("base64url");
}

export function signSupportToken(secret: string, orderId: string, email: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + LINK_VALIDITY_DAYS * 24 * 60 * 60;
  return `${orderId}.${exp}.${signature(secret, orderId, exp, email)}`;
}

/** Lit le jeton sans le vérifier (pour savoir quelle commande charger). */
export function parseSupportToken(token: string): { orderId: string; exp: number; sig: string } | null {
  const match = /^([0-9a-f-]{36})\.(\d{1,12})\.([A-Za-z0-9_-]{20,100})$/.exec(token);
  if (!match) return null;
  return { orderId: match[1], exp: Number(match[2]), sig: match[3] };
}

export function verifySupportToken(secret: string, token: string, order: { id: string; email: string }, now = Date.now()): boolean {
  const parsed = parseSupportToken(token);
  if (!parsed || parsed.orderId !== order.id || parsed.exp * 1000 < now) return false;
  const expected = Buffer.from(signature(secret, order.id, parsed.exp, order.email));
  const given = Buffer.from(parsed.sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

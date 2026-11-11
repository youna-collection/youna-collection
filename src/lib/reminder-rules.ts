import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Règles de la relance des paniers abandonnés (fonctions pures, testées à part).
 * - 1re relance : panier inactif depuis 24 h ;
 * - 2e relance (si activée) : 3 jours après la dernière activité, et au moins 24 h après la 1re ;
 * - jamais plus de 2 relances par panier, et rien pour un panier abandonné depuis plus de 7 jours
 *   (par exemple au premier lancement, ou si la tâche a été arrêtée un moment).
 */

const HOUR = 60 * 60 * 1000;
export const FIRST_REMINDER_AFTER_HOURS = 24;
export const SECOND_REMINDER_AFTER_HOURS = 72;
export const MIN_GAP_HOURS = 24;
export const MAX_CART_AGE_DAYS = 7;
export const MAX_REMINDERS = 2;

export type ReminderCart = {
  reminder_count: number;
  last_activity_at: string;
  last_reminder_at: string | null;
};

/** Quelle relance envoyer maintenant (1 ou 2), ou aucune. */
export function reminderStep(cart: ReminderCart, now: number, { second = true } = {}): 1 | 2 | null {
  const idle = now - new Date(cart.last_activity_at).getTime();
  if (idle > MAX_CART_AGE_DAYS * 24 * HOUR) return null;
  if (cart.reminder_count === 0) return idle >= FIRST_REMINDER_AFTER_HOURS * HOUR ? 1 : null;
  if (cart.reminder_count === 1 && second) {
    const sinceLast = cart.last_reminder_at ? now - new Date(cart.last_reminder_at).getTime() : Infinity;
    return idle >= SECOND_REMINDER_AFTER_HOURS * HOUR && sinceLast >= MIN_GAP_HOURS * HOUR ? 2 : null;
  }
  return null;
}

/** Dernière activité la plus ancienne qui peut encore donner lieu à une relance. */
export const oldestActivity = (now: number) => new Date(now - MAX_CART_AGE_DAYS * 24 * HOUR).toISOString();
/** Dernière activité la plus récente qui peut donner lieu à une relance. */
export const newestActivity = (now: number) => new Date(now - FIRST_REMINDER_AFTER_HOURS * HOUR).toISOString();

// --- Liens signés ---------------------------------------------------------------------------

const sign = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Lien de désinscription : il marche sans limite de durée (obligation légale) et ne contient
 * que l'adresse, encodée, et sa signature.
 */
export function signUnsubscribeToken(secret: string, email: string): string {
  const e = email.trim().toLowerCase();
  return `${Buffer.from(e).toString("base64url")}.${sign(secret, `desinscription-v1|${e}`)}`;
}

export function verifyUnsubscribeToken(secret: string, token: string): string | null {
  const match = /^([A-Za-z0-9_-]{1,400})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const email = Buffer.from(match[1], "base64url").toString("utf8");
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || email !== email.toLowerCase()) return null;
  return safeEqual(sign(secret, `desinscription-v1|${email}`), match[2]) ? email : null;
}

/** Lien « Reprendre mon panier » : valable 14 jours, pour ce panier seulement. */
export const RESUME_VALIDITY_DAYS = 14;

export function signResumeToken(secret: string, cartId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + RESUME_VALIDITY_DAYS * 24 * 60 * 60;
  return `${cartId}.${exp}.${sign(secret, `panier-v1|${cartId}|${exp}`)}`;
}

export function verifyResumeToken(secret: string, token: string, now = Date.now()): string | null {
  const match = /^([0-9a-f-]{36})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const [, cartId, exp, sig] = match;
  if (Number(exp) * 1000 < now) return null;
  return safeEqual(sign(secret, `panier-v1|${cartId}|${exp}`), sig) ? cartId : null;
}

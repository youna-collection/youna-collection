/** Texte par défaut de la page d'attente (utilisable aussi dans l'aperçu de l'admin, côté navigateur). */
export const MAINTENANCE_MESSAGE = "La boutique est momentanément fermée. Revenez très vite !";

/** La date de réouverture annoncée est-elle passée ? */
export function isReopenDue(reopenAt: string | null | undefined, now = Date.now()) {
  if (!reopenAt) return false;
  const at = Date.parse(reopenAt);
  return !Number.isNaN(at) && at <= now;
}

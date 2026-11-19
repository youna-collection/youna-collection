import { reopenShopIfDue } from "@/lib/shop-status";

/** Fin du compte à rebours : la page d'attente demande l'ouverture. Rien ne se passe avant l'heure réglée dans l'admin. */
export async function POST() {
  const open = await reopenShopIfDue();
  return Response.json({ open }, { headers: { "cache-control": "no-store" } });
}

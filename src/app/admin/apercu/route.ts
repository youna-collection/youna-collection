import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";

/**
 * « Voir la boutique » depuis l'admin. Ouvre un aperçu en direct, réservé à l'admin, pour qu'elle voie
 * le vrai site même quand la boutique est gelée. Les clientes, elles, reçoivent les pages en cache.
 */
export async function GET() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") redirect("/connexion?next=/admin/apercu");
  (await draftMode()).enable();
  redirect("/");
}

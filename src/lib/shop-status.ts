import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { isReopenDue } from "./maintenance-text";
import { createAdminClient } from "./supabase/admin";
import { isSupabaseConfigured } from "./supabase/env";

export { MAINTENANCE_MESSAGE } from "./maintenance-text";

export const SHOP_STATUS_TAG = "shop-status";

export type ShopStatus = { maintenance: boolean; title: string | null; message: string | null; reopen_at?: string | null };

const OPEN: ShopStatus = { maintenance: false, title: null, message: null, reopen_at: null };

/** État enregistré, lu au plus une fois par minute, et aussitôt après un changement dans l'admin. */
const readShopStatus = unstable_cache(
  async (): Promise<ShopStatus> => {
    if (!isSupabaseConfigured) return OPEN;
    const { data, error } = await createAdminClient().rpc("shop_status");
    if (error || !data) return OPEN;
    return data as ShopStatus;
  },
  ["shop-status"],
  { tags: [SHOP_STATUS_TAG], revalidate: 60 },
);

/** La boutique est-elle gelée ? Une fois l'heure de réouverture passée, elle est considérée ouverte. */
export async function getShopStatus(): Promise<ShopStatus> {
  const status = await readShopStatus();
  if (status.maintenance && isReopenDue(status.reopen_at)) return { ...status, maintenance: false };
  return status;
}

/**
 * Rouvre la boutique si l'heure annoncée est passée (appelé par la page d'attente à la fin du compte à rebours).
 * L'heure est vérifiée ici, pas dans le navigateur : appeler trop tôt ne fait rien.
 * Renvoie true si la boutique est ouverte (à l'instant ou déjà avant).
 */
export async function reopenShopIfDue(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("shop_settings")
    .update({ maintenance_enabled: false, maintenance_reopen_at: null })
    .eq("id", 1)
    .eq("maintenance_enabled", true)
    .lte("maintenance_reopen_at", new Date().toISOString())
    .select("id");
  if (error) return false;
  if (data?.length) {
    // Les pages en cache sont jetées tout de suite : la visite suivante voit la boutique ouverte.
    revalidateTag(SHOP_STATUS_TAG, { expire: 0 });
    return true;
  }
  const { data: row } = await admin.from("shop_settings").select("maintenance_enabled").eq("id", 1).maybeSingle();
  return row?.maintenance_enabled === false;
}

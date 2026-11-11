import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "./supabase/admin";
import { isSupabaseConfigured } from "./supabase/env";

export const SHOP_STATUS_TAG = "shop-status";

export type ShopStatus = { maintenance: boolean; title: string | null; message: string | null };

const OPEN: ShopStatus = { maintenance: false, title: null, message: null };

/** La boutique est-elle gelée ? Lu au plus une fois par minute, et aussitôt après un changement dans l'admin. */
export const getShopStatus = unstable_cache(
  async (): Promise<ShopStatus> => {
    if (!isSupabaseConfigured) return OPEN;
    const { data, error } = await createAdminClient().rpc("shop_status");
    if (error || !data) return OPEN;
    return data as ShopStatus;
  },
  ["shop-status"],
  { tags: [SHOP_STATUS_TAG], revalidate: 60 },
);

export const MAINTENANCE_MESSAGE = "La boutique est momentanément fermée. Revenez très vite !";

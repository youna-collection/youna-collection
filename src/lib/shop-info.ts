import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "./supabase/admin";
import { isSupabaseConfigured } from "./supabase/env";

export const SHOP_INFO_TAG = "shop-info";

/** Adresse de contact affichée tant que « E-mail affiché » n'est pas rempli dans Paramètres. */
export const DEFAULT_CONTACT_EMAIL = "Younacollection@outlook.fr";

/** Ce que le site public a le droit d'afficher (mentions légales, bas de page) : rien d'autre. */
export type ShopInfo = {
  legalName: string | null;
  tradeName: string;
  legalForm: string | null;
  siret: string | null;
  vatNumber: string | null;
  vatMention: string | null;
  address: string[];
  contactEmail: string;
  phone: string | null;
  social: { instagram: string | null; tiktok: string | null; snapchat: string | null };
  mediator: { name: string; url: string | null } | null;
};

type Row = Record<string, string | null | undefined>;

export function toShopInfo(row: Row | null): ShopInfo {
  const s = row ?? {};
  const cityLine = [s.postal_code, s.city].filter(Boolean).join(" ");
  return {
    legalName: s.legal_name ?? null,
    tradeName: s.trade_name || "Youna Collection",
    legalForm: s.legal_form ?? null,
    siret: s.siret ?? null,
    vatNumber: s.vat_number ?? null,
    vatMention: s.vat_mention ?? null,
    address: [s.address_line1, s.address_line2, cityLine, s.country].filter((l): l is string => Boolean(l)),
    contactEmail: s.email || DEFAULT_CONTACT_EMAIL,
    phone: s.phone ?? null,
    social: { instagram: s.instagram_url ?? null, tiktok: s.tiktok_url ?? null, snapchat: s.snapchat_url ?? null },
    mediator: s.mediator_name ? { name: s.mediator_name, url: s.mediator_url ?? null } : null,
  };
}

/** Lu au plus une fois par heure, et aussitôt après un enregistrement dans Paramètres. */
export const getShopInfo = unstable_cache(
  async (): Promise<ShopInfo> => {
    if (!isSupabaseConfigured) return toShopInfo(null);
    const { data } = await createAdminClient().from("shop_settings").select("*").eq("id", 1).maybeSingle<Row>();
    return toShopInfo(data);
  },
  ["shop-info"],
  { tags: [SHOP_INFO_TAG], revalidate: 3600 },
);

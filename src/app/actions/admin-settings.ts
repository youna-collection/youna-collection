"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { SHOP_INFO_TAG } from "@/lib/shop-info";
import { SHOP_STATUS_TAG } from "@/lib/shop-status";
import { normalizeSocialLink, SOCIAL_NETWORKS } from "@/lib/social";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { status: "idle" | "success" | "error"; message?: string };

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const schema = z.object({
  legal_name: text(120),
  trade_name: text(120),
  legal_form: text(120),
  siret: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || /^\d{14}$/.test(v), "Le SIRET compte 14 chiffres.")
    .transform((v) => v || null),
  vat_number: text(30),
  vat_mention: text(200),
  address_line1: text(120),
  address_line2: text(120),
  postal_code: text(12),
  city: text(80),
  country: text(60),
  email: z.union([z.literal(""), z.email("Adresse e-mail invalide.").max(254)]).transform((v) => v || null),
  phone: text(30),
  invoice_footer: text(500),
});

export async function saveShopSettings(_: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries([...formData.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""])));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_settings")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { status: "error", message: "Les paramètres n'ont pas pu être enregistrés." };
  updateTag(SHOP_INFO_TAG);
  revalidatePath("/admin/parametres");
  return { status: "success", message: "Enregistré. Les prochaines factures et les pages légales utilisent ces informations." };
}

/** Liens Instagram, TikTok, Snapchat (icônes en bas de page) et médiateur de la consommation (CGV). */
export async function saveSocialAndMediator(_: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireAdmin();
  const value = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
  };
  const update: Record<string, string | null> = {};
  for (const network of SOCIAL_NETWORKS) {
    const result = normalizeSocialLink(network.key, value(network.column));
    if ("error" in result) return { status: "error", message: result.error };
    update[network.column] = result.url;
  }
  const mediator = mediatorSchema.safeParse({ name: value("mediator_name"), url: value("mediator_url") });
  if (!mediator.success) return { status: "error", message: mediator.error.issues[0]?.message ?? "Vérifiez le médiateur." };
  update.mediator_name = mediator.data.name;
  update.mediator_url = mediator.data.url;

  const supabase = await createClient();
  const { error } = await supabase.from("shop_settings").update(update).eq("id", 1);
  if (error) return { status: "error", message: "Les liens n'ont pas pu être enregistrés." };
  updateTag(SHOP_INFO_TAG);
  revalidatePath("/admin/parametres");
  return { status: "success", message: "Enregistré. Les icônes apparaissent en bas de chaque page." };
}

const mediatorSchema = z.object({
  name: text(200),
  url: z
    .string()
    .trim()
    .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
    .refine((v) => v === "" || (v.length <= 300 && URL.canParse(v) && v.startsWith("https://")), "Le site du médiateur doit commencer par https://")
    .transform((v) => v || null),
});

const maintenanceSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().max(120),
  message: z.string().trim().max(1000),
});

/** Gèle ou rouvre la boutique. Effet immédiat sur tout le site. */
export async function setMaintenance(input: z.input<typeof maintenanceSchema>): Promise<SettingsState> {
  await requireAdmin();
  const parsed = maintenanceSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Texte trop long." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_settings")
    .update({
      maintenance_enabled: parsed.data.enabled,
      maintenance_title: parsed.data.title || null,
      maintenance_message: parsed.data.message || null,
    })
    .eq("id", 1);
  if (error) return { status: "error", message: "Le changement n'a pas pu être enregistré." };
  updateTag(SHOP_STATUS_TAG);
  revalidatePath("/admin/parametres");
  revalidatePath("/admin");
  return {
    status: "success",
    message: parsed.data.enabled ? "La boutique est gelée : les clientes voient la page d'attente." : "La boutique est ouverte.",
  };
}

const heroPath = z
  .string()
  .regex(/^home\/[a-f0-9]{16}\.(webp|jpg)$/)
  .nullable();

/** Photo de la page d'accueil : nouvelle photo déjà envoyée dans le stockage, ou null pour revenir aux photos des produits. */
export async function setHomeHero(path: string | null): Promise<SettingsState> {
  await requireAdmin();
  const parsed = heroPath.safeParse(path);
  if (!parsed.success) return { status: "error", message: "Photo invalide." };
  const supabase = await createClient();
  const { data: before } = await supabase.from("shop_settings").select("home_hero_path").eq("id", 1).maybeSingle<{ home_hero_path: string | null }>();
  const { error } = await supabase.from("shop_settings").update({ home_hero_path: parsed.data }).eq("id", 1);
  if (error) return { status: "error", message: "La photo n'a pas pu être enregistrée." };
  // L'ancienne photo ne sert plus à rien.
  const old = before?.home_hero_path;
  if (old && old !== parsed.data) await supabase.storage.from("product-images").remove([old]);
  updateTag(SHOP_INFO_TAG);
  revalidatePath("/");
  revalidatePath("/admin/parametres");
  return {
    status: "success",
    message: parsed.data ? "Photo enregistrée : elle s'affiche sur la page d'accueil." : "Photo retirée : l'accueil montre de nouveau les photos des produits.",
  };
}

/** Compte obligatoire pour passer commande, ou commande possible sans compte. */
export async function setCheckoutLoginRequired(required: boolean): Promise<SettingsState> {
  await requireAdmin();
  if (typeof required !== "boolean") return { status: "error", message: "Demande invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("shop_settings").update({ checkout_login_required: required }).eq("id", 1);
  if (error) return { status: "error", message: "Le changement n'a pas pu être enregistré." };
  updateTag(SHOP_INFO_TAG);
  revalidatePath("/admin/parametres");
  return {
    status: "success",
    message: required ? "Les clientes doivent maintenant se connecter pour commander." : "Les clientes peuvent commander sans compte.",
  };
}

const reminderSchema = z.object({ enabled: z.boolean(), second: z.boolean() });

/** Rappels de panier abandonné : activés ou non, et deuxième rappel à 3 jours. */
export async function setReminderSettings(input: z.input<typeof reminderSchema>): Promise<SettingsState> {
  await requireAdmin();
  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Demande invalide." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("shop_settings")
    .update({ cart_reminders_enabled: parsed.data.enabled, cart_reminder_second: parsed.data.second })
    .eq("id", 1);
  if (error) return { status: "error", message: "Le changement n'a pas pu être enregistré." };
  revalidatePath("/admin/parametres");
  return { status: "success", message: "Enregistré." };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "./auth";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { setCartCountCookie } from "@/lib/cart";
import { COUNTRY_NAMES } from "@/lib/shipping";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Actions de l'espace client. Elles utilisent la session de la cliente :
 * les règles RLS de la base empêchent de toucher aux données d'une autre.
 */

const fail = (message: string): ActionState => ({ status: "error", message });
const GENERIC = fail("Une erreur est survenue. Merci de réessayer.");

const value = (formData: FormData, name: string) => {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : "";
};

const phone = z
  .string()
  .regex(/^(\+?[0-9 .()-]{6,20})?$/, "Numéro de téléphone invalide.")
  .transform((v) => v || null);

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------
const profileSchema = z.object({
  first_name: z.string().max(80).transform((v) => v || null),
  last_name: z.string().max(80).transform((v) => v || null),
  phone,
});

export async function updateProfile(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/compte/profil");

  const parsed = profileSchema.safeParse({
    first_name: value(formData, "first_name"),
    last_name: value(formData, "last_name"),
    phone: value(formData, "phone"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Formulaire invalide.");

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return GENERIC;
  revalidatePath("/compte", "layout");
  return { status: "success", message: "Vos informations sont enregistrées." };
}

// ---------------------------------------------------------------------------
// Carnet d'adresses
// ---------------------------------------------------------------------------
const addressSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  label: z.string().max(40).transform((v) => v || null),
  first_name: z.string().min(1, "Prénom manquant.").max(80),
  last_name: z.string().min(1, "Nom manquant.").max(80),
  line1: z.string().min(1, "Adresse manquante.").max(120),
  line2: z.string().max(120).transform((v) => v || null),
  postal_code: z.string().min(2, "Code postal manquant.").max(12),
  city: z.string().min(1, "Ville manquante.").max(80),
  country: z.string().refine((code) => Object.hasOwn(COUNTRY_NAMES, code), "Pays invalide."),
  phone,
  is_default: z.boolean(),
});

export async function saveAddress(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/compte/adresses");

  const parsed = addressSchema.safeParse({
    ...Object.fromEntries(
      ["id", "label", "first_name", "last_name", "line1", "line2", "postal_code", "city", "country", "phone"].map((key) => [
        key,
        value(formData, key),
      ]),
    ),
    is_default: formData.get("is_default") === "on",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Formulaire invalide.");
  const { id, ...address } = parsed.data;

  const supabase = await createClient();
  // La première adresse devient l'adresse par défaut.
  const { count } = await supabase.from("addresses").select("id", { count: "exact", head: true });
  const isDefault = address.is_default || !count;
  if (isDefault) {
    await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id).eq("is_default", true);
  }

  const row = { ...address, is_default: isDefault };
  const { error } = id
    ? await supabase.from("addresses").update(row).eq("id", id).eq("user_id", user.id)
    : await supabase.from("addresses").insert({ ...row, user_id: user.id });
  if (error) return GENERIC;

  revalidatePath("/compte/adresses");
  redirect("/compte/adresses");
}

export async function deleteAddress(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/compte/adresses");
  const id = z.uuid().safeParse(formData.get("id"));
  if (id.success) {
    const supabase = await createClient();
    await supabase.from("addresses").delete().eq("id", id.data).eq("user_id", user.id);
  }
  revalidatePath("/compte/adresses");
}

export async function setDefaultAddress(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/compte/adresses");
  const id = z.uuid().safeParse(formData.get("id"));
  if (id.success) {
    const supabase = await createClient();
    await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id).eq("is_default", true);
    await supabase.from("addresses").update({ is_default: true }).eq("id", id.data).eq("user_id", user.id);
  }
  revalidatePath("/compte/adresses");
}

// ---------------------------------------------------------------------------
// Favoris
// ---------------------------------------------------------------------------
export type FavoriteResult = { ok: true; favorite: boolean } | { ok: false; login: true };

export async function toggleFavorite(input: unknown): Promise<FavoriteResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, login: true };
  const parsed = z.object({ productId: z.uuid(), favorite: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: true, favorite: false };

  const supabase = await createClient();
  const { productId, favorite } = parsed.data;
  if (favorite) {
    await supabase.from("favorites").upsert({ user_id: user.id, product_id: productId }, { ignoreDuplicates: true });
  } else {
    await supabase.from("favorites").delete().eq("user_id", user.id).eq("product_id", productId);
  }
  revalidatePath("/compte/favoris");
  return { ok: true, favorite };
}

// ---------------------------------------------------------------------------
// Suppression du compte (RGPD)
// ---------------------------------------------------------------------------
export async function deleteAccount(_: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/connexion?next=/compte/supprimer");
  if (profile.role === "admin") {
    return fail("Le compte administrateur ne peut pas être supprimé depuis le site.");
  }
  if (value(formData, "confirmation").toUpperCase() !== "SUPPRIMER") {
    return fail("Écrivez SUPPRIMER pour confirmer.");
  }

  // Supprime le compte, le profil, les adresses, les favoris et le panier.
  // Les commandes restent (obligation comptable), sans lien avec un compte.
  const { error } = await createAdminClient().auth.admin.deleteUser(profile.id);
  if (error) return GENERIC;

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  await setCartCountCookie(0);
  redirect("/compte-supprime");
}

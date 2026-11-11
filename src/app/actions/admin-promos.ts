"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { normalizePromoCode } from "@/lib/promo";
import { createClient } from "@/lib/supabase/server";

export type PromoResult = { ok: true; message?: string } | { ok: false; error: string };

const schema = z
  .object({
    id: z.uuid().nullable(),
    code: z
      .string()
      .transform(normalizePromoCode)
      .refine((v) => /^[A-Z0-9_-]{2,40}$/.test(v), "Le code : 2 à 40 lettres ou chiffres, sans espace ni accent."),
    type: z.enum(["percent", "fixed", "free_shipping"]),
    value: z.number().int().min(0).max(1_000_000),
    minSubtotalCents: z.number().int().min(0).max(1_000_000),
    startsAt: z.iso.datetime({ offset: true }).nullable(),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    maxUses: z.number().int().min(1).max(1_000_000).nullable(),
    oncePerCustomer: z.boolean(),
    isActive: z.boolean(),
    note: z.string().trim().max(200),
  })
  .refine((p) => p.type !== "percent" || (p.value >= 1 && p.value <= 100), { message: "Le pourcentage doit être entre 1 et 100.", path: ["value"] })
  .refine((p) => p.type !== "fixed" || p.value >= 1, { message: "Indiquez le montant de la réduction.", path: ["value"] })
  .refine((p) => !p.startsAt || !p.endsAt || p.startsAt < p.endsAt, { message: "La date de fin doit être après la date de début.", path: ["endsAt"] });

export type PromoPayload = z.input<typeof schema>;

export async function savePromo(input: PromoPayload): Promise<PromoResult> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Vérifiez le formulaire." };
  const p = parsed.data;
  const row = {
    code: p.code,
    type: p.type,
    value: p.type === "free_shipping" ? 0 : p.value,
    min_subtotal_cents: p.minSubtotalCents,
    starts_at: p.startsAt,
    ends_at: p.endsAt,
    max_uses: p.maxUses,
    once_per_customer: p.oncePerCustomer,
    is_active: p.isActive,
    note: p.note || null,
    updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const { data, error } = p.id
    ? await supabase.from("promo_codes").update(row).eq("id", p.id).select("id").maybeSingle()
    : await supabase.from("promo_codes").insert(row).select("id").single();
  if (error?.code === "23505") return { ok: false, error: `Le code ${p.code} existe déjà.` };
  if (error || !data) return { ok: false, error: "Le code n'a pas pu être enregistré." };
  revalidatePath("/admin/promos");
  if (!p.id) redirect(`/admin/promos?enregistre=${encodeURIComponent(p.code)}`);
  return { ok: true, message: "Enregistré." };
}

export async function setPromoActive(id: string, isActive: boolean): Promise<PromoResult> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Code introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.from("promo_codes").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Le code n'a pas pu être modifié." };
  revalidatePath("/admin/promos");
  return { ok: true };
}

/** Un code déjà utilisé est seulement désactivé : les commandes passées le mentionnent. */
export async function deletePromo(id: string): Promise<PromoResult> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Code introuvable." };
  const supabase = await createClient();
  const { data: promo } = await supabase.from("promo_codes").select("code, used_count").eq("id", id).maybeSingle();
  if (!promo) return { ok: false, error: "Code introuvable." };
  const { count } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("promo_code", promo.code);
  if ((promo.used_count as number) > 0 || (count ?? 0) > 0) {
    await supabase.from("promo_codes").update({ is_active: false }).eq("id", id);
    revalidatePath("/admin/promos");
    return { ok: true, message: "Ce code a déjà servi : il a été désactivé plutôt que supprimé." };
  }
  const { error } = await supabase.from("promo_codes").delete().eq("id", id);
  if (error) return { ok: false, error: "Le code n'a pas pu être supprimé." };
  revalidatePath("/admin/promos");
  redirect("/admin/promos");
}

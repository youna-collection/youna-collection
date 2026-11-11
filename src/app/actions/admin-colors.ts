"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { CATALOG_TAG } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";

/** La liste de couleurs commune (Admin → Couleurs). */

async function admin() {
  await requireAdmin();
  return createClient();
}

function refresh(catalog = false) {
  revalidatePath("/admin/couleurs");
  if (catalog) {
    updateTag(CATALOG_TAG);
    revalidatePath("/admin/produits", "layout");
  }
}

const nameSchema = z.string().trim().min(1).max(40);
const hexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export async function createColor(formData: FormData): Promise<void> {
  const supabase = await admin();
  const name = nameSchema.safeParse(formData.get("name"));
  const hex = hexSchema.safeParse(formData.get("hex"));
  if (!name.success) return;
  const { data: last } = await supabase.from("colors").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  // Un nom déjà dans la liste est simplement ignoré (index unique, sans tenir compte des majuscules).
  await supabase.from("colors").insert({ name: name.data, hex: hex.success ? hex.data : null, position: (last?.position ?? 0) + 1 });
  refresh();
}

/**
 * Renomme une couleur ou change sa pastille. Les variantes des produits qui portent ce nom
 * suivent (nom et pastille), pour que la boutique reste cohérente.
 */
export async function updateColor(formData: FormData): Promise<void> {
  const supabase = await admin();
  const id = z.uuid().safeParse(formData.get("id"));
  const name = nameSchema.safeParse(formData.get("name"));
  const hex = hexSchema.safeParse(formData.get("hex"));
  if (!id.success || !name.success || !hex.success) return;

  const { data: before } = await supabase.from("colors").select("name, hex").eq("id", id.data).maybeSingle();
  if (!before) return;
  const { error } = await supabase.from("colors").update({ name: name.data, hex: hex.data }).eq("id", id.data);
  if (error) return; // Nom déjà pris par une autre couleur.

  const changed = before.name !== name.data || before.hex !== hex.data;
  if (changed) {
    await supabase.from("product_variants").update({ color_name: name.data, color_hex: hex.data }).ilike("color_name", escapeLike(before.name));
  }
  refresh(changed);
}

export async function moveColor(formData: FormData): Promise<void> {
  const supabase = await admin();
  const id = z.uuid().safeParse(formData.get("id"));
  const direction = formData.get("direction") === "up" ? -1 : 1;
  if (!id.success) return;
  const { data } = await supabase.from("colors").select("id").order("position").order("name");
  const ids = (data ?? []).map((row) => row.id as string);
  const index = ids.indexOf(id.data);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  for (const [position, colorId] of ids.entries()) {
    await supabase.from("colors").update({ position }).eq("id", colorId);
  }
  refresh();
}

/** Retire la couleur de la liste seulement : les produits qui la portent ne changent pas. */
export async function deleteColor(formData: FormData): Promise<void> {
  const supabase = await admin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await supabase.from("colors").delete().eq("id", id.data);
  refresh();
}

/** Recherche exacte (sans tenir compte des majuscules) : % et _ sont des jokers pour ilike. */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

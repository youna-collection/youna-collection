"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { CATALOG_TAG } from "@/lib/catalog";
import { slugify } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

async function admin() {
  await requireAdmin();
  return createClient();
}

function refresh() {
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/categories");
  revalidatePath("/", "layout");
}

const nameSchema = z.string().trim().min(1).max(60);

export async function createCategory(formData: FormData): Promise<void> {
  const supabase = await admin();
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return;
  const { data: last } = await supabase.from("categories").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  let slug = slugify(name.data) || "categorie";
  const { data: taken } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
  if (taken) slug = `${slug}-${Date.now().toString(36)}`;
  await supabase.from("categories").insert({ name: name.data, slug, position: (last?.position ?? 0) + 1 });
  refresh();
}

export async function renameCategory(formData: FormData): Promise<void> {
  const supabase = await admin();
  const id = z.uuid().safeParse(formData.get("id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!id.success || !name.success) return;
  // L'adresse (/collections/...) ne change pas : les liens existants continuent de marcher.
  await supabase.from("categories").update({ name: name.data }).eq("id", id.data);
  refresh();
}

export async function toggleCategory(formData: FormData): Promise<void> {
  const supabase = await admin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const { data } = await supabase.from("categories").select("is_active").eq("id", id.data).single();
  if (data) await supabase.from("categories").update({ is_active: !data.is_active }).eq("id", id.data);
  refresh();
}

export async function moveCategory(formData: FormData): Promise<void> {
  const supabase = await admin();
  const id = z.uuid().safeParse(formData.get("id"));
  const direction = formData.get("direction") === "up" ? -1 : 1;
  if (!id.success) return;
  const { data } = await supabase.from("categories").select("id").order("position");
  const ids = (data ?? []).map((row) => row.id as string);
  const index = ids.indexOf(id.data);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  for (const [position, categoryId] of ids.entries()) {
    await supabase.from("categories").update({ position }).eq("id", categoryId);
  }
  refresh();
}

export async function deleteCategory(formData: FormData): Promise<void> {
  const supabase = await admin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const { count } = await supabase.from("product_categories").select("product_id", { count: "exact", head: true }).eq("category_id", id.data);
  if (count) return; // Uniquement une catégorie vide.
  await supabase.from("categories").delete().eq("id", id.data);
  refresh();
}

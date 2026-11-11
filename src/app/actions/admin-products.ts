"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { CATALOG_TAG } from "@/lib/catalog";
import { slugify } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/**
 * Actions de l'admin sur le catalogue. Chacune vérifie le rôle admin, puis passe par la
 * session de l'admin : la base refuse de toute façon ces écritures à quelqu'un d'autre.
 */

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string };

const BUCKET = "product-images";
const isForeignKeyError = (code?: string) => code === "23503";

async function admin() {
  await requireAdmin();
  return createClient();
}

/** Vide le cache du catalogue : la boutique montre aussitôt les changements. */
function refreshShop(productId?: string) {
  updateTag(CATALOG_TAG);
  revalidatePath("/admin/produits");
  if (productId) revalidatePath(`/admin/produits/${productId}`);
}

async function uniqueSlug(supabase: Awaited<ReturnType<typeof createClient>>, base: string, exceptId?: string) {
  const root = slugify(base) || "produit";
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? root : `${root}-${i}`;
    let query = supabase.from("products").select("id").eq("slug", slug);
    if (exceptId) query = query.neq("id", exceptId);
    const { data } = await query.maybeSingle();
    if (!data) return slug;
  }
  return `${root}-${randomBytes(3).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Créer, enregistrer, dupliquer, supprimer
// ---------------------------------------------------------------------------
export async function createProduct(): Promise<void> {
  const supabase = await admin();
  const { data: last } = await supabase.from("products").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: "Nouveau produit",
      slug: `nouveau-produit-${randomBytes(3).toString("hex")}`,
      status: "draft",
      position: (last?.position ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Création : ${error?.message}`);
  await supabase.from("product_variants").insert({ product_id: data.id, price_cents: 0, stock: 0, weight_grams: 300, position: 0 });
  revalidatePath("/admin/produits");
  redirect(`/admin/produits/${data.id}`);
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const variantSchema = z.object({
  id: z.uuid().nullable(),
  sku: optionalText(64),
  colorName: optionalText(60),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  size: optionalText(30),
  priceCents: z.int().min(0).max(1_000_000),
  compareAtPriceCents: z.int().min(0).max(1_000_000).nullable(),
  weightGrams: z.int().min(0).max(30_000),
  stock: z.int().min(0).max(100_000),
  originalStock: z.int().min(0).nullable(),
  trackStock: z.boolean(),
  lowStockThreshold: z.int().min(0).max(1000),
  bouquetVeilCount: z.int().min(1).max(20).nullable(),
  isActive: z.boolean(),
});

const productSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Donnez un nom au produit.").max(120),
  slug: z.string().trim().max(120),
  description: optionalText(5000),
  categoryIds: z.array(z.uuid()).max(50),
  kind: z.enum(["standard", "bouquet"]),
  status: z.enum(["draft", "active", "archived"]),
  publishAt: z.iso.datetime({ offset: true }).nullable(),
  bouquetEligible: z.boolean(),
  seoTitle: optionalText(70),
  seoDescription: optionalText(160),
  variants: z.array(variantSchema).min(1, "Il faut au moins une variante.").max(100),
  removedVariantIds: z.array(z.uuid()).max(100),
});

export type ProductPayload = z.input<typeof productSchema>;

export async function saveProduct(input: ProductPayload): Promise<AdminResult> {
  const supabase = await admin();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Fiche incomplète." };
  const p = parsed.data;

  const activeVariants = p.variants.filter((v) => v.isActive);
  const problem = publishProblem(p.kind, activeVariants, p.status === "active");
  if (problem) return { ok: false, error: problem };
  const labels = activeVariants.map((v) => `${v.colorName ?? ""}|${v.size ?? ""}`.toLowerCase());
  if (new Set(labels).size !== labels.length) return { ok: false, error: "Deux variantes ont la même couleur et la même taille." };

  // La catégorie principale est la première cochée, dans l'ordre du menu.
  let categoryIds: string[] = [];
  if (p.categoryIds.length) {
    const { data: categoryRows } = await supabase.from("categories").select("id").in("id", p.categoryIds).order("position");
    categoryIds = (categoryRows ?? []).map((c) => c.id as string);
  }

  const slug = await uniqueSlug(supabase, p.slug || p.name, p.id);
  const { error: productError } = await supabase
    .from("products")
    .update({
      name: p.name,
      slug,
      description: p.description,
      category_id: categoryIds[0] ?? null,
      kind: p.kind,
      status: p.status,
      publish_at: p.status === "active" ? p.publishAt : null,
      bouquet_eligible: p.bouquetEligible,
      seo_title: p.seoTitle,
      seo_description: p.seoDescription,
    })
    .eq("id", p.id);
  if (productError) return { ok: false, error: "La fiche n'a pas pu être enregistrée." };

  const linkError = await setProductCategories(supabase, p.id, categoryIds);
  if (linkError) return { ok: false, error: "Les catégories n'ont pas pu être enregistrées." };

  const notes: string[] = [];

  for (const [position, v] of p.variants.entries()) {
    const fields = {
      sku: v.sku,
      color_name: v.colorName,
      color_hex: v.colorHex,
      size: v.size,
      price_cents: v.priceCents,
      compare_at_price_cents: v.compareAtPriceCents && v.compareAtPriceCents > v.priceCents ? v.compareAtPriceCents : null,
      weight_grams: v.weightGrams,
      track_stock: v.trackStock,
      low_stock_threshold: v.lowStockThreshold,
      bouquet_veil_count: p.kind === "bouquet" ? v.bouquetVeilCount : null,
      is_active: v.isActive,
      position,
    };
    const label = [v.colorName, v.size].filter(Boolean).join(" ") || "sans nom";

    if (v.id) {
      const { error } = await supabase.from("product_variants").update(fields).eq("id", v.id).eq("product_id", p.id);
      if (error) {
        return { ok: false, error: error.code === "23505" ? `La référence (SKU) de « ${label} » existe déjà.` : `Variante « ${label} » non enregistrée.` };
      }
      // Le stock est ajusté de la différence : une vente passée entre-temps n'est pas effacée.
      const delta = v.stock - (v.originalStock ?? v.stock);
      if (delta !== 0) {
        const { error: stockError } = await supabase.rpc("adjust_stock", { p_variant_id: v.id, p_delta: delta, p_note: "Fiche produit" });
        if (stockError) notes.push(`Stock de « ${label} » non modifié (il ne peut pas devenir négatif).`);
      }
    } else {
      const { error } = await supabase.from("product_variants").insert({ ...fields, product_id: p.id, stock: v.stock });
      if (error) {
        return { ok: false, error: error.code === "23505" ? `La référence (SKU) de « ${label} » existe déjà.` : `Variante « ${label} » non ajoutée.` };
      }
    }
  }

  for (const id of p.removedVariantIds) {
    const { error } = await supabase.from("product_variants").delete().eq("id", id).eq("product_id", p.id);
    if (isForeignKeyError(error?.code)) {
      // Déjà vendue ou déjà en stock : on garde son historique et on la masque.
      await supabase.from("product_variants").update({ is_active: false }).eq("id", id);
      notes.push("Une variante qui a un historique de stock a été masquée au lieu d'être supprimée.");
    }
  }

  // Une couleur nouvelle rejoint la liste commune, pour la retrouver sur les autres produits.
  await addMissingColors(
    supabase,
    p.variants.flatMap((v) => (v.colorName ? [{ name: v.colorName, hex: v.colorHex }] : [])),
  );

  refreshShop(p.id);
  return { ok: true, message: ["Produit enregistré.", ...notes].join(" ") };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Ce qui empêche une mise en ligne (null si tout va bien). */
function publishProblem(
  kind: "standard" | "bouquet",
  activeVariants: { priceCents: number; weightGrams: number; bouquetVeilCount: number | null }[],
  goingLive: boolean,
): string | null {
  if (goingLive) {
    if (!activeVariants.length) return "Pour mettre en ligne, au moins une variante doit être visible.";
    if (activeVariants.some((v) => v.priceCents <= 0)) return "Chaque variante visible doit avoir un prix.";
    // Le poids choisit la tranche de frais de port : il ne doit pas manquer.
    if (activeVariants.some((v) => v.weightGrams <= 0)) return "Indiquez le poids de chaque variante visible.";
  }
  if (kind === "bouquet" && activeVariants.some((v) => !v.bouquetVeilCount)) {
    return "Pour un bouquet, indiquez le nombre de voiles de chaque taille.";
  }
  return null;
}

async function setProductCategories(supabase: Supabase, productId: string, categoryIds: string[]) {
  const { data: current, error } = await supabase.from("product_categories").select("category_id").eq("product_id", productId);
  if (error) return error;
  const before = new Set((current ?? []).map((r) => r.category_id as string));
  const removed = [...before].filter((id) => !categoryIds.includes(id));
  const added = categoryIds.filter((id) => !before.has(id));
  if (removed.length) {
    const { error: e } = await supabase.from("product_categories").delete().eq("product_id", productId).in("category_id", removed);
    if (e) return e;
  }
  if (added.length) {
    const { error: e } = await supabase.from("product_categories").insert(added.map((category_id) => ({ product_id: productId, category_id })));
    if (e) return e;
  }
  return null;
}

async function addMissingColors(supabase: Supabase, colors: { name: string; hex: string | null }[]) {
  if (!colors.length) return;
  const { data: existing } = await supabase.from("colors").select("name, position").order("position", { ascending: false });
  const known = new Set((existing ?? []).map((c) => (c.name as string).trim().toLowerCase()));
  let position = (existing?.[0]?.position as number | undefined) ?? 0;
  const fresh = new Map<string, { name: string; hex: string | null; position: number }>();
  for (const c of colors) {
    const key = c.name.trim().toLowerCase();
    if (known.has(key) || fresh.has(key)) continue;
    fresh.set(key, { name: c.name.trim(), hex: c.hex, position: ++position });
  }
  // Une erreur ici ne bloque pas l'enregistrement du produit (la liste est une aide).
  if (fresh.size) await supabase.from("colors").insert([...fresh.values()]);
}

/** Depuis la liste des produits : masquer (brouillon) ou mettre en ligne sans ouvrir la fiche. */
export async function setProductVisibility(productId: string, visible: boolean): Promise<AdminResult> {
  const supabase = await admin();
  if (!z.uuid().safeParse(productId).success) return { ok: false, error: "Produit introuvable." };
  if (visible) {
    const { data: product } = await supabase
      .from("products")
      .select("kind, variants:product_variants ( price_cents, weight_grams, bouquet_veil_count, is_active )")
      .eq("id", productId)
      .maybeSingle();
    if (!product) return { ok: false, error: "Produit introuvable." };
    const variants = (product.variants as { price_cents: number; weight_grams: number; bouquet_veil_count: number | null; is_active: boolean }[])
      .filter((v) => v.is_active)
      .map((v) => ({ priceCents: v.price_cents, weightGrams: v.weight_grams, bouquetVeilCount: v.bouquet_veil_count }));
    const problem = publishProblem(product.kind as "standard" | "bouquet", variants, true);
    if (problem) return { ok: false, error: `${problem} Ouvrez la fiche pour compléter.` };
  }
  const { error } = await supabase
    .from("products")
    .update(visible ? { status: "active", publish_at: null } : { status: "draft" })
    .eq("id", productId);
  if (error) return { ok: false, error: "Le changement n'a pas pu être enregistré." };
  refreshShop(productId);
  return { ok: true, message: visible ? "En ligne." : "Masqué." };
}

export async function duplicateProduct(productId: string): Promise<void> {
  const supabase = await admin();
  const { data, error } = await supabase.rpc("duplicate_product", { p_product_id: productId });
  if (error || !data) throw new Error(`Duplication : ${error?.message}`);
  // La copie reprend toutes les catégories de l'original.
  const { data: links } = await supabase.from("product_categories").select("category_id").eq("product_id", productId);
  if (links?.length) await setProductCategories(supabase, data as string, links.map((l) => l.category_id as string));
  revalidatePath("/admin/produits");
  redirect(`/admin/produits/${data as string}`);
}

/** Supprime les fichiers qui ne servent plus à aucune fiche (une copie peut partager les photos). */
async function removeOrphanFiles(supabase: Awaited<ReturnType<typeof createClient>>, paths: string[]) {
  const orphans: string[] = [];
  for (const path of new Set(paths)) {
    const { count } = await supabase.from("product_images").select("id", { count: "exact", head: true }).eq("storage_path", path);
    if (!count) orphans.push(path);
  }
  if (orphans.length) await supabase.storage.from(BUCKET).remove(orphans);
}

export async function deleteProduct(productId: string): Promise<AdminResult> {
  const supabase = await admin();
  const { data: images } = await supabase.from("product_images").select("storage_path").eq("product_id", productId);
  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (isForeignKeyError(error?.code)) {
    await supabase.from("products").update({ status: "archived" }).eq("id", productId);
    refreshShop(productId);
    return {
      ok: true,
      message: "Ce produit a déjà eu du stock ou des ventes : il est archivé (caché de la boutique) pour garder son historique.",
    };
  }
  if (error) return { ok: false, error: "Le produit n'a pas pu être supprimé." };
  await removeOrphanFiles(supabase, (images ?? []).map((i) => i.storage_path));
  refreshShop();
  redirect("/admin/produits?supprime=1");
}

// ---------------------------------------------------------------------------
// Photos (les fichiers sont envoyés par le navigateur, directement dans le stockage)
// ---------------------------------------------------------------------------
const pathSchema = z.string().regex(/^products\/[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.(webp|jpg|png)$/);

export async function addProductImages(productId: string, paths: string[], alt: string): Promise<AdminResult> {
  const supabase = await admin();
  const id = z.uuid().safeParse(productId);
  const files = z.array(pathSchema).min(1).max(20).safeParse(paths);
  if (!id.success || !files.success || files.data.some((path) => !path.startsWith(`products/${productId}/`))) {
    return { ok: false, error: "Photos invalides." };
  }
  const { data: last } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = (last?.position ?? -1) + 1;
  const { error } = await supabase
    .from("product_images")
    .insert(files.data.map((path, i) => ({ product_id: productId, storage_path: path, alt: alt.slice(0, 200) || null, position: start + i })));
  if (error) return { ok: false, error: "Les photos n'ont pas pu être enregistrées." };
  refreshShop(productId);
  return { ok: true };
}

const imageUpdateSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  variantId: z.uuid().nullable().optional(),
  alt: z.string().trim().max(200).optional(),
});

export async function updateProductImage(input: z.input<typeof imageUpdateSchema>): Promise<AdminResult> {
  const supabase = await admin();
  const parsed = imageUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Modification invalide." };
  const { id, productId, variantId, alt } = parsed.data;
  const update: Record<string, unknown> = {};
  if (variantId !== undefined) update.variant_id = variantId;
  if (alt !== undefined) update.alt = alt || null;
  const { error } = await supabase.from("product_images").update(update).eq("id", id).eq("product_id", productId);
  if (error) return { ok: false, error: "La photo n'a pas pu être modifiée." };
  refreshShop(productId);
  return { ok: true };
}

/** Enregistre le nouvel ordre des photos (la première est la photo principale). */
export async function reorderProductImages(productId: string, orderedIds: string[]): Promise<AdminResult> {
  const supabase = await admin();
  const ids = z.array(z.uuid()).max(100).safeParse(orderedIds);
  if (!ids.success) return { ok: false, error: "Ordre invalide." };
  for (const [position, id] of ids.data.entries()) {
    await supabase.from("product_images").update({ position }).eq("id", id).eq("product_id", productId);
  }
  refreshShop(productId);
  return { ok: true };
}

export async function deleteProductImage(productId: string, imageId: string): Promise<AdminResult> {
  const supabase = await admin();
  const { data } = await supabase.from("product_images").select("storage_path").eq("id", imageId).eq("product_id", productId).maybeSingle();
  if (!data) return { ok: false, error: "Photo introuvable." };
  await supabase.from("product_images").delete().eq("id", imageId);
  await removeOrphanFiles(supabase, [data.storage_path]);
  refreshShop(productId);
  return { ok: true };
}

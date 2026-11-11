import "server-only";
import { productImageUrl } from "../catalog";
import { createClient } from "../supabase/server";

/** Lectures de l'admin : avec sa session, les règles RLS lui montrent tout (brouillons compris). */

export type ProductStatus = "draft" | "active" | "archived";

export type AdminVariant = {
  id: string;
  sku: string | null;
  color_name: string | null;
  color_hex: string | null;
  size: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  weight_grams: number;
  stock: number;
  reserved: number;
  track_stock: boolean;
  low_stock_threshold: number;
  bouquet_veil_count: number | null;
  is_active: boolean;
  position: number;
};

export type AdminImage = { id: string; variant_id: string | null; storage_path: string; alt: string | null; position: number; url: string };

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** Catégorie principale (fil d'Ariane de la boutique). */
  category_id: string | null;
  /** Toutes ses catégories, principale comprise. */
  category_ids: string[];
  kind: "standard" | "bouquet";
  status: ProductStatus;
  publish_at: string | null;
  bouquet_eligible: boolean;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
  variants: AdminVariant[];
  images: AdminImage[];
};

export type AdminCategory = { id: string; slug: string; name: string; position: number; is_active: boolean; product_count: number };

const VARIANT_FIELDS =
  "id, sku, color_name, color_hex, size, price_cents, compare_at_price_cents, weight_grams, stock, reserved, track_stock, low_stock_threshold, bouquet_veil_count, is_active, position";

type Row = Omit<AdminProduct, "images" | "category_ids"> & { images: Omit<AdminImage, "url">[]; links: { category_id: string }[] };

function toAdminProduct({ links, ...row }: Row): AdminProduct {
  return {
    ...row,
    category_ids: [...new Set([...(row.category_id ? [row.category_id] : []), ...links.map((l) => l.category_id)])],
    variants: [...row.variants].sort((a, b) => a.position - b.position),
    images: [...row.images].sort((a, b) => a.position - b.position).map((image) => ({ ...image, url: productImageUrl(image.storage_path) })),
  };
}

const PRODUCT_FIELDS = `id, slug, name, description, category_id, kind, status, publish_at, bouquet_eligible, seo_title, seo_description, updated_at,
  links:product_categories ( category_id ),
  variants:product_variants ( ${VARIANT_FIELDS} ),
  images:product_images ( id, variant_id, storage_path, alt, position )`;

export async function listAdminProducts(): Promise<AdminProduct[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").select(PRODUCT_FIELDS).order("position").order("name");
  if (error) throw new Error(`Produits : ${error.message}`);
  return (data as unknown as Row[]).map(toAdminProduct);
}

export async function getAdminProduct(id: string): Promise<AdminProduct | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").select(PRODUCT_FIELDS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Produit : ${error.message}`);
  return data ? toAdminProduct(data as unknown as Row) : null;
}

export async function listAdminCategories(): Promise<AdminCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, position, is_active, product_categories ( count )")
    .order("position");
  if (error) throw new Error(`Catégories : ${error.message}`);
  return (data as unknown as (Omit<AdminCategory, "product_count"> & { product_categories: { count: number }[] })[]).map(
    ({ product_categories, ...c }) => ({ ...c, product_count: product_categories[0]?.count ?? 0 }),
  );
}

export type AdminColor = { id: string; name: string; hex: string | null; position: number; uses: number };

/** La liste de couleurs commune, avec le nombre de variantes qui portent chaque nom. */
export async function listColors(): Promise<AdminColor[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: variants }] = await Promise.all([
    supabase.from("colors").select("id, name, hex, position").order("position").order("name"),
    supabase.from("product_variants").select("color_name").not("color_name", "is", null),
  ]);
  if (error) throw new Error(`Couleurs : ${error.message}`);
  const uses = new Map<string, number>();
  for (const v of variants ?? []) {
    const key = (v.color_name as string).trim().toLowerCase();
    uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  return (data ?? []).map((c) => ({ ...c, uses: uses.get(c.name.trim().toLowerCase()) ?? 0 }));
}

/** Où en est la fiche pour les clientes. */
export function publicationState(product: Pick<AdminProduct, "status" | "publish_at">, now = new Date()) {
  if (product.status === "archived") return { label: "Archivé", tone: "muted" as const };
  if (product.status === "draft") return { label: "Brouillon", tone: "muted" as const };
  if (product.publish_at && new Date(product.publish_at) > now) return { label: "Programmé", tone: "info" as const };
  return { label: "En ligne", tone: "success" as const };
}

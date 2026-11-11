import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { slugify } from "./format";
import type { Category, Product, ProductImage, Variant } from "./product";
import type { ShippingMethod } from "./shipping";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "./supabase/env";

/** Le catalogue est public : lu sans session, avec les droits d'une visiteuse (règles RLS). */
function publicClient() {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Étiquette à invalider quand l'admin modifie le catalogue (phase 5). */
export const CATALOG_TAG = "catalog";
const CACHE = { tags: [CATALOG_TAG], revalidate: 300 };

export function productImageUrl(path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/product-images/${path}`;
}

const PRODUCT_SELECT = `
  id, slug, name, description, kind, bouquet_eligible, position,
  category:categories!products_category_id_fkey ( slug, name ),
  links:product_categories ( category:categories ( slug ) ),
  variants:product_variants ( id, sku, color_name, color_hex, size, price_cents, compare_at_price_cents,
                              available, track_stock, bouquet_veil_count, position ),
  images:product_images ( id, variant_id, storage_path, alt, position )
`;

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: "standard" | "bouquet";
  bouquet_eligible: boolean;
  position: number;
  category: { slug: string; name: string } | null;
  links: { category: { slug: string } | null }[];
  variants: {
    id: string;
    sku: string | null;
    color_name: string | null;
    color_hex: string | null;
    size: string | null;
    price_cents: number;
    compare_at_price_cents: number | null;
    available: number;
    track_stock: boolean;
    bouquet_veil_count: number | null;
    position: number;
  }[];
  images: { id: string; variant_id: string | null; storage_path: string; alt: string | null; position: number }[];
};

function toProduct(row: ProductRow): Product {
  const variants: Variant[] = row.variants
    .map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      colorName: variant.color_name,
      colorSlug: variant.color_name ? slugify(variant.color_name) : null,
      colorHex: variant.color_hex,
      size: variant.size,
      sizeSlug: variant.size ? slugify(variant.size) : null,
      priceCents: variant.price_cents,
      compareAtPriceCents: variant.compare_at_price_cents,
      available: variant.available,
      trackStock: variant.track_stock,
      bouquetVeilCount: variant.bouquet_veil_count,
      position: variant.position,
    }))
    .sort((a, b) => a.position - b.position);

  // Les photos d'une variante masquée (brouillon) ne sont jamais montrées.
  const visibleVariantIds = new Set(variants.map((variant) => variant.id));
  const images: ProductImage[] = row.images
    .filter((image) => image.variant_id === null || visibleVariantIds.has(image.variant_id))
    .map((image) => ({
      id: image.id,
      variantId: image.variant_id,
      url: productImageUrl(image.storage_path),
      alt: image.alt ?? row.name,
      position: image.position,
    }))
    .sort((a, b) => a.position - b.position);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    kind: row.kind,
    bouquetEligible: row.bouquet_eligible,
    position: row.position,
    category: row.category,
    // Une catégorie masquée n'est pas lue (règles RLS) : elle disparaît de la liste.
    categorySlugs: [...new Set([...(row.category ? [row.category.slug] : []), ...row.links.flatMap((l) => (l.category ? [l.category.slug] : []))])],
    variants,
    images,
  };
}

export const getCategories = unstable_cache(
  async (): Promise<Category[]> => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await publicClient()
      .from("categories")
      .select("id, slug, name, position")
      .order("position");
    if (error) throw new Error(`Catégories : ${error.message}`);
    return data;
  },
  ["categories"],
  CACHE,
);

/** Tous les produits publiés ayant au moins une variante visible. */
export const getProducts = unstable_cache(
  async (): Promise<Product[]> => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await publicClient().from("products").select(PRODUCT_SELECT).order("position");
    if (error) throw new Error(`Produits : ${error.message}`);
    return (data as unknown as ProductRow[]).map(toProduct).filter((product) => product.variants.length > 0);
  },
  ["products"],
  CACHE,
);

export async function getProduct(slug: string): Promise<Product | null> {
  return (await getProducts()).find((product) => product.slug === slug) ?? null;
}

/** Le produit apparaît-il dans cette catégorie (principale ou supplémentaire) ? */
export function inCategory(product: Pick<Product, "category" | "categorySlugs">, slug: string): boolean {
  return product.categorySlugs ? product.categorySlugs.includes(slug) : product.category?.slug === slug;
}

export async function getProductsByCategory(slug: string): Promise<Product[]> {
  return (await getProducts()).filter((product) => inCategory(product, slug));
}

type ShippingMethodRow = {
  code: string;
  name: string;
  description: string | null;
  carrier: ShippingMethod["carrier"];
  requires_relay_point: boolean;
  requires_address: boolean;
  rates: { country: string; max_weight_grams: number; price_cents: number }[];
};

/** Modes de livraison actifs et leurs tarifs, dans l'ordre choisi par l'admin. */
export const getShippingMethods = unstable_cache(
  async (): Promise<ShippingMethod[]> => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await publicClient()
      .from("shipping_methods")
      .select("code, name, description, carrier, requires_relay_point, requires_address, rates:shipping_rates ( country, max_weight_grams, price_cents )")
      .eq("is_active", true)
      .order("position");
    if (error) throw new Error(`Livraison : ${error.message}`);
    return (data as unknown as ShippingMethodRow[]).map((row) => ({
      code: row.code,
      name: row.name,
      description: row.description,
      carrier: row.carrier,
      requiresRelayPoint: row.requires_relay_point,
      requiresAddress: row.requires_address,
      rates: row.rates.map((rate) => ({ country: rate.country.trim(), maxWeightGrams: rate.max_weight_grams, priceCents: rate.price_cents })),
    }));
  },
  ["shipping-methods"],
  CACHE,
);

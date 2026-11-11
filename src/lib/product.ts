/** Types et règles d'affichage du catalogue, utilisables côté serveur comme côté navigateur. */

export type Variant = {
  id: string;
  sku: string | null;
  colorName: string | null;
  colorSlug: string | null;
  colorHex: string | null;
  size: string | null;
  sizeSlug: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  available: number;
  trackStock: boolean;
  bouquetVeilCount: number | null;
  position: number;
};

export type ProductImage = {
  id: string;
  variantId: string | null;
  url: string;
  alt: string;
  position: number;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: "standard" | "bouquet";
  /** Ses couleurs peuvent être choisies dans un bouquet. */
  bouquetEligible: boolean;
  position: number;
  /** Catégorie principale (fil d'Ariane). */
  category: { slug: string; name: string } | null;
  /** Toutes les catégories où le produit apparaît (principale comprise). Absent = seulement la principale. */
  categorySlugs?: string[];
  variants: Variant[];
  images: ProductImage[];
};

export type Category = { id: string; slug: string; name: string; position: number };

/** En dessous de ce nombre, la fiche affiche « Plus que N ». */
export const LOW_STOCK = 3;

export function isInStock(variant: Variant): boolean {
  return !variant.trackStock || variant.available > 0;
}

export function priceRange(variants: Variant[]): { min: number; max: number } | null {
  if (!variants.length) return null;
  const prices = variants.map((variant) => variant.priceCents);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** Photos à montrer pour une variante : les siennes, puis celles communes à la fiche. */
export function imagesForVariant(product: Product, variantId: string | null): ProductImage[] {
  const own = product.images.filter((image) => image.variantId !== null && image.variantId === variantId);
  const shared = product.images.filter((image) => image.variantId === null);
  const images = [...own, ...shared];
  if (images.length) return images;
  // Variante sans photo : on montre celle de la première variante qui en a une.
  const fallback = product.variants.map((variant) => product.images.find((image) => image.variantId === variant.id)).find(Boolean);
  return fallback ? [fallback] : [];
}

/** Variante mise en avant par défaut : la première disponible. */
export function defaultVariant(product: Product): Variant | null {
  return product.variants.find(isInStock) ?? product.variants[0] ?? null;
}

/** Retrouve la variante demandée dans l'adresse (?couleur=matcha ou ?taille=xl). */
export function findVariant(product: Product, query: { couleur?: unknown; taille?: unknown }): Variant | null {
  if (typeof query.couleur === "string") {
    const match = product.variants.find((variant) => variant.colorSlug === query.couleur);
    if (match) return match;
  }
  if (typeof query.taille === "string") {
    const match = product.variants.find((variant) => variant.sizeSlug === query.taille);
    if (match) return match;
  }
  return defaultVariant(product);
}

export function variantQuery(variant: Variant): string {
  if (variant.colorSlug) return `?couleur=${variant.colorSlug}`;
  if (variant.sizeSlug) return `?taille=${variant.sizeSlug}`;
  return "";
}

export function variantLabel(variant: Variant): string | null {
  if (variant.size && variant.bouquetVeilCount) return `${variant.size} · ${variant.bouquetVeilCount} voiles`;
  return variant.colorName ?? variant.size;
}

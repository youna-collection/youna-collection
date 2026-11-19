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

/** En dessous de ce nombre, la fiche affiche « Bientôt épuisé » (jamais le nombre exact). */
export const LOW_STOCK = 3;

export function isInStock(variant: Variant): boolean {
  return !variant.trackStock || variant.available > 0;
}

export function priceRange(variants: Variant[]): { min: number; max: number } | null {
  if (!variants.length) return null;
  const prices = variants.map((variant) => variant.priceCents);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** Une couleur du produit, avec ses tailles (une variante par taille). */
export type ColorGroup = { slug: string; name: string; hex: string | null; variants: Variant[] };

/** Les couleurs d'un produit, chacune une seule fois, dans l'ordre de l'admin. */
export function colorGroups(product: Product): ColorGroup[] {
  const groups = new Map<string, ColorGroup>();
  for (const variant of product.variants) {
    if (!variant.colorSlug) continue;
    const group = groups.get(variant.colorSlug) ?? { slug: variant.colorSlug, name: variant.colorName ?? "", hex: null, variants: [] };
    group.hex ??= variant.colorHex;
    group.variants.push(variant);
    groups.set(variant.colorSlug, group);
  }
  return [...groups.values()];
}

/** Les tailles proposées avec cette variante : celles de la même couleur (ou toutes, pour un produit sans couleurs). */
export function sizeOptions(product: Product, variant: Variant): Variant[] {
  return product.variants.filter((v) => v.size && v.colorSlug === variant.colorSlug);
}

/** Photos à montrer pour une variante : les siennes et celles des autres tailles de la même couleur, puis celles communes à la fiche. */
export function imagesForVariant(product: Product, variantId: string | null): ProductImage[] {
  const variant = product.variants.find((v) => v.id === variantId);
  // Une photo posée sur « Noir M » sert aussi à « Noir L » : les tailles d'une couleur partagent leurs photos.
  const siblings = variant?.colorSlug ? product.variants.filter((v) => v.colorSlug === variant.colorSlug && v.id !== variant.id).map((v) => v.id) : [];
  const own = [
    ...product.images.filter((image) => image.variantId !== null && image.variantId === variantId),
    ...product.images.filter((image) => image.variantId !== null && siblings.includes(image.variantId)),
  ];
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

/**
 * Retrouve la variante demandée dans l'adresse (?couleur=matcha, ?taille=xl ou les deux).
 * Une couleur seule ouvre sa première taille disponible ; une valeur inconnue est ignorée.
 */
export function findVariant(product: Product, query: { couleur?: unknown; taille?: unknown }): Variant | null {
  let candidates = product.variants;
  if (typeof query.couleur === "string") {
    const matches = candidates.filter((variant) => variant.colorSlug === query.couleur);
    if (matches.length) candidates = matches;
  }
  if (typeof query.taille === "string") {
    const matches = candidates.filter((variant) => variant.sizeSlug === query.taille);
    if (matches.length) candidates = matches;
  }
  return candidates.find(isInStock) ?? candidates[0] ?? null;
}

export function variantQuery(variant: Variant): string {
  const params = [
    variant.colorSlug ? `couleur=${variant.colorSlug}` : null,
    variant.sizeSlug ? `taille=${variant.sizeSlug}` : null,
  ].filter(Boolean);
  return params.length ? `?${params.join("&")}` : "";
}

/** Nom complet de la variante : « Noir · M », « Matcha », « XL · 6 voiles ». */
export function variantLabel(variant: Pick<Variant, "colorName" | "size" | "bouquetVeilCount">): string | null {
  if (variant.size && variant.bouquetVeilCount) return `${variant.size} · ${variant.bouquetVeilCount} voiles`;
  return [variant.colorName, variant.size].filter(Boolean).join(" · ") || null;
}

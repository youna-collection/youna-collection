/** Page catégorie : une vignette par couleur (épuisées comprises), filtres et tri. Utilisable côté serveur comme côté navigateur. */
import { imagesForVariant, isInStock, priceRange, variantQuery, type Product } from "./product";

export type Tile = {
  key: string;
  href: string;
  modelSlug: string;
  modelName: string;
  /** Sous-titre : la couleur, ou le nombre de tailles. */
  subtitle: string | null;
  imageUrl: string | null;
  imageAlt: string;
  priceCents: number;
  compareAtCents: number | null;
  /** Prix « à partir de » (plusieurs tailles à des prix différents). */
  from: boolean;
  inStock: boolean;
  /** Ordre choisi dans l'admin : modèle puis couleur. */
  order: number;
};

export type Sort = "modele" | "prix-asc" | "prix-desc";
export const SORTS: { value: Sort; label: string }[] = [
  { value: "modele", label: "Par modèle" },
  { value: "prix-asc", label: "Prix croissant" },
  { value: "prix-desc", label: "Prix décroissant" },
];

export type Filters = { models: string[]; inStockOnly: boolean; sort: Sort };

/** Chaque couleur visible devient une vignette ; un produit sans couleurs (tailles, bouquet) reste une seule vignette. */
export function buildTiles(products: Product[]): Tile[] {
  return products.flatMap((product, p) => {
    const colors = product.variants.filter((variant) => variant.colorSlug);
    if (colors.length) {
      return colors.map((variant, v) => {
        const image = imagesForVariant(product, variant.id)[0];
        return {
          key: variant.id,
          href: `/produits/${product.slug}${variantQuery(variant)}`,
          modelSlug: product.slug,
          modelName: product.name,
          subtitle: variant.colorName,
          imageUrl: image?.url ?? null,
          imageAlt: `${product.name} ${variant.colorName ?? ""}`.trim(),
          priceCents: variant.priceCents,
          compareAtCents: variant.compareAtPriceCents,
          from: false,
          inStock: isInStock(variant),
          order: p * 1000 + v,
        };
      });
    }
    const range = priceRange(product.variants);
    const first = product.variants.find(isInStock) ?? product.variants[0];
    const image = imagesForVariant(product, first?.id ?? null)[0];
    const sizes = product.variants.filter((variant) => variant.size).length;
    return [
      {
        key: product.id,
        href: `/produits/${product.slug}`,
        modelSlug: product.slug,
        modelName: product.name,
        subtitle: sizes > 1 ? `${sizes} tailles` : null,
        imageUrl: image?.url ?? null,
        imageAlt: product.name,
        priceCents: range?.min ?? 0,
        compareAtCents: range && range.min === range.max ? (first?.compareAtPriceCents ?? null) : null,
        from: Boolean(range && range.min !== range.max),
        inStock: product.variants.some(isInStock),
        order: p * 1000,
      },
    ];
  });
}

/** Modèles présents, dans l'ordre de l'admin, avec leur nombre de vignettes. */
export function modelsOf(tiles: Tile[]): { slug: string; name: string; count: number }[] {
  const models = new Map<string, { slug: string; name: string; count: number }>();
  for (const tile of tiles) {
    const model = models.get(tile.modelSlug) ?? { slug: tile.modelSlug, name: tile.modelName, count: 0 };
    model.count += 1;
    models.set(tile.modelSlug, model);
  }
  return [...models.values()];
}

export function applyFilters(tiles: Tile[], filters: Filters): Tile[] {
  const kept = tiles.filter(
    (tile) => (!filters.models.length || filters.models.includes(tile.modelSlug)) && (!filters.inStockOnly || tile.inStock),
  );
  // Par défaut : modèle par modèle, les couleurs disponibles d'abord, les épuisées ensuite.
  const byModel = (a: Tile, b: Tile) => Math.floor(a.order / 1000) - Math.floor(b.order / 1000) || Number(b.inStock) - Number(a.inStock) || a.order - b.order;
  const sorted = [...kept];
  if (filters.sort === "prix-asc") sorted.sort((a, b) => a.priceCents - b.priceCents || byModel(a, b));
  else if (filters.sort === "prix-desc") sorted.sort((a, b) => b.priceCents - a.priceCents || byModel(a, b));
  else sorted.sort(byModel);
  return sorted;
}

/** Lit les filtres dans l'adresse (?modele=liquid-jersey,liquid-silk&stock=1&tri=prix-asc). */
export function parseFilters(params: Record<string, string | string[] | undefined>, models: string[]): Filters {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : Array.isArray(value) ? (value[0] ?? "") : "";
  };
  const sort = SORTS.find((s) => s.value === one("tri"))?.value ?? "modele";
  return {
    models: one("modele")
      .split(",")
      .filter((slug) => models.includes(slug)),
    inStockOnly: one("stock") === "1",
    sort,
  };
}

export function filtersQuery(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.models.length) params.set("modele", filters.models.join(","));
  if (filters.inStockOnly) params.set("stock", "1");
  if (filters.sort !== "modele") params.set("tri", filters.sort);
  const query = params.toString();
  return query ? `?${query.replaceAll("%2C", ",")}` : "";
}

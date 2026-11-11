import { slugify } from "../../src/lib/format.ts";
import { CATEGORIES, PRODUCTS, VARIANTS, type CategoryDef } from "./shopify-map.ts";

/** Une ligne de l'export Shopify (products_export.csv), colonnes utiles seulement. */
export type ShopifyRow = Record<string, string>;

export type CatalogImage = { sourceUrl: string; alt: string };

export type CatalogVariant = {
  sku: string;
  legacyHandle: string;
  colorName: string | null;
  colorSlug: string | null;
  colorHexOverride: string | null;
  size: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  weightGrams: number;
  stock: number;
  isActive: boolean;
  bouquetVeilCount: number | null;
  position: number;
  images: CatalogImage[];
};

export type CatalogProduct = {
  slug: string;
  name: string;
  description: string;
  categorySlug: string;
  kind: "standard" | "bouquet";
  status: "active" | "draft";
  bouquetEligible: boolean;
  position: number;
  swatchPoint: { x: number; y: number } | null;
  /** Photos communes à toutes les variantes (ex. le bouquet). */
  images: CatalogImage[];
  variants: CatalogVariant[];
};

export type Catalog = {
  categories: CategoryDef[];
  products: CatalogProduct[];
  /** Ancienne adresse Shopify -> nouvelle adresse, pour les redirections à l'ouverture. */
  redirects: Record<string, string>;
};

// Même règle que le site : les adresses des couleurs doivent correspondre.
export { slugify };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Transforme la description HTML de Shopify en texte simple, paragraphes conservés. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === "#") {
        const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(value) ? String.fromCodePoint(value) : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/ /g, " ")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function toCents(value: string | undefined): number | null {
  if (!value || !value.trim()) return null;
  const amount = Number(value.replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Prix invalide : ${value}`);
  }
  return Math.round(amount * 100);
}

export function buildCatalog(rows: ShopifyRow[]): Catalog {
  // Une fiche Shopify = sa première ligne ; les lignes suivantes n'apportent que des photos.
  const mainRows = new Map<string, ShopifyRow>();
  const imagesByHandle = new Map<string, { url: string; position: number; alt: string }[]>();

  for (const row of rows) {
    const handle = row["Handle"]?.trim();
    if (!handle) continue;
    if (row["Title"]?.trim() && !mainRows.has(handle)) {
      mainRows.set(handle, row);
    }
    const src = row["Image Src"]?.trim();
    if (src) {
      const list = imagesByHandle.get(handle) ?? [];
      if (!list.some((image) => image.url === src)) {
        list.push({ url: src, position: Number(row["Image Position"]) || list.length + 1, alt: row["Image Alt Text"]?.trim() ?? "" });
      }
      imagesByHandle.set(handle, list);
    }
  }

  const unmapped = [...mainRows.keys()].filter((handle) => !(handle in VARIANTS));
  const missing = Object.keys(VARIANTS).filter((handle) => !mainRows.has(handle));
  if (unmapped.length || missing.length) {
    throw new Error(
      `Correspondance incomplète. Absents de la liste : ${unmapped.join(", ") || "aucun"}. Absents de l'export : ${missing.join(", ") || "aucun"}.`,
    );
  }

  const redirects: Record<string, string> = {};
  const handleOrder = Object.keys(VARIANTS);

  const products = PRODUCTS.map((def): CatalogProduct => {
    const handles = handleOrder.filter((handle) => VARIANTS[handle].product === def.slug);

    const variants = handles.map((handle, index): CatalogVariant => {
      const row = mainRows.get(handle)!;
      const map = VARIANTS[handle];
      const priceCents = toCents(row["Variant Price"]);
      if (priceCents === null) throw new Error(`Prix manquant pour ${handle}`);
      const compareAt = toCents(row["Variant Compare At Price"]);
      const grams = Math.round(Number(row["Variant Grams"]) || 0);
      const optionKey = map.color ?? map.size ?? null;
      const colorName = map.color ?? null;
      const label = colorName ?? map.size ?? def.name;

      const query = map.color ? `?couleur=${slugify(map.color)}` : map.size ? `?taille=${slugify(map.size)}` : "";
      redirects[`/products/${handle}`] = `/produits/${def.slug}${query}`;

      return {
        sku: optionKey ? `${def.slug}-${slugify(optionKey)}` : def.slug,
        legacyHandle: handle,
        colorName,
        colorSlug: colorName ? slugify(colorName) : null,
        colorHexOverride: map.hex ?? null,
        size: map.size ?? null,
        priceCents,
        compareAtPriceCents: compareAt !== null && compareAt > priceCents ? compareAt : null,
        weightGrams: grams > 0 ? grams : def.defaultWeightGrams,
        stock: Math.max(0, Math.trunc(Number(row["Variant Inventory Qty"]) || 0)),
        isActive: row["Status"]?.trim() === "active",
        bouquetVeilCount: map.bouquetVeilCount ?? null,
        position: index,
        images: (imagesByHandle.get(handle) ?? [])
          .sort((a, b) => a.position - b.position)
          .map((image) => ({ sourceUrl: image.url, alt: image.alt || `${def.name} ${label}` })),
      };
    });

    // Une photo partagée par toutes les variantes devient une photo de la fiche.
    const sharedUrls =
      variants.length > 1
        ? variants[0].images.map((image) => image.sourceUrl).filter((url) => variants.every((v) => v.images.some((image) => image.sourceUrl === url)))
        : [];
    const images = variants[0].images
      .filter((image) => sharedUrls.includes(image.sourceUrl))
      .map((image) => ({ sourceUrl: image.sourceUrl, alt: def.name }));
    for (const variant of variants) {
      variant.images = variant.images.filter((image) => !sharedUrls.includes(image.sourceUrl));
    }

    const descriptionRow = mainRows.get(def.descriptionFrom);
    if (!descriptionRow) throw new Error(`Description introuvable : ${def.descriptionFrom}`);

    return {
      slug: def.slug,
      name: def.name,
      description: htmlToText(descriptionRow["Body (HTML)"] ?? ""),
      categorySlug: def.category,
      kind: def.kind,
      status: variants.some((variant) => variant.isActive) ? "active" : "draft",
      bouquetEligible: def.bouquetEligible,
      position: def.position,
      swatchPoint: def.swatchPoint ?? null,
      images,
      variants,
    };
  });

  return { categories: CATEGORIES, products, redirects };
}

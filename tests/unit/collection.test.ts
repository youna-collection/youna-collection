import { describe, expect, it } from "vitest";
import { applyFilters, buildTiles, filtersQuery, modelsOf, parseFilters } from "@/lib/collection";
import type { Product, Variant } from "@/lib/product";

const variant = (id: string, color: string | null, price: number, available: number, size: string | null = null): Variant => ({
  id,
  sku: null,
  colorName: color,
  colorSlug: color ? color.toLowerCase() : null,
  colorHex: null,
  size,
  sizeSlug: size ? size.toLowerCase() : null,
  priceCents: price,
  compareAtPriceCents: null,
  available,
  trackStock: true,
  bouquetVeilCount: null,
  position: 0,
});

const product = (slug: string, variants: Variant[]): Product => ({
  id: slug,
  slug,
  name: slug.replace("-", " "),
  description: "",
  kind: "standard",
  bouquetEligible: false,
  position: 0,
  category: { slug: "voiles", name: "Voiles" },
  variants,
  images: variants.map((v) => ({ id: `img-${v.id}`, variantId: v.id, url: `https://x/${v.id}.webp`, alt: "", position: 0 })),
});

const products = [
  product("liquid-jersey", [variant("j1", "Matcha", 1199, 0), variant("j2", "Sable", 1199, 5)]),
  product("liquid-silk", [variant("s1", "Noir", 1499, 2)]),
  product("bouquet", [variant("b1", null, 3000, 9, "S"), variant("b2", null, 5000, 9, "L")]),
];

describe("page catégorie", () => {
  const tiles = buildTiles(products);

  it("une vignette par couleur, épuisées comprises, avec sa photo et la couleur en sous-titre", () => {
    expect(tiles.map((t) => t.key)).toEqual(["j1", "j2", "s1", "bouquet"]);
    expect(tiles[0]).toMatchObject({ modelName: "liquid jersey", subtitle: "Matcha", inStock: false, href: "/produits/liquid-jersey?couleur=matcha", imageUrl: "https://x/j1.webp" });
    expect(tiles[3]).toMatchObject({ subtitle: "2 tailles", priceCents: 3000, from: true, inStock: true });
  });

  it("par défaut : modèle par modèle, les couleurs épuisées à la fin de leur modèle", () => {
    expect(applyFilters(tiles, { models: [], inStockOnly: false, sort: "modele" }).map((t) => t.key)).toEqual(["j2", "j1", "s1", "bouquet"]);
  });

  it("filtres modèle et stock, tri par prix", () => {
    expect(applyFilters(tiles, { models: ["liquid-jersey"], inStockOnly: false, sort: "modele" }).map((t) => t.key)).toEqual(["j2", "j1"]);
    expect(applyFilters(tiles, { models: [], inStockOnly: true, sort: "prix-desc" }).map((t) => t.key)).toEqual(["bouquet", "s1", "j2"]);
    expect(modelsOf(tiles).map((m) => [m.slug, m.count])).toEqual([["liquid-jersey", 2], ["liquid-silk", 1], ["bouquet", 1]]);
  });

  it("filtres lus dans l'adresse, en ignorant les valeurs inconnues", () => {
    const filters = parseFilters({ modele: "liquid-silk,inconnu", stock: "1", tri: "prix-asc" }, ["liquid-jersey", "liquid-silk"]);
    expect(filters).toEqual({ models: ["liquid-silk"], inStockOnly: true, sort: "prix-asc" });
    expect(filtersQuery(filters)).toBe("?modele=liquid-silk&stock=1&tri=prix-asc");
    expect(parseFilters({ tri: "n'importe quoi" }, [])).toEqual({ models: [], inStockOnly: false, sort: "modele" });
    expect(filtersQuery({ models: [], inStockOnly: false, sort: "modele" })).toBe("");
  });
});

import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import { buildCatalog, htmlToText, slugify, type ShopifyRow } from "../../scripts/catalog/build-catalog";

const row = (handle: string, extra: Partial<ShopifyRow> = {}): ShopifyRow => ({
  Handle: handle,
  Title: handle.toUpperCase(),
  "Body (HTML)": "<p>Texte</p>",
  "Variant Price": "8.99",
  "Variant Compare At Price": "",
  "Variant Grams": "300.0",
  "Variant Inventory Qty": "2",
  Status: "active",
  "Image Src": `https://cdn.example/${handle}.png`,
  "Image Position": "1",
  ...extra,
});

describe("htmlToText", () => {
  it("garde les paragraphes et retire les balises", () => {
    expect(htmlToText('<p><meta charset="UTF-8"><span>Un&nbsp;tissu</span> fluide.<br></p><p>Taille unique</p>')).toBe(
      "Un tissu fluide.\n\nTaille unique",
    );
  });

  it("décode les caractères spéciaux", () => {
    expect(htmlToText("<p>L&#39;abaya &amp; le khimar</p>")).toBe("L'abaya & le khimar");
  });
});

describe("slugify", () => {
  it("produit une adresse lisible", () => {
    expect(slugify("Jaune Vanille")).toBe("jaune-vanille");
    expect(slugify("Écharpe  d'été!")).toBe("echarpe-d-ete");
  });
});

// L'export réel n'est pas dans le dépôt (il reste dans le dossier OneDrive) : test sauté s'il est absent.
const exportPath = process.env.SHOPIFY_PRODUCTS_CSV;
const realRows: ShopifyRow[] | null = exportPath
  ? parse(readFileSync(exportPath, "utf8"), { columns: true, bom: true, skip_empty_lines: true })
  : null;

describe.runIf(realRows)("export Shopify réel", () => {
  // Vitest parcourt ce bloc même quand il est ignoré : pas d'export, pas de calcul.
  const catalog = realRows ? buildCatalog(realRows) : { products: [], categories: [], redirects: {} };
  const bySlug = Object.fromEntries(catalog.products.map((product) => [product.slug, product]));

  it("reprend les 56 fiches Shopify, sans en perdre aucune", () => {
    const variants = catalog.products.flatMap((product) => product.variants);
    expect(variants).toHaveLength(56);
    expect(new Set(variants.map((variant) => variant.sku)).size).toBe(56);
    expect(Object.keys(catalog.redirects)).toHaveLength(56);
  });

  it("regroupe les couleurs en 9 fiches", () => {
    expect(catalog.products.map((product) => [product.slug, product.variants.length])).toEqual([
      ["liquid-jersey", 16],
      ["jersey", 14],
      ["premium-jersey-pearly", 2],
      ["abaya-essential", 7],
      ["set-abaya-khimar", 5],
      ["abaya-abeer", 1],
      ["jupe-coton", 2],
      ["cagoule", 5],
      ["bouquet-youna", 4],
    ]);
  });

  it("conserve prix, prix barrés et stocks", () => {
    const pearly = bySlug["premium-jersey-pearly"].variants;
    expect(pearly.find((v) => v.colorName === "White")).toMatchObject({ priceCents: 999, compareAtPriceCents: 1199, stock: 2 });
    expect(pearly.find((v) => v.colorName === "Black")).toMatchObject({ priceCents: 1500, compareAtPriceCents: null });
    expect(bySlug["abaya-essential"].variants.find((v) => v.colorName === "Burgundy")).toMatchObject({
      priceCents: 999,
      compareAtPriceCents: 2099,
      stock: 4,
    });
  });

  it("garde les brouillons Shopify masqués", () => {
    const jersey = bySlug["jersey"].variants;
    expect(jersey.find((v) => v.colorName === "Amber")?.isActive).toBe(false);
    expect(jersey.find((v) => v.colorName === "Peach")?.isActive).toBe(true);
    expect(bySlug["liquid-jersey"].variants.find((v) => v.colorName === "Toffee")?.isActive).toBe(false);
  });

  it("décrit les bouquets par taille et nombre de voiles", () => {
    const bouquet = bySlug["bouquet-youna"];
    expect(bouquet.kind).toBe("bouquet");
    expect(bouquet.variants.map((v) => [v.size, v.bouquetVeilCount, v.priceCents])).toEqual([
      ["S", 3, 3699],
      ["M", 4, 4599],
      ["L", 5, 5499],
      ["XL", 6, 6499],
    ]);
    expect(bouquet.images).toHaveLength(1);
    expect(bouquet.variants.every((v) => v.images.length === 0)).toBe(true);
  });

  it("remplace un poids de 0 g par le poids par défaut", () => {
    expect(bySlug["abaya-abeer"].variants[0].weightGrams).toBe(300);
    expect(bySlug["abaya-abeer"].variants[0].images).toHaveLength(2);
  });

  it("prépare la redirection des anciennes adresses", () => {
    expect(catalog.redirects["/products/liquid-jersey-2"]).toBe("/produits/liquid-jersey?couleur=dark-brown");
    expect(catalog.redirects["/products/bouquets-youna"]).toBe("/produits/bouquet-youna?taille=l");
  });
});

describe("garde-fous de l'import", () => {
  it("refuse un export contenant une fiche inconnue", () => {
    expect(() => buildCatalog([row("produit-inconnu")])).toThrow(/Correspondance incomplète/);
  });
});

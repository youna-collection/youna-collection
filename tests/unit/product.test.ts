import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format";
import {
  defaultVariant,
  findVariant,
  imagesForVariant,
  isInStock,
  priceRange,
  variantLabel,
  variantQuery,
  type Product,
  type Variant,
} from "@/lib/product";

const variant = (id: string, extra: Partial<Variant> = {}): Variant => ({
  id,
  sku: id,
  colorName: null,
  colorSlug: null,
  colorHex: null,
  size: null,
  sizeSlug: null,
  priceCents: 1199,
  compareAtPriceCents: null,
  available: 2,
  trackStock: true,
  bouquetVeilCount: null,
  position: 0,
  ...extra,
});

const image = (id: string, variantId: string | null) => ({ id, variantId, url: `/${id}.webp`, alt: id, position: 0 });

const product = (variants: Variant[], images = [image("a", "noir"), image("b", "matcha")]): Product => ({
  id: "p",
  slug: "liquid-jersey",
  name: "Liquid Jersey",
  description: "",
  kind: "standard",
  bouquetEligible: false,
  position: 0,
  category: null,
  variants,
  images,
});

const noir = variant("noir", { colorName: "Noir", colorSlug: "noir", available: 0 });
const matcha = variant("matcha", { colorName: "Matcha", colorSlug: "matcha", priceCents: 1099 });

describe("formatPrice", () => {
  it("affiche le prix à la française", () => {
    expect(formatPrice(1199).replace(/\s/g, " ")).toBe("11,99 €");
  });
});

describe("stock", () => {
  it("considère une variante sans suivi de stock comme disponible", () => {
    expect(isInStock(variant("x", { trackStock: false, available: 0 }))).toBe(true);
    expect(isInStock(noir)).toBe(false);
  });

  it("met en avant la première couleur disponible", () => {
    expect(defaultVariant(product([noir, matcha]))?.id).toBe("matcha");
  });

  it("montre quand même une fiche entièrement épuisée", () => {
    expect(defaultVariant(product([noir]))?.id).toBe("noir");
  });
});

describe("choix depuis l'adresse", () => {
  it("ouvre la couleur demandée, même épuisée", () => {
    expect(findVariant(product([noir, matcha]), { couleur: "noir" })?.id).toBe("noir");
  });

  it("ignore une couleur inconnue", () => {
    expect(findVariant(product([noir, matcha]), { couleur: "pirate" })?.id).toBe("matcha");
  });

  it("retrouve une taille de bouquet", () => {
    const xl = variant("xl", { size: "XL", sizeSlug: "xl", bouquetVeilCount: 6 });
    expect(findVariant(product([variant("s", { size: "S", sizeSlug: "s" }), xl]), { taille: "xl" })?.id).toBe("xl");
    expect(variantQuery(xl)).toBe("?taille=xl");
    expect(variantLabel(xl)).toBe("XL · 6 voiles");
  });
});

describe("photos", () => {
  it("montre les photos de la couleur choisie, puis les photos communes", () => {
    const p = product([noir, matcha], [image("commune", null), image("a", "noir"), image("b", "matcha")]);
    expect(imagesForVariant(p, "matcha").map((i) => i.id)).toEqual(["b", "commune"]);
  });

  it("utilise la photo d'une autre couleur si la variante n'en a pas", () => {
    const p = product([noir, matcha], [image("a", "noir")]);
    expect(imagesForVariant(p, "matcha").map((i) => i.id)).toEqual(["a"]);
  });
});

describe("prix", () => {
  it("calcule la fourchette de prix", () => {
    expect(priceRange([noir, matcha])).toEqual({ min: 1099, max: 1199 });
    expect(priceRange([])).toBeNull();
  });
});

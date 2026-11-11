import { describe, expect, it } from "vitest";
import { buildSnapshot, evaluateCart, type CartVariantInfo } from "@/lib/cart-rules";
import { quote, shippingCountries, shippingOptions, type ShippingMethod } from "@/lib/shipping";

const v = (id: string, extra: Partial<CartVariantInfo> = {}): CartVariantInfo => ({
  id,
  sku: id,
  productId: "p-voile",
  productSlug: "liquid-jersey",
  productName: "Liquid Jersey",
  productKind: "standard",
  productActive: true,
  productBouquetEligible: true,
  colorName: id,
  size: null,
  priceCents: 1199,
  weightGrams: 300,
  available: 3,
  trackStock: true,
  isActive: true,
  bouquetVeilCount: null,
  ...extra,
});

const bouquetS = v("bouquet-s", {
  productId: "p-bouquet",
  productSlug: "bouquet-youna",
  productName: "Bouquet Youna",
  productKind: "bouquet",
  productBouquetEligible: false,
  colorName: null,
  size: "S",
  bouquetVeilCount: 3,
  priceCents: 3699,
  weightGrams: 900,
});

const catalog = (...list: CartVariantInfo[]) => new Map(list.map((variant) => [variant.id, variant]));

describe("panier", () => {
  it("calcule le total, le poids et le nombre d'articles", () => {
    const cart = evaluateCart([{ id: "l1", variantId: "Noir", quantity: 2, veilIds: [] }], catalog(v("Noir")));
    expect(cart).toMatchObject({ count: 2, subtotalCents: 2398, weightGrams: 600, canCheckout: true });
    expect(cart.lines[0].label).toBe("Noir");
  });

  it("bloque le paiement si la quantité dépasse le stock", () => {
    const cart = evaluateCart([{ id: "l1", variantId: "Noir", quantity: 4, veilIds: [] }], catalog(v("Noir")));
    expect(cart.canCheckout).toBe(false);
    expect(cart.lines[0].problem).toBe("Plus que 3 en stock.");
  });

  it("signale un article retiré de la vente", () => {
    const cart = evaluateCart(
      [{ id: "l1", variantId: "Noir", quantity: 1, veilIds: [] }],
      catalog(v("Noir", { productActive: false })),
    );
    expect(cart.lines[0].problem).toBe("Cet article n'est plus disponible.");
  });

  it("signale un article supprimé", () => {
    const cart = evaluateCart([{ id: "l1", variantId: "disparu", quantity: 1, veilIds: [] }], catalog());
    expect(cart).toMatchObject({ canCheckout: false, subtotalCents: 0 });
  });

  it("accepte un article sans suivi de stock", () => {
    const cart = evaluateCart(
      [{ id: "l1", variantId: "Noir", quantity: 8, veilIds: [] }],
      catalog(v("Noir", { trackStock: false, available: 0 })),
    );
    expect(cart.canCheckout).toBe(true);
  });
});

describe("bouquets", () => {
  const veils = catalog(bouquetS, v("Noir"), v("Matcha", { available: 1 }), v("Pearly", { productBouquetEligible: false }));

  it("décrit la composition et réserve les voiles", () => {
    const cart = evaluateCart([{ id: "b", variantId: "bouquet-s", quantity: 1, veilIds: ["Noir", "Noir", "Matcha"] }], veils);
    expect(cart.canCheckout).toBe(true);
    expect(cart.lines[0].label).toBe("S · 3 voiles");
    expect(cart.lines[0].components.map((c) => c.label)).toEqual(["Liquid Jersey Noir", "Liquid Jersey Noir", "Liquid Jersey Matcha"]);
    expect(cart.stockItems).toEqual([
      { variant_id: "bouquet-s", quantity: 1 },
      { variant_id: "Noir", quantity: 2 },
      { variant_id: "Matcha", quantity: 1 },
    ]);
    expect(cart.weightGrams).toBe(900);
  });

  it("exige le bon nombre de voiles", () => {
    const cart = evaluateCart([{ id: "b", variantId: "bouquet-s", quantity: 1, veilIds: ["Noir"] }], veils);
    expect(cart.lines[0].problem).toBe("Ce bouquet doit contenir 3 voiles.");
  });

  it("refuse un voile qui ne peut pas aller dans un bouquet", () => {
    const cart = evaluateCart([{ id: "b", variantId: "bouquet-s", quantity: 1, veilIds: ["Noir", "Noir", "Pearly"] }], veils);
    expect(cart.lines[0].problem).toBe("Un des voiles choisis n'est plus disponible.");
  });

  it("partage le stock entre un voile seul et le même voile dans un bouquet", () => {
    const cart = evaluateCart(
      [
        { id: "seul", variantId: "Matcha", quantity: 1, veilIds: [] },
        { id: "b", variantId: "bouquet-s", quantity: 1, veilIds: ["Noir", "Noir", "Matcha"] },
      ],
      veils,
    );
    expect(cart.canCheckout).toBe(false);
    expect(cart.lines[0].problem).toBe("Plus que 1 en stock, en comptant les voiles de vos bouquets.");
    expect(cart.lines[1].problem).toBe("Le voile Liquid Jersey Matcha n'est plus disponible en quantité suffisante.");
  });

  it("multiplie les voiles par le nombre de bouquets", () => {
    const cart = evaluateCart([{ id: "b", variantId: "bouquet-s", quantity: 2, veilIds: ["Noir", "Noir", "Noir"] }], veils);
    expect(cart.lines[0].problem).toMatch(/Noir n'est plus disponible/);
  });
});

describe("livraison", () => {
  const relay: ShippingMethod = {
    code: "mondial_relay",
    name: "Point relais",
    description: null,
    carrier: "mondial_relay",
    requiresRelayPoint: true,
    requiresAddress: false,
    rates: [
      { country: "FR", maxWeightGrams: 30000, priceCents: 540 },
      { country: "FR", maxWeightGrams: 500, priceCents: 430 },
    ],
  };
  const international: ShippingMethod = {
    ...relay,
    code: "international",
    carrier: "colissimo",
    requiresRelayPoint: false,
    requiresAddress: true,
    rates: [
      { country: "BE", maxWeightGrams: 30000, priceCents: 1500 },
      { country: "IT", maxWeightGrams: 30000, priceCents: 1500 },
    ],
  };

  it("applique la tranche de poids", () => {
    expect(quote(relay, "FR", 300)).toBe(430);
    expect(quote(relay, "FR", 500)).toBe(430);
    expect(quote(relay, "FR", 900)).toBe(540);
    expect(quote(relay, "FR", 31000)).toBeNull();
    expect(quote(relay, "BE", 300)).toBeNull();
  });

  it("ne propose que les modes disponibles pour le pays", () => {
    expect(shippingOptions([relay, international], "BE", 300).map((o) => o.method.code)).toEqual(["international"]);
    expect(shippingCountries([relay, international])).toEqual(["FR", "BE", "IT"]);
  });
});

describe("copie de la commande", () => {
  it("fige les lignes, la livraison et les totaux", () => {
    const cart = evaluateCart([{ id: "l1", variantId: "Noir", quantity: 2, veilIds: [] }], catalog(v("Noir")));
    const snapshot = buildSnapshot(
      cart,
      { methodCode: "mondial_relay", carrier: "mondial_relay", name: "Point relais", priceCents: 540, address: null, relayPoint: { id: "012345" } },
      { email: "a@b.fr", firstName: "A", lastName: "B", phone: "0600000000" },
    );
    expect(snapshot.totals).toEqual({ subtotal_cents: 2398, discount_cents: 0, shipping_cents: 540, total_cents: 2938, promo_code: null });
    expect(snapshot.items[0]).toMatchObject({ variant_id: "Noir", quantity: 2, unit_price_cents: 1199, line_total_cents: 2398 });
    expect(snapshot.stock_items).toEqual([{ variant_id: "Noir", quantity: 2 }]);
  });

  it("applique le code promo : réduction sur les articles, livraison éventuellement offerte", () => {
    const cart = evaluateCart([{ id: "l1", variantId: "Noir", quantity: 2, veilIds: [] }], catalog(v("Noir")));
    const shipping = { methodCode: "colissimo", carrier: "colissimo" as const, name: "Colissimo", priceCents: 1026, address: null, relayPoint: null };
    const customer = { email: "a@b.fr", firstName: "A", lastName: "B", phone: "0600000000" };
    const withCode = buildSnapshot(cart, shipping, customer, { code: "MOINS5", discountCents: 500, shippingCents: 1026 });
    expect(withCode.totals).toEqual({ subtotal_cents: 2398, discount_cents: 500, shipping_cents: 1026, total_cents: 2924, promo_code: "MOINS5" });
    const freeShipping = buildSnapshot(cart, shipping, customer, { code: "PORT", discountCents: 0, shippingCents: 0 });
    expect(freeShipping.totals.total_cents).toBe(2398);
    expect(freeShipping.shipping.price_cents).toBe(0);
  });
});

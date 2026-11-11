import { describe, expect, it } from "vitest";
import { applyPromo, normalizePromoCode, promoError, promoLabel } from "@/lib/promo";

describe("codes promo", () => {
  it("applique un pourcentage arrondi au centime, sur les articles seulement", () => {
    expect(applyPromo({ code: "X", type: "percent", value: 10 }, 3597, 540)).toEqual({ discountCents: 360, shippingCents: 540, totalCents: 3777 });
  });

  it("ne descend jamais sous zéro", () => {
    expect(applyPromo({ code: "X", type: "fixed", value: 5000 }, 1199, 430)).toEqual({ discountCents: 1199, shippingCents: 430, totalCents: 430 });
  });

  it("offre la livraison", () => {
    expect(applyPromo({ code: "X", type: "free_shipping", value: 0 }, 1199, 430)).toEqual({ discountCents: 0, shippingCents: 0, totalCents: 1199 });
    expect(applyPromo(null, 1199, 430).totalCents).toBe(1629);
  });

  it("affiche des libellés et des erreurs lisibles", () => {
    expect(promoLabel({ type: "percent", value: 15 })).toBe("−15 %");
    expect(promoLabel({ type: "fixed", value: 500 })).toBe("−5,00 €");
    expect(promoError("promo_minimum", "3000")).toBe("Ce code est valable dès 30,00 € d'achat.");
    expect(promoError("n'importe quoi")).toBe("Ce code n'existe pas.");
    expect(normalizePromoCode(" bien venue ")).toBe("BIENVENUE");
  });
});

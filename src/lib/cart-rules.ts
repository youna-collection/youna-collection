/**
 * Règles du panier, sans accès à la base : disponibilité, bouquets, totaux.
 * Le serveur les applique à l'affichage du panier ET au moment du paiement.
 */

export const MAX_LINE_QUANTITY = 10;

export type CartVariantInfo = {
  id: string;
  sku: string | null;
  productId: string;
  productSlug: string;
  productName: string;
  productKind: "standard" | "bouquet";
  productActive: boolean;
  productBouquetEligible: boolean;
  colorName: string | null;
  size: string | null;
  priceCents: number;
  weightGrams: number;
  available: number;
  trackStock: boolean;
  isActive: boolean;
  bouquetVeilCount: number | null;
};

export type RawCartItem = { id: string; variantId: string; quantity: number; veilIds: string[] };

export type CartComponent = { variantId: string; label: string };

export type CartLine = {
  id: string;
  quantity: number;
  variant: CartVariantInfo | null;
  productName: string;
  label: string | null;
  components: CartComponent[];
  unitPriceCents: number;
  lineTotalCents: number;
  maxQuantity: number;
  problem: string | null;
};

export type EvaluatedCart = {
  lines: CartLine[];
  count: number;
  subtotalCents: number;
  weightGrams: number;
  canCheckout: boolean;
  /** Ce qu'il faut réserver : articles + voiles des bouquets, regroupés. */
  stockItems: { variant_id: string; quantity: number }[];
};

export function variantDisplayLabel(variant: Pick<CartVariantInfo, "colorName" | "size" | "bouquetVeilCount">): string | null {
  if (variant.size && variant.bouquetVeilCount) return `${variant.size} · ${variant.bouquetVeilCount} voiles`;
  return variant.colorName ?? variant.size;
}

export function veilLabel(variant: Pick<CartVariantInfo, "productName" | "colorName">): string {
  return [variant.productName, variant.colorName].filter(Boolean).join(" ");
}

function isSellable(variant: CartVariantInfo | undefined): variant is CartVariantInfo {
  return Boolean(variant && variant.isActive && variant.productActive);
}

/** Vérifie la composition d'un bouquet : bon nombre de voiles, tous éligibles et en vente. */
export function bouquetProblem(bouquet: CartVariantInfo, veilIds: string[], variants: Map<string, CartVariantInfo>): string | null {
  if (!bouquet.bouquetVeilCount || veilIds.length !== bouquet.bouquetVeilCount) {
    return `Ce bouquet doit contenir ${bouquet.bouquetVeilCount ?? "?"} voiles.`;
  }
  for (const id of veilIds) {
    const veil = variants.get(id);
    if (!isSellable(veil) || !veil.productBouquetEligible) {
      return "Un des voiles choisis n'est plus disponible.";
    }
  }
  return null;
}

export function evaluateCart(items: RawCartItem[], variants: Map<string, CartVariantInfo>): EvaluatedCart {
  // 1. Contrôles propres à chaque ligne.
  const lines: CartLine[] = items.map((item) => {
    const variant = variants.get(item.variantId) ?? null;
    const isBouquet = variant?.productKind === "bouquet";
    const components = isBouquet
      ? item.veilIds.map((id) => {
          const veil = variants.get(id);
          return { variantId: id, label: veil ? veilLabel(veil) : "Voile indisponible" };
        })
      : [];
    let problem: string | null = null;
    if (!isSellable(variant ?? undefined)) {
      problem = "Cet article n'est plus disponible.";
    } else if (isBouquet) {
      problem = bouquetProblem(variant!, item.veilIds, variants);
    }
    const unitPriceCents = variant?.priceCents ?? 0;
    return {
      id: item.id,
      quantity: item.quantity,
      variant,
      productName: variant?.productName ?? "Article indisponible",
      label: variant ? variantDisplayLabel(variant) : null,
      components,
      unitPriceCents,
      lineTotalCents: unitPriceCents * item.quantity,
      maxQuantity: variant?.trackStock ? Math.max(0, Math.min(MAX_LINE_QUANTITY, variant.available)) : MAX_LINE_QUANTITY,
      problem,
    };
  });

  // 2. Le stock est partagé entre lignes : un voile seul et le même voile dans un bouquet.
  const demand = new Map<string, number>();
  const add = (id: string, quantity: number) => demand.set(id, (demand.get(id) ?? 0) + quantity);
  for (const line of lines) {
    if (line.problem || !line.variant) continue;
    add(line.variant.id, line.quantity);
    for (const component of line.components) add(component.variantId, line.quantity);
  }

  const short = new Set(
    [...demand].filter(([id, quantity]) => {
      const variant = variants.get(id);
      return variant?.trackStock && quantity > variant.available;
    }).map(([id]) => id),
  );

  for (const line of lines) {
    if (line.problem || !line.variant) continue;
    if (short.has(line.variant.id)) {
      const available = line.variant.available;
      if (available <= 0) {
        line.problem = "Cet article est épuisé.";
      } else if (line.quantity > available) {
        line.problem = `Plus que ${available} en stock.`;
      } else {
        // La ligne seule passerait : c'est le même article, dans un bouquet du panier, qui manque.
        line.problem = `Plus que ${available} en stock, en comptant les voiles de vos bouquets.`;
      }
      continue;
    }
    const missing = line.components.find((component) => short.has(component.variantId));
    if (missing) {
      line.problem = `Le voile ${missing.label} n'est plus disponible en quantité suffisante.`;
    }
  }

  const valid = lines.filter((line) => line.variant);
  return {
    lines,
    count: lines.reduce((total, line) => total + line.quantity, 0),
    subtotalCents: valid.reduce((total, line) => total + line.lineTotalCents, 0),
    weightGrams: valid.reduce((total, line) => total + line.variant!.weightGrams * line.quantity, 0),
    canCheckout: lines.length > 0 && lines.every((line) => !line.problem),
    stockItems: [...demand].map(([variant_id, quantity]) => ({ variant_id, quantity })),
  };
}

export type ShippingChoice = {
  methodCode: string;
  carrier: "mondial_relay" | "colissimo" | "pickup";
  name: string;
  priceCents: number;
  address: Record<string, string> | null;
  relayPoint: Record<string, string> | null;
};

export type Customer = { email: string; firstName: string; lastName: string; phone: string };

/** Copie figée de la commande au moment du paiement : c'est elle qui deviendra la commande. */
export function buildSnapshot(
  cart: EvaluatedCart,
  shipping: ShippingChoice,
  customer: Customer,
  promo: { code: string; discountCents: number; shippingCents: number } | null = null,
) {
  const discountCents = promo?.discountCents ?? 0;
  const shippingCents = promo?.shippingCents ?? shipping.priceCents;
  return {
    customer: {
      email: customer.email,
      first_name: customer.firstName,
      last_name: customer.lastName,
      phone: customer.phone,
    },
    items: cart.lines.map((line) => ({
      variant_id: line.variant!.id,
      product_name: line.productName,
      variant_label: line.label,
      sku: line.variant!.sku,
      unit_price_cents: line.unitPriceCents,
      quantity: line.quantity,
      line_total_cents: line.lineTotalCents,
      components: line.components.map((component) => ({ variant_id: component.variantId, label: component.label })),
    })),
    stock_items: cart.stockItems,
    shipping: {
      method_code: shipping.methodCode,
      carrier: shipping.carrier,
      name: shipping.name,
      price_cents: shippingCents,
      address: shipping.address,
      relay_point: shipping.relayPoint,
    },
    totals: {
      subtotal_cents: cart.subtotalCents,
      discount_cents: discountCents,
      shipping_cents: shippingCents,
      total_cents: cart.subtotalCents - discountCents + shippingCents,
      promo_code: promo?.code ?? null,
    },
  };
}

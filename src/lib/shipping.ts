/** Modes de livraison et calcul des frais : règles communes au serveur et au navigateur. */

export type ShippingRate = { country: string; maxWeightGrams: number; priceCents: number };

export type ShippingMethod = {
  code: string;
  name: string;
  description: string | null;
  carrier: "mondial_relay" | "colissimo" | "pickup";
  requiresRelayPoint: boolean;
  requiresAddress: boolean;
  rates: ShippingRate[];
};

export const COUNTRY_NAMES: Record<string, string> = {
  FR: "France",
  BE: "Belgique",
  LU: "Luxembourg",
  DE: "Allemagne",
  NL: "Pays-Bas",
  IT: "Italie",
  ES: "Espagne",
  PT: "Portugal",
  AT: "Autriche",
  IE: "Irlande",
};

/** Prix pour un pays et un poids : la plus petite tranche de poids qui convient. */
export function quote(method: ShippingMethod, country: string, weightGrams: number): number | null {
  const rate = method.rates
    .filter((r) => r.country === country && r.maxWeightGrams >= weightGrams)
    .sort((a, b) => a.maxWeightGrams - b.maxWeightGrams)[0];
  return rate ? rate.priceCents : null;
}

export function shippingOptions(methods: ShippingMethod[], country: string, weightGrams: number) {
  return methods.flatMap((method) => {
    const priceCents = quote(method, country, weightGrams);
    return priceCents === null ? [] : [{ method, priceCents }];
  });
}

/** Pays proposés au paiement : ceux qui ont au moins un tarif. */
export function shippingCountries(methods: ShippingMethod[]): string[] {
  const countries = new Set(methods.flatMap((method) => method.rates.map((rate) => rate.country)));
  return [...countries].sort((a, b) => (a === "FR" ? -1 : b === "FR" ? 1 : (COUNTRY_NAMES[a] ?? a).localeCompare(COUNTRY_NAMES[b] ?? b)));
}

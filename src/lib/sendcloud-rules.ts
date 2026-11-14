/**
 * Règles Sendcloud sans accès réseau (testées dans tests/unit/sendcloud.test.ts).
 * Le site choisit le transporteur ; Sendcloud fournit les points relais, les étiquettes et le suivi.
 */

/** Carton + papier de soie, ajoutés au poids des articles pour l'étiquette. */
export const PACKAGING_GRAMS = 100;

/** Point relais tel que gardé dans la commande (orders.relay_point). */
export type StoredRelayPoint = {
  /** Identifiant Sendcloud (sert à créer l'étiquette). */
  id: string;
  /** Numéro du point chez le transporteur (ex. « FR39930 » chez Mondial Relay). */
  carrier_id: string;
  carrier: string;
  /** « locker » pour une consigne automatique, sinon « servicepoint ». */
  shop_type: string;
  name: string;
  address1: string;
  address2: string;
  postal_code: string;
  city: string;
  country: string;
};

/** Réponse de GET /api/v3/service-points/{id} (champs utiles). */
export type ApiServicePoint = {
  id: number;
  name: string;
  carrier: { code: string };
  carrier_service_point_id: string;
  general_shop_type?: string | null;
  is_expired?: boolean;
  address: { street?: string | null; house_number?: string | null; postal_code: string; city: string; country_code: string };
};

export function relayFromApi(point: ApiServicePoint): StoredRelayPoint {
  const street = [point.address.house_number, point.address.street].filter(Boolean).join(" ").trim();
  return {
    id: String(point.id),
    carrier_id: point.carrier_service_point_id,
    carrier: point.carrier.code,
    shop_type: point.general_shop_type === "locker" ? "locker" : "servicepoint",
    name: point.name.trim(),
    address1: street,
    address2: "",
    postal_code: point.address.postal_code,
    city: point.address.city,
    country: point.address.country_code.toUpperCase(),
  };
}

/** Une option d'envoi renvoyée par POST /api/v3/shipping-options. */
export type ShippingOption = {
  code: string;
  name: string;
  carrier: { code: string };
  functionalities?: { last_mile?: string | null } | null;
  quotes?: { price?: { total?: { value: string; currency: string } } }[] | null;
};

export type Delivery = { carrier: "mondial_relay" | "colissimo"; lastMile: "service_point" | "locker" | "home_delivery" };

/** Le mode d'envoi Sendcloud qui correspond à la commande. */
export function deliveryFor(carrier: string | null, relay: Pick<StoredRelayPoint, "shop_type"> | null): Delivery | null {
  if (carrier === "mondial_relay" && relay) return { carrier: "mondial_relay", lastMile: relay.shop_type === "locker" ? "locker" : "service_point" };
  if (carrier === "colissimo") return { carrier: "colissimo", lastMile: "home_delivery" };
  return null;
}

const price = (o: ShippingOption) => {
  const value = o.quotes?.[0]?.price?.total?.value;
  return value ? Number.parseFloat(value) : Number.POSITIVE_INFINITY;
};

/**
 * Choisit l'option la moins chère pour ce transporteur et ce type de livraison,
 * sans les options payantes en plus (signature) ni le dépôt sans étiquette (QR).
 */
export function chooseShippingOption(options: ShippingOption[], delivery: Delivery): ShippingOption | null {
  const candidates = options.filter(
    (o) =>
      o.carrier.code === delivery.carrier &&
      (o.functionalities?.last_mile ?? "") === delivery.lastMile &&
      !/signature|_qr|labelless|insurance|age_check/i.test(o.code),
  );
  return candidates.sort((a, b) => price(a) - price(b) || a.code.localeCompare(b.code))[0] ?? null;
}

/** Poids de l'étiquette en kilos (texte, 3 décimales), emballage compris. */
export function labelWeightKg(items: { quantity: number; weightGrams: number }[]): string {
  const grams = items.reduce((sum, i) => sum + Math.max(0, i.weightGrams) * i.quantity, 0) + PACKAGING_GRAMS;
  return (grams / 1000).toFixed(3);
}

type Contact = Record<string, string> | null;

/**
 * Destinataire de l'étiquette : la cliente (nom, e-mail, téléphone).
 * En point relais, la commande ne contient pas son adresse : on met celle du point relais.
 */
export function recipient(order: { email: string | null; shipping_address: Contact; relay_point: Contact }) {
  const contact = order.shipping_address ?? {};
  const place = order.relay_point
    ? { address_line_1: order.relay_point.address1, address_line_2: order.relay_point.address2, postal_code: order.relay_point.postal_code, city: order.relay_point.city, country_code: order.relay_point.country }
    : { address_line_1: contact.line1, address_line_2: contact.line2, postal_code: contact.postal_code, city: contact.city, country_code: contact.country };
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || contact.name || "";
  const result: Record<string, string> = { name };
  for (const [key, value] of Object.entries(place)) if (value) result[key] = String(value).trim();
  if (order.email) result.email = order.email;
  if (contact.phone) result.phone_number = contact.phone;
  return result;
}

/** Ce qui manque pour créer l'étiquette (vide si tout y est). */
export function missingForLabel(to: Record<string, string>): string[] {
  const labels: Record<string, string> = { name: "nom", address_line_1: "adresse", postal_code: "code postal", city: "ville", country_code: "pays" };
  return Object.keys(labels).filter((key) => !to[key]).map((key) => labels[key]);
}

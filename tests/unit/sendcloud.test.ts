import { describe, expect, it } from "vitest";
import { chooseShippingOption, deliveryFor, labelWeightKg, missingForLabel, recipient, relayFromApi, type ShippingOption } from "@/lib/sendcloud-rules";

// Options telles que Sendcloud les renvoie pour la France (prix inventés).
const option = (code: string, carrier: string, lastMile: string, price: string): ShippingOption => ({
  code,
  name: code,
  carrier: { code: carrier },
  functionalities: { last_mile: lastMile },
  quotes: [{ price: { total: { value: price, currency: "EUR" } } }],
});
const options = [
  option("mondial_relay:locker_delivery,dualapi", "mondial_relay", "locker", "3.81"),
  option("mondial_relay:service_point,dualapi/size=l,c2c", "mondial_relay", "service_point", "3.91"),
  option("mondial_relay:service_point_qr,dualapi/size=l,c2c", "mondial_relay", "service_point", "3.50"),
  option("mondial_relay:home_domestic,dualapi/c2c", "mondial_relay", "home_delivery", "5.17"),
  option("colissimo:home/fr", "colissimo", "home_delivery", "8.94"),
  option("colissimo:home/signature,fr", "colissimo", "home_delivery", "10.15"),
  option("colissimo:post-office", "colissimo", "locker_or_service_point", "7.04"),
];

describe("offre d'envoi Sendcloud", () => {
  it("point relais Mondial Relay : l'offre avec étiquette, pas celle du dépôt par QR code", () => {
    expect(chooseShippingOption(options, { carrier: "mondial_relay", lastMile: "service_point" })?.code).toBe("mondial_relay:service_point,dualapi/size=l,c2c");
  });

  it("consigne automatique Mondial Relay et Colissimo à domicile sans signature", () => {
    expect(chooseShippingOption(options, { carrier: "mondial_relay", lastMile: "locker" })?.code).toBe("mondial_relay:locker_delivery,dualapi");
    expect(chooseShippingOption(options, { carrier: "colissimo", lastMile: "home_delivery" })?.code).toBe("colissimo:home/fr");
  });

  it("aucune offre si le transporteur n'est pas activé", () => {
    expect(chooseShippingOption(options.slice(0, 4), { carrier: "colissimo", lastMile: "home_delivery" })).toBeNull();
  });

  it("type de livraison selon la commande", () => {
    expect(deliveryFor("mondial_relay", { shop_type: "servicepoint" })).toEqual({ carrier: "mondial_relay", lastMile: "service_point" });
    expect(deliveryFor("mondial_relay", { shop_type: "locker" })).toEqual({ carrier: "mondial_relay", lastMile: "locker" });
    expect(deliveryFor("colissimo", null)).toEqual({ carrier: "colissimo", lastMile: "home_delivery" });
    expect(deliveryFor("pickup", null)).toBeNull();
    expect(deliveryFor("mondial_relay", null)).toBeNull();
  });
});

describe("étiquette", () => {
  it("poids en kilos, emballage compris", () => {
    expect(labelWeightKg([{ quantity: 2, weightGrams: 150 }, { quantity: 1, weightGrams: 400 }])).toBe("0.800");
    expect(labelWeightKg([])).toBe("0.100");
  });

  it("point relais : le nom de la cliente avec l'adresse du relais", () => {
    const to = recipient({
      email: "cliente@example.com",
      shipping_address: { first_name: "Inès", last_name: "Exemple", phone: "0600000000", country: "FR" },
      relay_point: { id: "18934668", name: "Tabac", address1: "3 rue Danton", address2: "", postal_code: "94270", city: "Le Kremlin-Bicêtre", country: "FR" },
    });
    expect(to).toEqual({
      name: "Inès Exemple",
      address_line_1: "3 rue Danton",
      postal_code: "94270",
      city: "Le Kremlin-Bicêtre",
      country_code: "FR",
      email: "cliente@example.com",
      phone_number: "0600000000",
    });
    expect(missingForLabel(to)).toEqual([]);
  });

  it("domicile : l'adresse de la cliente ; signale ce qui manque", () => {
    const to = recipient({
      email: null,
      shipping_address: { first_name: "Sara", last_name: "", line1: "1 rue des Lilas", line2: "Bât. B", postal_code: "83000", city: "Toulon", country: "FR" },
      relay_point: null,
    });
    expect(to).toMatchObject({ name: "Sara", address_line_1: "1 rue des Lilas", address_line_2: "Bât. B", city: "Toulon" });
    expect(missingForLabel({ name: "Sara", country_code: "FR" })).toEqual(["adresse", "code postal", "ville"]);
  });

  it("point relais lu chez Sendcloud", () => {
    expect(
      relayFromApi({
        id: 18934668,
        name: " LOCKER GARE ",
        carrier: { code: "mondial_relay" },
        carrier_service_point_id: "FR39930",
        general_shop_type: "locker",
        address: { street: "RUE DANTON", house_number: "3", postal_code: "94270", city: "LE KREMLIN BICETRE", country_code: "fr" },
      }),
    ).toEqual({
      id: "18934668",
      carrier_id: "FR39930",
      carrier: "mondial_relay",
      shop_type: "locker",
      name: "LOCKER GARE",
      address1: "3 RUE DANTON",
      address2: "",
      postal_code: "94270",
      city: "LE KREMLIN BICETRE",
      country: "FR",
    });
  });
});

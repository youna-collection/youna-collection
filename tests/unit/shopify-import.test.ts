import { describe, expect, it } from "vitest";
import { buildCustomers, buildOrders, clean, matchVariant, shopifyDate, type CatalogVariant, type CsvRow } from "../../scripts/shopify/build-orders.ts";

// Données inventées, au format des exports Shopify.
const variants: CatalogVariant[] = [
  { id: "v-esp", sku: "liquid-jersey-espresso", productName: "Liquid Jersey", colorName: "Espresso", size: null },
  { id: "v-matcha", sku: "liquid-jersey-matcha", productName: "Liquid Jersey", colorName: "Matcha", size: null },
  { id: "v-lmatcha", sku: "liquid-jersey-light-matcha", productName: "Liquid Jersey", colorName: "Light Matcha", size: null },
  { id: "v-abeer", sku: "abaya-abeer", productName: "Abaya Abeer", colorName: null, size: null },
  { id: "v-bs", sku: "bouquet-youna-s", productName: "Bouquet Youna", colorName: null, size: "S" },
  { id: "v-bm", sku: "bouquet-youna-m", productName: "Bouquet Youna", colorName: null, size: "M" },
];

const customers = buildCustomers([
  {
    "Customer ID": "111",
    "First Name": "Inès",
    "Last Name": "Ben Ali",
    Email: "Ines@Example.com",
    "Default Address Address1": "1 rue des Lilas",
    "Default Address Address2": "",
    "Default Address City": "Toulon",
    "Default Address Country Code": "FR",
    "Default Address Zip": "'83000",
    "Default Address Phone": "'+33600000000",
    Phone: "",
  },
  { "Customer ID": "222", "First Name": "Sara", "Last Name": "", Email: "sara@example.com", "Default Address Address1": "", Phone: "" },
]);

function order(overrides: CsvRow): CsvRow {
  return {
    Name: "#1001",
    Email: "ines@example.com",
    "Financial Status": "paid",
    "Paid at": "2025-09-27 23:43:18 +0200",
    "Fulfillment Status": "fulfilled",
    "Fulfilled at": "2025-09-29 10:00:00 +0200",
    Currency: "EUR",
    Subtotal: "23.98",
    Shipping: "4.30",
    Total: "28.28",
    "Discount Amount": "0.00",
    "Shipping Method": "Standard",
    "Created at": "2025-09-27 23:43:18 +0200",
    "Lineitem quantity": "2",
    "Lineitem name": "LIQUID JERSEY ESPRESSO",
    "Lineitem price": "11.99",
    "Lineitem sku": "",
    "Billing Name": "Inès Ben Ali",
    "Billing Address1": "1 rue des Lilas",
    "Billing City": "Toulon",
    "Billing Zip": "'83000",
    "Billing Country": "FR",
    "Shipping Name": "Inès Ben Ali",
    "Shipping Address1": "1 rue des Lilas",
    "Shipping Address2": "",
    "Shipping City": "Toulon",
    "Shipping Zip": "'83000",
    "Shipping Country": "FR",
    "Shipping Phone": "",
    "Cancelled at": "",
    "Payment Method": "Shopify Payments",
    "Refunded Amount": "0.00",
    Id: "5550001",
    ...overrides,
  };
}

describe("lecture des champs Shopify", () => {
  it("retire l'apostrophe ajoutée pour Excel et lit les dates avec leur fuseau", () => {
    expect(clean("'83000")).toBe("83000");
    expect(shopifyDate("2025-09-27 23:43:18 +0200")).toBe("2025-09-27T23:43:18+02:00");
    expect(shopifyDate("")).toBeNull();
  });

  it("garde les clientes avec leur adresse, e-mail en minuscules", () => {
    expect(customers).toHaveLength(2);
    expect(customers[0]).toMatchObject({ email: "ines@example.com", shopify_id: "111", phone: "+33600000000" });
    expect(customers[0].address).toMatchObject({ first_name: "Inès", last_name: "Ben Ali", postal_code: "83000", city: "Toulon", country: "FR" });
    expect(customers[1].address).toBeNull();
  });
});

describe("articles reliés au catalogue", () => {
  it("reconnaît la couleur exacte, pas une couleur voisine", () => {
    expect(matchVariant("LIQUID JERSEY MATCHA", "", variants)?.id).toBe("v-matcha");
    expect(matchVariant("Liquid Jersey Light Matcha", "", variants)?.id).toBe("v-lmatcha");
  });

  it("reconnaît la taille d'un bouquet et un produit à variante unique", () => {
    expect(matchVariant("Bouquet Youna - S", "", variants)?.id).toBe("v-bs");
    expect(matchVariant("Abaya Abeer - S/M", "", variants)?.id).toBe("v-abeer");
  });

  it("laisse de côté un article qui n'existe plus", () => {
    expect(matchVariant("JERSEY SADDLE", "", variants)).toBeNull();
  });
});

describe("commandes", () => {
  it("regroupe les lignes d'une commande et garde son numéro et ses dates", () => {
    const rows = [order({}), { Name: "#1001", "Lineitem quantity": "1", "Lineitem name": "Abaya Abeer - S/M", "Lineitem price": "45.00" }];
    rows[0].Subtotal = "68.98";
    rows[0].Total = "73.28";
    const [o] = buildOrders(rows, customers, variants);
    expect(o).toMatchObject({
      order_number: 1001,
      legacy_name: "#1001",
      status: "delivered",
      source: "shopify_import",
      subtotal_cents: 6898,
      shipping_cents: 430,
      total_cents: 7328,
      discount_cents: 0,
      carrier: "mondial_relay",
      payment_method: "carte",
      created_at: "2025-09-27T23:43:18+02:00",
      delivered_at: "2025-09-29T10:00:00+02:00",
    });
    expect(o.items).toEqual([
      expect.objectContaining({ variant_id: "v-esp", product_name: "Liquid Jersey", variant_label: "Espresso", quantity: 2, line_total_cents: 2398 }),
      expect.objectContaining({ variant_id: "v-abeer", product_name: "Abaya Abeer", variant_label: "S/M", line_total_cents: 4500 }),
    ]);
    expect(o.shipping_address).toEqual({ first_name: "Inès", last_name: "Ben Ali", country: "FR" });
    expect(o.relay_point).toMatchObject({ name: "Inès Ben Ali", address1: "1 rue des Lilas", postal_code: "83000", city: "Toulon" });
    expect(o.warnings).toEqual([]);
  });

  it("point relais : le nom du relais ne remplace pas celui de la cliente", () => {
    const [o] = buildOrders(
      [order({ "Shipping Name": "Locker Gare", "Shipping Address1": "2 place de la Gare", "Shipping Zip": "83100" })],
      customers,
      variants,
    );
    expect(o.shipping_address).toEqual({ first_name: "Inès", last_name: "Ben Ali", country: "FR" });
    expect(o.relay_point).toMatchObject({ name: "Locker Gare", address1: "2 place de la Gare", postal_code: "83100" });
  });

  it("livraison à domicile : l'adresse de livraison est celle de la cliente", () => {
    const [o] = buildOrders([order({ "Shipping Method": "Livraison à domicile", Shipping: "4.30" })], customers, variants);
    expect(o).toMatchObject({ carrier: "colissimo", relay_point: null });
    expect(o.shipping_address).toMatchObject({ first_name: "Inès", line1: "1 rue des Lilas", postal_code: "83000", city: "Toulon" });
  });

  it("retrait Avenue 83 : contact seulement, paiement « en attente » mais remis → payée", () => {
    const [o] = buildOrders(
      [
        order({
          "Shipping Method": "Avenue 83",
          "Financial Status": "pending",
          "Paid at": "",
          "Payment Method": "custom",
          Shipping: "0.00",
          Total: "23.98",
          "Shipping Name": "",
          "Shipping Address1": "",
          "Shipping Country": "",
        }),
      ],
      customers,
      variants,
    );
    expect(o).toMatchObject({ status: "delivered", carrier: "pickup", shipping_method_code: "retrait_avenue83", payment_method: "autre" });
    expect(o.paid_at).toBe("2025-09-29T10:00:00+02:00");
    expect(o.shipping_address).toEqual({ first_name: "Inès", last_name: "Ben Ali", country: "FR" });
    expect(o.warnings[0]).toContain("comptée comme payée");
  });

  it("annulée : pas de date de paiement, et une réduction est retrouvée par les montants", () => {
    const [cancelled] = buildOrders(
      [order({ "Financial Status": "voided", "Paid at": "", "Fulfillment Status": "unfulfilled", "Fulfilled at": "", "Cancelled at": "2025-10-01 09:00:00 +0200" })],
      customers,
      variants,
    );
    expect(cancelled).toMatchObject({ status: "cancelled", paid_at: null, delivered_at: null, cancelled_at: "2025-10-01T09:00:00+02:00" });

    const [discounted] = buildOrders([order({ Total: "26.28", "Discount Amount": "2.00" })], customers, variants);
    expect(discounted.discount_cents).toBe(200);
    expect(discounted.warnings).toEqual([]);
  });
});

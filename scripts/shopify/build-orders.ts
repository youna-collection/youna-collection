/**
 * Transforme les exports Shopify (clientes + commandes) en lignes prêtes pour la base.
 * Fonctions pures : aucune lecture de fichier ni d'accès réseau ici (testées dans tests/unit).
 */
import { slugify } from "../../src/lib/format.ts";

export type CsvRow = Record<string, string>;
type Address = Record<string, string>;

export type CatalogVariant = { id: string; sku: string | null; productName: string; colorName: string | null; size: string | null };

export type LegacyCustomer = {
  email: string;
  shopify_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: Address | null;
};

export type ImportItem = {
  variant_id: string | null;
  product_name: string;
  variant_label: string | null;
  sku: string | null;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
};

export type ImportOrder = {
  order_number: number;
  legacy_name: string;
  legacy_shopify_id: string;
  email: string;
  status: "delivered" | "cancelled" | "paid";
  source: "shopify_import";
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  total_cents: number;
  refunded_cents: number;
  shipping_method_code: string | null;
  carrier: "mondial_relay" | "colissimo" | "pickup" | null;
  shipping_address: Address | null;
  relay_point: Address | null;
  billing_address: Address | null;
  payment_method: "carte" | "autre" | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  items: ImportItem[];
  /** Points à signaler (montants qui ne tombent pas juste, articles non reconnus…). */
  warnings: string[];
};

/** Shopify préfixe certains champs (code postal, téléphone) d'une apostrophe pour Excel. */
export function clean(value: string | undefined): string {
  return (value ?? "").trim().replace(/^'+/, "").trim();
}

export function cents(value: string | undefined): number {
  const v = clean(value);
  return v ? Math.round(Number.parseFloat(v.replace(",", ".")) * 100) : 0;
}

/** « 2025-09-27 23:43:18 +0200 » → « 2025-09-27T23:43:18+02:00 ». */
export function shopifyDate(value: string | undefined): string | null {
  const v = clean(value);
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(v);
  if (!m) return null;
  return `${m[1]}T${m[2]}${m[3]}:${m[4]}`;
}

const SHIPPING: Record<string, { code: string; carrier: ImportOrder["carrier"] }> = {
  "avenue 83": { code: "retrait_avenue83", carrier: "pickup" },
  standard: { code: "mondial_relay", carrier: "mondial_relay" },
  "livraison à domicile": { code: "colissimo", carrier: "colissimo" },
  "standard international": { code: "international", carrier: "colissimo" },
};

function splitName(full: string, known?: { first: string; last: string }): { first_name: string; last_name: string } {
  const name = full.replace(/\s+/g, " ").trim();
  if (known && known.first && `${known.first} ${known.last}`.trim().toLowerCase() === name.toLowerCase()) {
    return { first_name: known.first, last_name: known.last };
  }
  const space = name.indexOf(" ");
  return space === -1 ? { first_name: name, last_name: "" } : { first_name: name.slice(0, space), last_name: name.slice(space + 1) };
}

function address(row: CsvRow, prefix: "Shipping" | "Billing", known?: { first: string; last: string }): Address | null {
  const name = clean(row[`${prefix} Name`]);
  const line1 = clean(row[`${prefix} Address1`]);
  if (!name && !line1) return null;
  const result: Address = { ...splitName(name, known) };
  const phone = clean(row[`${prefix} Phone`]);
  if (phone) result.phone = phone;
  const country = clean(row[`${prefix} Country`]).toUpperCase();
  if (country) result.country = country;
  if (line1) {
    result.line1 = line1;
    result.line2 = clean(row[`${prefix} Address2`]);
    result.postal_code = clean(row[`${prefix} Zip`]);
    result.city = clean(row[`${prefix} City`]);
    if (!result.country) result.country = "FR";
  }
  return result;
}

function relayPoint(row: CsvRow): Address {
  const relay: Address = {
    name: clean(row["Shipping Name"]),
    address1: clean(row["Shipping Address1"]),
    address2: clean(row["Shipping Address2"]),
    postal_code: clean(row["Shipping Zip"]),
    city: clean(row["Shipping City"]),
    country: clean(row["Shipping Country"]).toUpperCase() || "FR",
  };
  return relay;
}

export function buildCustomers(rows: CsvRow[]): LegacyCustomer[] {
  const byEmail = new Map<string, LegacyCustomer>();
  for (const row of rows) {
    const email = clean(row["Email"]).toLowerCase();
    if (!email || !email.includes("@")) continue;
    const first = clean(row["First Name"]) || null;
    const last = clean(row["Last Name"]) || null;
    const addrPhone = clean(row["Default Address Phone"]);
    const line1 = clean(row["Default Address Address1"]);
    const addr: Address | null = line1
      ? {
          first_name: first ?? "",
          last_name: last ?? "",
          line1,
          line2: clean(row["Default Address Address2"]),
          postal_code: clean(row["Default Address Zip"]),
          city: clean(row["Default Address City"]),
          country: clean(row["Default Address Country Code"]).toUpperCase() || "FR",
          ...(addrPhone ? { phone: addrPhone } : {}),
        }
      : null;
    byEmail.set(email, {
      email,
      shopify_id: clean(row["Customer ID"]) || null,
      first_name: first,
      last_name: last,
      phone: clean(row["Phone"]) || addrPhone || null,
      address: addr,
    });
  }
  return [...byEmail.values()];
}

/** Retrouve le produit actuel d'un article Shopify (« LIQUID JERSEY ESPRESSO », « Bouquet Youna - S »…). */
export function matchVariant(name: string, sku: string, variants: CatalogVariant[]): CatalogVariant | null {
  const target = slugify(name);
  const skuSlug = slugify(sku);
  for (const v of variants) {
    if (skuSlug && v.sku && slugify(v.sku) === skuSlug) return v;
  }
  for (const v of variants) {
    const label = v.colorName ?? v.size ?? "";
    if (slugify(`${v.productName} ${label}`) === target) return v;
    if (v.sku && slugify(v.sku) === target) return v;
  }
  // Produit à une seule variante, avec une précision en plus (« Abaya Abeer - S/M »).
  const byProduct = new Map<string, CatalogVariant[]>();
  for (const v of variants) byProduct.set(v.productName, [...(byProduct.get(v.productName) ?? []), v]);
  for (const [productName, list] of byProduct) {
    if (list.length === 1 && target.startsWith(`${slugify(productName)}-`)) return list[0];
  }
  return null;
}

function itemLabel(name: string, variant: CatalogVariant): string | null {
  if (variant.colorName) return variant.colorName;
  if (variant.size) return variant.size;
  // Précision donnée par Shopify après le nom (« Abaya Abeer - S/M » → « S/M »).
  const extra = /\s-\s(.+)$/.exec(name)?.[1]?.trim();
  return extra || null;
}

export function buildOrders(rows: CsvRow[], customers: LegacyCustomer[], variants: CatalogVariant[]): ImportOrder[] {
  const known = new Map(customers.map((c) => [c.email, { first: c.first_name ?? "", last: c.last_name ?? "" }]));
  const groups = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const name = clean(row["Name"]);
    if (!name) continue;
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }

  const orders: ImportOrder[] = [];
  for (const [legacyName, lines] of groups) {
    // Les infos de la commande sont sur la première ligne ; les suivantes ne portent que l'article.
    const head = lines.find((l) => clean(l["Financial Status"])) ?? lines[0];
    const warnings: string[] = [];
    const orderNumber = Number.parseInt(legacyName.replace(/\D/g, ""), 10);
    const email = clean(head["Email"]).toLowerCase();
    const createdAt = shopifyDate(head["Created at"]);
    if (!createdAt) throw new Error(`${legacyName} : date de commande illisible`);

    const items: ImportItem[] = lines
      .filter((l) => clean(l["Lineitem name"]))
      .map((l) => {
        const name = clean(l["Lineitem name"]);
        const sku = clean(l["Lineitem sku"]);
        const quantity = Number.parseInt(clean(l["Lineitem quantity"]), 10) || 1;
        const unit = cents(l["Lineitem price"]);
        const variant = matchVariant(name, sku, variants);
        if (!variant) warnings.push(`article non relié au catalogue : ${name}`);
        return {
          variant_id: variant?.id ?? null,
          product_name: variant ? variant.productName : name,
          variant_label: variant ? itemLabel(name, variant) : null,
          sku: sku || variant?.sku || null,
          unit_price_cents: unit,
          quantity,
          line_total_cents: unit * quantity,
        };
      });

    const subtotal = items.reduce((sum, i) => sum + i.line_total_cents, 0);
    const shipping = cents(head["Shipping"]);
    const total = cents(head["Total"]);
    const discount = Math.max(0, subtotal + shipping - total);
    if (discount !== cents(head["Discount Amount"])) {
      warnings.push(`réduction recalculée ${discount / 100} € (Shopify indique ${cents(head["Discount Amount"]) / 100} €)`);
    }

    const financial = clean(head["Financial Status"]);
    const fulfilled = clean(head["Fulfillment Status"]) === "fulfilled";
    const cancelledAt = shopifyDate(head["Cancelled at"]);
    const fulfilledAt = shopifyDate(head["Fulfilled at"]);
    const cancelled = Boolean(cancelledAt) || financial === "voided";
    // Payée chez Shopify, ou remise en main propre (paiement « en attente » jamais validé dans Shopify).
    const paidAt = shopifyDate(head["Paid at"]) ?? (!cancelled && fulfilled ? (fulfilledAt ?? createdAt) : null);
    if (!cancelled && !shopifyDate(head["Paid at"])) warnings.push(`paiement « ${financial} » dans Shopify, comptée comme payée`);

    const method = SHIPPING[clean(head["Shipping Method"]).toLowerCase()] ?? null;
    if (!method && clean(head["Shipping Method"])) warnings.push(`mode de livraison inconnu : ${clean(head["Shipping Method"])}`);
    const who = known.get(email);
    // Point relais : Shopify met le nom et l'adresse du relais à la place de ceux de la cliente.
    const relay = method?.carrier === "mondial_relay" && clean(head["Shipping Address1"]) ? relayPoint(head) : null;
    const shippingAddress =
      method?.carrier === "pickup" || relay
        ? (address(head, "Billing", who) ?? address(head, "Shipping", who))
        : (address(head, "Shipping", who) ?? address(head, "Billing", who));
    // Retrait ou point relais : seul le contact compte (comme sur le nouveau site).
    if (shippingAddress && (method?.carrier === "pickup" || relay)) {
      for (const key of ["line1", "line2", "postal_code", "city"]) delete shippingAddress[key];
    }
    const payment = clean(head["Payment Method"]);

    orders.push({
      order_number: orderNumber,
      legacy_name: legacyName,
      legacy_shopify_id: clean(head["Id"]) || legacyName,
      email,
      status: cancelled ? "cancelled" : fulfilled ? "delivered" : "paid",
      source: "shopify_import",
      currency: clean(head["Currency"]) || "EUR",
      subtotal_cents: subtotal,
      discount_cents: discount,
      shipping_cents: shipping,
      total_cents: total,
      refunded_cents: cents(head["Refunded Amount"]),
      shipping_method_code: method?.code ?? null,
      carrier: method?.carrier ?? null,
      shipping_address: shippingAddress,
      relay_point: relay,
      billing_address: address(head, "Billing", who),
      payment_method: payment.includes("Shopify Payments") ? "carte" : payment ? "autre" : null,
      paid_at: paidAt,
      shipped_at: !cancelled && fulfilled ? (fulfilledAt ?? paidAt) : null,
      delivered_at: !cancelled && fulfilled ? (fulfilledAt ?? paidAt) : null,
      cancelled_at: cancelled ? (cancelledAt ?? createdAt) : null,
      created_at: createdAt,
      updated_at: cancelledAt ?? fulfilledAt ?? createdAt,
      items,
      warnings,
    });
  }
  return orders.sort((a, b) => a.order_number - b.order_number);
}

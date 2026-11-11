import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { documentNumber, pdfText, renderInvoicePdf, renderPackingSlips } = await import("@/lib/pdf/documents");

const invoice = {
  kind: "invoice" as const,
  number: 12,
  issued_at: "2026-11-10T10:00:00Z",
  seller: {
    legal_name: "Youna Collection",
    siret: "12345678900011",
    vat_mention: "TVA non applicable, art. 293 B du CGI",
    address: ["1 rue des Fleurs", "83000 Toulon", "France"],
    footer: "Merci pour votre confiance.",
  },
  buyer: { name: "Zoé Ünal", email: "zoe@test.fr", address: ["2 rue Haute", null, "75001 Paris", "FR"] },
  lines: [
    { label: "Bouquet Youna — S · 3 voiles", details: ["Liquid Jersey Noir", "Liquid Jersey Noir", "Liquid Jersey Ivory"], quantity: 1, unit_price_cents: 3699, total_cents: 3699 },
    { label: "Liquid Jersey — Noir", quantity: 2, unit_price_cents: 1199, total_cents: 2398 },
  ],
  totals: { order_number: 2001, order_date: "2026-11-09T22:43:00Z", subtotal_cents: 6097, discount_cents: 500, shipping_cents: 499, total_cents: 6096, promo_code: "BIENVENUE", payment: "carte" },
};

describe("PDF", () => {
  it("remplace les caractères que les polices standard ne savent pas dessiner", () => {
    expect(pdfText("11,99 € · été — ok")).toBe("11,99 € · été — ok");
    expect(pdfText("1 000 → فاطمة")).toBe("1 000 ? ?????");
    expect(documentNumber("invoice", 12)).toBe("F000012");
    expect(documentNumber("credit_note", 13)).toBe("A000013");
  });

  it("dessine une facture, sur plusieurs pages si besoin", async () => {
    const short = await PDFDocument.load(await renderInvoicePdf(invoice));
    expect(short.getPageCount()).toBe(1);
    expect(short.getTitle()).toBe("Facture F000012");

    const many = { ...invoice, lines: Array.from({ length: 80 }, (_, i) => ({ ...invoice.lines[1], label: `Voile ${i + 1}` })) };
    const long = await PDFDocument.load(await renderInvoicePdf(many, { preview: true }));
    expect(long.getPageCount()).toBeGreaterThan(1);

    const credit = await PDFDocument.load(await renderInvoicePdf({ ...invoice, kind: "credit_note", number: 13, credit_of_number: 12 }));
    expect(credit.getTitle()).toBe("Avoir A000013");
  });

  it("dessine un bon de préparation par commande", async () => {
    const order = {
      order_number: 2001,
      created_at: "2026-11-09T22:43:00Z",
      email: "zoe@test.fr",
      carrier: "mondial_relay",
      shipping_method_code: "mondial_relay",
      shipping_address: { first_name: "Zoé", last_name: "Ünal", phone: "0600000000", country: "FR" },
      relay_point: { id: "012345", name: "Tabac du port", address1: "3 quai", postal_code: "83000", city: "Toulon" },
      items: [{ product_name: "Bouquet Youna", variant_label: "S · 3 voiles", sku: null, quantity: 2, components: [{ label: "Noir" }, { label: "Noir" }, { label: "Ivory" }] }],
    };
    const pdf = await PDFDocument.load(await renderPackingSlips([order, { ...order, order_number: 2002 }]));
    expect(pdf.getPageCount()).toBe(2);
  });
});

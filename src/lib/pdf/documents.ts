import "server-only";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import { formatPrice } from "../format";
import { LOGO_FILLED, LOGO_HAIRLINES, LOGO_VIEWBOX } from "../logo-paths";
import { CARRIER_LABELS, documentNumber } from "../order-display";
import { COUNTRY_NAMES } from "../shipping";

/**
 * Factures, avoirs et bons de préparation en PDF (A4), dessinés avec les polices standard :
 * aucun fichier de police à embarquer, et les accents français sont pris en charge.
 */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.4, 0.37);
const LINE = rgb(0.85, 0.82, 0.77);

// Caractères disponibles dans les polices standard (WinAnsi) en plus du Latin-1.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** Remplace ce que les polices standard ne savent pas dessiner. */
export function pdfText(value: string | null | undefined): string {
  return Array.from((value ?? "").replace(/[   ]/g, " ").replace(/[−]/g, "-").replace(/[\r\n\t]+/g, " "))
    .map((c) => {
      const code = c.codePointAt(0) ?? 0;
      if ((code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(c)) return c;
      return "?";
    })
    .join("");
}

const money = (cents: number) => pdfText(formatPrice(cents));
const dateFr = (value: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" }).format(new Date(value));

export { documentNumber };

type Fonts = { regular: PDFFont; bold: PDFFont };

/** Petite aide de mise en page : écrit de haut en bas et ajoute une page si besoin. */
class Writer {
  page: PDFPage;
  y: number;
  constructor(
    private doc: PDFDocument,
    readonly fonts: Fonts,
    private onNewPage?: (w: Writer) => void,
  ) {
    this.page = doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }

  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
    this.onNewPage?.(this);
  }

  ensure(height: number) {
    if (this.y - height < MARGIN + 20) this.newPage();
  }

  text(value: string, x: number, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right"; y?: number } = {}) {
    const size = options.size ?? 9.5;
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const clean = pdfText(value);
    const width = font.widthOfTextAtSize(clean, size);
    this.page.drawText(clean, {
      x: options.align === "right" ? x - width : x,
      y: options.y ?? this.y,
      size,
      font,
      color: options.color ?? INK,
    });
  }

  /** Coupe un texte en lignes qui tiennent dans la largeur donnée. */
  wrap(value: string, width: number, size = 9.5, bold = false): string[] {
    const font = bold ? this.fonts.bold : this.fonts.regular;
    const words = pdfText(value).split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !current) {
        current = next;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  rule(y = this.y, color = LINE) {
    this.page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.6, color });
  }
}

/** Dessine le monogramme, son coin haut gauche en (x, top), sur la hauteur donnée (en points). */
function drawLogo(page: PDFPage, x: number, top: number, height: number) {
  const scale = height / LOGO_VIEWBOX.height;
  for (const d of LOGO_FILLED) page.drawSvgPath(d, { x, y: top, scale, color: INK });
  // L'épaisseur du trait suit l'échelle du dessin : on la compense pour garder un trait fin.
  page.drawSvgPath(LOGO_HAIRLINES, { x, y: top, scale, borderColor: INK, borderWidth: 0.5 / scale });
}

async function newDocument(title: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(title));
  doc.setProducer("Youna Collection");
  doc.setCreator("Youna Collection");
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  return { doc, fonts };
}

// ---------------------------------------------------------------------------
// Factures et avoirs
// ---------------------------------------------------------------------------

export type InvoiceData = {
  kind: "invoice" | "credit_note";
  number: number;
  issued_at: string;
  credit_of_number?: number | null;
  seller: {
    legal_name: string;
    trade_name?: string;
    legal_form?: string;
    siret: string;
    vat_number?: string;
    vat_mention?: string;
    address: string[];
    email?: string;
    phone?: string;
    footer?: string;
  };
  buyer: { name?: string; email?: string; address?: (string | null)[] };
  lines: { label: string; details?: string[]; quantity: number; unit_price_cents: number; total_cents: number }[];
  totals: {
    order_number: number;
    order_date?: string;
    subtotal_cents: number;
    discount_cents: number;
    shipping_cents: number;
    total_cents: number;
    promo_code?: string | null;
    payment?: string | null;
  };
};

const PAYMENT_TEXT: Record<string, string> = {
  carte: "carte bancaire",
  especes: "espèces",
  virement: "virement",
  autre: "autre moyen",
};

/** Regroupe « Voile Noir, Voile Noir, Voile Ivory » en « 2 × Voile Noir, Voile Ivory ». */
function groupDetails(details: string[]) {
  const counts = new Map<string, number>();
  for (const d of details) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts].map(([label, n]) => (n > 1 ? `${n} × ${label}` : label)).join(", ");
}

export async function renderInvoicePdf(invoice: InvoiceData, options: { preview?: boolean } = {}): Promise<Uint8Array> {
  const isCredit = invoice.kind === "credit_note";
  const title = `${isCredit ? "Avoir" : "Facture"} ${documentNumber(invoice.kind, invoice.number)}`;
  const { doc, fonts } = await newDocument(title);
  const right = A4[0] - MARGIN;
  const cols = { qty: 360, unit: 450, total: right };

  const tableHeader = (w: Writer) => {
    w.text("Désignation", MARGIN, { bold: true, size: 8.5 });
    w.text("Qté", cols.qty, { bold: true, size: 8.5, align: "right" });
    w.text("Prix unitaire", cols.unit, { bold: true, size: 8.5, align: "right" });
    w.text("Total", cols.total, { bold: true, size: 8.5, align: "right" });
    w.y -= 7;
    w.rule(w.y, INK);
    w.y -= 14;
  };
  const w = new Writer(doc, fonts, (writer) => {
    writer.text(`${title} (suite)`, MARGIN, { size: 9, color: MUTED });
    writer.y -= 24;
    tableHeader(writer);
  });

  if (options.preview) {
    w.text("APERÇU - CE DOCUMENT N'EST PAS UNE FACTURE", A4[0] / 2 - 130, { bold: true, size: 10, color: rgb(0.7, 0.15, 0.15), y: A4[1] - 28 });
  }

  // Vendeur (à gauche) et titre (à droite).
  const s = invoice.seller;
  const top = w.y;
  drawLogo(w.page, MARGIN, top + 10, 32);
  w.y -= 40;
  w.text(s.trade_name || s.legal_name, MARGIN, { bold: true, size: 14 });
  w.y -= 16;
  const sellerLines = [
    s.trade_name ? s.legal_name : null,
    s.legal_form ?? null,
    ...s.address.filter(Boolean),
    s.email ?? null,
    s.phone ?? null,
    `SIRET : ${s.siret}`,
    s.vat_number ? `N° TVA : ${s.vat_number}` : null,
  ].filter((l): l is string => Boolean(l));
  for (const line of sellerLines) {
    w.text(line, MARGIN, { size: 9, color: MUTED });
    w.y -= 12;
  }
  const leftBottom = w.y;

  let ry = top;
  w.text(isCredit ? "AVOIR" : "FACTURE", right, { bold: true, size: 18, align: "right", y: ry });
  ry -= 20;
  for (const line of [
    `N° ${documentNumber(invoice.kind, invoice.number)}`,
    `Date : ${dateFr(invoice.issued_at)}`,
    `Commande n° ${invoice.totals.order_number}${invoice.totals.order_date ? ` du ${dateFr(invoice.totals.order_date)}` : ""}`,
    isCredit && invoice.credit_of_number ? `Se rapporte à la facture ${documentNumber("invoice", invoice.credit_of_number)}` : null,
  ]) {
    if (!line) continue;
    w.text(line, right, { size: 9.5, align: "right", y: ry });
    ry -= 13;
  }
  w.y = Math.min(leftBottom, ry) - 18;

  // Client.
  const b = invoice.buyer;
  w.text(isCredit ? "Client" : "Facturé à", MARGIN, { bold: true, size: 9 });
  w.y -= 13;
  for (const line of [b.name, ...(b.address ?? []).map((l) => (l && COUNTRY_NAMES[l]) || l), b.email].filter((l): l is string => Boolean(l))) {
    w.text(line, MARGIN, { size: 9.5 });
    w.y -= 12;
  }
  if (!b.name && !b.email && !b.address?.length) {
    w.text("Client particulier", MARGIN, { size: 9.5 });
    w.y -= 12;
  }
  w.y -= 18;

  // Lignes.
  tableHeader(w);
  for (const line of invoice.lines) {
    const labelLines = w.wrap(line.label, cols.qty - MARGIN - 40);
    const details = line.details?.length ? w.wrap(groupDetails(line.details), cols.qty - MARGIN - 40, 8) : [];
    w.ensure(labelLines.length * 12 + details.length * 10 + 10);
    w.text(String(line.quantity), cols.qty, { align: "right" });
    w.text(money(line.unit_price_cents), cols.unit, { align: "right" });
    w.text(money(line.total_cents), cols.total, { align: "right" });
    for (const l of labelLines) {
      w.text(l, MARGIN);
      w.y -= 12;
    }
    for (const d of details) {
      w.text(d, MARGIN + 8, { size: 8, color: MUTED });
      w.y -= 10;
    }
    w.y -= 4;
    w.rule(w.y + 6);
    w.y -= 6;
  }

  // Totaux.
  const t = invoice.totals;
  w.ensure(110);
  w.y -= 6;
  const totalRow = (label: string, value: string, bold = false) => {
    w.text(label, cols.unit - 10, { align: "right", bold, size: bold ? 11 : 9.5 });
    w.text(value, cols.total, { align: "right", bold, size: bold ? 11 : 9.5 });
    w.y -= bold ? 16 : 13;
  };
  if (!isCredit) {
    totalRow("Sous-total", money(t.subtotal_cents));
    if (t.discount_cents) totalRow(`Réduction${t.promo_code ? ` (${t.promo_code})` : ""}`, `-${money(t.discount_cents)}`);
    totalRow("Livraison", t.shipping_cents ? money(t.shipping_cents) : "Offerte");
  }
  w.y -= 2;
  totalRow(isCredit ? "Montant remboursé" : "Total", money(t.total_cents), true);

  w.y -= 10;
  if (s.vat_mention) {
    w.text(s.vat_mention, MARGIN, { size: 9 });
    w.y -= 13;
  }
  if (t.payment) {
    const how = PAYMENT_TEXT[t.payment] ?? t.payment;
    w.text(isCredit ? `Remboursé par ${how}.` : `Payée par ${how}${t.order_date ? ` le ${dateFr(t.order_date)}` : ""}.`, MARGIN, { size: 9 });
    w.y -= 13;
  }

  if (s.footer) {
    const lines = w.wrap(s.footer, A4[0] - 2 * MARGIN, 8);
    w.ensure(lines.length * 10 + 10);
    let y = MARGIN + lines.length * 10;
    for (const line of lines) {
      w.text(line, MARGIN, { size: 8, color: MUTED, y });
      y -= 10;
    }
  }

  return doc.save();
}

// ---------------------------------------------------------------------------
// Bons de préparation (sans prix : peuvent être glissés dans le colis)
// ---------------------------------------------------------------------------

export type PackingOrder = {
  order_number: number;
  created_at: string;
  email: string | null;
  carrier: string | null;
  shipping_method_code: string | null;
  shipping_address: Record<string, string> | null;
  relay_point: Record<string, string> | null;
  items: { product_name: string; variant_label: string | null; sku: string | null; quantity: number; components: { label: string }[] }[];
  notes?: string[];
};

export async function renderPackingSlips(orders: PackingOrder[], shopName = "Youna Collection"): Promise<Uint8Array> {
  const { doc, fonts } = await newDocument(orders.length === 1 ? `Bon de préparation ${orders[0].order_number}` : "Bons de préparation");
  const right = A4[0] - MARGIN;

  for (const order of orders) {
    const w = new Writer(doc, fonts, (writer) => {
      writer.text(`Commande n° ${order.order_number} (suite)`, MARGIN, { size: 9, color: MUTED });
      writer.y -= 24;
    });
    drawLogo(w.page, MARGIN, w.y + 12, 26);
    w.text(shopName, MARGIN + 44, { bold: true, size: 13 });
    w.text("BON DE PRÉPARATION", right, { bold: true, size: 14, align: "right" });
    w.y -= 34;
    w.text(`Commande n° ${order.order_number}`, MARGIN, { bold: true, size: 20 });
    w.text(`du ${dateFr(order.created_at)}`, right, { size: 10, align: "right" });
    w.y -= 28;

    // Livraison.
    const a = order.shipping_address ?? {};
    const name = [a.first_name, a.last_name].filter(Boolean).join(" ") || a.name || "";
    w.text("Livraison", MARGIN, { bold: true, size: 9 });
    w.text("Cliente", 320, { bold: true, size: 9 });
    w.y -= 14;
    const shipping: string[] = [order.carrier ? (CARRIER_LABELS[order.carrier] ?? order.carrier) : "—"];
    if (order.relay_point) {
      const r = order.relay_point;
      shipping.push(`Point relais : ${r.name ?? ""}${r.id ? ` (n° ${r.id})` : ""}`, [r.address1, r.address2].filter(Boolean).join(", "), `${r.postal_code ?? ""} ${r.city ?? ""}`);
    } else if (a.line1) {
      shipping.push(name, [a.line1, a.line2].filter(Boolean).join(", "), `${a.postal_code ?? ""} ${a.city ?? ""} ${a.country && a.country !== "FR" ? (COUNTRY_NAMES[a.country] ?? a.country) : ""}`);
    }
    const customer = [name, a.phone, order.email].filter((l): l is string => Boolean(l));
    const startY = w.y;
    for (const line of shipping) {
      w.text(line, MARGIN, { size: 10 });
      w.y -= 13;
    }
    const leftY = w.y;
    w.y = startY;
    for (const line of customer) {
      w.text(line, 320, { size: 10 });
      w.y -= 13;
    }
    w.y = Math.min(leftY, w.y) - 18;

    // Articles à préparer.
    w.text("Article", MARGIN + 22, { bold: true, size: 8.5 });
    w.text("Qté", right, { bold: true, size: 8.5, align: "right" });
    w.y -= 7;
    w.rule(w.y, INK);
    w.y -= 16;
    let count = 0;
    for (const item of order.items) {
      count += item.quantity;
      const label = `${item.product_name}${item.variant_label ? ` — ${item.variant_label}` : ""}${item.sku ? `  (${item.sku})` : ""}`;
      const lines = w.wrap(label, right - MARGIN - 80, 11, true);
      w.ensure(lines.length * 14 + item.components.length * 13 + 12);
      w.page.drawRectangle({ x: MARGIN, y: w.y - 2, width: 11, height: 11, borderColor: INK, borderWidth: 0.8 });
      w.text(String(item.quantity), right, { bold: true, size: 13, align: "right" });
      for (const l of lines) {
        w.text(l, MARGIN + 22, { bold: true, size: 11 });
        w.y -= 14;
      }
      if (item.components.length) {
        w.text(item.quantity > 1 ? `Voiles de chaque bouquet (x${item.quantity}) :` : "Voiles du bouquet :", MARGIN + 22, { size: 9, color: MUTED });
        w.y -= 12;
        const counts = new Map<string, number>();
        for (const c of item.components) counts.set(c.label, (counts.get(c.label) ?? 0) + 1);
        for (const [cLabel, n] of counts) {
          w.page.drawRectangle({ x: MARGIN + 30, y: w.y - 1, width: 8, height: 8, borderColor: MUTED, borderWidth: 0.6 });
          w.text(`${n > 1 ? `${n} × ` : ""}${cLabel}`, MARGIN + 44, { size: 10 });
          w.y -= 13;
        }
      }
      w.y -= 4;
      w.rule(w.y + 6);
      w.y -= 10;
    }
    w.text(`${count} article${count > 1 ? "s" : ""}`, right, { size: 10, align: "right" });
    w.y -= 20;

    if (order.notes?.length) {
      w.text("Notes", MARGIN, { bold: true, size: 9 });
      w.y -= 13;
      for (const note of order.notes) {
        for (const l of w.wrap(note, right - MARGIN, 9)) {
          w.ensure(12);
          w.text(l, MARGIN, { size: 9 });
          w.y -= 12;
        }
      }
      w.y -= 10;
    }

    w.ensure(30);
    w.text("Merci pour votre commande !", MARGIN, { size: 11 });
  }

  return doc.save();
}

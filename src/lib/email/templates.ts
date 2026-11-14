import { formatPrice } from "../format";
import { CARRIER_LABELS, deliveryPostalCode, trackingLink } from "../order-display";
import { COUNTRY_NAMES } from "../shipping";
import { addressBlock, button, escapeHtml, heading, highlight, layout, paragraph, productList, rows, siteUrl, small, subheading } from "./layout";

/** Contenu des e-mails. Fonctions pures : faciles à tester et à prévisualiser. */

export type EmailOrder = {
  id: string;
  order_number: number;
  email: string;
  user_id: string | null;
  carrier: string | null;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  total_cents: number;
  promo_code: string | null;
  shipping_address: Record<string, string> | null;
  relay_point: Record<string, string> | null;
  tracking_number: string | null;
  tracking_url: string | null;
  /** « especes » + paid_at vide : la cliente paiera en main propre au retrait. */
  payment_method?: string | null;
  paid_at?: string | null;
  items: {
    product_name: string;
    variant_label: string | null;
    quantity: number;
    line_total_cents: number;
    components: { label: string }[];
    /** Photo de la couleur commandée (adresse complète), si elle existe. */
    image_url?: string | null;
  }[];
};

export type RenderedEmail = { subject: string; html: string; text: string };

/** Commande click & collect à régler en espèces au retrait. */
export const paysCashOnPickup = (o: Pick<EmailOrder, "payment_method" | "paid_at">) => o.payment_method === "especes" && !o.paid_at;

const firstName = (o: EmailOrder) => o.shipping_address?.first_name?.trim() || null;
const hello = (o: EmailOrder) => (firstName(o) ? `Bonjour ${firstName(o)},` : "Bonjour,");

function itemLines(o: EmailOrder) {
  return o.items.map((i) => ({
    label: `${i.quantity} × ${i.product_name}${i.variant_label ? ` — ${i.variant_label}` : ""}`,
    detail: i.components.length ? `Voiles : ${groupLabels(i.components.map((c) => c.label)).join(", ")}` : null,
    value: formatPrice(i.line_total_cents),
  }));
}

/** Les articles avec leur photo, pour la cliente. */
function productItems(o: EmailOrder) {
  return o.items.map((i) => ({
    imageUrl: i.image_url ?? null,
    name: i.product_name,
    lines: [
      i.variant_label,
      i.components.length ? `Voiles : ${groupLabels(i.components.map((c) => c.label)).join(", ")}` : null,
      `Quantité : ${i.quantity}`,
    ].filter((l): l is string => Boolean(l)),
    value: formatPrice(i.line_total_cents),
  }));
}

/** Délais indicatifs après l'expédition, en jours ouvrés (les mêmes que la page Livraison et retours). */
function deliveryDelay(o: EmailOrder): [number, number] | null {
  if (o.carrier === "pickup") return null;
  const country = o.shipping_address?.country;
  if (country && country !== "FR") return [4, 8];
  if (o.carrier === "mondial_relay") return [3, 5];
  if (o.carrier === "colissimo") return [2, 3];
  return null;
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });

/** « mardi 2 décembre – jeudi 4 décembre » : la fenêtre de livraison estimée à partir d'aujourd'hui. */
export function estimatedDelivery(o: EmailOrder, now: Date): string | null {
  const delay = deliveryDelay(o);
  if (!delay) return null;
  return `${dayFormat.format(addBusinessDays(now, delay[0]))} – ${dayFormat.format(addBusinessDays(now, delay[1]))}`;
}

function groupLabels(labels: string[]) {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].map(([label, n]) => (n > 1 ? `${n} × ${label}` : label));
}

function totalLines(o: EmailOrder) {
  return [
    { label: "Sous-total", value: formatPrice(o.subtotal_cents) },
    ...(o.discount_cents > 0 ? [{ label: `Réduction${o.promo_code ? ` (${o.promo_code})` : ""}`, value: `−${formatPrice(o.discount_cents)}` }] : []),
    { label: "Livraison", value: o.shipping_cents > 0 ? formatPrice(o.shipping_cents) : "Offerte" },
    { label: paysCashOnPickup(o) ? "À régler en espèces au retrait" : "Total payé", value: formatPrice(o.total_cents), strong: true },
  ];
}

/** Où va le colis, en quelques lignes. */
function deliveryLines(o: EmailOrder): string[] {
  const a = o.shipping_address ?? {};
  const r = o.relay_point;
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ");
  if (o.carrier === "pickup") return ["Click & collect", "Nous vous contacterons pour convenir du retrait."];
  if (r) {
    return [`Point relais Mondial Relay : ${r.name}`, [r.address1, r.address2].filter(Boolean).join(", "), `${r.postal_code} ${r.city}`, `Pour : ${name}`];
  }
  return [
    `${CARRIER_LABELS[o.carrier ?? ""] ?? "Livraison"} à domicile`,
    name,
    a.line1,
    a.line2,
    `${a.postal_code ?? ""} ${a.city ?? ""}`.trim(),
    a.country && a.country !== "FR" ? (COUNTRY_NAMES[a.country] ?? a.country) : null,
  ].filter((l): l is string => Boolean(l));
}

function orderLink(o: EmailOrder) {
  return o.user_id ? siteUrl(`/compte/commandes/${o.order_number}`) : siteUrl("/inscription");
}

const textList = (lines: { label: string; detail?: string | null; value: string }[]) =>
  lines.map((l) => `${l.label} : ${l.value}${l.detail ? `\n  ${l.detail}` : ""}`).join("\n");

export function orderConfirmationEmail(o: EmailOrder): RenderedEmail {
  const subject = `Merci pour votre commande n° ${o.order_number}`;
  const intro = paysCashOnPickup(o)
    ? `Nous avons bien reçu votre commande <strong>n° ${o.order_number}</strong>. Vous la réglerez en espèces (${formatPrice(o.total_cents)}) au moment du retrait : nous vous contacterons pour convenir du moment.`
    : `Nous avons bien reçu votre commande <strong>n° ${o.order_number}</strong> et votre paiement. Nous la préparons avec soin et vous écrirons dès son envoi.`;
  const accountHint = o.user_id
    ? "Vous pouvez suivre votre commande à tout moment depuis votre compte."
    : "Créez votre compte avec cette même adresse e-mail : vous y retrouverez cette commande et pourrez la suivre.";
  const body = [
    heading("Merci pour votre commande"),
    paragraph(escapeHtml(hello(o))),
    paragraph(intro),
    subheading(`${o.items.reduce((n, i) => n + i.quantity, 0)} article${o.items.reduce((n, i) => n + i.quantity, 0) > 1 ? "s" : ""}`),
    productList(productItems(o)),
    rows(totalLines(o)),
    subheading("Livraison"),
    addressBlock(deliveryLines(o)),
    button(o.user_id ? "Suivre ma commande" : "Créer mon compte", orderLink(o)),
    small(escapeHtml(accountHint)),
  ].join("");
  const text = [
    hello(o),
    "",
    intro.replace(/<[^>]+>/g, ""),
    "",
    textList(itemLines(o)),
    textList(totalLines(o)),
    "",
    "Livraison :",
    ...deliveryLines(o),
    "",
    `${accountHint} ${orderLink(o)}`,
  ].join("\n");
  return { subject, html: layout({ preheader: `Commande n° ${o.order_number} confirmée.`, body }), text };
}

export function orderShippedEmail(o: EmailOrder, now: Date = new Date()): RenderedEmail {
  const pickup = o.carrier === "pickup";
  const link = trackingLink(o.carrier, o.tracking_number, o.tracking_url, deliveryPostalCode(o.relay_point, o.shipping_address));
  const subject = pickup ? `Votre commande n° ${o.order_number} est prête` : `Votre commande n° ${o.order_number} est en route`;
  const intro = pickup
    ? `Votre commande <strong>n° ${o.order_number}</strong> est prête. Nous vous contacterons pour convenir du retrait.${paysCashOnPickup(o) ? ` Pensez à prévoir ${formatPrice(o.total_cents)} en espèces.` : ""}`
    : `Bonne nouvelle : votre commande <strong>n° ${o.order_number}</strong> vient d'être confiée à ${escapeHtml(CARRIER_LABELS[o.carrier ?? ""] ?? "notre transporteur")}.`;
  const tracking = o.tracking_number ? `Numéro de suivi : ${o.tracking_number}` : null;
  const eta = pickup ? null : estimatedDelivery(o, now);
  const body = [
    heading(pickup ? "Votre commande est prête" : "Votre commande est en route"),
    paragraph(escapeHtml(hello(o))),
    paragraph(intro),
    eta ? highlight("Livraison estimée", [eta]) : "",
    tracking ? paragraph(escapeHtml(tracking)) : "",
    link ? button("Suivre mon colis", link) : "",
    o.relay_point ? small("Vous recevrez un message de Mondial Relay quand votre colis sera arrivé au point relais. Pensez à votre pièce d'identité.") : "",
    subheading("Contenu du colis"),
    productList(productItems(o)),
    pickup ? "" : subheading("Livraison"),
    pickup ? "" : addressBlock(deliveryLines(o)),
    o.user_id ? small(`<a href="${escapeHtml(orderLink(o))}" style="color:inherit">Voir ma commande</a>`) : "",
  ].join("");
  const text = [
    hello(o),
    "",
    intro.replace(/<[^>]+>/g, ""),
    eta ? `Livraison estimée : ${eta}` : "",
    tracking ?? "",
    link ? `Suivre mon colis : ${link}` : "",
    "",
    textList(itemLines(o)),
    ...(pickup ? [] : ["", "Livraison :", ...deliveryLines(o)]),
  ].join("\n");
  return { subject, html: layout({ preheader: subject, body }), text };
}

export function orderRefundedEmail(o: EmailOrder, refund: { amount_cents: number; method: "stripe" | "manual" }): RenderedEmail {
  const amount = formatPrice(refund.amount_cents);
  const subject = `Remboursement de ${amount} — commande n° ${o.order_number}`;
  const detail =
    refund.method === "stripe"
      ? "Le montant sera visible sur votre compte bancaire sous 5 à 10 jours ouvrés, selon votre banque, sur la carte utilisée pour la commande."
      : "Ce remboursement a été effectué directement avec vous.";
  const body = [
    heading("Votre remboursement"),
    paragraph(escapeHtml(hello(o))),
    paragraph(`Nous avons effectué un remboursement de <strong>${escapeHtml(amount)}</strong> pour votre commande n° ${o.order_number}.`),
    paragraph(escapeHtml(detail)),
    o.user_id ? button("Voir ma commande", orderLink(o)) : "",
  ].join("");
  const text = [hello(o), "", `Nous avons effectué un remboursement de ${amount} pour votre commande n° ${o.order_number}.`, detail].join("\n");
  return { subject, html: layout({ preheader: subject, body }), text };
}

// --- Alertes pour la boutique -------------------------------------------------------------

const ADMIN_FOOTER = "Alerte automatique de votre boutique.";

export function adminNewOrderEmail(o: EmailOrder): RenderedEmail {
  const name = [o.shipping_address?.first_name, o.shipping_address?.last_name].filter(Boolean).join(" ") || o.email;
  const cash = paysCashOnPickup(o);
  const subject = `Nouvelle commande n° ${o.order_number} — ${formatPrice(o.total_cents)}${cash ? " (espèces au retrait)" : ""}`;
  const cashNote = cash ? " À encaisser en espèces au retrait : rien n'a encore été payé." : "";
  const body = [
    heading(`Commande n° ${o.order_number}`),
    paragraph(`${escapeHtml(name)} vient de commander pour <strong>${escapeHtml(formatPrice(o.total_cents))}</strong>.${escapeHtml(cashNote)}`),
    rows(itemLines(o)),
    subheading("Livraison"),
    addressBlock(deliveryLines(o)),
    button("Ouvrir la commande", siteUrl(`/admin/commandes/${o.order_number}`)),
  ].join("");
  const text = [`${name} vient de commander pour ${formatPrice(o.total_cents)}.${cashNote}`, "", textList(itemLines(o)), "", siteUrl(`/admin/commandes/${o.order_number}`)].join("\n");
  return { subject, html: layout({ preheader: subject, body, footer: ADMIN_FOOTER }), text };
}

export function adminSoldOutEmail(variants: { label: string }[]): RenderedEmail {
  const names = variants.map((v) => v.label);
  const subject = names.length === 1 ? `Épuisé : ${names[0]}` : `${names.length} articles épuisés`;
  const body = [
    heading("Rupture de stock"),
    paragraph(names.length === 1 ? "Cet article vient de passer à 0 :" : "Ces articles viennent de passer à 0 :"),
    addressBlock(names),
    small("Ils ne peuvent plus être commandés jusqu'à ce que vous remettiez du stock."),
    button("Gérer le stock", siteUrl("/admin/stock?filtre=epuise")),
  ].join("");
  const text = [subject, "", ...names, "", siteUrl("/admin/stock")].join("\n");
  return { subject, html: layout({ preheader: subject, body, footer: ADMIN_FOOTER }), text };
}

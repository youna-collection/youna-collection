import { TICKET_STATUS_LABELS, TICKET_TYPE_LABELS, type TicketStatus, type TicketType } from "../support-rules";
import { addressBlock, button, escapeHtml, heading, layout, paragraph, siteUrl, small, subheading } from "./layout";
import type { RenderedEmail } from "./templates";

/** E-mails du SAV. Fonctions pures, comme les e-mails de commande. */

export type EmailTicket = {
  number: number;
  type: TicketType;
  status: TicketStatus;
  order_number: number;
  first_name: string | null;
  items: { quantity: number; label: string }[];
};

const hello = (t: { first_name: string | null }) => (t.first_name ? `Bonjour ${t.first_name},` : "Bonjour,");

/** Texte saisi par une personne : échappé, retours à la ligne conservés. */
const quote = (body: string) =>
  `<div style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #d9cfc0;font-size:14px;line-height:1.6;color:#1c1c1c">${escapeHtml(body).replace(/\n/g, "<br>")}</div>`;

const itemLabels = (t: EmailTicket) => t.items.map((i) => `${i.quantity} × ${i.label}`);

export function supportLinkEmail(orderNumber: number, link: string): RenderedEmail {
  const subject = `Votre accès au service client — commande n° ${orderNumber}`;
  const body = [
    heading("Service client"),
    paragraph(`Voici votre lien pour faire une demande de retour, d'échange ou une réclamation concernant la commande n° ${orderNumber}, et suivre nos réponses.`),
    button("Ouvrir mon espace SAV", link),
    small("Ce lien est personnel et reste valable 30 jours. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail."),
  ].join("");
  const text = [
    "Bonjour,",
    "",
    `Voici votre lien pour le service client (commande n° ${orderNumber}) :`,
    link,
    "",
    "Ce lien est personnel et reste valable 30 jours.",
  ].join("\n");
  return { subject, html: layout({ preheader: subject, body }), text };
}

export function supportReceivedEmail(t: EmailTicket, message: string, link: string): RenderedEmail {
  const kind = TICKET_TYPE_LABELS[t.type].toLowerCase();
  const subject = `Demande n° ${t.number} bien reçue`;
  const body = [
    heading("Demande bien reçue"),
    paragraph(escapeHtml(hello(t))),
    paragraph(`Nous avons bien reçu votre demande de ${escapeHtml(kind)} pour la commande n° ${t.order_number}. Nous revenons vers vous très vite.`),
    t.items.length ? subheading("Articles concernés") + addressBlock(itemLabels(t)) : "",
    subheading("Votre message"),
    quote(message),
    button("Suivre ma demande", link),
    t.type === "complaint" ? "" : small("Merci d'attendre notre réponse avant de renvoyer un article : nous vous indiquerons l'adresse et la marche à suivre."),
  ].join("");
  const text = [
    hello(t),
    "",
    `Nous avons bien reçu votre demande de ${kind} (n° ${t.number}) pour la commande n° ${t.order_number}.`,
    ...(t.items.length ? ["", ...itemLabels(t)] : []),
    "",
    "Suivre ma demande :",
    link,
  ].join("\n");
  return { subject, html: layout({ preheader: subject, body }), text };
}

export function supportUpdateEmail(t: EmailTicket, update: { message: string | null; statusChanged: boolean }, link: string): RenderedEmail {
  const status = TICKET_STATUS_LABELS[t.status];
  const subject = update.message ? `Réponse à votre demande n° ${t.number}` : `Demande n° ${t.number} : ${status.toLowerCase()}`;
  const body = [
    heading(update.message ? "Nouvelle réponse" : "Votre demande a évolué"),
    paragraph(escapeHtml(hello(t))),
    update.message
      ? paragraph(`Nous avons répondu à votre demande n° ${t.number} (commande n° ${t.order_number}) :`) + quote(update.message)
      : paragraph(`Votre demande n° ${t.number} (commande n° ${t.order_number}) est maintenant : <strong>${escapeHtml(status)}</strong>.`),
    update.message && update.statusChanged ? small(`État de la demande : ${escapeHtml(status)}.`) : "",
    button(t.status === "closed" ? "Voir ma demande" : "Voir et répondre", link),
  ].join("");
  const text = [
    hello(t),
    "",
    update.message ? `Nous avons répondu à votre demande n° ${t.number} :\n\n${update.message}` : `Votre demande n° ${t.number} est maintenant : ${status}.`,
    "",
    link,
  ].join("\n");
  return { subject, html: layout({ preheader: subject, body }), text };
}

// --- Alertes pour la boutique -------------------------------------------------------------

const ADMIN_FOOTER = "Alerte automatique de votre boutique.";

export function adminSupportEmail(t: EmailTicket & { email: string }, message: string, photoCount: number, kind: "new" | "reply"): RenderedEmail {
  const type = TICKET_TYPE_LABELS[t.type];
  const subject = kind === "new" ? `SAV : ${type.toLowerCase()} — commande n° ${t.order_number}` : `SAV : réponse de la cliente — demande n° ${t.number}`;
  const who = t.first_name ? `${t.first_name} (${t.email})` : t.email;
  const link = siteUrl(`/admin/sav/${t.number}`);
  const body = [
    heading(kind === "new" ? `Nouvelle demande n° ${t.number}` : `Réponse — demande n° ${t.number}`),
    paragraph(`${escapeHtml(who)} ${kind === "new" ? `a ouvert une demande de <strong>${escapeHtml(type.toLowerCase())}</strong>` : "a répondu"} pour la commande n° ${t.order_number}.`),
    kind === "new" && t.items.length ? addressBlock(itemLabels(t)) : "",
    quote(message),
    photoCount ? small(`${photoCount} photo${photoCount > 1 ? "s" : ""} jointe${photoCount > 1 ? "s" : ""}.`) : "",
    button("Ouvrir la demande", link),
  ].join("");
  const text = [subject, "", message, "", link].join("\n");
  return { subject, html: layout({ preheader: subject, body, footer: ADMIN_FOOTER }), text };
}

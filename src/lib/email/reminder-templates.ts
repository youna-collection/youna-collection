import { formatPrice } from "../format";
import { button, escapeHtml, heading, layout, paragraph, rows, small } from "./layout";
import type { RenderedEmail } from "./templates";

/**
 * Rappel de panier : purement informatif (ce qu'il contient, un lien pour le retrouver),
 * sans code promo ni compte à rebours. Le lien de désinscription figure dans chaque e-mail.
 */

export type ReminderLine = { label: string; detail?: string | null; totalCents: number };

export type ReminderInput = {
  step: 1 | 2;
  firstName: string | null;
  lines: ReminderLine[];
  subtotalCents: number;
  resumeUrl: string;
  unsubscribeUrl: string;
};

export function cartReminderEmail(r: ReminderInput): RenderedEmail {
  const hello = r.firstName ? `Bonjour ${r.firstName},` : "Bonjour,";
  const subject = r.step === 1 ? "Votre panier vous attend" : "Votre panier est toujours là";
  const intro =
    r.step === 1
      ? "Vous avez laissé des articles dans votre panier. Le voici, si vous souhaitez reprendre votre commande."
      : "Petit rappel : votre panier est toujours enregistré. C'est notre dernier message à ce sujet.";
  const lines = r.lines.map((l) => ({ label: l.label, detail: l.detail, value: formatPrice(l.totalCents) }));

  const html = layout({
    preheader: intro,
    body: [
      heading(subject),
      paragraph(escapeHtml(hello)),
      paragraph(escapeHtml(intro)),
      rows([...lines, { label: "Sous-total", value: formatPrice(r.subtotalCents), strong: true }]),
      small("Les articles ne sont pas réservés : leur disponibilité peut changer d'ici votre commande. Livraison calculée à l'étape suivante."),
      button("Reprendre mon panier", r.resumeUrl),
    ].join(""),
    footer: `Vous recevez ce message car vous avez demandé un rappel lors de votre commande.<br>
<a href="${escapeHtml(r.unsubscribeUrl)}" style="color:inherit">Ne plus recevoir de rappel</a> · Une question ? Répondez simplement à cet e-mail.`,
  });

  const text = [
    subject,
    "",
    hello,
    intro,
    "",
    ...r.lines.map((l) => `${l.label} : ${formatPrice(l.totalCents)}${l.detail ? `\n  ${l.detail}` : ""}`),
    `Sous-total : ${formatPrice(r.subtotalCents)}`,
    "",
    "Les articles ne sont pas réservés : leur disponibilité peut changer d'ici votre commande.",
    `Reprendre mon panier : ${r.resumeUrl}`,
    "",
    "Vous recevez ce message car vous avez demandé un rappel lors de votre commande.",
    `Ne plus recevoir de rappel : ${r.unsubscribeUrl}`,
  ].join("\n");

  return { subject, html, text };
}

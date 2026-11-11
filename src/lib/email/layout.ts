/**
 * Habillage commun des e-mails : sobre, aux couleurs de la boutique, lisible sur téléphone.
 * Tableaux et styles en ligne : c'est ce que les messageries (Gmail, Outlook…) affichent le mieux.
 */

export const COLORS = { ivory: "#f6f1e9", paper: "#fbf9f5", sand: "#d9cfc0", ink: "#1c1c1c", muted: "#6b645a" };
const FONT = "'Jost', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function siteUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

export const paragraph = (html: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.ink}">${html}</p>`;
export const small = (html: string) => `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:${COLORS.muted}">${html}</p>`;
export const heading = (text: string) =>
  `<h1 style="margin:0 0 20px;font-size:22px;font-weight:400;letter-spacing:0.04em;color:${COLORS.ink}">${escapeHtml(text)}</h1>`;
export const subheading = (text: string) =>
  `<h2 style="margin:28px 0 12px;font-size:12px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:${COLORS.muted}">${escapeHtml(text)}</h2>`;

export function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="background:${COLORS.ink}">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:13px;letter-spacing:0.15em;text-transform:uppercase;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/** Lignes « libellé … montant » (articles, totaux). */
export function rows(lines: { label: string; detail?: string | null; value: string; strong?: boolean }[]): string {
  const body = lines
    .map(
      (l) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid ${COLORS.sand};font-size:14px;line-height:1.4;color:${COLORS.ink};${l.strong ? "font-weight:600;" : ""}">${escapeHtml(l.label)}${
        l.detail ? `<br><span style="font-size:12px;color:${COLORS.muted}">${escapeHtml(l.detail)}</span>` : ""
      }</td>
<td style="padding:8px 0 8px 12px;border-bottom:1px solid ${COLORS.sand};font-size:14px;text-align:right;white-space:nowrap;vertical-align:top;color:${COLORS.ink};${l.strong ? "font-weight:600;" : ""}">${escapeHtml(l.value)}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px">${body}</table>`;
}

/** Bloc d'adresse, une ligne par élément non vide. */
export const addressBlock = (lines: (string | null | undefined)[]) =>
  `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${COLORS.ink}">${lines.filter(Boolean).map(escapeHtml).join("<br>")}</p>`;

export function layout({ preheader, body, footer }: { preheader: string; body: string; footer?: string }): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Youna Collection</title></head>
<body style="margin:0;padding:0;background:${COLORS.ivory};font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.ivory}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:8px 0 24px">
<a href="${escapeHtml(siteUrl("/"))}" style="text-decoration:none"><img src="${escapeHtml(siteUrl("/logo-email.png"))}" width="72" height="54" alt="Youna Collection" style="display:block;border:0;width:72px;height:54px;font-size:16px;letter-spacing:0.3em;color:${COLORS.ink}"></a>
</td></tr>
<tr><td style="background:${COLORS.paper};border:1px solid ${COLORS.sand};padding:32px 24px">${body}</td></tr>
<tr><td align="center" style="padding:20px 8px;font-size:12px;line-height:1.6;color:${COLORS.muted}">
${footer ?? "Une question ? Répondez simplement à cet e-mail."}<br>
<a href="${escapeHtml(siteUrl("/"))}" style="color:${COLORS.muted}">Youna Collection</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

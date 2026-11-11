const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** 1199 -> "11,99 €" */
export function formatPrice(cents: number): string {
  return euros.format(cents / 100);
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 1199 -> "11,99" (pour un champ de saisie) */
export function centsToInput(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

/** « 11,99 » ou « 11.99 » ou « 12 » -> 1199 ; null si vide ; NaN si illisible. */
export function parseEuros(value: string): number | null {
  const clean = value.replace(/\s|€/g, "").replace(",", ".");
  if (!clean) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return Number.NaN;
  return Math.round(Number(clean) * 100);
}

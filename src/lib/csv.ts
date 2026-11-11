/** Fichiers CSV pour Excel en français : séparateur « ; », BOM, formules neutralisées. */

export function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  // Neutralise les formules (=, +, -, @) qu'un tableur exécuterait.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const csvEuros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function csvResponse(rows: (string | number | null | undefined)[][], filename: string): Response {
  const body = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
  return new Response(`﻿${body}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

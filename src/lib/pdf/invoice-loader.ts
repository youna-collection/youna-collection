import "server-only";
import { createClient } from "../supabase/server";
import { documentNumber, type InvoiceData, renderInvoicePdf } from "./documents";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Réponse PDF : affichée dans le navigateur, avec un nom de fichier lisible. */
export function pdfResponse(bytes: Uint8Array, filename: string) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

/** Facture ou avoir lu avec la session : l'admin voit tout, la cliente seulement les siens. */
export async function invoicePdf(id: string): Promise<Response | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("kind, number, issued_at, seller, buyer, lines, totals, credit:credit_of ( number )")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as Omit<InvoiceData, "credit_of_number"> & { credit: { number: number } | null };
  const bytes = await renderInvoicePdf({ ...row, credit_of_number: row.credit?.number ?? null });
  const name = `${row.kind === "invoice" ? "Facture" : "Avoir"}-${documentNumber(row.kind, row.number)}.pdf`;
  return pdfResponse(bytes, name);
}

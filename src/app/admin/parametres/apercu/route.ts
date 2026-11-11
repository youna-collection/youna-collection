import { getCurrentProfile } from "@/lib/auth";
import { getShopSettings } from "@/lib/admin/orders";
import { renderInvoicePdf } from "@/lib/pdf/documents";
import { pdfResponse } from "@/lib/pdf/invoice-loader";

/** Aperçu d'une facture avec les informations du vendeur actuelles (rien n'est émis ni numéroté). */
export async function GET() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return new Response("Introuvable.", { status: 404 });
  const s = await getShopSettings();
  const missing = "(à compléter)";
  const now = new Date().toISOString();

  const bytes = await renderInvoicePdf(
    {
      kind: "invoice",
      number: 1,
      issued_at: now,
      seller: {
        legal_name: s?.legal_name ?? missing,
        trade_name: s?.trade_name ?? undefined,
        legal_form: s?.legal_form ?? undefined,
        siret: s?.siret ?? missing,
        vat_number: s?.vat_number ?? undefined,
        vat_mention: s?.vat_mention ?? undefined,
        address: [s?.address_line1 ?? missing, s?.address_line2 ?? "", `${s?.postal_code ?? ""} ${s?.city ?? ""}`.trim() || missing, s?.country ?? ""].filter(Boolean),
        email: s?.email ?? undefined,
        phone: s?.phone ?? undefined,
        footer: s?.invoice_footer ?? undefined,
      },
      buyer: { name: "Cliente Exemple", email: "cliente@exemple.fr", address: ["12 rue de l'Exemple", "75001 Paris", "FR"] },
      lines: [
        { label: "Liquid Jersey — Noir", quantity: 2, unit_price_cents: 1199, total_cents: 2398 },
        { label: "Bouquet Youna — S · 3 voiles", details: ["Liquid Jersey Noir", "Liquid Jersey Noir", "Liquid Jersey Ivory"], quantity: 1, unit_price_cents: 3699, total_cents: 3699 },
      ],
      totals: { order_number: 2001, order_date: now, subtotal_cents: 6097, discount_cents: 0, shipping_cents: 499, total_cents: 6596, payment: "carte" },
    },
    { preview: true },
  );
  return pdfResponse(bytes, "Apercu-facture.pdf");
}

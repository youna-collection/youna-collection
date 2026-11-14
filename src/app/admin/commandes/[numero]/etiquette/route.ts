import { getCurrentProfile } from "@/lib/auth";
import { pdfResponse } from "@/lib/pdf/invoice-loader";
import { getLabelPdf, SendcloudError } from "@/lib/sendcloud";
import { createClient } from "@/lib/supabase/server";

/** Étiquette Sendcloud d'une commande, en PDF (récupérée chez Sendcloud à chaque ouverture). */
export async function GET(_request: Request, { params }: RouteContext<"/admin/commandes/[numero]/etiquette">) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return new Response("Introuvable.", { status: 404 });
  const { numero } = await params;
  if (!/^\d{1,9}$/.test(numero)) return new Response("Introuvable.", { status: 404 });

  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("sendcloud_parcel_id").eq("order_number", Number(numero)).maybeSingle();
  if (!data?.sendcloud_parcel_id) return text("Cette commande n'a pas d'étiquette.", 404);

  try {
    const pdf = await getLabelPdf(data.sendcloud_parcel_id);
    return pdfResponse(new Uint8Array(pdf), `Etiquette-${numero}.pdf`);
  } catch (error) {
    const detail = error instanceof SendcloudError ? error.message : "Sendcloud ne répond pas.";
    return text(`L'étiquette n'a pas pu être récupérée (${detail}). Réessayez dans un instant.`, 502);
  }
}

function text(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

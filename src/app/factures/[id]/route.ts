import { getCurrentUser } from "@/lib/auth";
import { invoicePdf } from "@/lib/pdf/invoice-loader";

/** Une facture ou un avoir déjà émis (admin, ou cliente pour ses propres commandes). */
export async function GET(_: Request, { params }: RouteContext<"/factures/[id]">) {
  const { id } = await params;
  if (!(await getCurrentUser())) return new Response("Connectez-vous pour voir ce document.", { status: 401 });
  return (await invoicePdf(id)) ?? new Response("Document introuvable.", { status: 404 });
}

import { getCurrentProfile } from "@/lib/auth";
import { listCustomers } from "@/lib/admin/customers";
import { csvEuros, csvResponse } from "@/lib/csv";

/** Liste des clientes en CSV (s'ouvre directement dans Excel en français). */
export async function GET() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return new Response("Introuvable.", { status: 404 });

  const customers = await listCustomers();
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "");
  return csvResponse(
    [
      ["E-mail", "Prénom", "Nom", "Téléphone", "Compte", "Commandes", "Montant dépensé (€)", "Première commande", "Dernière commande"],
      ...customers.map((c) => [
        c.email,
        c.first_name,
        c.last_name,
        c.phone,
        c.has_account ? "oui" : "non",
        c.orders_count,
        csvEuros(c.spent_cents),
        day(c.first_order_at),
        day(c.last_order_at),
      ]),
    ],
    `clientes-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

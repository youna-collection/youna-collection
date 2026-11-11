import type { NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { customerName, SOURCE_LABELS, type OrderSource } from "@/lib/admin/orders";
import { PAYMENT_LABELS } from "@/lib/admin/stock";
import { csvEuros, csvResponse } from "@/lib/csv";
import { CARRIER_LABELS, documentNumber, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-display";
import { createClient } from "@/lib/supabase/server";

/** Minuit (heure de Paris) le premier jour du mois donné, en UTC. */
function parisMonthStart(year: number, month: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, 1));
  const offset =
    new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Paris" })).getTime() - new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess.getTime() - offset);
}

type Row = {
  order_number: number;
  created_at: string;
  status: OrderStatus;
  source: OrderSource;
  email: string | null;
  shipping_address: Record<string, string> | null;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  total_cents: number;
  refunded_cents: number;
  promo_code: string | null;
  payment_method: string | null;
  carrier: string | null;
  items: { quantity: number }[];
  invoices: { kind: "invoice" | "credit_note"; number: number }[];
};

/**
 * Commandes d'un mois (?mois=2026-11) ou d'une année (?annee=2026) en CSV, pour la comptabilité.
 * Les commandes annulées sont incluses (avec leur statut et le montant remboursé).
 */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return new Response("Introuvable.", { status: 404 });

  const month = request.nextUrl.searchParams.get("mois") ?? "";
  const year = request.nextUrl.searchParams.get("annee") ?? "";
  let from: Date;
  let to: Date;
  let label: string;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    from = parisMonthStart(y, m);
    to = m === 12 ? parisMonthStart(y + 1, 1) : parisMonthStart(y, m + 1);
    label = month;
  } else if (/^\d{4}$/.test(year)) {
    from = parisMonthStart(Number(year), 1);
    to = parisMonthStart(Number(year) + 1, 1);
    label = year;
  } else {
    return new Response("Période invalide.", { status: 400 });
  }

  const supabase = await createClient();
  const orders: Row[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `order_number, created_at, status, source, email, shipping_address, subtotal_cents, discount_cents, shipping_cents, total_cents,
         refunded_cents, promo_code, payment_method, carrier, items:order_items ( quantity ), invoices ( kind, number )`,
      )
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .order("created_at")
      .range(page * 1000, page * 1000 + 999);
    if (error) return new Response("Export impossible.", { status: 500 });
    orders.push(...(data as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }

  const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const payment = (o: Row) => (o.source === "web" ? "Carte (Stripe)" : o.payment_method ? (PAYMENT_LABELS[o.payment_method] ?? o.payment_method) : "");
  return csvResponse(
    [
      [
        "N° commande",
        "Date",
        "Statut",
        "Canal",
        "Cliente",
        "E-mail",
        "Pays",
        "Articles",
        "Sous-total (€)",
        "Réduction (€)",
        "Code promo",
        "Livraison (€)",
        "Total payé (€)",
        "Remboursé (€)",
        "Net encaissé (€)",
        "Paiement",
        "Transporteur",
        "Facture",
        "Avoirs",
      ],
      ...orders.map((o) => [
        o.order_number,
        date(o.created_at),
        ORDER_STATUS_LABELS[o.status],
        SOURCE_LABELS[o.source],
        customerName(o.shipping_address),
        o.email,
        o.shipping_address?.country ?? "",
        o.items.reduce((n, i) => n + i.quantity, 0),
        csvEuros(o.subtotal_cents),
        csvEuros(o.discount_cents),
        o.promo_code,
        csvEuros(o.shipping_cents),
        csvEuros(o.total_cents),
        csvEuros(o.refunded_cents),
        csvEuros(o.total_cents - o.refunded_cents),
        payment(o),
        o.carrier ? (CARRIER_LABELS[o.carrier] ?? o.carrier) : "",
        o.invoices.filter((i) => i.kind === "invoice").map((i) => documentNumber(i.kind, i.number)).join(" "),
        o.invoices.filter((i) => i.kind === "credit_note").map((i) => documentNumber(i.kind, i.number)).join(" "),
      ]),
    ],
    `commandes-${label}.csv`,
  );
}

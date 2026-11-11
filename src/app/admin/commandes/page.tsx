import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/order-status";
import { countOrdersByStatus, customerName, listAdminOrders, ORDER_FILTERS, type OrderFilter, SOURCE_LABELS } from "@/lib/admin/orders";
import { formatPrice } from "@/lib/format";
import { CARRIER_LABELS } from "@/lib/order-display";

export const metadata: Metadata = { title: "Commandes" };
export const dynamic = "force-dynamic";

const field = "min-h-11 border border-sand bg-white px-3 text-base outline-none focus:border-ink";
const dateTime = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/commandes">) {
  const params = await searchParams;
  const filter = (ORDER_FILTERS.find((f) => f.value === params.statut)?.value ?? "a-traiter") as OrderFilter;
  const q = typeof params.q === "string" ? params.q : "";
  const source = typeof params.source === "string" ? params.source : "";
  const page = Math.max(1, Math.min(1000, Number(params.page) || 1));

  const [{ orders, total, pageCount }, counts] = await Promise.all([listAdminOrders({ filter, q, source, page }), countOrdersByStatus()]);
  const badge: Partial<Record<OrderFilter, number>> = { "a-traiter": counts.paid, preparation: counts.preparing, expediees: counts.shipped };

  const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(new Date());

  const href = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams();
    const merged = { statut: filter, q, source, page: undefined as number | undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) next.set(k, String(v));
    return `/admin/commandes?${next}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl">Commandes</h1>
        {(counts.paid ?? 0) + (counts.preparing ?? 0) > 0 ? (
          <a href="/admin/commandes/bons?a=preparer" target="_blank" className="flex min-h-11 items-center border border-ink px-4 text-sm">
            Imprimer les bons à préparer ({(counts.paid ?? 0) + (counts.preparing ?? 0)})
          </a>
        ) : null}
      </div>

      <details className="border border-sand bg-ivory">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm">Exporter pour la comptabilité (CSV)</summary>
        <form action="/admin/commandes/export" method="get" className="flex flex-wrap items-end gap-2 px-4 pb-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">Mois</span>
            <input type="month" name="mois" required defaultValue={thisMonth} className="min-h-11 border border-sand bg-white px-3 text-base" />
          </label>
          <button type="submit" className="min-h-11 border border-ink px-4 text-sm">
            Télécharger
          </button>
          <a href={`/admin/commandes/export?annee=${thisMonth.slice(0, 4)}`} className="flex min-h-11 items-center px-2 text-sm underline underline-offset-4">
            Toute l&apos;année {thisMonth.slice(0, 4)}
          </a>
        </form>
      </details>

      <nav aria-label="Statut" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-1">
          {ORDER_FILTERS.map((f) => (
            <li key={f.value} className="shrink-0">
              <Link
                href={href({ statut: f.value, page: undefined })}
                aria-current={f.value === filter ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 border px-3 text-sm ${f.value === filter ? "border-ink bg-ink text-ivory" : "border-sand bg-white"}`}
              >
                {f.label}
                {badge[f.value] ? <span className="text-xs opacity-70">{badge[f.value]}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input type="hidden" name="statut" value={filter} />
        <input type="search" name="q" defaultValue={q} placeholder="N° de commande, nom ou e-mail…" className={field} aria-label="Rechercher" />
        <select name="source" defaultValue={source} className={field} aria-label="Origine">
          <option value="">Toutes les origines</option>
          <option value="web">En ligne</option>
          <option value="in_person">En boutique</option>
          <option value="shopify_import">Ancien site Shopify</option>
        </select>
        <button type="submit" className="min-h-11 border border-ink px-4 text-sm">
          Rechercher
        </button>
      </form>

      <p className="text-sm text-muted">
        {total} commande{total > 1 ? "s" : ""}
      </p>

      <ul className="flex flex-col divide-y divide-sand border-y border-sand bg-ivory">
        {orders.map((order) => {
          const name = customerName(order.shipping_address);
          return (
            <li key={order.id}>
              <Link href={`/admin/commandes/${order.order_number}`} className="flex flex-col gap-1 p-3 hover:bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">n° {order.order_number}</span>
                    <StatusBadge status={order.status} />
                  </span>
                  <span>{formatPrice(order.total_cents)}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                  <span className="min-w-0 truncate">{[name, order.email].filter(Boolean).join(" · ") || "Cliente non renseignée"}</span>
                  <span>{dateTime.format(new Date(order.created_at))}</span>
                </div>
                <span className="text-xs text-muted">
                  {order.item_count} article{order.item_count > 1 ? "s" : ""} ·{" "}
                  {order.source === "web" ? (order.carrier ? (CARRIER_LABELS[order.carrier] ?? order.carrier) : "—") : SOURCE_LABELS[order.source]}
                  {order.refunded_cents ? ` · ${formatPrice(order.refunded_cents)} remboursés` : ""}
                </span>
              </Link>
            </li>
          );
        })}
        {!orders.length ? <li className="p-4 text-sm text-muted">Aucune commande ici.</li> : null}
      </ul>

      {pageCount > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} className="min-h-11 underline underline-offset-4">
              ← Précédentes
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={href({ page: page + 1 })} className="min-h-11 underline underline-offset-4">
              Suivantes →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { SOURCE_LABELS } from "@/lib/admin/orders";
import { change, getStats, PERIODS, type PeriodKey, periodRange } from "@/lib/admin/stats";
import { formatPrice } from "@/lib/format";
import { CARRIER_LABELS } from "@/lib/order-display";

export const metadata: Metadata = { title: "Statistiques" };
export const dynamic = "force-dynamic";

function Delta({ value, previousLabel }: { value: number | null; previousLabel: string }) {
  if (value === null) return <span className="text-xs text-muted">pas de comparaison</span>;
  const up = value > 0;
  const tone = value === 0 ? "text-muted" : up ? "text-success" : "text-danger";
  return (
    <span className={`text-xs ${tone}`}>
      {value === 0 ? "=" : up ? "▲" : "▼"} {up ? "+" : ""}
      {value} % <span className="text-muted">vs {previousLabel}</span>
    </span>
  );
}

function Tile({ label, value, delta, previousLabel }: { label: string; value: string; delta: number | null; previousLabel: string }) {
  return (
    <div className="flex flex-col gap-1 border border-sand bg-ivory p-4">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-2xl font-medium tabular-nums">{value}</span>
      <Delta value={delta} previousLabel={previousLabel} />
    </div>
  );
}

/** Liste classée avec une barre proportionnelle (une seule couleur), valeur au bout. */
function Ranked({ rows }: { rows: { key: string; label: string; value: number; display: string; sub?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="text-sm text-muted">Rien sur cette période.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums">{r.display}</span>
          </div>
          <div className="h-2 w-full bg-sand/40">
            <div className="h-2 rounded-r bg-ink" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          {r.sub ? <span className="text-xs text-muted">{r.sub}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export default async function StatsPage({ searchParams }: PageProps<"/admin/statistiques">) {
  const params = await searchParams;
  const key = (typeof params.periode === "string" && params.periode in PERIODS ? params.periode : "30j") as PeriodKey;
  const range = periodRange(key);
  const [stats, previous] = await Promise.all([
    getStats(range.from, range.to, range.bucket),
    getStats(range.previousFrom, range.previousTo, range.bucket),
  ]);
  const t = stats.totals;
  const p = previous.totals;
  const avg = t.orders ? Math.round(t.net_cents / t.orders) : 0;
  const prevAvg = p.orders ? Math.round(p.net_cents / p.orders) : 0;
  const previousLabel = key === "12m" ? "les 12 mois d'avant" : `les ${PERIODS[key].label} d'avant`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl">Statistiques</h1>
        <nav aria-label="Période" className="flex gap-1">
          {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
            <Link
              key={k}
              href={`/admin/statistiques?periode=${k}`}
              aria-current={k === key ? "page" : undefined}
              className={`flex min-h-11 items-center border px-3 text-sm ${k === key ? "border-ink bg-ink text-ivory" : "border-sand bg-white"}`}
            >
              {PERIODS[k].label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Chiffre d'affaires net" value={formatPrice(t.net_cents)} delta={change(t.net_cents, p.net_cents)} previousLabel={previousLabel} />
        <Tile label="Commandes" value={String(t.orders)} delta={change(t.orders, p.orders)} previousLabel={previousLabel} />
        <Tile label="Panier moyen" value={formatPrice(avg)} delta={change(avg, prevAvg)} previousLabel={previousLabel} />
        <Tile label="Articles vendus" value={String(t.items)} delta={change(t.items, p.items)} previousLabel={previousLabel} />
      </div>

      <section className="flex flex-col gap-3 border border-sand bg-ivory p-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg">Chiffre d&apos;affaires net</h2>
          <p className="text-xs text-muted">
            Par {range.bucket === "day" ? "jour" : range.bucket === "week" ? "semaine" : "mois"} · total payé moins remboursements · en ligne et en boutique
          </p>
        </div>
        <RevenueChart points={stats.series} bucket={range.bucket} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-4 border border-sand bg-ivory p-4">
          <h2 className="text-lg">Meilleures ventes</h2>
          <Ranked
            rows={stats.top_products.map((r) => ({
              key: r.name,
              label: r.name,
              value: r.quantity,
              display: `${r.quantity} vendu${r.quantity > 1 ? "s" : ""}`,
              sub: formatPrice(r.revenue_cents),
            }))}
          />
        </section>
        <section className="flex flex-col gap-4 border border-sand bg-ivory p-4">
          <h2 className="text-lg">Couleurs et tailles préférées</h2>
          <Ranked
            rows={stats.top_variants.map((r) => ({
              key: `${r.name}-${r.variant}`,
              label: [r.name, r.variant].filter(Boolean).join(" · "),
              value: r.quantity,
              display: String(r.quantity),
            }))}
          />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="flex flex-col gap-4 border border-sand bg-ivory p-4">
          <h2 className="text-lg">En ligne ou en boutique</h2>
          <Ranked
            rows={stats.by_source.map((r) => ({
              key: r.source,
              label: SOURCE_LABELS[r.source] ?? r.source,
              value: r.net_cents,
              display: formatPrice(r.net_cents),
              sub: `${r.orders} commande${r.orders > 1 ? "s" : ""}`,
            }))}
          />
        </section>
        <section className="flex flex-col gap-4 border border-sand bg-ivory p-4">
          <h2 className="text-lg">Livraison choisie</h2>
          <Ranked
            rows={stats.by_carrier.map((r) => ({
              key: r.carrier ?? "aucun",
              label: r.carrier ? (CARRIER_LABELS[r.carrier] ?? r.carrier) : "—",
              value: r.orders,
              display: `${r.orders}`,
            }))}
          />
        </section>
        <section className="flex flex-col gap-3 border border-sand bg-ivory p-4 text-sm">
          <h2 className="text-lg">Clientes</h2>
          <dl className="flex flex-col gap-2">
            <div className="flex justify-between">
              <dt>Clientes différentes</dt>
              <dd className="tabular-nums">{stats.customers}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Déjà venues avant</dt>
              <dd className="tabular-nums">{stats.returning_customers}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Nouveaux comptes</dt>
              <dd className="tabular-nums">{stats.new_accounts}</dd>
            </div>
          </dl>
          <Link href="/admin/clientes" className="text-xs underline underline-offset-2">
            Voir toutes les clientes
          </Link>
        </section>
      </div>

      <section className="flex flex-col gap-3 border border-sand bg-ivory p-4 text-sm">
        <h2 className="text-lg">Détail</h2>
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <div className="flex justify-between">
            <dt>Encaissé (avant remboursements)</dt>
            <dd className="tabular-nums">{formatPrice(t.gross_cents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Remboursé</dt>
            <dd className="tabular-nums">{formatPrice(t.refunded_cents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Dont frais de port payés</dt>
            <dd className="tabular-nums">{formatPrice(t.shipping_cents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Réductions accordées</dt>
            <dd className="tabular-nums">{formatPrice(t.discount_cents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Commandes annulées</dt>
            <dd className="tabular-nums">{t.cancelled}</dd>
          </div>
        </dl>
        {stats.promos.length ? (
          <div className="flex flex-col gap-1 border-t border-sand pt-3">
            <h3 className="text-sm text-muted">Codes promo utilisés</h3>
            {stats.promos.map((pr) => (
              <div key={pr.code} className="flex justify-between">
                <span>{pr.code}</span>
                <span className="tabular-nums">
                  {pr.orders} commande{pr.orders > 1 ? "s" : ""} · −{formatPrice(pr.discount_cents)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted">Les frais Stripe (environ 1,5 % + 0,25 € par paiement en ligne) ne sont pas déduits.</p>
      </section>
    </div>
  );
}

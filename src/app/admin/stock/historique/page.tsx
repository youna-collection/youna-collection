import type { Metadata } from "next";
import Link from "next/link";
import { listStockMovements, STOCK_REASON_LABELS } from "@/lib/admin/stock";

export const metadata: Metadata = { title: "Historique du stock" };
export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StockHistoryPage({ searchParams }: PageProps<"/admin/stock/historique">) {
  const params = await searchParams;
  const variantId = typeof params.variante === "string" && UUID.test(params.variante) ? params.variante : undefined;
  const movements = await listStockMovements(variantId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin/stock" className="text-sm text-muted hover:text-ink">
          ← Stock
        </Link>
        <h1 className="text-xl">Historique du stock</h1>
        {variantId ? (
          <p className="text-sm text-muted">
            {movements[0]?.label ?? "Cet article"} ·{" "}
            <Link href="/admin/stock/historique" className="underline underline-offset-2">
              voir tous les articles
            </Link>
          </p>
        ) : (
          <p className="text-sm text-muted">Les {movements.length} derniers mouvements.</p>
        )}
      </div>

      <ul className="flex flex-col divide-y divide-sand border-y border-sand bg-ivory">
        {movements.map((m) => (
          <li key={m.id} className="flex items-start gap-3 p-3">
            <span className={`w-12 shrink-0 text-right text-lg tabular-nums ${m.delta > 0 ? "text-success" : "text-danger"}`}>
              {m.delta > 0 ? `+${m.delta}` : m.delta}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {variantId ? null : (
                <Link href={`/admin/stock/historique?variante=${m.variant_id}`} className="truncate hover:underline">
                  {m.label}
                </Link>
              )}
              <span className="text-sm">
                {STOCK_REASON_LABELS[m.reason] ?? m.reason}
                {m.order_number ? ` · commande n° ${m.order_number}` : ""}
                {m.note ? ` · ${m.note}` : ""}
              </span>
              <span className="text-xs text-muted">
                {dateTime.format(new Date(m.created_at))} · reste {m.stock_after}
              </span>
            </div>
          </li>
        ))}
        {!movements.length ? <li className="p-4 text-sm text-muted">Aucun mouvement pour le moment.</li> : null}
      </ul>
    </div>
  );
}

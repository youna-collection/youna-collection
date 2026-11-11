import type { Metadata } from "next";
import Link from "next/link";
import { TicketStatusBadge } from "@/components/support/ticket-view";
import { listAdminTickets, SUPPORT_FILTERS, type SupportFilter } from "@/lib/admin/support";
import { TICKET_TYPE_LABELS } from "@/lib/support-rules";

export const metadata: Metadata = { title: "SAV" };
export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default async function AdminSupportPage({ searchParams }: PageProps<"/admin/sav">) {
  const params = await searchParams;
  const filter = (SUPPORT_FILTERS.find((f) => f.value === params.filtre)?.value ?? "a-traiter") as SupportFilter;
  const page = Math.max(1, Math.min(1000, Number(params.page) || 1));
  const { tickets, pageCount } = await listAdminTickets({ filter, page });
  const href = (patch: { filtre?: string; page?: number }) => {
    const next = new URLSearchParams({ filtre: patch.filtre ?? filter });
    if (patch.page && patch.page > 1) next.set("page", String(patch.page));
    return `/admin/sav?${next}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl">SAV</h1>
      <nav aria-label="Filtre" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-1">
          {SUPPORT_FILTERS.map((f) => (
            <li key={f.value} className="shrink-0">
              <Link
                href={href({ filtre: f.value })}
                aria-current={f.value === filter ? "page" : undefined}
                className={`flex min-h-11 items-center border px-3 text-sm ${f.value === filter ? "border-ink bg-ink text-ivory" : "border-sand bg-white"}`}
              >
                {f.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tickets.length ? (
        <ul className="flex flex-col divide-y divide-sand border-y border-sand bg-white">
          {tickets.map((t) => {
            const name = [t.order.shipping_address?.first_name, t.order.shipping_address?.last_name].filter(Boolean).join(" ");
            const toHandle = t.last_author === "customer" && t.status !== "closed";
            return (
              <li key={t.id}>
                <Link href={`/admin/sav/${t.number}`} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm hover:bg-paper">
                  <span className="min-w-0">
                    <span className={toHandle ? "font-medium" : ""}>
                      n° {t.number} · {TICKET_TYPE_LABELS[t.type]} · {name || t.email}
                    </span>
                    <span className="block text-xs text-muted">
                      Commande n° {t.order.order_number} · {toHandle ? "la cliente attend votre réponse" : "dernier message"} · {dateTime.format(new Date(t.last_message_at))}
                    </span>
                  </span>
                  <TicketStatusBadge status={t.status} admin />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">{filter === "a-traiter" ? "Aucune demande en attente de réponse." : "Aucune demande."}</p>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pages" className="flex gap-4 text-sm">
          {page > 1 ? <Link href={href({ page: page - 1 })}>← Plus récentes</Link> : null}
          {page < pageCount ? <Link href={href({ page: page + 1 })}>Plus anciennes →</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}

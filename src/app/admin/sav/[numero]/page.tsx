import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TicketReply } from "@/components/admin/ticket-reply";
import { TicketStatusBadge, TicketThread } from "@/components/support/ticket-view";
import { requireAdmin } from "@/lib/auth";
import { formatDate, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-display";
import { loadTicket } from "@/lib/support";
import { returnDeadline, TICKET_TYPE_LABELS } from "@/lib/support-rules";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/admin/sav/[numero]">): Promise<Metadata> {
  return { title: `SAV n° ${(await params).numero}` };
}

export default async function AdminTicketPage({ params }: PageProps<"/admin/sav/[numero]">) {
  const { numero } = await params;
  await requireAdmin(`/admin/sav/${numero}`);
  if (!/^\d{1,9}$/.test(numero)) notFound();
  const ticket = await loadTicket(Number(numero));
  if (!ticket) notFound();

  const { order } = ticket;
  const name = [order.shipping_address?.first_name, order.shipping_address?.last_name].filter(Boolean).join(" ");
  const deadline = returnDeadline(order);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link href="/admin/sav" className="text-sm text-muted hover:text-ink">
            ← SAV
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl">
              Demande n° {ticket.number} · {TICKET_TYPE_LABELS[ticket.type]}
            </h1>
            <TicketStatusBadge status={ticket.status} admin />
          </div>
          <p className="text-sm text-muted">Ouverte le {formatDate(ticket.created_at)}</p>
        </div>
        <TicketThread messages={ticket.messages} viewer="admin" />
        <section className="border border-sand bg-ivory p-4">
          <TicketReply ticketId={ticket.id} status={ticket.status} />
        </section>
      </div>

      <aside className="flex min-w-0 flex-col gap-4 text-sm">
        <section className="flex flex-col gap-1 border border-sand bg-ivory p-4">
          <h2 className="mb-1 text-base">Cliente</h2>
          {name ? <p>{name}</p> : null}
          <a href={`mailto:${ticket.email}`} className="break-all underline underline-offset-4">
            {ticket.email}
          </a>
          <p className="text-xs text-muted">{order.user_id ? "A un compte" : "Sans compte (accès par lien e-mail)"}</p>
        </section>
        <section className="flex flex-col gap-1 border border-sand bg-ivory p-4">
          <h2 className="mb-1 text-base">Commande</h2>
          <Link href={`/admin/commandes/${order.order_number}`} className="underline underline-offset-4">
            n° {order.order_number}
          </Link>
          <p className="text-muted">{ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}</p>
          {order.delivered_at ? <p className="text-muted">Livrée le {formatDate(order.delivered_at)}</p> : null}
          {!order.delivered_at && order.shipped_at ? <p className="text-muted">Expédiée le {formatDate(order.shipped_at)}</p> : null}
          {deadline && ticket.type !== "complaint" ? <p className="text-muted">Délai de retour : {formatDate(deadline)}</p> : null}
        </section>
        {ticket.items.length ? (
          <section className="flex flex-col gap-1 border border-sand bg-ivory p-4">
            <h2 className="mb-1 text-base">Articles concernés</h2>
            <ul>
              {ticket.items.map((i) => (
                <li key={i.order_item_id}>
                  {i.quantity} × {i.product_name}
                  {i.variant_label ? <span className="text-muted"> — {i.variant_label}</span> : null}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Une fois l&apos;article reçu, remboursez-le depuis la commande : le stock est remis à jour au même moment.</p>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

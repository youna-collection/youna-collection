import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewTicketSection, TicketList } from "@/components/support/ticket-view";
import { activeTicketNumber, getGuestOrder, listTicketsForOrder } from "@/lib/support";

export const metadata: Metadata = { title: "Service client", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function GuestSupportPage() {
  const order = await getGuestOrder();
  if (!order) redirect("/sav?lien=expire");
  const [tickets, active] = await Promise.all([listTicketsForOrder(order.id), activeTicketNumber(order.id)]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-3">
        <Link href="/sav" className="text-xs tracking-widest text-muted uppercase hover:underline">
          ← Service client
        </Link>
        <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Commande n° {order.order_number}</h1>
      </div>
      {tickets.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm tracking-[0.2em] uppercase">Vos demandes</h2>
          <TicketList tickets={tickets} hrefFor={(t) => `/sav/suivi/${t.number}`} />
        </section>
      ) : null}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm tracking-[0.2em] uppercase">Nouvelle demande</h2>
        <NewTicketSection order={order} activeHref={active ? `/sav/suivi/${active}` : null} />
      </section>
    </main>
  );
}

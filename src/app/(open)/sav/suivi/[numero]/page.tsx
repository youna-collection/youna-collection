import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CustomerTicketView } from "@/components/support/ticket-view";
import { getGuestOrder, getTicketForCustomer } from "@/lib/support";

export const metadata: Metadata = { title: "Ma demande", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function GuestTicketPage({ params, searchParams }: PageProps<"/sav/suivi/[numero]">) {
  const { numero } = await params;
  const query = await searchParams;
  if (!(await getGuestOrder())) redirect("/sav?lien=expire");
  if (!/^\d{1,9}$/.test(numero)) notFound();
  const ticket = await getTicketForCustomer(Number(numero), "guest");
  if (!ticket) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-12">
      <CustomerTicketView
        ticket={ticket}
        mode="guest"
        flash={query.envoyee ? "envoyee" : query.deja ? "deja" : undefined}
        backHref="/sav/suivi"
        backLabel={`Commande n° ${ticket.order.order_number}`}
      />
    </main>
  );
}

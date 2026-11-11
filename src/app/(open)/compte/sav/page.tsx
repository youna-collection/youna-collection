import type { Metadata } from "next";
import Link from "next/link";
import { TicketList } from "@/components/support/ticket-view";
import { requireProfile } from "@/lib/auth";
import { listTicketsForUser } from "@/lib/support";

export const metadata: Metadata = { title: "Service client" };
export const dynamic = "force-dynamic";

export default async function MySupportPage() {
  const profile = await requireProfile("/compte/sav");
  const tickets = await listTicketsForUser(profile.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Service client</h1>
        <Link href="/compte/sav/nouvelle" className="flex min-h-11 items-center bg-ink px-5 text-xs tracking-widest text-ivory uppercase">
          Nouvelle demande
        </Link>
      </div>
      <p className="text-sm text-muted">
        Retour, échange ou réclamation : retours et échanges sont possibles pendant 14 jours après la réception du colis. Pour un souci (colis abîmé, article manquant…), écrivez-nous à tout moment.
      </p>
      {tickets.length ? (
        <TicketList tickets={tickets} hrefFor={(t) => `/compte/sav/${t.number}`} />
      ) : (
        <p className="text-sm text-muted">Vous n&apos;avez encore fait aucune demande.</p>
      )}
    </div>
  );
}

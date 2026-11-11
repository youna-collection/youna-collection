import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerTicketView } from "@/components/support/ticket-view";
import { requireProfile } from "@/lib/auth";
import { getTicketForCustomer } from "@/lib/support";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/compte/sav/[numero]">): Promise<Metadata> {
  return { title: `Demande n° ${(await params).numero}` };
}

export default async function MyTicketPage({ params, searchParams }: PageProps<"/compte/sav/[numero]">) {
  const { numero } = await params;
  const query = await searchParams;
  await requireProfile(`/compte/sav/${numero}`);
  if (!/^\d{1,9}$/.test(numero)) notFound();
  const ticket = await getTicketForCustomer(Number(numero), "account");
  if (!ticket) notFound();

  return (
    <CustomerTicketView
      ticket={ticket}
      mode="account"
      flash={query.envoyee ? "envoyee" : query.deja ? "deja" : undefined}
      backHref="/compte/sav"
      backLabel="Service client"
    />
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewTicketSection } from "@/components/support/ticket-view";
import { getMyOrders } from "@/lib/account";
import { requireProfile } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { formatDate } from "@/lib/order-display";
import { activeTicketNumber, getOrderAccess } from "@/lib/support";

export const metadata: Metadata = { title: "Nouvelle demande" };
export const dynamic = "force-dynamic";

export default async function NewSupportPage({ searchParams }: PageProps<"/compte/sav/nouvelle">) {
  const { commande } = await searchParams;
  await requireProfile(`/compte/sav/nouvelle${typeof commande === "string" ? `?commande=${encodeURIComponent(commande)}` : ""}`);

  const back = (
    <Link href="/compte/sav" className="text-xs tracking-widest text-muted uppercase hover:underline">
      ← Service client
    </Link>
  );

  // Étape 1 : choisir la commande.
  if (typeof commande !== "string") {
    const orders = (await getMyOrders()).filter((o) => o.status !== "cancelled");
    return (
      <div className="flex flex-col gap-6">
        {back}
        <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Nouvelle demande</h1>
        <p className="text-sm">Quelle commande est concernée ?</p>
        {orders.length ? (
          <ul className="flex flex-col divide-y divide-sand border-y border-sand">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/compte/sav/nouvelle?commande=${o.order_number}`} className="flex justify-between gap-4 py-4 text-sm hover:bg-paper">
                  <span>
                    Commande n° {o.order_number}
                    <span className="block text-xs text-muted">
                      {formatDate(o.created_at)} · {o.item_count} article{o.item_count > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span>{formatPrice(o.total_cents)} →</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucune commande sur ce compte.</p>
        )}
      </div>
    );
  }

  // Étape 2 : la demande.
  if (!/^\d{1,9}$/.test(commande)) notFound();
  const access = await getOrderAccess(Number(commande));
  if (!access || access.mode !== "account") notFound();
  const active = await activeTicketNumber(access.order.id);

  return (
    <div className="flex flex-col gap-6">
      {back}
      <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Commande n° {access.order.order_number}</h1>
      <NewTicketSection order={access.order} activeHref={active ? `/compte/sav/${active}` : null} />
    </div>
  );
}

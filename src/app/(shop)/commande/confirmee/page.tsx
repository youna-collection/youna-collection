import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SyncCartCount } from "@/components/cart-link";
import { formatPrice } from "@/lib/format";
import { fulfillSession } from "@/lib/orders";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Merci pour votre commande", robots: { index: false } };

type ConfirmedOrder = { order_number: number; total_cents: number; carrier: string | null; payment_method: string | null };
const ORDER_FIELDS = "order_number, total_cents, carrier, payment_method";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Commande en espèces (click & collect) : enregistrée sans passer par Stripe, retrouvée par son identifiant secret. */
async function cashOrder(orderId: string) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await createAdminClient()
    .from("orders")
    .select(ORDER_FIELDS)
    .eq("id", orderId)
    .eq("payment_method", "especes")
    .eq("source", "web")
    .gte("created_at", since)
    .maybeSingle<ConfirmedOrder>();
  return data;
}

async function cardOrder(sessionId: string) {
  const session = await getStripe()
    .checkout.sessions.retrieve(sessionId)
    .catch(() => null);
  if (!session) notFound();
  // Le webhook crée normalement la commande ; si cette page arrive avant lui, elle la crée elle-même.
  const orderId = await fulfillSession(session, { refreshCatalog: false });
  if (!orderId) return null;
  const { data } = await createAdminClient().from("orders").select(ORDER_FIELDS).eq("id", orderId).single<ConfirmedOrder>();
  return data;
}

export default async function ConfirmationPage({ searchParams }: PageProps<"/commande/confirmee">) {
  const { session_id: sessionId, commande } = await searchParams;
  let order: ConfirmedOrder | null;
  if (typeof commande === "string" && UUID.test(commande)) {
    order = await cashOrder(commande);
    if (!order) notFound();
  } else if (typeof sessionId === "string" && /^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    order = await cardOrder(sessionId);
  } else {
    notFound();
  }
  const cash = order?.payment_method === "especes";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-start gap-6 px-4 py-12 md:py-20">
      {order ? <SyncCartCount count={0} /> : null}
      <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Merci !</h1>
      {order ? (
        <>
          <p>
            Votre commande <strong>n° {order.order_number}</strong> est {cash ? "enregistrée" : "confirmée"} ({formatPrice(order.total_cents)}).
          </p>
          {cash ? (
            <p>
              Vous la réglerez <strong>en espèces</strong> au moment du retrait. Prévoyez si possible l&apos;appoint.
            </p>
          ) : null}
          <p className="text-sm text-muted">
            {order.carrier === "pickup"
              ? "Nous vous contactons très vite pour convenir du retrait."
              : "Nous préparons votre colis avec soin. Vous recevrez le numéro de suivi dès son envoi."}
          </p>
        </>
      ) : (
        <p>Votre paiement est en cours de validation. Votre commande apparaîtra dès qu&apos;il sera confirmé.</p>
      )}
      <Link href="/" className="min-h-12 bg-ink px-6 py-4 text-sm tracking-widest text-ivory uppercase">
        Retour à la boutique
      </Link>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SyncCartCount } from "@/components/cart-link";
import { formatPrice } from "@/lib/format";
import { fulfillSession } from "@/lib/orders";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Merci pour votre commande", robots: { index: false } };

export default async function ConfirmationPage({ searchParams }: PageProps<"/commande/confirmee">) {
  const { session_id: sessionId } = await searchParams;
  if (typeof sessionId !== "string" || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) notFound();

  const session = await getStripe()
    .checkout.sessions.retrieve(sessionId)
    .catch(() => null);
  if (!session) notFound();

  // Le webhook crée normalement la commande ; si cette page arrive avant lui, elle la crée elle-même.
  const orderId = await fulfillSession(session, { refreshCatalog: false });
  const { data: order } = orderId
    ? await createAdminClient()
        .from("orders")
        .select("order_number, total_cents, email, carrier")
        .eq("id", orderId)
        .single<{ order_number: number; total_cents: number; email: string; carrier: string | null }>()
    : { data: null };

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-start gap-6 px-4 py-12 md:py-20">
      {order ? <SyncCartCount count={0} /> : null}
      <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Merci !</h1>
      {order ? (
        <>
          <p>
            Votre commande <strong>n° {order.order_number}</strong> est confirmée ({formatPrice(order.total_cents)}).
          </p>
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

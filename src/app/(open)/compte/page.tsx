import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { OrderList } from "@/components/order-list";
import { getMyOrders } from "@/lib/account";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Mon compte" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const profile = await requireProfile("/compte");
  const orders = await getMyOrders(3);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Bonjour{profile.first_name ? ` ${profile.first_name}` : ""}</h1>
        <p className="text-sm text-muted">{profile.email}</p>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm tracking-[0.2em] uppercase">Dernières commandes</h2>
          {orders.length ? (
            <Link href="/compte/commandes" className="text-xs tracking-widest text-muted uppercase hover:underline">
              Tout voir
            </Link>
          ) : null}
        </div>
        {orders.length ? (
          <OrderList orders={orders} />
        ) : (
          <p className="text-sm text-muted">
            Vous n&apos;avez pas encore de commande. Les commandes passées sans compte avec l&apos;adresse {profile.email}{" "}
            apparaissent ici automatiquement.
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        {profile.role === "admin" ? (
          <Link href="/admin" className="flex min-h-12 items-center border border-ink px-6 text-sm tracking-widest uppercase">
            Espace admin
          </Link>
        ) : null}
        <form action={signOut}>
          <button type="submit" className="min-h-12 border border-ink px-6 text-sm tracking-widest uppercase">
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { OrderList } from "@/components/order-list";
import { getMyOrders } from "@/lib/account";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Mes commandes" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const profile = await requireProfile("/compte/commandes");
  const orders = await getMyOrders();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Mes commandes</h1>
      {orders.length ? (
        <OrderList orders={orders} />
      ) : (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted">
            Aucune commande pour le moment. Celles passées sans compte avec l&apos;adresse {profile.email} apparaissent ici
            automatiquement.
          </p>
          <Link href="/" className="min-h-12 bg-ink px-6 py-4 text-sm tracking-widest text-ivory uppercase">
            Découvrir la collection
          </Link>
        </div>
      )}
    </div>
  );
}

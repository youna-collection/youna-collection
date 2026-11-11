import Link from "next/link";
import { MaintenancePage } from "@/components/maintenance-page";
import { ShopShell } from "@/components/shop-shell";
import { getCurrentProfile } from "@/lib/auth";
import { getShopStatus } from "@/lib/shop-status";

/**
 * Pages de vente (accueil, collections, produits, panier, paiement). Quand la boutique est gelée,
 * les visiteuses voient la page d'attente ; l'admin continue de tout voir, avec un bandeau.
 * Le compte client et la connexion (groupe « (open) ») restent toujours accessibles.
 */
export default async function ShopLayout({ children }: LayoutProps<"/">) {
  const status = await getShopStatus();
  if (!status.maintenance) return <ShopShell>{children}</ShopShell>;

  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") return <MaintenancePage title={status.title} message={status.message} />;

  return (
    <ShopShell
      banner={
        <div role="status" className="bg-danger px-4 py-2 text-center text-xs text-ivory">
          Boutique gelée : les clientes voient la page d&apos;attente. Vous seule voyez le site.{" "}
          <Link href="/admin/parametres#gel" className="underline underline-offset-2">
            Rouvrir
          </Link>
        </div>
      }
    >
      {children}
    </ShopShell>
  );
}

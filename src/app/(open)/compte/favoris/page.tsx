import type { Metadata } from "next";
import Link from "next/link";
import { ProductGrid } from "@/components/product-card";
import { getMyFavoriteIds } from "@/lib/account";
import { requireProfile } from "@/lib/auth";
import { getProducts } from "@/lib/catalog";

export const metadata: Metadata = { title: "Mes favoris" };
export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  await requireProfile("/compte/favoris");
  const [ids, products] = await Promise.all([getMyFavoriteIds(), getProducts()]);
  // Dans l'ordre d'ajout, le plus récent d'abord ; un produit retiré de la vente disparaît.
  const favorites = [...ids].flatMap((id) => products.filter((product) => product.id === id));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Mes favoris</h1>
      {favorites.length ? (
        <ProductGrid products={favorites} />
      ) : (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-muted">Touchez le cœur sur une fiche produit pour la retrouver ici.</p>
          <Link href="/" className="min-h-12 bg-ink px-6 py-4 text-sm tracking-widest text-ivory uppercase">
            Découvrir la collection
          </Link>
        </div>
      )}
    </div>
  );
}

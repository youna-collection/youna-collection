import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Compte supprimé", robots: { index: false } };

export default function AccountDeletedPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-6 px-4 py-16">
      <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Compte supprimé</h1>
      <p>Votre compte et vos données personnelles (profil, adresses, favoris, panier) ont été supprimés.</p>
      <p className="text-sm text-muted">
        Les factures de vos commandes passées sont conservées, comme la loi l&apos;impose pour la comptabilité.
      </p>
      <Link href="/" className="min-h-12 bg-ink px-6 py-4 text-sm tracking-widest text-ivory uppercase">
        Retour à la boutique
      </Link>
    </main>
  );
}

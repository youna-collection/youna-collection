import Link from "next/link";
import { MAINTENANCE_MESSAGE } from "@/lib/shop-status";
import { LogoMark } from "./logo";

/** Page d'attente quand la boutique est gelée : une vraie page d'accueil, pas une erreur. */
export function MaintenancePage({ title, message }: { title: string | null; message: string | null }) {
  return (
    <main id="contenu" className="flex flex-1 flex-col items-center justify-center gap-8 bg-ivory px-6 py-20 text-center">
      <meta name="robots" content="noindex" />
      <p>
        <LogoMark className="h-16" />
        <span className="sr-only">Youna Collection</span>
      </p>
      <div className="flex max-w-lg flex-col gap-4">
        <h1 className="text-3xl font-light tracking-[0.1em] text-balance">{title || "On se refait une beauté"}</h1>
        <p className="whitespace-pre-line text-muted">{message || MAINTENANCE_MESSAGE}</p>
      </div>
      <span aria-hidden="true" className="h-px w-16 bg-sand" />
      <nav aria-label="Liens utiles" className="flex flex-wrap justify-center gap-6 text-xs tracking-widest uppercase">
        <Link href="/compte" className="underline-offset-4 hover:underline">
          Mon compte
        </Link>
        <Link href="/compte/commandes" className="underline-offset-4 hover:underline">
          Suivre ma commande
        </Link>
      </nav>
    </main>
  );
}

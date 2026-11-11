import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 py-20 text-center">
      <h1 className="text-2xl font-light tracking-[0.25em] uppercase">Page introuvable</h1>
      <p className="text-muted">Cette page n&apos;existe pas ou n&apos;est plus disponible.</p>
      <Link href="/" className="inline-flex min-h-12 items-center bg-ink px-8 text-sm tracking-widest text-ivory uppercase">
        Retour à l&apos;accueil
      </Link>
    </main>
      <SiteFooter />
    </>
  );
}

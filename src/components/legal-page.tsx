import Link from "next/link";
import { LEGAL_LINKS } from "./site-footer";

export const LEGAL_UPDATED = "11 novembre 2026";

/** Mise en page commune des pages légales : titre, date, texte lisible, liens vers les autres pages. */
export function LegalPage({ title, intro, children, current }: { title: string; intro?: React.ReactNode; children: React.ReactNode; current: string }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-light tracking-[0.15em] text-balance uppercase">{title}</h1>
        <p className="text-xs text-muted">Mise à jour le {LEGAL_UPDATED}</p>
        {intro ? <div className="text-sm text-muted">{intro}</div> : null}
      </header>
      <div className="legal flex flex-col gap-8 text-sm leading-relaxed">{children}</div>
      <nav aria-label="Autres informations" className="border-t border-sand pt-6">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs tracking-widest uppercase">
          {LEGAL_LINKS.filter((l) => l.href !== current).map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="underline-offset-4 hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}

/** Une partie numérotée ou non : titre + paragraphes. */
export function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="text-base font-medium tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

/** Une information que la vendeuse doit encore remplir dans Paramètres. */
export function ToFill({ children }: { children: React.ReactNode }) {
  return <span className="bg-sand px-1 text-ink">[{children} — à compléter]</span>;
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

import Link from "next/link";
import { LOGO_FILLED, LOGO_HAIRLINES, LOGO_VIEWBOX } from "@/lib/logo-paths";

/**
 * Monogramme Youna Collection, en vectoriel : net à toutes les tailles et de la couleur
 * du texte autour. Les traits fins gardent 1 px quelle que soit la taille.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`} aria-hidden="true" className={`w-auto ${className}`} fill="currentColor">
      {LOGO_FILLED.map((d) => (
        <path key={d} d={d} />
      ))}
      <path d={LOGO_HAIRLINES} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Logo de la barre de navigation (monogramme + « Youna Collection »), qui ramène à l'accueil.
 * `nameClassName` permet de masquer le nom quand la place manque (tablette).
 */
export function Logo({ className = "", nameClassName = "" }: { className?: string; nameClassName?: string }) {
  return (
    <Link href="/" aria-label="Youna Collection, accueil" className={`flex items-center gap-3 ${className}`}>
      <LogoMark className="h-8 shrink-0 md:h-10" />
      <span aria-hidden="true" className={`flex-col items-start leading-none ${nameClassName || "flex"}`}>
        <span className="text-lg font-light tracking-[0.4em] uppercase md:text-xl">Youna</span>
        <span className="mt-1 text-[0.55rem] tracking-[0.5em] text-muted uppercase">Collection</span>
      </span>
    </Link>
  );
}

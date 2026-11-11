import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** Habillage de la boutique : lien d'évitement, en-tête et pied de page. */
export function ShopShell({ children, banner }: { children: React.ReactNode; banner?: React.ReactNode }) {
  return (
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ink focus:p-3 focus:text-ivory"
      >
        Aller au contenu
      </a>
      {banner}
      <SiteHeader />
      <div id="contenu" className="flex flex-1 flex-col">
        {children}
      </div>
      <SiteFooter />
    </>
  );
}

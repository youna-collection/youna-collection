"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Fine barre en haut de l'écran pendant le chargement d'une page : on voit tout de suite que le clic a été pris en compte.
 * Elle démarre au clic sur un lien du site et se termine quand la nouvelle page s'affiche.
 */
export function NavigationProgress() {
  const bar = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nouvelle page affichée : la barre se remplit puis disparaît.
  useEffect(() => {
    const el = bar.current;
    if (!el || el.dataset.state !== "loading") return;
    el.dataset.state = "done";
    const hide = setTimeout(() => {
      el.dataset.state = "idle";
    }, 350);
    return () => clearTimeout(hide);
  }, [pathname, search]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      const el = bar.current;
      if (!el) return;
      el.dataset.state = "loading";
      // Au cas où la page ne change pas (lien annulé…) : la barre s'efface d'elle-même.
      if (safety.current) clearTimeout(safety.current);
      safety.current = setTimeout(() => {
        if (el.dataset.state === "loading") el.dataset.state = "idle";
      }, 10_000);
    }
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      if (safety.current) clearTimeout(safety.current);
    };
  }, []);

  return <div ref={bar} data-state="idle" aria-hidden="true" className="nav-progress" />;
}

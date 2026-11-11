"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { BagIcon } from "./icons";

/** Prévient l'icône du panier qu'il faut relire le nombre d'articles. */
export function notifyCartChange() {
  window.dispatchEvent(new Event("cart-change"));
}

function subscribe(callback: () => void) {
  window.addEventListener("cart-change", callback);
  window.addEventListener("focus", callback);
  window.addEventListener("pageshow", callback);
  return () => {
    window.removeEventListener("cart-change", callback);
    window.removeEventListener("focus", callback);
    window.removeEventListener("pageshow", callback);
  };
}

function readCount() {
  const match = document.cookie.match(/(?:^|;\s*)youna_panier_n=(\d+)/);
  return match ? Number(match[1]) : 0;
}

/** Les pages restent en cache : le nombre est lu dans un cookie, côté navigateur. */
export function CartLink() {
  const count = useSyncExternalStore(subscribe, readCount, () => 0);
  return (
    <Link
      href="/panier"
      aria-label={count ? `Panier, ${count} article${count > 1 ? "s" : ""}` : "Panier"}
      className="relative -mr-2 flex size-11 items-center justify-center"
    >
      <BagIcon />
      {count ? (
        <span className="absolute top-1.5 right-1 flex min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] leading-4 text-ivory">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

/** Remet l'icône à jour quand le serveur connaît le vrai nombre (après connexion, par exemple). */
export function SyncCartCount({ count }: { count: number }) {
  useEffect(() => {
    if (readCount() === count) return;
    document.cookie = `youna_panier_n=${count}; path=/; max-age=${60 * 60 * 24 * 60}; samesite=lax`;
    notifyCartChange();
  }, [count]);
  return null;
}

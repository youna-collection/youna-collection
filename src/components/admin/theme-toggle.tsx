"use client";

import { useState } from "react";

/** Bascule clair / sombre de l'admin, retenue un an sur cet appareil (cookie lu par le serveur : pas de flash). */
export function ThemeToggle({ initialDark }: { initialDark: boolean }) {
  const [dark, setDark] = useState(initialDark);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.cookie = `admin-theme=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
    document.querySelector("[data-admin-root]")?.classList.toggle("admin-dark", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Passer en mode clair" : "Passer en mode sombre"}
      className="flex min-h-10 min-w-10 items-center justify-center gap-2 px-2 text-xs tracking-widest text-muted uppercase hover:text-ink"
    >
      <span aria-hidden="true" className="text-base leading-none">
        {dark ? "☀" : "☾"}
      </span>
      <span aria-hidden="true" className="hidden sm:inline">
        {dark ? "Mode clair" : "Mode sombre"}
      </span>
    </button>
  );
}

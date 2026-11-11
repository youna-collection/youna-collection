"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/compte", label: "Accueil" },
  { href: "/compte/commandes", label: "Commandes" },
  { href: "/compte/sav", label: "SAV" },
  { href: "/compte/favoris", label: "Favoris" },
  { href: "/compte/adresses", label: "Adresses" },
  { href: "/compte/profil", label: "Profil" },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Mon compte" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-6 border-b border-sand md:flex-col md:gap-1 md:border-b-0">
        {LINKS.map((link) => {
          const active = link.href === "/compte" ? pathname === "/compte" : pathname.startsWith(link.href);
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center text-xs tracking-[0.2em] uppercase md:min-h-10 ${
                  active ? "border-b border-ink md:border-b-0 md:font-medium" : "text-muted hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

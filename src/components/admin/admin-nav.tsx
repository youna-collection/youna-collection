"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export type AdminLink = { href: string; label: string; badge?: number };

export function AdminNav({ links }: { links: AdminLink[] }) {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  // Sur téléphone, le menu défile à l'horizontale : on amène la rubrique en cours à l'écran.
  useEffect(() => {
    const el = nav.current;
    const current = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && current && el.scrollWidth > el.clientWidth) {
      el.scrollTo({ left: current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2 });
    }
  }, [pathname]);
  return (
    <nav ref={nav} aria-label="Admin" className="relative -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-5 md:flex-col md:gap-1">
        {links.map((link) => {
          const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center border-b-2 text-sm md:min-h-10 md:border-b-0 md:border-l-2 md:pl-3 ${
                  active ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {link.label}
                {link.badge ? (
                  <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-xs text-ivory" aria-label={`${link.badge} à traiter`}>
                    {link.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

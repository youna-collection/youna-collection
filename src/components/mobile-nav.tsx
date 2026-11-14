"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CloseIcon, MenuIcon } from "./icons";

export type NavLink = { href: string; label: string; children?: { href: string; label: string }[] };

export function MobileNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  // Le menu reste ouvert seulement sur la page où il a été ouvert : changer de page le ferme.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const open = openOn === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpenOn(null);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        onClick={() => setOpenOn(open ? null : pathname)}
        className="-ml-2 flex size-11 items-center justify-center"
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>

      {open ? (
        <nav id="mobile-menu" aria-label="Menu" className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-sand bg-ivory shadow-sm">
          <ul className="mx-auto flex max-w-6xl flex-col px-4 py-2">
            {links.map((link) => {
              const isExpanded = expanded === link.href;
              return (
                <li key={link.href} className="border-b border-sand/60 last:border-0">
                  {link.children ? (
                    <>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => setExpanded(isExpanded ? null : link.href)}
                        className="flex min-h-12 w-full items-center justify-between text-sm tracking-[0.2em] uppercase"
                      >
                        {link.label}
                        <span aria-hidden className="text-lg">
                          {isExpanded ? "−" : "+"}
                        </span>
                      </button>
                      {isExpanded ? (
                        <ul className="pb-2 pl-4">
                          {link.children.map((child) => (
                            <li key={child.href}>
                              <Link href={child.href} onClick={close} className="flex min-h-11 items-center text-sm">
                                {child.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : (
                    <Link
                      href={link.href}
                      onClick={close}
                      aria-current={pathname === link.href ? "page" : undefined}
                      className="flex min-h-12 items-center text-sm tracking-[0.2em] uppercase"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

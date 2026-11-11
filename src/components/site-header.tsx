import Link from "next/link";
import { getCategories } from "@/lib/catalog";
import { CartLink } from "./cart-link";
import { UserIcon } from "./icons";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";

export async function SiteHeader() {
  const categories = await getCategories();
  const links = [
    { href: "/", label: "Accueil" },
    ...categories.map((category) => ({ href: `/collections/${category.slug}`, label: category.name })),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-sand bg-ivory/95 backdrop-blur">
      <div className="relative mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 md:h-20">
        <div className="flex items-center">
          <MobileNav links={[...links, { href: "/compte", label: "Mon compte" }]} />
          <Logo className="hidden md:flex" nameClassName="hidden lg:flex" />
        </div>

        <Logo className="md:hidden" />
        <nav aria-label="Catégories" className="hidden md:block">
          <ul className="flex items-center gap-5 lg:gap-8">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-xs tracking-[0.25em] uppercase underline-offset-8 hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center justify-end">
          <Link href="/compte" aria-label="Mon compte" className="hidden size-11 items-center justify-center md:flex">
            <UserIcon />
          </Link>
          <CartLink />
        </div>
      </div>
    </header>
  );
}

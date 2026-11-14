import Link from "next/link";
import { getCategories, getProducts, inCategory } from "@/lib/catalog";
import { CartLink } from "./cart-link";
import { UserIcon } from "./icons";
import { Logo } from "./logo";
import { MobileNav, type NavLink } from "./mobile-nav";

export async function SiteHeader() {
  const [categories, products] = await Promise.all([getCategories(), getProducts()]);
  const links: NavLink[] = [
    { href: "/", label: "Accueil" },
    ...categories.map((category) => {
      const href = `/collections/${category.slug}`;
      // Sous-menu : les modèles de la catégorie (à partir de deux), chacun ouvre toutes ses couleurs.
      const models = products.filter((product) => inCategory(product, category.slug));
      return {
        href,
        label: category.name,
        children:
          models.length > 1
            ? [{ href, label: `Tout voir` }, ...models.map((model) => ({ href: `${href}?modele=${model.slug}`, label: model.name }))]
            : undefined,
      };
    }),
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
              <li key={link.href} className="group relative">
                <Link
                  href={link.href}
                  aria-haspopup={link.children ? "true" : undefined}
                  className="flex h-20 items-center text-xs tracking-[0.25em] uppercase underline-offset-8 hover:underline"
                >
                  {link.label}
                </Link>
                {link.children ? (
                  // S'ouvre au survol de la souris ou au clavier (touche Tab) ; se referme après un clic.
                  <ul className="invisible absolute top-full left-1/2 z-40 min-w-56 -translate-x-1/2 border border-sand bg-ivory py-2 opacity-0 shadow-sm transition-opacity group-hover:visible group-has-[:focus-visible]:visible group-has-[:focus-visible]:opacity-100 group-hover:opacity-100">
                    {link.children.map((child) => (
                      <li key={child.href}>
                        <Link href={child.href} className="block px-5 py-2.5 text-sm whitespace-nowrap hover:bg-paper focus:bg-paper">
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
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

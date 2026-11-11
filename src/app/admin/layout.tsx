import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { ThemeToggle } from "@/components/admin/theme-toggle";
import { LogoMark } from "@/components/logo";
import { countTicketsToHandle } from "@/lib/admin/support";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin Youna" },
  robots: { index: false, follow: false },
};

const LINKS = [
  { href: "/admin", label: "Accueil" },
  { href: "/admin/commandes", label: "Commandes" },
  { href: "/admin/sav", label: "SAV" },
  { href: "/admin/produits", label: "Produits" },
  { href: "/admin/categories", label: "Catégories" },
  { href: "/admin/couleurs", label: "Couleurs" },
  { href: "/admin/stock", label: "Stock" },
  { href: "/admin/ventes", label: "Ventes en boutique" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/promos", label: "Codes promo" },
  { href: "/admin/statistiques", label: "Statistiques" },
  { href: "/admin/parametres", label: "Paramètres" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const toHandle = await countTicketsToHandle();
  const links = LINKS.map((link) => (link.href === "/admin/sav" && toHandle ? { ...link, badge: toHandle } : link));
  // Mode sombre par défaut : l'admin ne ressemble pas à la boutique.
  const dark = (await cookies()).get("admin-theme")?.value !== "light";

  return (
    <div data-admin-root className={`flex min-h-full flex-1 flex-col bg-paper ${dark ? "admin-dark" : ""}`}>
      <header className="sticky top-0 z-30 border-b border-sand bg-ivory">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
          <Link href="/admin" aria-label="Youna Collection, tableau de bord" className="flex items-center gap-3 text-xs tracking-[0.3em] uppercase">
            <LogoMark className="h-7 text-gold" />
            <span className="text-muted">admin</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle initialDark={dark} />
            <Link href="/" className="text-xs tracking-widest text-muted uppercase hover:text-ink" target="_blank">
              <span className="sm:hidden">Boutique ↗</span>
              <span className="hidden sm:inline">Voir la boutique ↗</span>
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 content-start grid-cols-[minmax(0,1fr)] gap-6 px-4 py-4 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-10 md:py-8">
        <div className="border-b border-sand md:sticky md:top-20 md:self-start md:border-b-0">
          <AdminNav links={links} />
        </div>
        <main className="min-w-0 pb-24">{children}</main>
      </div>
    </div>
  );
}

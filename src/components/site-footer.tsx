import Link from "next/link";
import { getCategories } from "@/lib/catalog";
import { getShopInfo } from "@/lib/shop-info";
import { InstagramIcon, QuestionIcon, SnapchatIcon, TikTokIcon, TruckIcon } from "./icons";
import { LogoMark } from "./logo";

export const LEGAL_LINKS = [
  { href: "/livraison-retours", label: "Livraison et retours" },
  { href: "/cgv", label: "Conditions générales de vente" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Confidentialité et cookies" },
];

export async function SiteFooter() {
  const [categories, info] = await Promise.all([getCategories(), getShopInfo()]);
  const socials = [
    { href: info.social.instagram, label: "Instagram", Icon: InstagramIcon },
    { href: info.social.tiktok, label: "TikTok", Icon: TikTokIcon },
    { href: info.social.snapchat, label: "Snapchat", Icon: SnapchatIcon },
  ].filter((s): s is typeof s & { href: string } => Boolean(s.href));

  return (
    <footer className="mt-20 border-t border-sand bg-paper">
      <ul className="mx-auto grid max-w-6xl gap-10 border-b border-sand px-4 py-12 text-center sm:grid-cols-2">
        <li className="flex flex-col items-center gap-2">
          <TruckIcon width={34} height={34} />
          <p className="mt-1 text-lg font-light tracking-[0.12em] uppercase">Livraison rapide</p>
          <Link href="/livraison-retours" className="text-xs tracking-[0.12em] uppercase underline-offset-4 hover:underline">
            Expéditions sous 48 h
          </Link>
        </li>
        <li className="flex flex-col items-center gap-2">
          <QuestionIcon width={34} height={34} />
          <p className="mt-1 text-lg font-light tracking-[0.12em] uppercase">Une question</p>
          <p className="text-xs">
            <span className="tracking-[0.12em] uppercase">Contactez-nous : </span>
            <a href={`mailto:${info.contactEmail}`} className="break-all underline-offset-4 hover:underline">
              {info.contactEmail}
            </a>
          </p>
        </li>
      </ul>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Link href="/" aria-label="Youna Collection, accueil" className="self-start">
            <LogoMark className="h-12" />
          </Link>
          <p className="max-w-xs text-sm text-muted">Voiles, abayas, cagoules et bouquets de voiles.</p>
          {socials.length ? (
            <ul className="flex gap-2" aria-label="Nos réseaux sociaux">
              {socials.map(({ href, label, Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${label} (nouvel onglet)`}
                    className="flex size-11 items-center justify-center border border-sand transition-colors hover:border-ink"
                  >
                    <Icon />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <nav aria-label="Boutique">
          <p className="text-xs tracking-[0.25em] text-muted uppercase">Boutique</p>
          <ul className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
            {categories.map((category) => (
              <li key={category.id}>
                <Link href={`/collections/${category.slug}`} className="hover:underline">
                  {category.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/compte" className="hover:underline">
                Mon compte
              </Link>
            </li>
            <li>
              <Link href="/sav" className="hover:underline">
                Retours et SAV
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Informations">
          <p className="text-xs tracking-[0.25em] text-muted uppercase">Informations</p>
          <ul className="mt-4 flex flex-col gap-3 text-sm">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <p className="border-t border-sand px-4 py-6 text-center text-xs text-muted">
        © {new Date().getFullYear()} {info.tradeName}
      </p>
    </footer>
  );
}

import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { ProductGrid } from "@/components/product-card";
import { ColorMarquee } from "@/components/color-marquee";
import { LoopVideo } from "@/components/loop-video";
import { getProducts, inCategory, productImageUrl } from "@/lib/catalog";
import { getHomeHero } from "@/lib/shop-info";
import { isInStock, type Product } from "@/lib/product";

export const revalidate = 300;

/**
 * Vidéo d'accueil en test (format portrait 768 × 1344) : elle remplace la photo sur téléphone.
 * Sur ordinateur, la photo paysage reste (une vidéo verticale y serait coupée en bande étroite).
 */
const HOME_VIDEO = "/videos/accueil.mp4";
/** Image vide de 1 pixel : sur téléphone, la photo d'ordinateur n'est pas téléchargée pour rien. */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/** Les couleurs d'un produit qui ont leur propre photo. */
function colorTiles(product: Product) {
  return product.variants
    .filter((variant) => variant.colorSlug)
    .map((variant) => ({ variant, image: product.images.find((image) => image.variantId === variant.id) }))
    .filter((tile) => tile.image);
}

/** Choisit `count` éléments répartis sur toute la liste (couleurs variées pour le bandeau). */
function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))]);
}

/** Une seule photo téléchargée : celle du téléphone, ou celle de l'ordinateur à partir de 768 px de large. */
function HeroPicture({ desktop, mobile }: { desktop: string; mobile: string | null }) {
  const common = { alt: "", fill: true, sizes: "100vw", fetchPriority: "high" as const, loading: "eager" as const };
  const { props: desktopProps } = getImageProps({ ...common, src: desktop });
  const { props: mobileProps } = mobile ? getImageProps({ ...common, src: mobile }) : { props: { ...common, src: BLANK, fill: undefined } };
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={desktopProps.srcSet} sizes="100vw" />
      {/* Image décorative (alt vide), srcSet optimisé par next/image. */}
      <img {...mobileProps} alt="" className="object-cover" />
    </picture>
  );
}

export default async function HomePage() {
  const [products, hero] = await Promise.all([getProducts(), getHomeHero()]);

  // Bandeau du haut quand aucune photo d'accueil n'est choisie : le produit qui a le plus de couleurs.
  const palette = [...products].sort((a, b) => colorTiles(b).length - colorTiles(a).length)[0];
  const heroTiles = spread(palette ? colorTiles(palette) : [], 5);

  // Une rangée qui défile par modèle de voile (Liquid Jersey, Liquid Silk Signature…), dès qu'il a des photos de couleurs.
  const voileRows = products
    .filter((product) => inCategory(product, "voiles"))
    .map((product) => ({ product, tiles: colorTiles(product) }))
    .filter((row) => row.tiles.length > 0);

  // Puis les vêtements, et l'espace bouquets en dernier.
  const clothes = products.filter((product) => inCategory(product, "jupes"));
  const bouquets = products.filter((product) => inCategory(product, "bouquets"));
  const bouquetImage = bouquets.flatMap((product) => product.images)[0];
  const bouquetHref = bouquets.length === 1 ? `/produits/${bouquets[0].slug}` : "/collections/bouquets";

  return (
    <main>
      <section className="border-b border-sand bg-paper">
        {HOME_VIDEO ? (
          <LoopVideo src={HOME_VIDEO} media="(max-width: 767px)" label="Voiles Youna Collection en mouvement" className="aspect-[4/7] w-full md:hidden" />
        ) : null}
        {hero ? (
          // Photos choisies par l'admin (Paramètres > Photos de la page d'accueil) : portrait 4:5 sur téléphone, paysage 16:9 sur ordinateur.
          <div className={`relative w-full bg-photo md:aspect-[16/9] ${HOME_VIDEO ? "hidden md:block" : "aspect-[4/5]"}`}>
            <HeroPicture desktop={productImageUrl(hero.desktop)} mobile={HOME_VIDEO ? null : productImageUrl(hero.mobile)} />
          </div>
        ) : heroTiles.length >= 3 ? (
          <div className={`grid-cols-3 ${HOME_VIDEO ? "hidden md:grid" : "grid"} ${heroTiles.length >= 5 ? "md:grid-cols-5" : ""}`} aria-hidden>
            {heroTiles.map(({ variant, image }, i) => (
              <div key={variant.id} className={`relative aspect-[2/3] bg-photo ${i >= 3 ? "hidden md:block" : ""}`}>
                <Image src={image!.url} alt="" fill priority sizes="(min-width: 768px) 20vw, 34vw" className="object-cover" />
              </div>
            ))}
          </div>
        ) : null}
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 px-4 py-12 text-center md:py-16">
          <h1 className="text-3xl font-light tracking-[0.3em] uppercase md:text-4xl">Youna Collection</h1>
          <p className="text-muted">Voiles, abayas, cagoules et bouquets de voiles.</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/collections/voiles"
              className="inline-flex min-h-12 items-center justify-center bg-ink px-8 text-sm tracking-widest text-ivory uppercase"
            >
              Découvrir les voiles
            </Link>
            <Link
              href="/collections/bouquets"
              className="inline-flex min-h-12 items-center justify-center border border-ink px-8 text-sm tracking-widest uppercase"
            >
              Offrir un bouquet
            </Link>
          </div>
        </div>
      </section>

      {voileRows.map(({ product, tiles: rowTiles }, i) => (
        <section key={product.id} className="pt-16" aria-labelledby={`modele-${product.slug}`}>
          <div className="mx-auto mb-6 flex max-w-6xl items-end justify-between gap-4 px-4">
            <div>
              <h2 id={`modele-${product.slug}`} className="text-sm tracking-[0.3em] uppercase">
                {product.name}
              </h2>
              <p className="mt-1 text-sm text-muted">{rowTiles.length} couleurs</p>
            </div>
            <Link
              href={product.category ? `/collections/${product.category.slug}?modele=${product.slug}` : `/produits/${product.slug}`}
              className="text-xs tracking-widest uppercase underline underline-offset-4"
            >
              Voir tout
            </Link>
          </div>
          <ColorMarquee
            label={`Couleurs ${product.name}`}
            reverse={i % 2 === 1}
            tiles={rowTiles.map(({ variant, image }) => ({
              key: variant.id,
              href: `/produits/${product.slug}?couleur=${variant.colorSlug}`,
              imageUrl: image!.url,
              label: variant.colorName ?? product.name,
              soldOut: !isInStock(variant),
            }))}
          />
        </section>
      ))}

      {clothes.length ? (
        <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="vetements">
          <div className="mb-8 flex items-end justify-between gap-4">
            <h2 id="vetements" className="text-sm tracking-[0.3em] uppercase">
              Vêtements
            </h2>
            <Link href="/collections/jupes" className="text-xs tracking-widest uppercase underline underline-offset-4">
              Voir tout
            </Link>
          </div>
          <ProductGrid products={clothes} />
        </section>
      ) : null}

      <section className="mt-16 bg-paper" aria-labelledby="bouquets">
        <div className={`mx-auto grid max-w-5xl items-center gap-10 px-4 py-14 md:gap-16 md:py-20 ${bouquetImage ? "md:grid-cols-2" : ""}`}>
          {bouquetImage ? (
            <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden bg-photo">
              <Image src={bouquetImage.url} alt={bouquetImage.alt || "Bouquet de voiles Youna"} fill sizes="(min-width: 768px) 384px, 100vw" className="object-cover" />
            </div>
          ) : null}
          <div className="flex flex-col items-center gap-5 text-center md:items-start md:text-left">
            <h2 id="bouquets" className="font-display text-4xl md:text-5xl">
              Conception Bouquets
            </h2>
            <p className="font-display text-xl leading-snug md:text-2xl">Ce bouquet de voiles est conçu à partir de tulle et de voiles délicatement travaillés.</p>
            <p className="font-display text-xl leading-snug md:text-2xl">
              Chaque conception est sublimée par de fines aiguilles ornées de diamants ainsi que de fleurs de gypsophiles.
            </p>
            <p className="font-display text-xl leading-snug md:text-2xl">Un cadeau idéal pour offrir lors d&apos;occasions spéciales.</p>
            <Link
              href={bouquetHref}
              className="mt-3 inline-flex min-h-12 items-center justify-center bg-ink px-8 text-sm tracking-widest text-ivory uppercase"
            >
              Je commande mon bouquet !
            </Link>
          </div>
        </div>
      </section>

      {products.length ? null : <p className="px-4 py-16 text-center text-muted">La boutique est en préparation.</p>}
    </main>
  );
}

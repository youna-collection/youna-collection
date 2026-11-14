import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { ProductGrid } from "@/components/product-card";
import { ColorMarquee } from "@/components/color-marquee";
import { getProducts, inCategory, productImageUrl } from "@/lib/catalog";
import { getHomeHero } from "@/lib/shop-info";
import { isInStock, type Product } from "@/lib/product";

export const revalidate = 300;

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
function HeroPicture({ desktop, mobile }: { desktop: string; mobile: string }) {
  const common = { alt: "", fill: true, sizes: "100vw", fetchPriority: "high" as const, loading: "eager" as const };
  const { props: desktopProps } = getImageProps({ ...common, src: desktop });
  const { props: mobileProps } = getImageProps({ ...common, src: mobile });
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

  return (
    <main>
      <section className="border-b border-sand bg-paper">
        {hero ? (
          // Photos choisies par l'admin (Paramètres > Photos de la page d'accueil) : portrait 4:5 sur téléphone, paysage 16:9 sur ordinateur.
          <div className="relative aspect-[4/5] w-full bg-photo md:aspect-[16/9]">
            <HeroPicture desktop={productImageUrl(hero.desktop)} mobile={productImageUrl(hero.mobile)} />
          </div>
        ) : heroTiles.length >= 3 ? (
          <div className={`grid grid-cols-3 ${heroTiles.length >= 5 ? "md:grid-cols-5" : ""}`} aria-hidden>
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

      {products.length ? (
        <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="collection">
          <h2 id="collection" className="mb-8 text-center text-sm tracking-[0.3em] uppercase">
            Toute la collection
          </h2>
          <ProductGrid products={products} />
        </section>
      ) : (
        <p className="px-4 py-16 text-center text-muted">La boutique est en préparation.</p>
      )}
    </main>
  );
}

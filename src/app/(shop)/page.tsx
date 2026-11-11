import Image from "next/image";
import Link from "next/link";
import { ProductGrid } from "@/components/product-card";
import { getCategories, getProducts, inCategory } from "@/lib/catalog";
import { defaultVariant, imagesForVariant, isInStock, type Product } from "@/lib/product";

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

export default async function HomePage() {
  const [categories, products] = await Promise.all([getCategories(), getProducts()]);

  // La palette mise en avant : le produit qui a le plus de couleurs.
  const palette = [...products].sort((a, b) => colorTiles(b).length - colorTiles(a).length)[0];
  const tiles = palette ? colorTiles(palette) : [];
  const heroTiles = spread(tiles, 5);
  const inStockCount = tiles.filter((tile) => isInStock(tile.variant)).length;

  const categoryTiles = categories
    .map((category) => {
      const product = products.find((p) => p.category?.slug === category.slug) ?? products.find((p) => inCategory(p, category.slug));
      const image = product ? imagesForVariant(product, defaultVariant(product)?.id ?? null)[0] : undefined;
      return { category, image };
    })
    .filter((tile) => tile.image);

  return (
    <main>
      <section className="border-b border-sand bg-paper">
        {heroTiles.length >= 3 ? (
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

      {categoryTiles.length ? (
        <section className="mx-auto max-w-6xl px-4 pt-16" aria-labelledby="univers">
          <h2 id="univers" className="mb-8 text-center text-sm tracking-[0.3em] uppercase">
            Nos univers
          </h2>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {categoryTiles.map(({ category, image }) => (
              <li key={category.id}>
                <Link href={`/collections/${category.slug}`} className="group block">
                  <div className="relative aspect-[3/4] overflow-hidden bg-photo">
                    <Image
                      src={image!.url}
                      alt=""
                      fill
                      sizes="(min-width: 768px) 20vw, 50vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                  </div>
                  <p className="mt-3 text-center text-xs tracking-[0.25em] uppercase">{category.name}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {palette && tiles.length > 3 ? (
        <section className="pt-16" aria-labelledby="palette">
          <div className="mx-auto flex max-w-6xl items-end justify-between gap-4 px-4">
            <div>
              <h2 id="palette" className="text-sm tracking-[0.3em] uppercase">
                {palette.name}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {tiles.length} couleurs · {inStockCount} en stock
              </p>
            </div>
            <Link href={`/produits/${palette.slug}`} className="text-xs tracking-widest uppercase underline underline-offset-4">
              Voir tout
            </Link>
          </div>
          <ul className="scrollbar-none mx-auto mt-6 flex max-w-6xl snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2">
            {tiles.map(({ variant, image }) => (
              <li key={variant.id} className="w-28 shrink-0 snap-start md:w-36">
                <Link href={`/produits/${palette.slug}?couleur=${variant.colorSlug}`} className="block">
                  <div className="relative aspect-[3/4] bg-photo">
                    <Image
                      src={image!.url}
                      alt={`${palette.name} ${variant.colorName}`}
                      fill
                      sizes="144px"
                      className={`object-cover ${isInStock(variant) ? "" : "opacity-50"}`}
                    />
                  </div>
                  <p className="mt-2 text-xs">{variant.colorName}</p>
                  {isInStock(variant) ? null : <p className="text-[0.65rem] tracking-widest text-muted uppercase">Épuisé</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

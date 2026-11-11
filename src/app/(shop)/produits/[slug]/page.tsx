import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductView, type VeilOption } from "@/components/product-view";
import { getMyFavoriteIds } from "@/lib/account";
import { getCurrentUser } from "@/lib/auth";
import { getProduct, getProducts } from "@/lib/catalog";
import { findVariant, imagesForVariant, isInStock, priceRange } from "@/lib/product";

export async function generateMetadata({ params }: PageProps<"/produits/[slug]">): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  if (!product) return {};
  const image = imagesForVariant(product, product.variants[0]?.id ?? null)[0];
  const description = product.description.replace(/\s+/g, " ").slice(0, 155);
  return {
    title: product.name,
    description,
    alternates: { canonical: `/produits/${product.slug}` },
    openGraph: { title: product.name, description, images: image ? [image.url] : [] },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/produits/[slug]">) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();

  const variant = findVariant(product, await searchParams);
  if (!variant) notFound();

  // Pour un bouquet : les couleurs de voiles en stock (le serveur revérifie à l'ajout).
  const veils: VeilOption[] =
    product.kind === "bouquet"
      ? (await getProducts())
          .filter((p) => p.bouquetEligible)
          .flatMap((p) =>
            p.variants.filter(isInStock).map((v) => ({
              id: v.id,
              label: [p.name, v.colorName].filter(Boolean).join(" "),
              colorHex: v.colorHex,
              available: v.available,
              trackStock: v.trackStock,
            })),
          )
      : [];

  const isFavorite = (await getCurrentUser()) ? (await getMyFavoriteIds()).has(product.id) : false;

  const range = priceRange(product.variants);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images.slice(0, 5).map((image) => image.url),
    brand: { "@type": "Brand", name: "Youna Collection" },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "EUR",
      lowPrice: ((range?.min ?? 0) / 100).toFixed(2),
      highPrice: ((range?.max ?? 0) / 100).toFixed(2),
      offerCount: product.variants.length,
      availability: product.variants.some(isInStock) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10">
      <nav aria-label="Fil d'Ariane" className="mb-6 text-xs tracking-widest text-muted uppercase">
        <Link href="/" className="hover:underline">
          Accueil
        </Link>
        {product.category ? (
          <>
            {" / "}
            <Link href={`/collections/${product.category.slug}`} className="hover:underline">
              {product.category.name}
            </Link>
          </>
        ) : null}
      </nav>

      <ProductView product={product} initialVariantId={variant.id} veils={veils} isFavorite={isFavorite} />

      <script
        type="application/ld+json"
        // Données structurées pour Google : contenu issu du catalogue, caractère < neutralisé.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/product-card";
import { getCategories, getProductsByCategory } from "@/lib/catalog";

export const revalidate = 300;

export async function generateStaticParams() {
  return (await getCategories()).map((category) => ({ slug: category.slug }));
}

async function findCategory(slug: string) {
  return (await getCategories()).find((category) => category.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const category = await findCategory((await params).slug);
  return category ? { title: category.name, alternates: { canonical: `/collections/${category.slug}` } } : {};
}

export default async function CollectionPage({ params }: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const category = await findCategory(slug);
  if (!category) notFound();

  const products = await getProductsByCategory(slug);
  const colorCount = products.reduce((total, product) => total + product.variants.length, 0);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-10 text-center">
        <h1 className="text-2xl font-light tracking-[0.3em] uppercase">{category.name}</h1>
        {products.length ? (
          <p className="mt-2 text-sm text-muted">
            {products.length} modèle{products.length > 1 ? "s" : ""} · {colorCount} déclinaison{colorCount > 1 ? "s" : ""}
          </p>
        ) : null}
      </header>
      {products.length ? (
        <ProductGrid products={products} />
      ) : (
        <p className="text-center text-muted">Aucun produit pour le moment.</p>
      )}
    </main>
  );
}

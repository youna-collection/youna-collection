import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionBrowser } from "@/components/collection-browser";
import { getCategories, getProductsByCategory } from "@/lib/catalog";
import { buildTiles, filtersQuery, modelsOf, parseFilters } from "@/lib/collection";

async function findCategory(slug: string) {
  return (await getCategories()).find((category) => category.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/collections/[slug]">): Promise<Metadata> {
  const category = await findCategory((await params).slug);
  return category ? { title: category.name, alternates: { canonical: `/collections/${category.slug}` } } : {};
}

export default async function CollectionPage({ params, searchParams }: PageProps<"/collections/[slug]">) {
  const { slug } = await params;
  const [categories, products] = await Promise.all([getCategories(), getProductsByCategory(slug)]);
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  // Une vignette par couleur, épuisées comprises ; seules les couleurs masquées dans l'admin n'apparaissent pas.
  const tiles = buildTiles(products);
  const models = modelsOf(tiles);
  const filters = parseFilters(await searchParams, models.map((m) => m.slug));

  // Un seul modèle choisi (sous-menu) : son nom en titre, la catégorie au-dessus.
  const model = filters.models.length === 1 ? models.find((m) => m.slug === filters.models[0]) : undefined;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <header className="mb-8 text-center">
        {model ? <p className="mb-2 text-xs tracking-[0.3em] text-muted uppercase">{category.name}</p> : null}
        <h1 className="text-2xl font-light tracking-[0.3em] uppercase">{model ? model.name : category.name}</h1>
        {model ? (
          <p className="mt-2 text-sm text-muted">
            {model.count} couleur{model.count > 1 ? "s" : ""}
          </p>
        ) : tiles.length ? (
          <p className="mt-2 text-sm text-muted">
            {models.length} modèle{models.length > 1 ? "s" : ""} · {tiles.length} article{tiles.length > 1 ? "s" : ""}
          </p>
        ) : null}
      </header>
      {tiles.length ? (
        // La clé repart de zéro quand on arrive par un autre lien du menu (autre modèle).
        <CollectionBrowser key={filtersQuery(filters)} categories={categories} currentSlug={slug} tiles={tiles} initialFilters={filters} />
      ) : (
        <p className="text-center text-muted">Aucun produit pour le moment.</p>
      )}
    </main>
  );
}

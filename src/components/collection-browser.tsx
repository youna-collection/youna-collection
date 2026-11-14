"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { applyFilters, type Filters, filtersQuery, modelsOf, SORTS, type Tile } from "@/lib/collection";
import type { Category } from "@/lib/product";
import { Price } from "./price";

function TileCard({ tile, priority }: { tile: Tile; priority: boolean }) {
  return (
    <Link href={tile.href} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden bg-photo">
        {tile.imageUrl ? (
          <Image
            src={tile.imageUrl}
            alt={tile.imageAlt}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 22vw, (min-width: 640px) 33vw, 50vw"
            className={`object-cover transition-transform duration-700 group-hover:scale-[1.03] ${tile.inStock ? "" : "opacity-60"}`}
          />
        ) : null}
        {tile.inStock ? null : (
          <span className="absolute top-2 left-2 bg-ivory px-2 py-1 text-[0.65rem] tracking-widest uppercase">Épuisé</span>
        )}
      </div>
      <h3 className="mt-3 text-xs tracking-[0.18em] uppercase">{tile.modelName}</h3>
      {tile.subtitle ? <p className="mt-0.5 text-sm text-muted">{tile.subtitle}</p> : null}
      <div className="mt-1">
        <Price cents={tile.priceCents} compareAtCents={tile.compareAtCents} from={tile.from} />
      </div>
    </Link>
  );
}

export function CollectionBrowser({
  categories,
  currentSlug,
  tiles,
  initialFilters,
}: {
  categories: Category[];
  currentSlug: string;
  tiles: Tile[];
  initialFilters: Filters;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [panelOpen, setPanelOpen] = useState(false);
  const models = useMemo(() => modelsOf(tiles), [tiles]);
  const shown = useMemo(() => applyFilters(tiles, filters), [tiles, filters]);
  const active = filters.models.length + (filters.inStockOnly ? 1 : 0);

  function update(next: Filters) {
    setFilters(next);
    // L'adresse garde les filtres (lien partageable, retour arrière) sans recharger la page.
    window.history.replaceState(null, "", `${window.location.pathname}${filtersQuery(next)}`);
  }

  function toggleModel(slug: string) {
    const selected = filters.models.includes(slug) ? filters.models.filter((m) => m !== slug) : [...filters.models, slug];
    update({ ...filters, models: models.map((m) => m.slug).filter((m) => selected.includes(m)) });
  }

  const sidebar = (
    <div className="flex flex-col gap-8 text-sm">
      <section>
        <h2 className="mb-3 text-xs tracking-[0.25em] uppercase">Catégories</h2>
        <ul className="flex flex-col gap-2">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`/collections/${category.slug}`}
                aria-current={category.slug === currentSlug ? "page" : undefined}
                className={category.slug === currentSlug ? "underline underline-offset-4" : "text-muted hover:text-ink"}
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {models.length > 1 ? (
        <section>
          <h2 className="mb-3 text-xs tracking-[0.25em] uppercase">Modèles</h2>
          <ul className="flex flex-col gap-2">
            {models.map((model) => (
              <li key={model.slug}>
                <label className="flex min-h-8 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={filters.models.includes(model.slug)}
                    onChange={() => toggleModel(model.slug)}
                    className="size-4 accent-ink"
                  />
                  <span className="flex-1">{model.name}</span>
                  <span className="text-xs text-muted">{model.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-xs tracking-[0.25em] uppercase">Disponibilité</h2>
        <label className="flex min-h-8 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={filters.inStockOnly}
            onChange={(event) => update({ ...filters, inStockOnly: event.target.checked })}
            className="size-4 accent-ink"
          />
          En stock uniquement
        </label>
      </section>

      <section>
        <h2 className="mb-3 text-xs tracking-[0.25em] uppercase">Trier</h2>
        <select
          value={filters.sort}
          onChange={(event) => update({ ...filters, sort: event.target.value as Filters["sort"] })}
          aria-label="Trier"
          className="min-h-11 w-full border border-sand bg-white px-3 text-base"
        >
          {SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </select>
      </section>

      {active ? (
        <button type="button" onClick={() => update({ models: [], inStockOnly: false, sort: filters.sort })} className="self-start text-sm underline underline-offset-4">
          Tout afficher
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <aside className="md:w-52 md:shrink-0">
        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          aria-expanded={panelOpen}
          className="flex min-h-11 w-full items-center justify-between border border-ink px-4 text-sm tracking-widest uppercase md:hidden"
        >
          <span>Filtrer et trier{active ? ` (${active})` : ""}</span>
          <span aria-hidden>{panelOpen ? "−" : "+"}</span>
        </button>
        <div className={`${panelOpen ? "mt-4 block border border-sand bg-white p-4" : "hidden"} md:sticky md:top-28 md:mt-0 md:block md:border-0 md:bg-transparent md:p-0`}>
          {sidebar}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <p className="mb-4 text-sm text-muted" aria-live="polite">
          {shown.length} article{shown.length > 1 ? "s" : ""}
        </p>
        {shown.length ? (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((tile, index) => (
              <li key={tile.key}>
                <TileCard tile={tile} priority={index < 4} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">Aucun article ne correspond à ces filtres.</p>
        )}
      </div>
    </div>
  );
}

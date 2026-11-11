"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { addToCart } from "@/app/actions/cart";
import {
  LOW_STOCK,
  imagesForVariant,
  isInStock,
  variantLabel,
  variantQuery,
  type Product,
  type ProductImage,
  type Variant,
} from "@/lib/product";
import { notifyCartChange } from "./cart-link";
import { FavoriteButton } from "./favorite-button";
import { Price } from "./price";

/** Une couleur de voile proposée dans un bouquet. */
export type VeilOption = { id: string; label: string; colorHex: string | null; available: number; trackStock: boolean };

function Gallery({ images, productName }: { images: ProductImage[]; productName: string }) {
  const [index, setIndex] = useState(0);
  const current = images[Math.min(index, images.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[3/4] overflow-hidden bg-photo">
        {current ? (
          <Image
            src={current.url}
            alt={current.alt}
            fill
            priority
            sizes="(min-width: 768px) 55vw, 100vw"
            className="object-cover"
          />
        ) : (
          <span className="sr-only">{productName}</span>
        )}
      </div>
      {images.length > 1 ? (
        <div className="flex gap-2">
          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Photo ${i + 1} sur ${images.length}`}
              aria-current={i === index}
              className={`relative aspect-[3/4] w-16 overflow-hidden bg-photo ${i === index ? "ring-1 ring-ink" : "opacity-70"}`}
            >
              <Image src={image.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StockLine({ variant }: { variant: Variant }) {
  if (!isInStock(variant)) return <p className="text-sm text-danger">Épuisé</p>;
  if (variant.trackStock && variant.available <= LOW_STOCK) {
    return <p className="text-sm text-danger">Plus que {variant.available} en stock</p>;
  }
  return <p className="text-sm text-success">En stock</p>;
}

function ColorPicker({ product, selected, onSelect }: { product: Product; selected: Variant; onSelect: (v: Variant) => void }) {
  return (
    <fieldset>
      <legend className="text-sm">
        Couleur : <span className="text-muted">{selected.colorName}</span>
      </legend>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup">
        {product.variants.map((variant) => {
          const active = variant.id === selected.id;
          const soldOut = !isInStock(variant);
          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${variant.colorName}${soldOut ? " (épuisé)" : ""}`}
              title={variant.colorName ?? undefined}
              onClick={() => onSelect(variant)}
              className={`relative flex size-11 items-center justify-center rounded-full ${
                active ? "ring-1 ring-ink ring-offset-2 ring-offset-ivory" : ""
              }`}
            >
              <span
                className="size-9 rounded-full border border-black/10"
                style={{ backgroundColor: variant.colorHex ?? "#ccc" }}
              />
              {soldOut ? (
                <span aria-hidden className="absolute h-px w-10 rotate-45 bg-ink/60" />
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function SizePicker({ product, selected, onSelect }: { product: Product; selected: Variant; onSelect: (v: Variant) => void }) {
  return (
    <fieldset>
      <legend className="text-sm">Taille</legend>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
        {product.variants.map((variant) => {
          const active = variant.id === selected.id;
          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(variant)}
              disabled={!isInStock(variant)}
              className={`min-h-12 border px-2 text-sm disabled:text-muted disabled:line-through ${
                active ? "border-ink bg-ink text-ivory" : "border-sand"
              }`}
            >
              {variantLabel(variant)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function BouquetComposer({
  veils,
  count,
  picks,
  onChange,
}: {
  veils: VeilOption[];
  count: number;
  picks: string[];
  onChange: (picks: string[]) => void;
}) {
  const quantityOf = (id: string) => picks.filter((pick) => pick === id).length;
  const remaining = count - picks.length;

  function add(veil: VeilOption) {
    if (remaining <= 0) return;
    if (veil.trackStock && quantityOf(veil.id) >= veil.available) return;
    onChange([...picks, veil.id]);
  }
  function remove(id: string) {
    const index = picks.lastIndexOf(id);
    if (index >= 0) onChange(picks.filter((_, i) => i !== index));
  }

  return (
    <fieldset className="flex flex-col gap-3 border border-sand p-4">
      <legend className="px-1 text-sm">Choisissez vos {count} voiles</legend>
      <p className="text-sm text-muted" aria-live="polite">
        {remaining > 0
          ? `${picks.length} sur ${count} choisi${picks.length > 1 ? "s" : ""} — encore ${remaining}.`
          : `Vos ${count} voiles sont choisis.`}
      </p>
      <ul className="flex flex-col divide-y divide-sand">
        {veils.map((veil) => {
          const quantity = quantityOf(veil.id);
          const maxed = remaining <= 0 || (veil.trackStock && quantity >= veil.available);
          return (
            <li key={veil.id} className="flex items-center gap-3 py-2">
              <span
                aria-hidden
                className="size-7 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: veil.colorHex ?? "#ccc" }}
              />
              <span className="flex-1 text-sm">{veil.label}</span>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => remove(veil.id)}
                  disabled={quantity === 0}
                  aria-label={`Retirer un voile ${veil.label}`}
                  className="flex size-10 items-center justify-center text-lg disabled:text-sand"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm tabular-nums" aria-label={`${quantity} voile${quantity > 1 ? "s" : ""} ${veil.label}`}>
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => add(veil)}
                  disabled={maxed}
                  aria-label={`Ajouter un voile ${veil.label}`}
                  className="flex size-10 items-center justify-center text-lg disabled:text-sand"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {!veils.length ? <p className="text-sm text-danger">Aucune couleur n&apos;est disponible pour le moment.</p> : null}
    </fieldset>
  );
}

function AddToCart({ variant, veilIds, ready }: { variant: Variant; veilIds: string[]; ready: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const soldOut = !isInStock(variant);

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await addToCart({ variantId: variant.id, quantity: 1, veilIds });
      if (result.ok) {
        notifyCartChange();
        setMessage({ ok: true, text: "Ajouté au panier." });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={submit}
        disabled={soldOut || !ready || pending}
        className="min-h-12 bg-ink px-6 text-sm tracking-widest text-ivory uppercase disabled:opacity-50"
      >
        {soldOut ? "Épuisé" : pending ? "Ajout…" : "Ajouter au panier"}
      </button>
      <p role="status" className={`min-h-5 text-sm ${message?.ok ? "text-success" : "text-danger"}`}>
        {message ? (
          <>
            {message.text}{" "}
            {message.ok ? (
              <Link href="/panier" className="text-ink underline underline-offset-4">
                Voir le panier
              </Link>
            ) : null}
          </>
        ) : null}
      </p>
    </div>
  );
}

export function ProductView({
  product,
  initialVariantId,
  veils = [],
  isFavorite = false,
}: {
  product: Product;
  initialVariantId: string;
  veils?: VeilOption[];
  isFavorite?: boolean;
}) {
  const [selectedId, setSelectedId] = useState(initialVariantId);
  const [picks, setPicks] = useState<string[]>([]);
  const selected = product.variants.find((variant) => variant.id === selectedId) ?? product.variants[0];
  const hasColors = product.variants.some((variant) => variant.colorName);
  const hasSizes = product.variants.length > 1 && product.variants.some((variant) => variant.size);
  const veilCount = product.kind === "bouquet" ? (selected.bouquetVeilCount ?? 0) : 0;

  function select(variant: Variant) {
    setSelectedId(variant.id);
    // Bouquet plus petit : on garde les premiers voiles choisis.
    if (variant.bouquetVeilCount) setPicks((current) => current.slice(0, variant.bouquetVeilCount!));
    // Met à jour l'adresse sans recharger : le lien partagé ouvre la bonne couleur.
    window.history.replaceState(null, "", `${window.location.pathname}${variantQuery(variant)}`);
  }

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-12">
      <Gallery key={selected.id} images={imagesForVariant(product, selected.id)} productName={product.name} />

      <div className="flex flex-col gap-6 md:sticky md:top-28 md:self-start">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-light tracking-[0.15em] uppercase">{product.name}</h1>
            <FavoriteButton productId={product.id} productSlug={product.slug} initial={isFavorite} />
          </div>
          <Price cents={selected.priceCents} compareAtCents={selected.compareAtPriceCents} large />
        </div>

        {hasColors && product.variants.length > 1 ? <ColorPicker product={product} selected={selected} onSelect={select} /> : null}
        {hasSizes ? <SizePicker product={product} selected={selected} onSelect={select} /> : null}

        <StockLine variant={selected} />

        {veilCount > 0 && isInStock(selected) ? (
          <BouquetComposer veils={veils} count={veilCount} picks={picks} onChange={setPicks} />
        ) : null}

        <AddToCart variant={selected} veilIds={veilCount ? picks : []} ready={!veilCount || picks.length === veilCount} />

        {product.description ? (
          <div className="flex flex-col gap-3 border-t border-sand pt-6 text-sm leading-relaxed text-ink/85">
            {product.description.split("\n\n").map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

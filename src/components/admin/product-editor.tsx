"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { deleteProduct, duplicateProduct, saveProduct, type ProductPayload } from "@/app/actions/admin-products";
import type { AdminProduct, AdminVariant } from "@/lib/admin/products";
import { centsToInput, parseEuros, slugify } from "@/lib/format";

type Category = { id: string; name: string };
type PaletteColor = { name: string; hex: string | null };
type Mode = "draft" | "active" | "scheduled" | "archived";

type VariantDraft = {
  key: string;
  id: string | null;
  colorName: string;
  colorHex: string;
  hasColor: boolean;
  size: string;
  price: string;
  compareAt: string;
  stock: string;
  originalStock: number | null;
  reserved: number;
  weight: string;
  sku: string;
  trackStock: boolean;
  lowStockThreshold: string;
  bouquetVeilCount: string;
  isActive: boolean;
};

const euros = centsToInput;

const parseInteger = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN);

let counter = 0;
const newKey = () => `nouvelle-${++counter}`;

function toDraft(v: AdminVariant): VariantDraft {
  return {
    key: v.id,
    id: v.id,
    colorName: v.color_name ?? "",
    colorHex: v.color_hex ?? "#cccccc",
    hasColor: Boolean(v.color_hex),
    size: v.size ?? "",
    price: euros(v.price_cents),
    compareAt: euros(v.compare_at_price_cents),
    stock: String(v.stock),
    originalStock: v.stock,
    reserved: v.reserved,
    weight: String(v.weight_grams),
    sku: v.sku ?? "",
    trackStock: v.track_stock,
    lowStockThreshold: String(v.low_stock_threshold),
    bouquetVeilCount: v.bouquet_veil_count ? String(v.bouquet_veil_count) : "",
    isActive: v.is_active,
  };
}

/** Nouvelle variante : reprend le prix et le poids de `from` ; avec `sameColor`, aussi sa couleur (duplication). */
function blankVariant(from?: VariantDraft, sameColor = false): VariantDraft {
  return {
    ...(from ?? {
      colorName: "",
      colorHex: "#cccccc",
      hasColor: false,
      size: "",
      price: "",
      compareAt: "",
      weight: "300",
      trackStock: true,
      lowStockThreshold: "2",
      bouquetVeilCount: "",
      isActive: true,
    }),
    key: newKey(),
    id: null,
    stock: "0",
    originalStock: null,
    reserved: 0,
    sku: "",
    ...(sameColor ? {} : { colorName: "", colorHex: "#cccccc", hasColor: from?.hasColor ?? false }),
  } as VariantDraft;
}

/** Date ISO -> valeur d'un champ date-heure (heure locale). */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const input = "min-h-11 w-full border border-sand bg-white px-3 text-base outline-none focus:border-ink";
const label = "flex flex-col gap-1 text-sm";

function initialMode(product: AdminProduct): Mode {
  if (product.status === "active" && product.publish_at && new Date(product.publish_at) > new Date()) return "scheduled";
  return product.status;
}

export function ProductEditor({
  product,
  categories,
  colors,
  shopUrl,
}: {
  product: AdminProduct;
  categories: Category[];
  colors: PaletteColor[];
  shopUrl: string;
}) {
  const [name, setName] = useState(product.name);
  const autoSlug = product.slug.startsWith("nouveau-produit-");
  const [slug, setSlug] = useState(autoSlug ? "" : product.slug);
  const [description, setDescription] = useState(product.description ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>(product.category_ids);
  const [kind, setKind] = useState(product.kind);
  const [mode, setMode] = useState<Mode>(initialMode(product));
  const [publishAt, setPublishAt] = useState(toLocalInput(product.publish_at));
  const [bouquetEligible, setBouquetEligible] = useState(product.bouquet_eligible);
  const [seoTitle, setSeoTitle] = useState(product.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(product.seo_description ?? "");
  const [variants, setVariants] = useState<VariantDraft[]>(product.variants.map(toDraft));
  const [removed, setRemoved] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [syncedAt, setSyncedAt] = useState(product.updated_at);
  const router = useRouter();

  // Après un enregistrement, la page renvoie la fiche relue en base : nouvelles variantes, stock à jour.
  if (product.updated_at !== syncedAt) {
    setSyncedAt(product.updated_at);
    setVariants(product.variants.map(toDraft));
    setRemoved([]);
    setMode(initialMode(product));
    if (!product.slug.startsWith("nouveau-produit-")) setSlug(product.slug);
  }

  // Prévient avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
    setMessage(null);
  };

  function updateVariant(key: string, patch: Partial<VariantDraft>) {
    setVariants((list) => list.map((v) => (v.key === key ? { ...v, ...patch } : v)));
    setDirty(true);
    setMessage(null);
  }

  function moveVariant(index: number, direction: -1 | 1) {
    setVariants((list) => {
      const next = [...list];
      const target = index + direction;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  function removeVariant(v: VariantDraft) {
    if (variants.length === 1) return;
    if (v.id) setRemoved((list) => [...list, v.id!]);
    setVariants((list) => list.filter((item) => item.key !== v.key));
    setDirty(true);
  }

  function buildPayload(): ProductPayload | string {
    const list: ProductPayload["variants"] = [];
    for (const v of variants) {
      const name = [v.colorName, v.size].filter(Boolean).join(" ") || "sans nom";
      const price = parseEuros(v.price);
      const compareAt = parseEuros(v.compareAt);
      const stock = parseInteger(v.stock);
      const weight = parseInteger(v.weight || "0");
      const threshold = parseInteger(v.lowStockThreshold || "0");
      const veils = v.bouquetVeilCount ? parseInteger(v.bouquetVeilCount) : null;
      if (price === null || Number.isNaN(price)) return `Prix invalide pour « ${name} ».`;
      if (Number.isNaN(compareAt ?? 0)) return `Prix barré invalide pour « ${name} ».`;
      if (Number.isNaN(stock)) return `Stock invalide pour « ${name} ».`;
      if (Number.isNaN(weight)) return `Poids invalide pour « ${name} ».`;
      if (Number.isNaN(threshold) || (veils !== null && Number.isNaN(veils))) return `Valeur invalide pour « ${name} ».`;
      list.push({
        id: v.id,
        sku: v.sku,
        colorName: v.colorName,
        colorHex: v.hasColor ? v.colorHex : null,
        size: v.size,
        priceCents: price,
        compareAtPriceCents: compareAt,
        weightGrams: weight,
        stock,
        originalStock: v.originalStock,
        trackStock: v.trackStock,
        lowStockThreshold: threshold,
        bouquetVeilCount: veils,
        isActive: v.isActive,
      });
    }
    if (mode === "scheduled" && !publishAt) return "Choisissez la date de mise en ligne.";
    return {
      id: product.id,
      name,
      slug: slug || slugify(name),
      description,
      categoryIds,
      kind,
      status: mode === "scheduled" ? "active" : mode,
      publishAt: mode === "scheduled" ? new Date(publishAt).toISOString() : null,
      bouquetEligible,
      seoTitle,
      seoDescription,
      variants: list,
      removedVariantIds: removed,
    };
  }

  function save() {
    const payload = buildPayload();
    if (typeof payload === "string") {
      setMessage({ ok: false, text: payload });
      return;
    }
    startTransition(async () => {
      const result = await saveProduct(payload);
      if (result.ok) {
        setDirty(false);
        setRemoved([]);
        setMessage({ ok: true, text: result.message ?? "Enregistré." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  const previewSlug = slug || slugify(name);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 border border-sand bg-ivory p-4">
        <label className={label}>
          Nom du produit
          <input className={input} value={name} onChange={(e) => touch(setName)(e.target.value)} maxLength={120} />
        </label>
        <label className={label}>
          Description
          <textarea
            className={`${input} min-h-40 py-2 leading-relaxed`}
            value={description}
            onChange={(e) => touch(setDescription)(e.target.value)}
            maxLength={5000}
          />
          <span className="text-xs text-muted">Laissez une ligne vide pour commencer un nouveau paragraphe.</span>
        </label>
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1">Catégories</legend>
          {categories.length ? (
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const checked = categoryIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 border px-3 ${checked ? "border-ink bg-white" : "border-sand"}`}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-ink"
                      checked={checked}
                      onChange={(e) =>
                        touch(setCategoryIds)(e.target.checked ? [...categoryIds, c.id] : categoryIds.filter((id) => id !== c.id))
                      }
                    />
                    {c.name}
                  </label>
                );
              })}
            </div>
          ) : null}
          <span className="text-xs text-muted">
            Cochez toutes les catégories où le produit doit apparaître. La première dans l&apos;ordre du menu sert de catégorie principale.{" "}
            <Link href="/admin/categories" className="underline underline-offset-2">
              Gérer les catégories
            </Link>
          </span>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Type
            <select
              className={input}
              value={kind}
              onChange={(e) => touch(setKind)(e.target.value as AdminProduct["kind"])}
            >
              <option value="standard">Article classique</option>
              <option value="bouquet">Bouquet (la cliente choisit les voiles)</option>
            </select>
          </label>
        </div>
        {kind === "standard" ? (
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-ink"
              checked={bouquetEligible}
              onChange={(e) => touch(setBouquetEligible)(e.target.checked)}
            />
            <span>Ses couleurs peuvent être choisies dans un bouquet (voiles uniquement)</span>
          </label>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 border border-sand bg-ivory p-4">
        <h2 className="font-medium">Visibilité</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["draft", "Brouillon", "Invisible pour les clientes."],
              ["active", "En ligne", "Visible dès l'enregistrement."],
              ["scheduled", "Programmé", "Apparaît tout seul à la date choisie."],
              ["archived", "Archivé", "Retiré de la boutique, conservé ici."],
            ] as const
          ).map(([value, title, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 border p-3 text-sm ${mode === value ? "border-ink bg-white" : "border-sand"}`}
            >
              <input
                type="radio"
                name="mode"
                className="mt-1 accent-ink"
                checked={mode === value}
                onChange={() => touch(setMode)(value)}
              />
              <span>
                <span className="block">{title}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {mode === "scheduled" ? (
          <label className={label}>
            Date et heure de mise en ligne
            <input
              type="datetime-local"
              className={input}
              value={publishAt}
              onChange={(e) => touch(setPublishAt)(e.target.value)}
            />
          </label>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-medium">Variantes ({variants.length})</h2>
          <button
            type="button"
            onClick={() => {
              setVariants((list) => [...list, blankVariant(list[list.length - 1])]);
              setDirty(true);
            }}
            className="min-h-11 border border-ink px-4 text-sm"
          >
            + Ajouter une variante
          </button>
        </div>
        <p className="-mt-2 text-xs text-muted">
          Une variante par couleur (et/ou par taille), avec son propre prix et son stock.{" "}
          <Link href="/admin/couleurs" className="underline underline-offset-2">
            Gérer la liste des couleurs
          </Link>
        </p>
        <datalist id="couleurs-liste">
          {colors.map((c) => (
            <option key={c.name} value={c.name} />
          ))}
        </datalist>
        <ul className="flex flex-col gap-3">
          {variants.map((v, index) => (
            <li key={v.key} className={`flex flex-col gap-3 border bg-ivory p-4 ${v.isActive ? "border-sand" : "border-dashed border-sand opacity-70"}`}>
              <div className="grid grid-cols-[auto_1fr] items-end gap-3 sm:grid-cols-[auto_1fr_1fr]">
                <label className="flex flex-col items-center gap-1 text-sm">
                  <span className="sr-only">Teinte</span>
                  <input
                    type="color"
                    value={v.colorHex}
                    onChange={(e) => updateVariant(v.key, { colorHex: e.target.value, hasColor: true })}
                    className="size-11 cursor-pointer border border-sand bg-white p-0.5"
                    title="Teinte de la pastille"
                  />
                </label>
                <label className={label}>
                  Couleur
                  <input
                    className={input}
                    value={v.colorName}
                    placeholder="Choisir ou taper"
                    list="couleurs-liste"
                    onChange={(e) => {
                      // Une couleur de la liste remplit aussi sa pastille.
                      const known = colors.find((c) => c.name.toLowerCase() === e.target.value.trim().toLowerCase());
                      updateVariant(v.key, known?.hex ? { colorName: e.target.value, colorHex: known.hex, hasColor: true } : { colorName: e.target.value });
                    }}
                  />
                </label>
                <label className={`${label} col-span-2 sm:col-span-1`}>
                  Taille
                  <input
                    className={input}
                    value={v.size}
                    placeholder={kind === "bouquet" ? "Ex. S" : "Facultatif"}
                    onChange={(e) => updateVariant(v.key, { size: e.target.value })}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className={label}>
                  Prix (€)
                  <input className={input} inputMode="decimal" value={v.price} onChange={(e) => updateVariant(v.key, { price: e.target.value })} />
                </label>
                <label className={label}>
                  Prix barré (€)
                  <input
                    className={input}
                    inputMode="decimal"
                    value={v.compareAt}
                    placeholder="Promo"
                    onChange={(e) => updateVariant(v.key, { compareAt: e.target.value })}
                  />
                </label>
                <label className={label}>
                  Stock
                  <input className={input} inputMode="numeric" value={v.stock} onChange={(e) => updateVariant(v.key, { stock: e.target.value })} />
                  {v.reserved ? <span className="text-xs text-muted">{v.reserved} en cours de paiement</span> : null}
                </label>
                <label className={label}>
                  Poids (g)
                  <input className={input} inputMode="numeric" value={v.weight} onChange={(e) => updateVariant(v.key, { weight: e.target.value })} />
                </label>
              </div>
              {kind === "bouquet" ? (
                <label className={`${label} max-w-40`}>
                  Nombre de voiles
                  <input
                    className={input}
                    inputMode="numeric"
                    value={v.bouquetVeilCount}
                    onChange={(e) => updateVariant(v.key, { bouquetVeilCount: e.target.value })}
                  />
                </label>
              ) : null}
              <details className="text-sm">
                <summary className="min-h-10 cursor-pointer py-2 text-muted">Plus d&apos;options</summary>
                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  <label className={label}>
                    Référence (SKU)
                    <input className={input} value={v.sku} onChange={(e) => updateVariant(v.key, { sku: e.target.value })} />
                  </label>
                  <label className={label}>
                    Alerte stock bas à partir de
                    <input
                      className={input}
                      inputMode="numeric"
                      value={v.lowStockThreshold}
                      onChange={(e) => updateVariant(v.key, { lowStockThreshold: e.target.value })}
                    />
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="size-4 accent-ink"
                      checked={v.trackStock}
                      onChange={(e) => updateVariant(v.key, { trackStock: e.target.checked })}
                    />
                    Suivre le stock (décocher pour un article fait sur commande)
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="size-4 accent-ink"
                      checked={!v.hasColor}
                      onChange={(e) => updateVariant(v.key, { hasColor: !e.target.checked })}
                    />
                    Pas de pastille de couleur
                  </label>
                </div>
              </details>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sand pt-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-ink"
                    checked={v.isActive}
                    onChange={(e) => updateVariant(v.key, { isActive: e.target.checked })}
                  />
                  Visible en boutique
                </label>
                <div className="flex items-center">
                  <button type="button" onClick={() => moveVariant(index, -1)} disabled={index === 0} aria-label="Monter" className="flex size-10 items-center justify-center disabled:text-sand">
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveVariant(index, 1)}
                    disabled={index === variants.length - 1}
                    aria-label="Descendre"
                    className="flex size-10 items-center justify-center disabled:text-sand"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVariants((list) => [...list.slice(0, index + 1), blankVariant(v, true), ...list.slice(index + 1)]);
                      setDirty(true);
                    }}
                    className="min-h-10 px-2 text-xs"
                  >
                    Dupliquer
                  </button>
                  <button
                    type="button"
                    onClick={() => removeVariant(v)}
                    disabled={variants.length === 1}
                    className="min-h-10 px-2 text-xs text-danger disabled:text-sand"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <details className="border border-sand bg-ivory p-4">
        <summary className="cursor-pointer font-medium">Référencement Google et adresse de la page</summary>
        <div className="flex flex-col gap-4 pt-4">
          <label className={label}>
            Adresse de la page
            <div className="flex items-center border border-sand bg-white focus-within:border-ink">
              <span className="pl-3 text-sm text-muted">/produits/</span>
              <input
                className="min-h-11 w-full bg-transparent px-1 text-base outline-none"
                value={slug}
                placeholder={slugify(name)}
                onChange={(e) => touch(setSlug)(slugify(e.target.value))}
              />
            </div>
            {product.status === "active" && slug && slug !== product.slug ? (
              <span className="text-xs text-danger">Attention : les anciens liens vers ce produit ne marcheront plus.</span>
            ) : null}
          </label>
          <label className={label}>
            Titre pour Google (facultatif)
            <input className={input} value={seoTitle} maxLength={70} placeholder={name} onChange={(e) => touch(setSeoTitle)(e.target.value)} />
          </label>
          <label className={label}>
            Description pour Google (facultatif, 160 caractères)
            <textarea
              className={`${input} min-h-20 py-2`}
              value={seoDescription}
              maxLength={160}
              onChange={(e) => touch(setSeoDescription)(e.target.value)}
            />
          </label>
        </div>
      </details>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href={`${shopUrl}/produits/${product.slug}`} target="_blank" className="underline underline-offset-4">
          Voir la fiche en boutique ↗
        </Link>
        <button
          type="button"
          disabled={pending || dirty}
          title={dirty ? "Enregistrez d'abord vos modifications" : undefined}
          onClick={() => startTransition(() => duplicateProduct(product.id))}
          className="underline underline-offset-4 disabled:text-muted disabled:no-underline"
        >
          Dupliquer ce produit
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Supprimer « ${product.name} » ? Cette action est définitive.`)) return;
            startTransition(async () => {
              const result = await deleteProduct(product.id);
              setMessage(result.ok ? { ok: true, text: result.message ?? "Supprimé." } : { ok: false, text: result.error });
              if (result.ok) setMode("archived");
            });
          }}
          className="text-danger underline underline-offset-4"
        >
          Supprimer
        </button>
      </div>

      {/* Barre d'enregistrement, toujours visible en bas de l'écran. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sand bg-ivory/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-4 px-4 py-3">
          <p role="status" className={`flex-1 text-sm ${message ? (message.ok ? "text-success" : "text-danger") : "text-muted"}`}>
            {message?.text ?? (dirty ? "Modifications non enregistrées" : `/produits/${previewSlug}`)}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="min-h-11 shrink-0 bg-ink px-6 text-sm text-ivory disabled:opacity-50"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

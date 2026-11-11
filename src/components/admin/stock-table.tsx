"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { adjustStock } from "@/app/actions/admin-stock";

export type StockRow = {
  id: string;
  productId: string;
  productName: string;
  variantLabel: string;
  sku: string | null;
  imageUrl: string | null;
  stock: number;
  reserved: number;
  threshold: number;
  tracked: boolean;
  visible: boolean;
};

const FILTERS = [
  { value: "", label: "Tout" },
  { value: "bas", label: "Stock bas" },
  { value: "epuise", label: "Épuisé" },
];

const field = "min-h-11 border border-sand bg-white px-3 text-base outline-none focus:border-ink";

function status(row: StockRow) {
  const available = row.stock - row.reserved;
  if (!row.tracked) return "libre";
  if (available <= 0) return "epuise";
  if (available <= row.threshold) return "bas";
  return "ok";
}

export function StockTable({ rows, initialQuery, initialFilter }: { rows: StockRow[]; initialQuery: string; initialFilter: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(FILTERS.some((f) => f.value === initialFilter) ? initialFilter : "");
  const [hideHidden, setHideHidden] = useState(false);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (hideHidden && !row.visible) return false;
      if (filter && status(row) !== filter) return false;
      if (q && ![row.productName, row.variantLabel, row.sku].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, filter, hideHidden]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un produit, une couleur…"
          className={`${field} sm:flex-1`}
          aria-label="Rechercher"
        />
        <div className="flex gap-1" role="group" aria-label="Filtrer">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={`min-h-11 flex-1 border px-3 text-sm sm:flex-none ${filter === f.value ? "border-ink bg-ink text-ivory" : "border-sand bg-white"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={hideHidden} onChange={(e) => setHideHidden(e.target.checked)} className="size-4 accent-ink" />
        Masquer les articles invisibles en boutique (brouillons, variantes masquées)
      </label>

      <p className="text-sm text-muted">
        {visibleRows.length} article{visibleRows.length > 1 ? "s" : ""}
      </p>

      <ul className="flex flex-col divide-y divide-sand border-y border-sand bg-ivory">
        {visibleRows.map((row) => (
          <StockLine key={row.id} row={row} />
        ))}
        {!visibleRows.length ? <li className="p-4 text-sm text-muted">Aucun article ne correspond.</li> : null}
      </ul>
    </div>
  );
}

function StockLine({ row }: { row: StockRow }) {
  const [saved, setSaved] = useState(row.stock);
  const [value, setValue] = useState(String(row.stock));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
  const changed = !Number.isNaN(parsed) && parsed !== saved;
  const available = saved - row.reserved;
  const state = status({ ...row, stock: saved });

  function bump(delta: number) {
    const base = Number.isNaN(parsed) ? saved : parsed;
    setValue(String(Math.max(0, base + delta)));
    setMessage(null);
  }

  function save() {
    if (!changed) return;
    startTransition(async () => {
      const result = await adjustStock({ variantId: row.id, delta: parsed - saved, reason: "manual" });
      if (result.ok) {
        setSaved(result.stock);
        setValue(String(result.stock));
        setMessage({ ok: true, text: "Enregistré" });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <div className="relative aspect-[3/4] w-12 shrink-0 overflow-hidden bg-photo">
        {row.imageUrl ? <Image src={row.imageUrl} alt="" fill sizes="48px" className="object-cover" /> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link href={`/admin/produits/${row.productId}`} className="truncate hover:underline">
          {row.productName}
        </Link>
        <span className="text-sm">{row.variantLabel}</span>
        <span className="text-xs text-muted">
          {!row.tracked ? (
            "Stock non suivi (toujours en vente)"
          ) : (
            <>
              <span className={state === "epuise" ? "text-danger" : state === "bas" ? "text-ink" : ""}>
                {state === "epuise" ? "Épuisé" : state === "bas" ? `Stock bas : ${available} disponible${available > 1 ? "s" : ""}` : `${available} disponible${available > 1 ? "s" : ""}`}
              </span>
              {row.reserved ? ` · ${row.reserved} réservé${row.reserved > 1 ? "s" : ""}` : ""}
            </>
          )}
          {!row.visible ? " · invisible en boutique" : ""}
          {" · "}
          <Link href={`/admin/stock/historique?variante=${row.id}`} className="underline underline-offset-2">
            historique
          </Link>
        </span>
      </div>
      {row.tracked ? (
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          {message ? (
            <span role="status" className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>
              {message.text}
            </span>
          ) : null}
          <div className="flex items-center border border-sand bg-white">
            <button type="button" onClick={() => bump(-1)} className="size-11 text-lg" aria-label={`Retirer 1 — ${row.variantLabel}`}>
              −
            </button>
            <input
              inputMode="numeric"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setMessage(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
              className="h-11 w-14 border-x border-sand text-center text-base outline-none focus:bg-paper"
              aria-label={`Stock — ${row.productName} ${row.variantLabel}`}
            />
            <button type="button" onClick={() => bump(1)} className="size-11 text-lg" aria-label={`Ajouter 1 — ${row.variantLabel}`}>
              +
            </button>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={!changed || pending}
            className="min-h-11 bg-ink px-4 text-sm text-ivory disabled:opacity-30"
          >
            {pending ? "…" : "OK"}
          </button>
        </div>
      ) : null}
    </li>
  );
}

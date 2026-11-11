"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deletePromo, savePromo } from "@/app/actions/admin-promos";
import { centsToInput, parseEuros } from "@/lib/format";
import type { PromoType } from "@/lib/promo";

export type PromoRow = {
  id: string;
  code: string;
  type: PromoType;
  value: number;
  min_subtotal_cents: number;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number;
  once_per_customer: boolean;
  is_active: boolean;
  note: string | null;
};

const field = "min-h-11 w-full border border-sand bg-white px-3 text-base outline-none focus:border-ink";
const label = "text-sm text-muted";

function toLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const TYPES: { value: PromoType; label: string }[] = [
  { value: "percent", label: "Pourcentage" },
  { value: "fixed", label: "Montant fixe" },
  { value: "free_shipping", label: "Livraison offerte" },
];

export function PromoEditor({ promo }: { promo: PromoRow | null }) {
  const router = useRouter();
  const [code, setCode] = useState(promo?.code ?? "");
  const [type, setType] = useState<PromoType>(promo?.type ?? "percent");
  const [value, setValue] = useState(promo ? (promo.type === "fixed" ? centsToInput(promo.value) : String(promo.value || "")) : "10");
  const [minimum, setMinimum] = useState(promo?.min_subtotal_cents ? centsToInput(promo.min_subtotal_cents) : "");
  const [startsAt, setStartsAt] = useState(toLocal(promo?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toLocal(promo?.ends_at ?? null));
  const [maxUses, setMaxUses] = useState(promo?.max_uses ? String(promo.max_uses) : "");
  const [once, setOnce] = useState(promo?.once_per_customer ?? false);
  const [active, setActive] = useState(promo?.is_active ?? true);
  const [note, setNote] = useState(promo?.note ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    let numeric = 0;
    if (type === "percent") numeric = /^\d{1,3}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
    if (type === "fixed") numeric = parseEuros(value) ?? Number.NaN;
    const min = parseEuros(minimum) ?? 0;
    const uses = maxUses.trim() ? (/^\d+$/.test(maxUses.trim()) ? Number(maxUses.trim()) : Number.NaN) : null;
    if (Number.isNaN(numeric)) return setMessage({ ok: false, text: type === "percent" ? "Pourcentage illisible (exemple : 10)." : "Montant illisible (exemple : 5 ou 4,50)." });
    if (Number.isNaN(min)) return setMessage({ ok: false, text: "Montant minimum illisible." });
    if (uses !== null && (Number.isNaN(uses) || uses < 1)) return setMessage({ ok: false, text: "Nombre d'utilisations illisible." });
    setMessage(null);
    startTransition(async () => {
      const result = await savePromo({
        id: promo?.id ?? null,
        code,
        type,
        value: numeric,
        minSubtotalCents: min,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        maxUses: uses,
        oncePerCustomer: once,
        isActive: active,
        note,
      });
      if (result && !result.ok) return setMessage({ ok: false, text: result.error });
      setMessage({ ok: true, text: result?.message ?? "Enregistré." });
      router.refresh();
    });
  }

  function remove() {
    if (!promo || !window.confirm(`Supprimer le code ${promo.code} ?`)) return;
    startTransition(async () => {
      const result = await deletePromo(promo.id);
      if (result) setMessage(result.ok ? { ok: true, text: result.message ?? "Supprimé." } : { ok: false, text: result.error });
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5 border border-sand bg-ivory p-4">
      <label className="flex flex-col gap-1">
        <span className={label}>Code (ce que la cliente tape)</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="BIENVENUE10"
          maxLength={40}
          autoCapitalize="characters"
          className={`${field} uppercase tracking-widest`}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${label} mb-1`}>Type de réduction</legend>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <label
              key={t.value}
              className={`flex min-h-11 cursor-pointer items-center justify-center border px-2 text-center text-sm has-focus-visible:outline-2 ${type === t.value ? "border-ink bg-ink text-ivory" : "border-sand bg-white"}`}
            >
              <input type="radio" name="type" checked={type === t.value} onChange={() => setType(t.value)} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {type !== "free_shipping" ? (
          <label className="flex flex-col gap-1">
            <span className={label}>{type === "percent" ? "Réduction (%)" : "Réduction (€)"}</span>
            <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className={field} />
          </label>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className={label}>Montant minimum du panier (€, facultatif)</span>
          <input inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} placeholder="0" className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Début (facultatif)</span>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Fin (facultatif)</span>
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Nombre total d&apos;utilisations (facultatif)</span>
          <input inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Illimité" className={field} />
          {promo ? <span className="text-xs text-muted">Déjà utilisé {promo.used_count} fois.</span> : null}
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Note pour vous (facultatif)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ex. : offert aux abonnées Instagram" className={field} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} className="size-4 accent-ink" />
        Une seule fois par cliente (même e-mail)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-ink" />
        Code actif
      </label>

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={save} disabled={pending} className="min-h-11 bg-ink px-6 text-sm text-ivory disabled:opacity-50">
          {pending ? "Enregistrement…" : promo ? "Enregistrer" : "Créer le code"}
        </button>
        {promo ? (
          <button type="button" onClick={remove} disabled={pending} className="min-h-11 px-2 text-sm text-danger underline underline-offset-4">
            Supprimer
          </button>
        ) : null}
      </div>
    </div>
  );
}

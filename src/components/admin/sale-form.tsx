"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { recordInPersonSale } from "@/app/actions/admin-stock";
import { centsToInput, formatPrice, parseEuros } from "@/lib/format";

export type SaleVariant = { id: string; label: string; priceCents: number; available: number | null; veilCount: number | null };
export type SaleProduct = { id: string; name: string; kind: "standard" | "bouquet"; bouquetEligible: boolean; variants: SaleVariant[] };

type Line = { key: number; variantId: string; quantity: number; price: string; components: string[] };

const PAYMENTS = [
  { value: "especes", label: "Espèces" },
  { value: "carte", label: "Carte" },
  { value: "virement", label: "Virement" },
  { value: "autre", label: "Autre" },
] as const;

type Payment = (typeof PAYMENTS)[number]["value"];

const field = "min-h-11 w-full border border-sand bg-white px-3 text-base outline-none focus:border-ink";
const label = "text-sm text-muted";

let counter = 0;

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const stockText = (available: number | null) => (available == null ? "" : available <= 0 ? " — épuisé" : ` — ${available} dispo`);

export function SaleForm({ products }: { products: SaleProduct[] }) {
  const router = useRouter();
  const variants = useMemo(() => {
    const map = new Map<string, SaleVariant & { productName: string; kind: SaleProduct["kind"] }>();
    for (const p of products) for (const v of p.variants) map.set(v.id, { ...v, productName: p.name, kind: p.kind });
    return map;
  }, [products]);
  const veils = useMemo(
    () => products.filter((p) => p.bouquetEligible).flatMap((p) => p.variants.map((v) => ({ ...v, label: `${p.name} · ${v.label}` }))),
    [products],
  );

  const [lines, setLines] = useState<Line[]>([]);
  const [picker, setPicker] = useState("");
  const [payment, setPayment] = useState<Payment | "">("");
  const [discount, setDiscount] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [otherDay, setOtherDay] = useState(false);
  const [soldAt, setSoldAt] = useState(nowLocal);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function addLine(variantId: string) {
    const variant = variants.get(variantId);
    if (!variant) return;
    setMessage(null);
    setLines((current) => {
      const existing = current.find((l) => l.variantId === variantId && !variant.veilCount);
      if (existing) return current.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...current,
        {
          key: ++counter,
          variantId,
          quantity: 1,
          price: centsToInput(variant.priceCents),
          components: Array.from({ length: variant.veilCount ?? 0 }, () => ""),
        },
      ];
    });
    setPicker("");
  }

  const update = (key: number, patch: Partial<Line>) => {
    setMessage(null);
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const subtotal = lines.reduce((sum, l) => {
    const price = parseEuros(l.price);
    return sum + (price && !Number.isNaN(price) ? price * l.quantity : 0);
  }, 0);
  const discountCents = parseEuros(discount) ?? 0;
  const total = Math.max(0, subtotal - (Number.isNaN(discountCents) ? 0 : discountCents));

  function submit() {
    if (!lines.length) return setMessage({ ok: false, text: "Ajoutez au moins un article." });
    for (const l of lines) {
      const price = parseEuros(l.price);
      if (price == null || Number.isNaN(price)) return setMessage({ ok: false, text: `Prix illisible pour ${variants.get(l.variantId)?.productName}.` });
      if (l.components.some((c) => !c)) return setMessage({ ok: false, text: "Choisissez tous les voiles du bouquet." });
    }
    if (Number.isNaN(discountCents)) return setMessage({ ok: false, text: "Remise illisible (exemple : 5 ou 2,50)." });
    if (discountCents > subtotal) return setMessage({ ok: false, text: "La remise est plus grande que le total." });
    if (!payment) return setMessage({ ok: false, text: "Indiquez le moyen de paiement." });

    startTransition(async () => {
      const result = await recordInPersonSale({
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPriceCents: parseEuros(l.price) ?? 0, components: l.components })),
        paymentMethod: payment,
        discountCents,
        customerName,
        email: email.trim(),
        soldAt: otherDay && soldAt ? new Date(soldAt).toISOString() : null,
      });
      if (!result.ok) return setMessage({ ok: false, text: result.error });
      setMessage({ ok: true, text: `Vente n° ${result.orderNumber} enregistrée (${formatPrice(total)}). Le stock a été mis à jour.` });
      setLines([]);
      setPayment("");
      setDiscount("");
      setCustomerName("");
      setEmail("");
      setOtherDay(false);
      setSoldAt(nowLocal());
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-5 border border-sand bg-ivory p-4">
      <h2 className="text-lg">Nouvelle vente</h2>

      <label className="flex flex-col gap-1">
        <span className={label}>Ajouter un article</span>
        <select value={picker} onChange={(e) => addLine(e.target.value)} className={field}>
          <option value="">Choisir un produit et une couleur…</option>
          {products.map((p) => (
            <optgroup key={p.id} label={p.name}>
              {p.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {p.name} · {v.label} — {formatPrice(v.priceCents)}
                  {stockText(v.available)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {lines.length ? (
        <ul className="flex flex-col divide-y divide-sand border-y border-sand">
          {lines.map((line) => {
            const variant = variants.get(line.variantId);
            if (!variant) return null;
            return (
              <li key={line.key} className="flex flex-col gap-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col">
                    <span>{variant.productName}</span>
                    <span className="text-sm text-muted">
                      {variant.label}
                      {stockText(variant.available)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                    className="min-h-11 px-2 text-sm text-muted underline underline-offset-2"
                  >
                    Retirer
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <span className={label}>Quantité</span>
                    <div className="flex items-center border border-sand bg-white">
                      <button
                        type="button"
                        onClick={() => update(line.key, { quantity: Math.max(1, line.quantity - 1) })}
                        className="size-11 text-lg"
                        aria-label="Une de moins"
                      >
                        −
                      </button>
                      <span className="flex-1 text-center tabular-nums" aria-live="polite">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => update(line.key, { quantity: Math.min(100, line.quantity + 1) })}
                        className="size-11 text-lg"
                        aria-label="Une de plus"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className={label}>Prix unitaire (€)</span>
                    <input inputMode="decimal" value={line.price} onChange={(e) => update(line.key, { price: e.target.value })} className={field} />
                  </label>
                </div>
                {line.components.length ? (
                  <div className="flex flex-col gap-2">
                    <span className={label}>Voiles du bouquet</span>
                    {line.components.map((component, index) => (
                      <select
                        key={index}
                        value={component}
                        onChange={(e) => update(line.key, { components: line.components.map((c, i) => (i === index ? e.target.value : c)) })}
                        className={field}
                        aria-label={`Voile ${index + 1}`}
                      >
                        <option value="">Voile {index + 1}…</option>
                        {veils.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                            {stockText(v.available)}
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className={`${label} mb-1`}>Paiement</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PAYMENTS.map((p) => (
            <label
              key={p.value}
              className={`flex min-h-11 cursor-pointer items-center justify-center border text-sm has-focus-visible:outline-2 ${payment === p.value ? "border-ink bg-ink text-ivory" : "border-sand bg-white"}`}
            >
              <input type="radio" name="payment" value={p.value} checked={payment === p.value} onChange={() => setPayment(p.value)} className="sr-only" />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={label}>Remise (€, facultatif)</span>
          <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Nom de la cliente (facultatif)</span>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="off" className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>E-mail (facultatif)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={field} />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">Avec son e-mail, la vente apparaît aussi dans le compte de la cliente si elle en a un.</p>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={otherDay} onChange={(e) => setOtherDay(e.target.checked)} className="size-4 accent-ink" />
          La vente a eu lieu un autre jour
        </label>
        {otherDay ? (
          <input type="datetime-local" value={soldAt} max={nowLocal()} onChange={(e) => setSoldAt(e.target.value)} className={`${field} sm:w-64`} aria-label="Date de la vente" />
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-sand pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col">
          <span className="text-sm text-muted">Total encaissé</span>
          <span className="text-2xl">{formatPrice(total)}</span>
        </div>
        <button type="button" onClick={submit} disabled={pending} className="min-h-12 bg-ink px-6 text-ivory disabled:opacity-50">
          {pending ? "Enregistrement…" : "Enregistrer la vente"}
        </button>
      </div>

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

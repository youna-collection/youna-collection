"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addOrderNote, refundOrder, saveTracking, setOrderStatus } from "@/app/actions/admin-orders";
import { centsToInput, formatPrice, parseEuros } from "@/lib/format";
import type { OrderStatus } from "@/lib/order-display";

const field = "min-h-11 w-full border border-sand bg-white px-3 text-base outline-none focus:border-ink";
const primary = "min-h-11 bg-ink px-5 text-sm text-ivory disabled:opacity-50";
const secondary = "min-h-11 border border-ink px-4 text-sm disabled:opacity-50";

function Feedback({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
      {message.text}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Statut et suivi
// ---------------------------------------------------------------------------
type Step = "paid" | "preparing" | "shipped" | "delivered";

export function StatusPanel({
  orderId,
  status,
  carrierLabel,
  trackingNumber,
  trackingUrl,
  needsTracking,
  canNotify = true,
}: {
  orderId: string;
  status: OrderStatus;
  carrierLabel: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  needsTracking: boolean;
  /** Faux pour une commande de l'ancien site Shopify : aucun e-mail n'est envoyé. */
  canNotify?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [shipping, setShipping] = useState(false);
  const [number, setNumber] = useState(trackingNumber ?? "");
  const [url, setUrl] = useState(trackingUrl ?? "");
  const [notify, setNotify] = useState(true);

  if (!["paid", "preparing", "shipped", "delivered"].includes(status)) return null;
  const from = status as Step;

  function go(to: Step, withTracking = false) {
    setMessage(null);
    startTransition(async () => {
      const result = await setOrderStatus({
        orderId,
        from,
        to,
        ...(withTracking ? { trackingNumber: number, trackingUrl: url } : {}),
        notify: to === "shipped" && withTracking && notify && canNotify,
      });
      if (!result.ok) return setMessage({ ok: false, text: result.error });
      setShipping(false);
      router.refresh();
    });
  }

  function saveTrackingOnly() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveTracking({ orderId, trackingNumber: number, trackingUrl: url });
      setMessage(result.ok ? { ok: true, text: result.message ?? "Enregistré." } : { ok: false, text: result.error });
      if (result.ok) router.refresh();
    });
  }

  const trackingFields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">N° de suivi{carrierLabel ? ` ${carrierLabel}` : ""}</span>
        <input value={number} onChange={(e) => setNumber(e.target.value)} className={field} autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Lien de suivi (facultatif)</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={field} inputMode="url" autoComplete="off" />
      </label>
    </div>
  );

  return (
    <section className="flex flex-col gap-4 border border-sand bg-ivory p-4">
      <h2 className="text-lg">Traitement</h2>

      {from === "paid" || from === "preparing" ? (
        shipping ? (
          <div className="flex flex-col gap-3">
            {needsTracking ? trackingFields : <p className="text-sm text-muted">Retrait sur place : pas de numéro de suivi.</p>}
            {needsTracking && canNotify ? (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-5 accent-ink" />
                Prévenir la cliente par e-mail (avec le lien de suivi)
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => go(needsTracking ? "shipped" : "delivered", true)} className={primary}>
                {needsTracking ? "Confirmer l'envoi" : "Confirmer le retrait"}
              </button>
              <button type="button" disabled={pending} onClick={() => setShipping(false)} className={secondary}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {from === "paid" ? (
              <button type="button" disabled={pending} onClick={() => go("preparing")} className={secondary}>
                Commencer la préparation
              </button>
            ) : null}
            <button type="button" disabled={pending} onClick={() => setShipping(true)} className={primary}>
              {needsTracking ? "Marquer comme expédiée" : "Marquer comme retirée"}
            </button>
            {from === "preparing" ? (
              <button type="button" disabled={pending} onClick={() => go("paid")} className="min-h-11 px-2 text-sm text-muted underline underline-offset-4">
                Revenir à « Payée »
              </button>
            ) : null}
          </div>
        )
      ) : null}

      {from === "shipped" || from === "delivered" ? (
        <div className="flex flex-col gap-3">
          {needsTracking ? (
            <>
              {trackingFields}
              <div>
                <button type="button" disabled={pending} onClick={saveTrackingOnly} className={secondary}>
                  Enregistrer le suivi
                </button>
              </div>
            </>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-sand pt-3">
            {from === "shipped" ? (
              <>
                <button type="button" disabled={pending} onClick={() => go("delivered")} className={primary}>
                  Marquer comme livrée
                </button>
                <button type="button" disabled={pending} onClick={() => go("preparing")} className="min-h-11 px-2 text-sm text-muted underline underline-offset-4">
                  Revenir à « En préparation »
                </button>
              </>
            ) : (
              <button type="button" disabled={pending} onClick={() => go("shipped")} className="min-h-11 px-2 text-sm text-muted underline underline-offset-4">
                Revenir à « Expédiée »
              </button>
            )}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted">
        La cliente voit le nouveau statut (et le suivi) dans son espace client.{" "}
        {canNotify ? "L'e-mail d'expédition ne part qu'une fois par commande." : "Commande de l'ancien site : aucun e-mail n'est envoyé."}
      </p>
      <Feedback message={message} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Remboursement
// ---------------------------------------------------------------------------
export type RefundableItem = { id: string; label: string; quantity: number; returnable: number; unitPriceCents: number };

export function RefundPanel({
  orderId,
  remainingCents,
  canUseStripe,
  items,
  sellerComplete,
}: {
  orderId: string;
  remainingCents: number;
  canUseStripe: boolean;
  items: RefundableItem[];
  sellerComplete: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(centsToInput(remainingCents));
  const [method, setMethod] = useState<"stripe" | "manual">(canUseStripe ? "stripe" : "manual");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (remainingCents <= 0) return null;

  function submit() {
    const cents = parseEuros(amount);
    if (cents == null || Number.isNaN(cents) || cents <= 0) return setMessage({ ok: false, text: "Montant illisible (exemple : 11,99)." });
    if (cents > remainingCents) return setMessage({ ok: false, text: `Il reste au plus ${formatPrice(remainingCents)} à rembourser.` });
    const restocked = Object.entries(restock)
      .filter(([, q]) => q > 0)
      .map(([order_item_id, quantity]) => ({ order_item_id, quantity }));
    const how = method === "stripe" ? "sur sa carte bancaire (via Stripe)" : "en main propre (vous l'avez déjà rendu)";
    if (!window.confirm(`Rembourser ${formatPrice(cents)} à la cliente ${how} ?\nCette opération ne peut pas être annulée.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await refundOrder({ orderId, amountCents: cents, method, reason, items: restocked });
      if (!result.ok) return setMessage({ ok: false, text: result.error });
      setMessage({ ok: true, text: result.message ?? "Remboursé." });
      setOpen(false);
      setRestock({});
      setReason("");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4 border border-sand bg-ivory p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">Remboursement</h2>
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className={secondary}>
            Rembourser…
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted">Montant à rembourser (€)</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
              <span className="text-xs text-muted">Au plus {formatPrice(remainingCents)}.</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted">Raison (facultatif, figure sur l&apos;avoir)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={field} />
            </label>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm text-muted">Comment ?</legend>
            {canUseStripe ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="method" checked={method === "stripe"} onChange={() => setMethod("stripe")} className="size-4 accent-ink" />
                Sur sa carte bancaire, via Stripe (automatique)
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="method" checked={method === "manual"} onChange={() => setMethod("manual")} className="size-4 accent-ink" />
              Déjà rendu en main propre (espèces, virement…) : seulement l&apos;enregistrer
            </label>
          </fieldset>

          {items.some((i) => i.returnable > 0) ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm text-muted">Remettre en stock (si les articles reviennent en bon état)</legend>
              {items
                .filter((i) => i.returnable > 0)
                .map((item) => (
                  <label key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0">{item.label}</span>
                    <select
                      value={restock[item.id] ?? 0}
                      onChange={(e) => setRestock((r) => ({ ...r, [item.id]: Number(e.target.value) }))}
                      className="min-h-11 border border-sand bg-white px-2"
                      aria-label={`Quantité à remettre en stock : ${item.label}`}
                    >
                      {Array.from({ length: item.returnable + 1 }, (_, n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
            </fieldset>
          ) : null}

          {!sellerComplete ? (
            <p className="text-xs text-muted">
              Aucun avoir ne sera créé : vos informations de vendeur (Paramètres) ne sont pas encore complètes.
            </p>
          ) : (
            <p className="text-xs text-muted">Un avoir (facture de remboursement) sera créé automatiquement.</p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={submit} className={primary}>
              {pending ? "Remboursement…" : "Rembourser"}
            </button>
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm underline underline-offset-4">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Remboursement total ou partiel, avec remise en stock des articles si besoin.</p>
      )}
      <Feedback message={message} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Notes internes
// ---------------------------------------------------------------------------
export function NoteForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await addOrderNote({ orderId, body });
          if (!result.ok) return setMessage({ ok: false, text: result.error });
          setBody("");
          setMessage(null);
          router.refresh();
        });
      }}
    >
      <label className="sr-only" htmlFor="note">
        Nouvelle note
      </label>
      <textarea id="note" value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={2000} placeholder="Note visible par vous seule…" className={`${field} py-2`} />
      <div>
        <button type="submit" disabled={pending || !body.trim()} className={secondary}>
          Ajouter la note
        </button>
      </div>
      <Feedback message={message} />
    </form>
  );
}

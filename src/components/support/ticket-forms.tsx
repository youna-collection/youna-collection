"use client";

import { type FormEvent, useActionState, useRef, useState, useTransition } from "react";
import type { ActionState } from "@/app/actions/auth";
import { createTicket, replyToTicket } from "@/app/actions/support";
import { MESSAGE_MAX, TICKET_TYPE_HINTS, TICKET_TYPE_LABELS, type TypeAvailability } from "@/lib/support-rules";
import { type PickedPhoto, PhotoPicker, withPhotos } from "./photo-picker";

const INITIAL: ActionState = { status: "idle" };

function Feedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p role="status" className={`text-sm ${state.status === "error" ? "text-danger" : "text-success"}`}>
      {state.message}
    </p>
  );
}

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button type="submit" disabled={pending} className="min-h-12 bg-ink px-6 text-sm tracking-widest text-ivory uppercase disabled:opacity-50">
      {pending ? "Envoi en cours…" : label}
    </button>
  );
}

const textareaClass = "min-h-32 w-full border border-sand bg-white p-3 text-base outline-none focus:border-ink";

export type TicketFormItem = { id: string; label: string; quantity: number };

export function NewTicketForm({ orderNumber, items, availability }: { orderNumber: number; items: TicketFormItem[]; availability: TypeAvailability[] }) {
  const [state, action, pending] = useActionState(createTicket, INITIAL);
  const [sending, startTransition] = useTransition();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [type, setType] = useState(availability.find((a) => a.allowed)?.type ?? "complaint");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const busy = pending || sending;
  const blocked = availability.find((a) => !a.allowed);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = withPhotos(event.currentTarget, photos);
    startTransition(() => action(data));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm">Type de demande</legend>
        {availability.map((a) => (
          <label key={a.type} className={`flex min-h-12 items-start gap-3 border p-3 text-sm ${type === a.type ? "border-ink" : "border-sand"} ${a.allowed ? "cursor-pointer" : "opacity-50"}`}>
            <input type="radio" name="type" value={a.type} checked={type === a.type} disabled={!a.allowed || busy} onChange={() => setType(a.type)} className="mt-1 accent-ink" />
            <span>
              {TICKET_TYPE_LABELS[a.type]}
              <span className="block text-xs text-muted">{TICKET_TYPE_HINTS[a.type]}</span>
            </span>
          </label>
        ))}
        {blocked?.reason ? <p className="text-xs text-muted">Retour et échange indisponibles : {blocked.reason}</p> : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm">
          Articles concernés {type === "complaint" ? <span className="text-muted">(facultatif)</span> : null}
        </legend>
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 border-b border-sand py-2 text-sm">
            <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                name={`item_${item.id}`}
                checked={checked[item.id] ?? false}
                disabled={busy}
                onChange={(e) => setChecked({ ...checked, [item.id]: e.currentTarget.checked })}
                className="size-4 accent-ink"
              />
              {item.label}
            </label>
            {item.quantity > 1 ? (
              <select name={`qty_${item.id}`} defaultValue={item.quantity} disabled={busy || !checked[item.id]} aria-label={`Quantité pour ${item.label}`} className="min-h-11 border border-sand bg-white px-2 text-base">
                {Array.from({ length: item.quantity }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <input type="hidden" name={`qty_${item.id}`} value={1} />
            )}
          </div>
        ))}
      </fieldset>

      <label className="flex flex-col gap-2 text-sm">
        Votre message
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={MESSAGE_MAX}
          disabled={busy}
          className={textareaClass}
          placeholder={
            type === "exchange"
              ? "Indiquez la couleur ou la taille souhaitée en échange."
              : type === "return"
                ? "Dites-nous en quelques mots pourquoi l'article ne vous convient pas."
                : "Décrivez le souci : une photo nous aide beaucoup."
          }
        />
      </label>

      <PhotoPicker photos={photos} onChange={setPhotos} disabled={busy} />
      <Feedback state={state} />
      <Submit pending={busy} label="Envoyer ma demande" />
    </form>
  );
}

export function ReplyForm({ ticketNumber, mode }: { ticketNumber: number; mode: "account" | "guest" }) {
  const form = useRef<HTMLFormElement>(null);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [state, action, pending] = useActionState(async (previous: ActionState, data: FormData) => {
    const result = await replyToTicket(previous, data);
    // Message parti : on vide le formulaire.
    if (result.status === "success") {
      form.current?.reset();
      setPhotos((current) => {
        current.forEach((p) => URL.revokeObjectURL(p.preview));
        return [];
      });
    }
    return result;
  }, INITIAL);
  const [sending, startTransition] = useTransition();
  const busy = pending || sending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = withPhotos(event.currentTarget, photos);
    startTransition(() => action(data));
  }

  return (
    <form ref={form} onSubmit={submit} className="flex flex-col gap-4">
      <input type="hidden" name="ticketNumber" value={ticketNumber} />
      <input type="hidden" name="mode" value={mode} />
      <label className="flex flex-col gap-2 text-sm">
        Votre réponse
        <textarea name="message" required maxLength={MESSAGE_MAX} disabled={busy} className={textareaClass} />
      </label>
      <PhotoPicker photos={photos} onChange={setPhotos} disabled={busy} />
      <Feedback state={state} />
      <Submit pending={busy} label="Envoyer" />
    </form>
  );
}

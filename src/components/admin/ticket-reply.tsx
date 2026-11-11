"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateTicket } from "@/app/actions/admin-support";
import { ADMIN_TICKET_STATUS_LABELS, MESSAGE_MAX, TICKET_STATUSES, type TicketStatus } from "@/lib/support-rules";

const field = "w-full border border-sand bg-white px-3 text-base outline-none focus:border-ink";

/** Répondre à une cliente et/ou changer l'état de sa demande. */
export function TicketReply({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  // Répondre à une nouvelle demande la passe « en cours » par défaut.
  const [next, setNext] = useState<TicketStatus>(status === "open" ? "in_progress" : status);
  const [notify, setNotify] = useState(true);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const result = await updateTicket({ ticketId, from: status, status: next, message, notify });
      if (result.ok) {
        setMessage("");
        setFeedback({ ok: true, text: result.message });
        router.refresh();
      } else {
        setFeedback({ ok: false, text: result.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        Votre réponse
        <textarea
          value={message}
          onChange={(e) => setMessage(e.currentTarget.value)}
          maxLength={MESSAGE_MAX}
          rows={6}
          disabled={pending}
          className={`${field} min-h-32 py-2`}
          placeholder="Bonjour, merci pour votre message…"
        />
      </label>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          État de la demande
          <select value={next} onChange={(e) => setNext(e.currentTarget.value as TicketStatus)} disabled={pending} className={`${field} min-h-11`}>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ADMIN_TICKET_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.currentTarget.checked)} disabled={pending} className="size-4 accent-ink" />
          Prévenir la cliente par e-mail
        </label>
      </div>
      {feedback ? (
        <p role={feedback.ok ? "status" : "alert"} className={feedback.ok ? "text-success" : "text-danger"}>
          {feedback.text}
        </p>
      ) : null}
      <button type="submit" disabled={pending || (!message.trim() && next === status)} className="min-h-11 self-start bg-ink px-5 text-ivory disabled:opacity-50">
        {pending ? "Envoi…" : message.trim() ? "Envoyer la réponse" : "Changer l'état"}
      </button>
      <p className="text-xs text-muted">« Fermée » empêche la cliente de répondre ; « Résolue » la laisse rouvrir la demande en répondant.</p>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setMaintenance } from "@/app/actions/admin-settings";

const field = "min-h-11 w-full border border-sand bg-white px-3 text-base outline-none focus:border-ink";

export function MaintenanceSwitch({ enabled, title, message }: { enabled: boolean; title: string | null; message: string | null }) {
  const router = useRouter();
  const [t, setT] = useState(title ?? "");
  const [m, setM] = useState(message ?? "");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(next: boolean) {
    if (next && !window.confirm("Geler la boutique ? Les clientes verront la page d'attente et ne pourront plus commander.")) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await setMaintenance({ enabled: next, title: t, message: m });
      setFeedback({ ok: result.status === "success", text: result.message ?? "" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className={`border p-3 text-sm ${enabled ? "border-danger text-danger" : "border-success text-success"}`} role="status">
        {enabled ? "La boutique est gelée. Les clientes voient la page d'attente." : "La boutique est ouverte."}
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Titre de la page d&apos;attente</span>
        <input value={t} onChange={(e) => setT(e.target.value)} maxLength={120} placeholder="On se refait une beauté" className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Message</span>
        <textarea
          value={m}
          onChange={(e) => setM(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="La boutique est momentanément fermée. Revenez très vite !"
          className={`${field} py-2`}
        />
        <span className="text-xs text-muted">Par exemple : « Nouvelle collection le 15 décembre à 18 h. Suivez-nous sur Instagram ! »</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <>
            <button type="button" disabled={pending} onClick={() => apply(false)} className="min-h-11 bg-ink px-5 text-sm text-ivory disabled:opacity-50">
              Rouvrir la boutique
            </button>
            <button type="button" disabled={pending} onClick={() => apply(true)} className="min-h-11 border border-ink px-4 text-sm disabled:opacity-50">
              Mettre à jour le message
            </button>
          </>
        ) : (
          <button type="button" disabled={pending} onClick={() => apply(true)} className="min-h-11 bg-danger px-5 text-sm text-ivory disabled:opacity-50">
            Geler la boutique
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        Pendant le gel : vous voyez toujours le site (avec un bandeau). Les clientes peuvent encore se connecter et suivre leurs commandes. Les commandes déjà
        payées continuent d&apos;arriver normalement.
      </p>
      {feedback ? (
        <p role={feedback.ok ? "status" : "alert"} className={`text-sm ${feedback.ok ? "text-success" : "text-danger"}`}>
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}

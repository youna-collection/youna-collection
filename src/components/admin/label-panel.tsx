"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelLabel, createLabel } from "@/app/actions/admin-labels";

const primary = "min-h-11 bg-ink px-5 text-sm text-ivory disabled:opacity-50";
const secondary = "min-h-11 border border-ink px-4 text-sm disabled:opacity-50";

/** Étiquette Sendcloud : création (payante, avec confirmation), impression, annulation. */
export function LabelPanel({
  orderId,
  orderNumber,
  carrierLabel,
  hasLabel,
  canChange,
}: {
  orderId: string;
  orderNumber: number;
  carrierLabel: string;
  hasLabel: boolean;
  /** Faux une fois le colis expédié : on peut encore imprimer, plus créer ni annuler. */
  canChange: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"create" | "cancel" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function run(action: typeof createLabel) {
    setMessage(null);
    startTransition(async () => {
      const result = await action({ orderId });
      setConfirming(null);
      setMessage(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error });
      if (result.ok) router.refresh();
    });
  }

  if (!hasLabel && !canChange) return null;

  return (
    <section className="flex flex-col gap-3 border border-sand bg-ivory p-4">
      <h2 className="text-lg">Étiquette {carrierLabel}</h2>

      {hasLabel ? (
        <div className="flex flex-wrap gap-2">
          <a href={`/admin/commandes/${orderNumber}/etiquette`} target="_blank" className={`${primary} flex items-center`}>
            Imprimer l&apos;étiquette (PDF)
          </a>
          {canChange && confirming !== "cancel" ? (
            <button type="button" disabled={pending} onClick={() => setConfirming("cancel")} className={secondary}>
              Annuler l&apos;étiquette
            </button>
          ) : null}
        </div>
      ) : confirming !== "create" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">L&apos;étiquette est créée sur votre compte Sendcloud, avec le numéro de suivi.</p>
          <button type="button" disabled={pending} onClick={() => setConfirming("create")} className={`${primary} self-start`}>
            Créer l&apos;étiquette
          </button>
        </div>
      ) : null}

      {confirming === "create" ? (
        <div className="flex flex-col gap-2 border border-ink bg-white p-3 text-sm">
          <p>Sendcloud va facturer cette étiquette sur votre compte. Vérifiez l&apos;adresse de la cliente avant de continuer.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run(createLabel)} className={primary}>
              {pending ? "Création…" : "Oui, créer l'étiquette"}
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirming(null)} className={secondary}>
              Non
            </button>
          </div>
        </div>
      ) : null}

      {confirming === "cancel" ? (
        <div className="flex flex-col gap-2 border border-ink bg-white p-3 text-sm">
          <p>Annuler cette étiquette ? Ne déposez pas le colis avec l&apos;ancienne étiquette.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run(cancelLabel)} className={primary}>
              {pending ? "Annulation…" : "Oui, annuler"}
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirming(null)} className={secondary}>
              Non
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

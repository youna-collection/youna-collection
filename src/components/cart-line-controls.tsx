"use client";

import { useState, useTransition } from "react";
import { updateCartItem } from "@/app/actions/cart";
import { notifyCartChange } from "./cart-link";

/** − / + / Retirer pour une ligne du panier. La page se met à jour après chaque changement. */
export function CartLineControls({ lineId, quantity, maxQuantity }: { lineId: string; quantity: number; maxQuantity: number }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(next: number) {
    setError(null);
    startTransition(async () => {
      const result = await updateCartItem({ lineId, quantity: next });
      if (result.ok) notifyCartChange();
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-center gap-4 ${pending ? "opacity-50" : ""}`}>
        <div className="flex items-center border border-sand">
          <button
            type="button"
            onClick={() => change(quantity - 1)}
            disabled={pending || quantity <= 1}
            aria-label="Retirer un exemplaire"
            className="flex size-10 items-center justify-center disabled:text-sand"
          >
            −
          </button>
          <span className="w-6 text-center text-sm tabular-nums" aria-label={`Quantité : ${quantity}`}>
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => change(quantity + 1)}
            disabled={pending || quantity >= maxQuantity}
            aria-label="Ajouter un exemplaire"
            className="flex size-10 items-center justify-center disabled:text-sand"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={() => change(0)}
          disabled={pending}
          className="min-h-10 text-xs tracking-widest text-muted uppercase underline-offset-4 hover:underline"
        >
          Retirer
        </button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

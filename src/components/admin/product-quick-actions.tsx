"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { duplicateProduct, setProductVisibility } from "@/app/actions/admin-products";

const button = "min-h-10 border border-sand bg-white px-3 text-xs disabled:opacity-50";

/** Masquer, remettre en ligne ou dupliquer un produit directement depuis la liste. */
export function ProductQuickActions({ productId, visible }: { productId: string; visible: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setProductVisibility(productId, !visible);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex gap-2">
        <button type="button" onClick={toggle} disabled={pending} className={button}>
          {visible ? "Masquer" : "Mettre en ligne"}
        </button>
        <form action={duplicateProduct.bind(null, productId)}>
          <button type="submit" disabled={pending} className={button}>
            Dupliquer
          </button>
        </form>
      </div>
      {error ? (
        <p role="alert" className="max-w-64 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

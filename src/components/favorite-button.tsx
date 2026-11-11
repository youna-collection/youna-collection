"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleFavorite } from "@/app/actions/account";
import { HeartIcon } from "./icons";

export function FavoriteButton({ productId, productSlug, initial }: { productId: string; productSlug: string; initial: boolean }) {
  const [favorite, setFavorite] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    const next = !favorite;
    setFavorite(next);
    startTransition(async () => {
      const result = await toggleFavorite({ productId, favorite: next });
      if (!result.ok) {
        setFavorite(!next);
        router.push(`/connexion?next=${encodeURIComponent(`/produits/${productSlug}`)}`);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={favorite}
      aria-label={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
      title={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
      className="-mr-2 flex size-11 shrink-0 items-center justify-center"
    >
      <HeartIcon filled={favorite} />
    </button>
  );
}

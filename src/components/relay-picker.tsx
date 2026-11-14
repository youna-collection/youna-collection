"use client";

import { useState } from "react";

export type RelayPoint = {
  /** Identifiant Sendcloud du point relais (vérifié par le serveur à la commande). */
  id: string;
  name: string;
  address1: string;
  address2: string;
  postalCode: string;
  city: string;
  country: string;
};

// Carte des points relais Mondial Relay fournie par Sendcloud (fenêtre par-dessus la page).
const SCRIPT = "https://embed.sendcloud.sc/spp/1.0.0/api.min.js";
const publicKey = process.env.NEXT_PUBLIC_SENDCLOUD_PUBLIC_KEY ?? "";

type SendcloudPoint = {
  id: number;
  name: string;
  street?: string;
  house_number?: string;
  postal_code: string;
  city: string;
  country: string;
};
type SendcloudPicker = {
  open: (config: Record<string, string>, onSuccess: (point: SendcloudPoint) => void, onFailure: (errors: string[]) => void) => void;
};

let loading: Promise<void> | null = null;

function loadPicker(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error(SCRIPT));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function RelayPicker({
  country,
  postalCode,
  selected,
  onSelect,
}: {
  country: string;
  postalCode: string;
  selected: RelayPoint | null;
  onSelect: (relay: RelayPoint) => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  // La carte s'ouvre autour de ce code postal (ou de cette ville).
  const [near, setNear] = useState(postalCode);

  async function open() {
    setStatus("loading");
    try {
      await loadPicker();
      const picker = (window as unknown as { sendcloud?: { servicePoints?: SendcloudPicker } }).sendcloud?.servicePoints;
      if (!picker) throw new Error("picker");
      setStatus("idle");
      picker.open(
        {
          apiKey: publicKey,
          country: country.toLowerCase(),
          language: "fr-fr",
          carriers: "mondial_relay",
          ...(/^\d[\d\s-]*$/.test(near.trim()) ? { postalCode: near.trim() } : near.trim() ? { city: near.trim() } : {}),
        },
        (point) => {
          onSelect({
            id: String(point.id),
            name: point.name.trim(),
            address1: [point.house_number, point.street].filter(Boolean).join(" ").trim(),
            address2: "",
            postalCode: point.postal_code.trim(),
            city: point.city.trim(),
            country: point.country.trim().toUpperCase(),
          });
        },
        (errors) => {
          // « Closed » : la cliente a fermé la fenêtre sans choisir.
          if (!errors.every((e) => e === "Closed")) setStatus("error");
        },
      );
    } catch {
      setStatus("error");
    }
  }

  if (!publicKey) {
    return <p className="text-sm text-danger">Le choix du point relais n&apos;est pas encore disponible. Choisissez un autre mode de livraison.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {selected ? (
        <div className="border border-ink bg-white p-3 text-sm">
          <p className="text-xs tracking-widest text-muted uppercase">Point relais choisi</p>
          <p className="mt-1">{selected.name}</p>
          <p className="text-muted">
            {[selected.address1, selected.address2].filter(Boolean).join(", ")} — {selected.postalCode} {selected.city}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">Choisissez le point relais où vous retirerez votre colis.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Code postal ou ville
          <input
            value={near}
            onChange={(event) => setNear(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                open();
              }
            }}
            autoComplete="postal-code"
            maxLength={60}
            className="min-h-11 w-48 border border-sand bg-white px-3 text-base outline-none focus:border-ink"
          />
        </label>
        <button type="button" onClick={open} disabled={status === "loading"} className="min-h-11 border border-ink px-4 text-sm disabled:opacity-50">
          {status === "loading" ? "Ouverture de la carte…" : selected ? "Changer de point relais" : "Voir les points relais"}
        </button>
      </div>
      {status === "error" ? (
        <p className="text-sm text-danger">La carte des points relais n&apos;a pas pu s&apos;ouvrir. Réessayez dans un instant.</p>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

export type RelayPoint = {
  id: string;
  name: string;
  address1: string;
  address2: string;
  postalCode: string;
  city: string;
  country: string;
};

// Carte officielle Mondial Relay (module jQuery + carte Leaflet), chargée seulement sur la page de commande.
const JQUERY = "https://ajax.googleapis.com/ajax/libs/jquery/2.2.4/jquery.min.js";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const WIDGET = "https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js";

const loaded = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = false;
        script.onload = () => resolve();
        script.onerror = () => {
          loaded.delete(src);
          script.remove();
          reject(new Error(src));
        };
        document.head.appendChild(script);
      }),
    );
  }
  return loaded.get(src)!;
}

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

type WidgetData = { ID: string; Nom: string; Adresse1: string; Adresse2: string; CP: string; Ville: string; Pays: string };
type JQueryLike = (target: HTMLElement) => { MR_ParcelShopPicker: (options: Record<string, unknown>) => void };

/** Code enseigne Mondial Relay : 8 caractères. « BDTEST » tant que le contrat n'est pas renseigné. */
const brand = (process.env.NEXT_PUBLIC_MONDIAL_RELAY_BRAND || "BDTEST").padEnd(8, " ").slice(0, 8);

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
  const zone = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    let cancelled = false;
    const element = zone.current;
    (async () => {
      try {
        loadCss(LEAFLET_CSS);
        await loadScript(JQUERY);
        await loadScript(LEAFLET_JS);
        await loadScript(WIDGET);
        if (cancelled || !element) return;
        element.innerHTML = "";
        const $ = (window as unknown as { jQuery: JQueryLike }).jQuery;
        $(element).MR_ParcelShopPicker({
          Target: "#mr-relay-id",
          Brand: brand,
          Country: country,
          AllowedCountries: country,
          PostCode: postalCode,
          ColLivMod: "24R",
          NbResults: "7",
          Responsive: true,
          ShowResultsOnMap: true,
          EnableGmap: false,
          OnParcelShopSelected: (data: WidgetData) =>
            onSelectRef.current({
              id: data.ID,
              name: data.Nom.trim(),
              address1: data.Adresse1.trim(),
              address2: (data.Adresse2 ?? "").trim(),
              postalCode: data.CP.trim(),
              city: data.Ville.trim(),
              country: data.Pays.trim(),
            }),
        });
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      if (element) element.innerHTML = "";
    };
    // Le code postal ne sert qu'à la première recherche : on ne recharge pas la carte à chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

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
        <p className="text-sm text-muted">Recherchez votre code postal puis choisissez un point relais dans la liste.</p>
      )}
      {status === "loading" ? <p className="text-sm text-muted">Chargement de la carte…</p> : null}
      {status === "error" ? (
        <p className="text-sm text-danger">La carte des points relais n&apos;a pas pu se charger. Rechargez la page.</p>
      ) : null}
      <input type="hidden" id="mr-relay-id" />
      <div ref={zone} className="mr-widget min-h-20" />
    </div>
  );
}

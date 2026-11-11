"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";

export type ChartPoint = { date: string; orders: number; net_cents: number };

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 28, left: 52 };

function niceMax(value: number) {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude * 4 >= value) ?? 10;
  return step * magnitude * 4;
}

const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: cents >= 1_000_000 ? "compact" : "standard" }).format(cents / 100);

function label(date: string, bucket: "day" | "week" | "month", long = false) {
  const d = new Date(`${date}T12:00:00Z`);
  if (bucket === "month") return d.toLocaleDateString("fr-FR", { month: long ? "long" : "short", year: long ? "numeric" : undefined, timeZone: "UTC" });
  if (bucket === "week") return `${long ? "Semaine du " : ""}${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })}`;
  return d.toLocaleDateString("fr-FR", { weekday: long ? "long" : undefined, day: "numeric", month: long ? "long" : "short", timeZone: "UTC" });
}

/** Chiffre d'affaires net par jour, semaine ou mois : colonnes d'une seule couleur, détail au survol. */
export function RevenueChart({ points, bucket }: { points: ChartPoint[]; bucket: "day" | "week" | "month" }) {
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const max = niceMax(Math.max(...points.map((p) => p.net_cents), 0));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(points.length, 1);
  const barW = Math.max(2, Math.min(24, slot - 2));
  const y = (v: number) => PAD.top + plotH - (Math.max(v, 0) / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.ceil(points.length / Math.max(1, Math.floor(plotW / 56)));
  const current = active != null ? points[active] : null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative w-full min-w-0"
        ref={box}
        onMouseLeave={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} role="img" aria-label="Chiffre d'affaires net sur la période" className="block max-w-full">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-sand)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-muted)">
                {euros(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const x = PAD.left + i * slot + (slot - barW) / 2;
            const top = y(p.net_cents);
            const h = PAD.top + plotH - top;
            const r = Math.min(4, barW / 2, h);
            return (
              <g key={p.date}>
                {h > 0 ? (
                  <path
                    d={`M${x},${PAD.top + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${PAD.top + plotH} Z`}
                    fill="var(--color-chart)"
                    opacity={active == null || active === i ? 1 : 0.35}
                  />
                ) : null}
                {i % labelEvery === 0 || i === points.length - 1 ? (
                  <text x={x + barW / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
                    {label(p.date, bucket)}
                  </text>
                ) : null}
                {/* Zone de survol plus large que la colonne. */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${label(p.date, bucket, true)} : ${formatPrice(p.net_cents)}, ${p.orders} commande${p.orders > 1 ? "s" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onTouchStart={() => setActive(i)}
                  className="outline-none"
                />
              </g>
            );
          })}
        </svg>
        {current && active != null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 flex flex-col border border-sand bg-white px-3 py-2 text-xs shadow-sm"
            style={{ left: Math.min(Math.max(PAD.left + active * slot + slot / 2 - 70, 0), width - 150), width: 150 }}
          >
            <span className="text-muted">{label(current.date, bucket, true)}</span>
            <span className="text-sm">{formatPrice(current.net_cents)}</span>
            <span className="text-muted">
              {current.orders} commande{current.orders > 1 ? "s" : ""}
            </span>
          </div>
        ) : null}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Voir les chiffres en tableau</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-muted">
              <th className="py-1 font-normal">Période</th>
              <th className="py-1 text-right font-normal">Commandes</th>
              <th className="py-1 text-right font-normal">CA net</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date} className="border-t border-sand">
                <td className="py-1">{label(p.date, bucket, true)}</td>
                <td className="py-1 text-right tabular-nums">{p.orders}</td>
                <td className="py-1 text-right tabular-nums">{formatPrice(p.net_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

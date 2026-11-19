"use client";

import { useEffect, useState } from "react";

const UNITS = [
  { label: "jours", ms: 86_400_000 },
  { label: "heures", ms: 3_600_000 },
  { label: "min", ms: 60_000 },
  { label: "sec", ms: 1_000 },
] as const;

function split(remaining: number) {
  let rest = Math.max(0, remaining);
  return UNITS.map((unit) => {
    const value = Math.floor(rest / unit.ms);
    rest -= value * unit.ms;
    return { label: unit.label, value };
  });
}

/**
 * Compte à rebours jusqu'à la réouverture. Calculé seulement dans le navigateur (la page est en cache).
 * Arrivé à zéro, la page se recharge toute seule chaque minute pour montrer la boutique dès qu'elle rouvre.
 */
export function Countdown({ target }: { target: string }) {
  const end = Date.parse(target);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const tick = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
    };
  }, []);

  const done = now !== null && now >= end;
  useEffect(() => {
    if (!done) return;
    const reload = setInterval(() => window.location.reload(), 60_000);
    return () => clearInterval(reload);
  }, [done]);

  if (done) {
    return (
      <p role="status" className="text-sm tracking-[0.2em] uppercase">
        C&apos;est l&apos;heure ! La boutique ouvre dans un instant…
      </p>
    );
  }

  const parts = now === null ? UNITS.map((u) => ({ label: u.label, value: null })) : split(end - now);
  // Les jours disparaissent le dernier jour.
  const shown = parts[0].value === 0 ? parts.slice(1) : parts;

  return (
    <div role="timer" aria-live="off" className="flex justify-center gap-3 sm:gap-5">
      {shown.map((part) => (
        <div key={part.label} className="flex w-16 flex-col items-center gap-1 border border-sand bg-white/60 py-3 sm:w-20">
          <span className="font-display text-3xl tabular-nums sm:text-4xl">{part.value === null ? "–" : String(part.value).padStart(2, "0")}</span>
          <span className="text-[0.65rem] tracking-[0.2em] text-muted uppercase">{part.label}</span>
        </div>
      ))}
    </div>
  );
}

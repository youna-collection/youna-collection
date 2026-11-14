"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Courte vidéo muette qui tourne en boucle, avec un bouton pause (obligatoire pour une animation automatique).
 * Si la visiteuse a demandé moins d'animations, la vidéo démarre en pause.
 * `media` : la vidéo n'est téléchargée que si l'écran correspond (ex. téléphone seulement).
 */
export function LoopVideo({ src, label, media, className = "" }: { src: string; label: string; media?: string; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v || (media && !window.matchMedia(media).matches)) return;
    v.src = src;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) v.pause();
    else void v.play().catch(() => setPlaying(false));
  }, [src, media]);

  function toggle() {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }

  return (
    <div className={`relative overflow-hidden bg-photo ${className}`}>
      <video ref={video} muted loop playsInline preload="auto" aria-label={label} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} className="absolute inset-0 size-full object-cover" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Mettre la vidéo en pause" : "Lire la vidéo"}
        className="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-full bg-ink/60 text-ivory backdrop-blur"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
            <rect x="6" y="5" width="4" height="14" />
            <rect x="14" y="5" width="4" height="14" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
            <path d="M7 5l12 7-12 7z" />
          </svg>
        )}
      </button>
    </div>
  );
}

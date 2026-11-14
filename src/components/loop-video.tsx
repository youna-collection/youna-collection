"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Courte vidéo muette qui tourne en boucle, avec un bouton pause (obligatoire pour une animation automatique).
 * Si la visiteuse a demandé moins d'animations, la vidéo reste en pause.
 * `centerOnWide` : sur écran large, la vidéo (verticale) est montrée entière au centre, sur le fond de la page.
 * Sur téléphone, elle remplit tout le cadre.
 * `media` : la vidéo n'est téléchargée que si l'écran correspond.
 * iPhone en mode économie d'énergie : la lecture automatique d'une <video> est refusée. Safari accepte pourtant
 * un MP4 dans une balise <img> (lu comme un GIF animé, muet et en boucle) : on bascule alors sur cette image.
 * Ailleurs (navigateur qui ne sait pas faire), la première image reste affichée et la vidéo démarre au premier toucher.
 */
export function LoopVideo({
  src,
  label,
  media,
  centerOnWide = false,
  className = "",
}: {
  src: string;
  label: string;
  media?: string;
  centerOnWide?: boolean;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // Pause demandée par la visiteuse (bouton) : on ne relance plus la vidéo à sa place.
  const pausedByVisitor = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  // Lecture automatique refusée mais MP4 accepté comme image (Safari) : la vidéo est montrée en <img>.
  const [asImage, setAsImage] = useState(false);
  const asImageRef = useRef(false);

  useEffect(() => {
    const v = video.current;
    if (!v || (media && !window.matchMedia(media).matches)) return;
    // « #t=0.001 » : Safari affiche la première image même quand il refuse de lancer la vidéo.
    v.src = `${src}#t=0.001`;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let triedImage = false;
    const tryImage = () => {
      if (triedImage) return;
      triedImage = true;
      const probe = new Image();
      probe.onload = () => {
        if (!v.paused || pausedByVisitor.current) return;
        asImageRef.current = true;
        setAsImage(true);
      };
      probe.src = src;
    };
    const start = (event?: Event) => {
      // Le bouton lecture/pause gère lui-même son toucher.
      if (event?.target instanceof Node && button.current?.contains(event.target)) return;
      if (asImageRef.current || !v.paused || pausedByVisitor.current) return;
      void v.play().catch(() => {
        setPlaying(false);
        tryImage();
      });
    };
    // Lecture refusée (économie d'énergie, économiseur de données…) : nouvel essai au premier toucher ou clic,
    // et quand la visiteuse revient sur l'onglet.
    const onVisible = () => document.visibilityState === "visible" && start();
    document.addEventListener("touchend", start, { passive: true });
    document.addEventListener("click", start);
    document.addEventListener("visibilitychange", onVisible);
    start();
    return () => {
      document.removeEventListener("touchend", start);
      document.removeEventListener("click", start);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [src, media]);

  function toggle() {
    const v = video.current;
    if (!v) return;
    if (asImageRef.current) {
      // Pause sur la version image : on revient à la vidéo, arrêtée sur sa première image.
      asImageRef.current = false;
      setAsImage(false);
      pausedByVisitor.current = true;
      return;
    }
    pausedByVisitor.current = !v.paused;
    if (v.paused) void v.play();
    else v.pause();
  }

  return (
    <div className={`relative overflow-hidden ${centerOnWide ? "bg-photo md:bg-transparent" : "bg-photo"} ${className}`}>
      <video
        ref={video}
        muted
        loop
        playsInline
        preload="auto"
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className={`absolute inset-0 size-full object-cover ${centerOnWide ? "md:object-contain" : ""}`}
      />
      {asImage ? (
        // MP4 lu comme une image animée par Safari (voir plus haut) ; pas d'optimisation next/image pour une vidéo.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className={`absolute inset-0 size-full object-cover ${centerOnWide ? "md:object-contain" : ""}`} />
      ) : null}
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-label={playing || asImage ? "Mettre la vidéo en pause" : "Lire la vidéo"}
        className="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-full bg-ink/60 text-ivory backdrop-blur"
      >
        {playing || asImage ? (
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

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Courte vidéo muette qui tourne en boucle, sans bouton (choix de Youna).
 * Si la visiteuse a demandé moins d'animations, la vidéo reste sur sa première image.
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
  // Lecture automatique refusée mais MP4 accepté comme image (Safari) : la vidéo est montrée en <img>.
  const [asImage, setAsImage] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v || (media && !window.matchMedia(media).matches)) return;
    // « #t=0.001 » : Safari affiche la première image même quand il refuse de lancer la vidéo.
    v.src = `${src}#t=0.001`;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let showingImage = false;
    let triedImage = false;
    const tryImage = () => {
      if (triedImage) return;
      triedImage = true;
      const probe = new Image();
      probe.onload = () => {
        if (!v.paused) return;
        showingImage = true;
        setAsImage(true);
      };
      probe.src = src;
    };
    const start = () => {
      if (showingImage || !v.paused) return;
      void v.play().catch(tryImage);
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

  const fit = `absolute inset-0 size-full object-cover ${centerOnWide ? "md:object-contain" : ""}`;
  return (
    <div className={`relative overflow-hidden ${centerOnWide ? "bg-photo md:bg-transparent" : "bg-photo"} ${className}`}>
      <video ref={video} muted loop playsInline preload="auto" aria-label={label} className={fit} />
      {asImage ? (
        // MP4 lu comme une image animée par Safari (voir plus haut) ; pas d'optimisation next/image pour une vidéo.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className={fit} />
      ) : null}
    </div>
  );
}

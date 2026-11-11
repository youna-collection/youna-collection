"use client";

import { useEffect, useRef, useState } from "react";

export type PickedPhoto = { id: string; file: File; preview: string };

const MAX_SIDE = 1600;
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Réduit la photo dans le navigateur avant l'envoi (1600 px, JPEG) : l'envoi est rapide même
 * en 4G, et les informations cachées de l'appareil photo (lieu, date) sont retirées.
 */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function PhotoPicker({ photos, onChange, max = 3, disabled }: { photos: PickedPhoto[]; onChange: (photos: PickedPhoto[]) => void; max?: number; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(photos);
  useEffect(() => {
    latest.current = photos;
  }, [photos]);

  // Libère les aperçus quand le composant disparaît.
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const room = max - photos.length;
    const picked = [...files].slice(0, room);
    const next: PickedPhoto[] = [];
    for (const original of picked) {
      const file = await shrink(original);
      if (file.size > MAX_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setError("Une photo n'a pas pu être ajoutée : utilisez une photo JPEG ou PNG.");
        continue;
      }
      next.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) });
    }
    if (files.length > room) setError(`${max} photos au maximum.`);
    onChange([...photos, ...next]);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  function remove(id: string) {
    const photo = photos.find((p) => p.id === id);
    if (photo) URL.revokeObjectURL(photo.preview);
    onChange(photos.filter((p) => p.id !== id));
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        Photos <span className="text-muted">(facultatif, {max} au maximum)</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="relative size-20 border border-sand bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local, pas d'optimisation possible */}
            <img src={photo.preview} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => remove(photo.id)}
              disabled={disabled}
              aria-label="Retirer cette photo"
              className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full border border-sand bg-ivory text-base leading-none"
            >
              ×
            </button>
          </div>
        ))}
        {photos.length < max ? (
          <label className={`flex size-20 cursor-pointer flex-col items-center justify-center border border-dashed border-ink/40 text-center text-xs text-muted ${busy || disabled ? "opacity-50" : ""}`}>
            <span className="text-xl leading-none">+</span>
            {busy ? "Patientez…" : "Ajouter"}
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              disabled={busy || disabled}
              className="sr-only"
              onChange={(e) => void add(e.currentTarget.files)}
            />
          </label>
        ) : null}
      </div>
      {error ? <p className="text-danger">{error}</p> : null}
    </div>
  );
}

/** Ajoute les photos choisies au formulaire envoyé. */
export function withPhotos(form: HTMLFormElement, photos: PickedPhoto[]): FormData {
  const data = new FormData(form);
  data.delete("photos");
  for (const photo of photos) data.append("photos", photo.file);
  return data;
}

"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addProductImages, deleteProductImage, reorderProductImages, updateProductImage } from "@/app/actions/admin-products";
import type { AdminImage } from "@/lib/admin/products";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const MAX_SIDE = 1800;

/** Réduit la photo (1800 px maximum) et la convertit en WebP, ou en JPEG si le navigateur ne sait pas faire. */
async function prepare(file: File): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpeg = await toBlob("image/jpeg");
  if (!jpeg) throw new Error("conversion");
  return { blob: jpeg, ext: "jpg" };
}

const randomName = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");

type VariantOption = { id: string; label: string };

export function PhotoManager({
  productId,
  productName,
  images,
  variants,
}: {
  productId: string;
  productName: string;
  images: AdminImage[];
  variants: VariantOption[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const supabase = createBrowserSupabase();
    const paths: string[] = [];
    const list = Array.from(files).slice(0, 20);
    for (const [index, file] of list.entries()) {
      setProgress(`Envoi de la photo ${index + 1} sur ${list.length}…`);
      try {
        const { blob, ext } = await prepare(file);
        const path = `products/${productId}/${randomName()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
        if (uploadError) throw uploadError;
        paths.push(path);
      } catch {
        setError(`La photo « ${file.name} » n'a pas pu être envoyée.`);
      }
    }
    if (paths.length) {
      setProgress("Enregistrement…");
      const result = await addProductImages(productId, paths, productName);
      if (!result.ok) setError(result.error);
    }
    setProgress(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Erreur.");
      router.refresh();
    });
  }

  function move(index: number, direction: -1 | 1) {
    const ids = images.map((image) => image.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderProductImages(productId, ids));
  }

  const busy = pending || progress !== null;

  return (
    <section className="flex flex-col gap-4 border border-sand bg-ivory p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-medium">Photos</h2>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="min-h-11 bg-ink px-4 text-sm text-ivory disabled:opacity-50"
        >
          + Ajouter des photos
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => upload(event.target.files)}
        />
      </div>
      {progress ? <p className="text-sm text-muted">{progress}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <li key={image.id} className={`flex flex-col gap-2 ${busy ? "opacity-60" : ""}`}>
              <div className="relative aspect-[3/4] overflow-hidden bg-photo">
                <Image src={image.url} alt={image.alt ?? ""} fill sizes="200px" className="object-cover" />
                {index === 0 ? (
                  <span className="absolute top-1 left-1 bg-ink px-1.5 py-0.5 text-[10px] text-ivory uppercase">Principale</span>
                ) : null}
              </div>
              {variants.length > 1 ? (
                <select
                  aria-label="Couleur de cette photo"
                  value={image.variant_id ?? ""}
                  disabled={busy}
                  onChange={(event) =>
                    run(() => updateProductImage({ id: image.id, productId, variantId: event.target.value || null }))
                  }
                  className="min-h-10 border border-sand bg-white px-2 text-sm"
                >
                  <option value="">Toutes les variantes</option>
                  {variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="flex items-center justify-between">
                <div className="flex">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={busy || index === 0}
                    aria-label="Déplacer avant"
                    className="flex size-10 items-center justify-center disabled:text-sand"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={busy || index === images.length - 1}
                    aria-label="Déplacer après"
                    className="flex size-10 items-center justify-center disabled:text-sand"
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Supprimer cette photo ?")) run(() => deleteProductImage(productId, image.id));
                  }}
                  className="min-h-10 px-1 text-xs text-danger"
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucune photo. Sur téléphone, vous pouvez en prendre une directement.</p>
      )}
      {variants.length > 1 && images.length ? (
        <p className="text-xs text-muted">
          Associez chaque photo à sa couleur : la fiche montrera la bonne photo quand la cliente choisit une couleur.
        </p>
      ) : null}
    </section>
  );
}

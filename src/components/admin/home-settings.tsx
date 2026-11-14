"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { setCheckoutLoginRequired, setHomeHero } from "@/app/actions/admin-settings";
import { preparePhoto, randomName } from "@/lib/prepare-photo";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Feedback = { ok: boolean; text: string } | null;

function Message({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p role={feedback.ok ? "status" : "alert"} className={`text-sm ${feedback.ok ? "text-success" : "text-danger"}`}>
      {feedback.text}
    </p>
  );
}

/** Photo en haut de la page d'accueil : envoi, remplacement, retrait. */
export function HomeHeroSettings({ heroUrl }: { heroUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();
  const busy = uploading || pending;

  async function upload(file: File | undefined) {
    if (!file) return;
    setFeedback(null);
    setUploading(true);
    try {
      const { blob, ext } = await preparePhoto(file, 2400);
      const path = `home/${randomName()}.${ext}`;
      const { error } = await createBrowserSupabase()
        .storage.from("product-images")
        .upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
      if (error) throw error;
      const result = await setHomeHero(path);
      setFeedback({ ok: result.status === "success", text: result.message ?? "" });
      router.refresh();
    } catch {
      setFeedback({ ok: false, text: `La photo « ${file.name} » n'a pas pu être envoyée.` });
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  function remove() {
    if (!window.confirm("Retirer cette photo ? L'accueil montrera de nouveau les photos des produits.")) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await setHomeHero(null);
      setFeedback({ ok: result.status === "success", text: result.message ?? "" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {heroUrl ? (
        <div className={`relative aspect-[4/5] w-full max-w-md overflow-hidden bg-photo sm:aspect-[16/9] ${busy ? "opacity-60" : ""}`}>
          <Image src={heroUrl} alt="Photo actuelle de la page d'accueil" fill sizes="448px" className="object-cover" />
        </div>
      ) : (
        <p className="text-sm text-muted">Aucune photo choisie : l&apos;accueil montre une rangée de photos de vos produits.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="min-h-11 bg-ink px-4 text-sm text-ivory disabled:opacity-50">
          {uploading ? "Envoi de la photo…" : heroUrl ? "Changer la photo" : "Choisir une photo"}
        </button>
        {heroUrl ? (
          <button type="button" disabled={busy} onClick={remove} className="min-h-11 border border-ink px-4 text-sm disabled:opacity-50">
            Retirer la photo
          </button>
        ) : null}
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(event) => upload(event.target.files?.[0])} />
      </div>
      <p className="text-xs text-muted">
        Conseil : une photo en largeur (paysage). Sur téléphone, le centre de la photo est montré ; gardez le sujet au milieu.
      </p>
      <Message feedback={feedback} />
    </div>
  );
}

/** Case : compte obligatoire pour commander. */
export function CheckoutLoginSetting({ required }: { required: boolean }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  function save(next: boolean) {
    setFeedback(null);
    startTransition(async () => {
      const result = await setCheckoutLoginRequired(next);
      setFeedback({ ok: result.status === "success", text: result.message ?? "" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={required} disabled={pending} onChange={(e) => save(e.target.checked)} className="mt-1 size-4 accent-ink" />
        <span>
          Obliger les clientes à se connecter pour commander
          <span className="block text-muted">
            Décoché : elles peuvent commander sans compte (avec leur e-mail). Coché : elles se connectent ou créent leur compte au moment de commander ;
            leur panier est gardé.
          </span>
        </span>
      </label>
      <Message feedback={feedback} />
    </div>
  );
}

"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { type HeroSlot, setCheckoutLoginRequired, setHomeHero, setHomeHeroVisible } from "@/app/actions/admin-settings";
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

/** Format de chaque emplacement : même rapport largeur/hauteur que le cadre de la page d'accueil. */
const SLOTS: Record<HeroSlot, { title: string; size: string; aspect: string; maxSide: number; width: string }> = {
  desktop: { title: "Ordinateur", size: "1920 × 1080 pixels (paysage)", aspect: "aspect-[16/9]", maxSide: 2400, width: "w-full max-w-md" },
  mobile: { title: "Téléphone", size: "1080 × 1350 pixels (portrait)", aspect: "aspect-[4/5]", maxSide: 1350, width: "w-40" },
};

function HeroSlotEditor({ slot, url }: { slot: HeroSlot; url: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();
  const busy = uploading || pending;
  const format = SLOTS[slot];

  async function upload(file: File | undefined) {
    if (!file) return;
    setFeedback(null);
    setUploading(true);
    try {
      const { blob, ext } = await preparePhoto(file, format.maxSide);
      const path = `home/${randomName()}.${ext}`;
      const { error } = await createBrowserSupabase()
        .storage.from("product-images")
        .upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
      if (error) throw error;
      const result = await setHomeHero(slot, path);
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
    if (!window.confirm(`Retirer la photo « ${format.title} » ?`)) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await setHomeHero(slot, null);
      setFeedback({ ok: result.status === "success", text: result.message ?? "" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base">{format.title}</h3>
      <p className="text-xs text-muted">Format conseillé : {format.size}</p>
      <div className={`relative ${format.aspect} ${format.width} overflow-hidden border border-sand bg-photo ${busy ? "opacity-60" : ""}`}>
        {url ? (
          <Image src={url} alt={`Photo d'accueil ${format.title.toLowerCase()}`} fill sizes="448px" className="object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted">Aucune photo</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="min-h-11 bg-ink px-4 text-sm text-ivory disabled:opacity-50">
          {uploading ? "Envoi…" : url ? "Changer" : "Choisir une photo"}
        </button>
        {url ? (
          <button type="button" disabled={busy} onClick={remove} className="min-h-11 border border-ink px-4 text-sm disabled:opacity-50">
            Retirer
          </button>
        ) : null}
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(event) => upload(event.target.files?.[0])} />
      </div>
      <Message feedback={feedback} />
    </div>
  );
}

/** Photos en haut de la page d'accueil : une pour ordinateur, une pour téléphone, et la case pour les afficher. */
export function HomeHeroSettings({ desktopUrl, mobileUrl, visible }: { desktopUrl: string | null; mobileUrl: string | null; visible: boolean }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setFeedback(null);
    startTransition(async () => {
      const result = await setHomeHeroVisible(next);
      setFeedback({ ok: result.status === "success", text: result.message ?? "" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Le cadre est coupé sur les bords si la photo n&apos;a pas le bon format : gardez le sujet au centre. S&apos;il n&apos;y a qu&apos;une photo, elle
        sert sur ordinateur et sur téléphone.
      </p>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex-1">
          <HeroSlotEditor slot="desktop" url={desktopUrl} />
        </div>
        <HeroSlotEditor slot="mobile" url={mobileUrl} />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={visible} disabled={pending} onChange={(e) => toggle(e.target.checked)} className="mt-1 size-4 accent-ink" />
        <span>
          Afficher ces photos sur la page d&apos;accueil
          <span className="block text-muted">Décoché : vous pouvez préparer vos photos ; l&apos;accueil montre les photos des produits.</span>
        </span>
      </label>
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

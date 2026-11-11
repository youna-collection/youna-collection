import type { Metadata } from "next";
import Link from "next/link";
import type { PromoRow } from "@/components/admin/promo-editor";
import { formatPrice } from "@/lib/format";
import { promoLabel } from "@/lib/promo";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Codes promo" };
export const dynamic = "force-dynamic";

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

function state(p: PromoRow, now: Date) {
  if (!p.is_active) return { label: "Désactivé", tone: "bg-sand/60 text-muted" };
  if (p.starts_at && new Date(p.starts_at) > now) return { label: "Programmé", tone: "bg-ink/10 text-ink" };
  if (p.ends_at && new Date(p.ends_at) <= now) return { label: "Expiré", tone: "bg-sand/60 text-muted" };
  if (p.max_uses && p.used_count >= p.max_uses) return { label: "Épuisé", tone: "bg-sand/60 text-muted" };
  return { label: "Actif", tone: "bg-success/10 text-success" };
}

export default async function PromosPage({ searchParams }: PageProps<"/admin/promos">) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("promo_codes")
    .select("id, code, type, value, min_subtotal_cents, starts_at, ends_at, max_uses, used_count, once_per_customer, is_active, note")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });
  const promos = (data ?? []) as PromoRow[];
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl">Codes promo</h1>
        <Link href="/admin/promos/nouveau" className="flex min-h-11 items-center bg-ink px-5 text-sm text-ivory">
          + Nouveau code
        </Link>
      </div>
      {typeof params.enregistre === "string" ? <p className="text-sm text-success">Le code {params.enregistre} est créé.</p> : null}
      <p className="text-sm text-muted">La cliente tape le code au moment de payer. La réduction s&apos;applique aux articles (pas à la livraison, sauf « livraison offerte »).</p>

      <ul className="flex flex-col divide-y divide-sand border-y border-sand bg-ivory">
        {promos.map((p) => {
          const s = state(p, now);
          const conditions = [
            p.min_subtotal_cents ? `dès ${formatPrice(p.min_subtotal_cents)}` : null,
            p.once_per_customer ? "1 fois par cliente" : null,
            p.starts_at ? `à partir du ${date.format(new Date(p.starts_at))}` : null,
            p.ends_at ? `jusqu'au ${date.format(new Date(p.ends_at))}` : null,
          ].filter(Boolean);
          return (
            <li key={p.id}>
              <Link href={`/admin/promos/${p.id}`} className="flex flex-col gap-1 p-3 hover:bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="font-medium tracking-widest">{p.code}</span>
                    <span className={`px-1.5 py-0.5 text-[11px] ${s.tone}`}>{s.label}</span>
                  </span>
                  <span>{promoLabel(p)}</span>
                </div>
                <span className="text-xs text-muted">
                  Utilisé {p.used_count} fois{p.max_uses ? ` sur ${p.max_uses}` : ""}
                  {conditions.length ? ` · ${conditions.join(" · ")}` : ""}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
              </Link>
            </li>
          );
        })}
        {!promos.length ? <li className="p-4 text-sm text-muted">Aucun code pour le moment.</li> : null}
      </ul>
    </div>
  );
}

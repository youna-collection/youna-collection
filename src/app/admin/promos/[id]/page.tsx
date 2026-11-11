import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PromoEditor, type PromoRow } from "@/components/admin/promo-editor";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Code promo" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PromoPage({ params }: PageProps<"/admin/promos/[id]">) {
  const { id } = await params;
  let promo: PromoRow | null = null;
  if (id !== "nouveau") {
    if (!UUID.test(id)) notFound();
    const supabase = await createClient();
    const { data } = await supabase
      .from("promo_codes")
      .select("id, code, type, value, min_subtotal_cents, starts_at, ends_at, max_uses, used_count, once_per_customer, is_active, note")
      .eq("id", id)
      .maybeSingle();
    if (!data) notFound();
    promo = data as PromoRow;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin/promos" className="text-sm text-muted hover:text-ink">
          ← Codes promo
        </Link>
        <h1 className="text-xl">{promo ? promo.code : "Nouveau code promo"}</h1>
      </div>
      <PromoEditor key={promo?.id ?? "new"} promo={promo} />
    </div>
  );
}

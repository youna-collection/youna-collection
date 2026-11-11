import type { Metadata } from "next";
import { SaleForm, type SaleProduct } from "@/components/admin/sale-form";
import { listAdminProducts } from "@/lib/admin/products";
import { listInPersonSales, PAYMENT_LABELS } from "@/lib/admin/stock";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Ventes en boutique" };
export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default async function InPersonSalesPage() {
  const [products, sales] = await Promise.all([listAdminProducts(), listInPersonSales()]);

  const saleProducts: SaleProduct[] = products
    .filter((p) => p.status !== "archived")
    .map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      bouquetEligible: p.bouquet_eligible,
      variants: p.variants.map((v) => ({
        id: v.id,
        label: [v.color_name, v.size].filter(Boolean).join(" · ") || "Modèle unique",
        priceCents: v.price_cents,
        available: v.track_stock ? v.stock - v.reserved : null,
        veilCount: v.bouquet_veil_count,
      })),
    }));

  const today = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const todaySales = sales.filter((s) => new Date(s.created_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) === today);
  const todayTotal = todaySales.reduce((sum, s) => sum + s.total_cents, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl">Ventes en boutique</h1>
        <p className="text-sm text-muted">
          Pour une vente faite en main propre (salon, Avenue 83…) : le stock est retiré tout de suite, et la vente compte dans vos chiffres.
        </p>
      </div>

      <SaleForm products={saleProducts} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg">Dernières ventes</h2>
          <span className="text-sm text-muted">
            Aujourd&apos;hui : {todaySales.length} vente{todaySales.length > 1 ? "s" : ""} · {formatPrice(todayTotal)}
          </span>
        </div>
        <ul className="flex flex-col divide-y divide-sand border-y border-sand bg-ivory">
          {sales.map((sale) => (
            <li key={sale.id} className="flex flex-col gap-1 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  n° {sale.order_number} · {dateTime.format(new Date(sale.created_at))}
                </span>
                <span>{formatPrice(sale.total_cents)}</span>
              </div>
              <span className="text-sm">
                {sale.items.map((i) => `${i.quantity} × ${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ""}`).join(", ")}
              </span>
              <span className="text-xs text-muted">
                {sale.payment_method ? PAYMENT_LABELS[sale.payment_method] : "—"}
                {sale.discount_cents ? ` · remise ${formatPrice(sale.discount_cents)}` : ""}
                {sale.customer_name ? ` · ${sale.customer_name}` : ""}
                {sale.email ? ` · ${sale.email}` : ""}
              </span>
            </li>
          ))}
          {!sales.length ? <li className="p-4 text-sm text-muted">Aucune vente en boutique pour le moment.</li> : null}
        </ul>
      </section>
    </div>
  );
}

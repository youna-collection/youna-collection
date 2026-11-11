import type { Metadata } from "next";
import Link from "next/link";
import { StockTable, type StockRow } from "@/components/admin/stock-table";
import { listAdminProducts } from "@/lib/admin/products";

export const metadata: Metadata = { title: "Stock" };
export const dynamic = "force-dynamic";

export default async function AdminStockPage({ searchParams }: PageProps<"/admin/stock">) {
  const params = await searchParams;
  const products = await listAdminProducts();

  const rows: StockRow[] = products
    .filter((p) => p.status !== "archived")
    .flatMap((product) =>
      product.variants.map((variant) => {
        const image = product.images.find((i) => i.variant_id === variant.id) ?? product.images[0];
        return {
          id: variant.id,
          productId: product.id,
          productName: product.name,
          variantLabel: [variant.color_name, variant.size].filter(Boolean).join(" · ") || "Modèle unique",
          sku: variant.sku,
          imageUrl: image?.url ?? null,
          stock: variant.stock,
          reserved: variant.reserved,
          threshold: variant.low_stock_threshold,
          tracked: variant.track_stock,
          visible: variant.is_active && product.status === "active",
        };
      }),
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl">Stock</h1>
        <Link href="/admin/stock/historique" className="text-sm underline underline-offset-4">
          Historique des mouvements
        </Link>
      </div>
      <p className="text-sm text-muted">
        Changez le nombre puis appuyez sur « OK ». Chaque changement est noté dans l&apos;historique. Les articles « réservés » sont dans un
        paiement en cours : ils reviennent en stock si la cliente abandonne.
      </p>
      <StockTable rows={rows} initialQuery={typeof params.q === "string" ? params.q : ""} initialFilter={typeof params.filtre === "string" ? params.filtre : ""} />
    </div>
  );
}

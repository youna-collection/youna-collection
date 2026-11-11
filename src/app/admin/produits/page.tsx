import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createProduct } from "@/app/actions/admin-products";
import { ProductQuickActions } from "@/components/admin/product-quick-actions";
import { listAdminCategories, listAdminProducts, publicationState } from "@/lib/admin/products";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Produits" };
export const dynamic = "force-dynamic";

const TONES = { success: "bg-success/10 text-success", info: "bg-ink/10 text-ink", muted: "bg-sand/60 text-muted" };

const field = "min-h-11 border border-sand bg-white px-3 text-base outline-none focus:border-ink";

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/produits">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const status = typeof params.statut === "string" ? params.statut : "";
  const category = typeof params.categorie === "string" ? params.categorie : "";
  const stock = typeof params.stock === "string" ? params.stock : "";

  const [products, categories] = await Promise.all([listAdminProducts(), listAdminCategories()]);
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  const filtered = products.filter((product) => {
    if (q) {
      const haystack = [product.name, ...product.variants.flatMap((v) => [v.color_name, v.size, v.sku])].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (status && publicationState(product).label !== status) return false;
    if (category && !product.category_ids.includes(category)) return false;
    const tracked = product.variants.filter((v) => v.is_active && v.track_stock);
    if (stock === "epuise" && !tracked.some((v) => v.stock - v.reserved <= 0)) return false;
    if (stock === "bas" && !tracked.some((v) => v.stock - v.reserved > 0 && v.stock - v.reserved <= v.low_stock_threshold)) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl">Produits</h1>
        <form action={createProduct}>
          <button type="submit" className="min-h-11 bg-ink px-5 text-sm text-ivory">
            + Ajouter un produit
          </button>
        </form>
      </div>

      {params.supprime === "1" ? <p className="text-sm text-success">Le produit a été supprimé.</p> : null}

      <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <input type="search" name="q" defaultValue={q} placeholder="Rechercher un nom, une couleur…" className={field} />
        <select name="statut" defaultValue={status} className={field} aria-label="Visibilité">
          <option value="">Toutes visibilités</option>
          {["En ligne", "Programmé", "Brouillon", "Archivé"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select name="categorie" defaultValue={category} className={field} aria-label="Catégorie">
          <option value="">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="stock" defaultValue={stock} className={field} aria-label="Stock">
          <option value="">Tout le stock</option>
          <option value="bas">Stock bas</option>
          <option value="epuise">Épuisé</option>
        </select>
        <button type="submit" className="min-h-11 border border-ink px-4 text-sm">
          Filtrer
        </button>
      </form>

      <p className="text-sm text-muted">
        {filtered.length} produit{filtered.length > 1 ? "s" : ""}
        {filtered.length !== products.length ? ` sur ${products.length}` : ""}
      </p>

      <ul className="flex flex-col divide-y divide-sand border-y border-sand bg-ivory">
        {filtered.map((product) => {
          const state = publicationState(product);
          const image = product.images[0];
          const prices = product.variants.map((v) => v.price_cents);
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          const tracked = product.variants.filter((v) => v.track_stock && v.is_active);
          const totalStock = tracked.reduce((sum, v) => sum + v.stock, 0);
          const soldOut = tracked.filter((v) => v.stock - v.reserved <= 0).length;
          return (
            <li key={product.id} className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:gap-0 sm:pb-0 sm:pr-3">
              <Link href={`/admin/produits/${product.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-3 hover:bg-white">
                <div className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden bg-photo">
                  {image ? <Image src={image.url} alt="" fill sizes="56px" className="object-cover" /> : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate">{product.name}</span>
                    <span className={`px-1.5 py-0.5 text-[11px] ${TONES[state.tone]}`}>{state.label}</span>
                  </div>
                  <span className="text-xs text-muted">
                    {product.category_ids.length
                      ? product.category_ids.map((id) => categoryNames.get(id)).filter(Boolean).join(", ")
                      : "Sans catégorie"}{" "}
                    · {product.variants.length}{" "}
                    variante{product.variants.length > 1 ? "s" : ""}
                  </span>
                  <span className="text-xs text-muted">
                    {tracked.length ? `${totalStock} en stock` : "Stock non suivi"}
                    {soldOut ? (
                      <span className="text-danger">
                        {" "}
                        · {soldOut} épuisée{soldOut > 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </span>
                </div>
                <span className="shrink-0 text-sm">{min === max ? formatPrice(min) : `${formatPrice(min)} – ${formatPrice(max)}`}</span>
              </Link>
              <div className="pl-[4.25rem] sm:pl-0">
                <ProductQuickActions productId={product.id} visible={product.status === "active"} />
              </div>
            </li>
          );
        })}
        {!filtered.length ? <li className="p-4 text-sm text-muted">Aucun produit ne correspond.</li> : null}
      </ul>
    </div>
  );
}

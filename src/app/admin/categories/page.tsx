import type { Metadata } from "next";
import Link from "next/link";
import { createCategory, deleteCategory, moveCategory, renameCategory, toggleCategory } from "@/app/actions/admin-categories";
import { listAdminCategories } from "@/lib/admin/products";

export const metadata: Metadata = { title: "Catégories" };
export const dynamic = "force-dynamic";

const field = "min-h-11 w-full border border-sand bg-white px-3 text-base outline-none focus:border-ink";
const small = "flex min-h-10 min-w-10 items-center justify-center px-2 text-sm disabled:text-sand";

export default async function AdminCategoriesPage() {
  const categories = await listAdminCategories();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-xl">Catégories</h1>
      <p className="-mt-3 text-sm text-muted">
        Elles forment le menu de la boutique, dans cet ordre. Une catégorie masquée disparaît du menu.
      </p>

      <ul className="flex flex-col divide-y divide-sand border-y border-sand bg-ivory">
        {categories.map((category, index) => (
          <li key={category.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <form action={renameCategory} className="flex flex-1 gap-2">
              <input type="hidden" name="id" value={category.id} />
              <input name="name" defaultValue={category.name} aria-label="Nom de la catégorie" className={field} maxLength={60} required />
              <button type="submit" className="min-h-11 shrink-0 border border-sand px-3 text-sm">
                Renommer
              </button>
            </form>
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <Link href={`/admin/produits?categorie=${category.id}`} className="px-2 text-muted underline underline-offset-4">
                {category.product_count} produit{category.product_count > 1 ? "s" : ""}
              </Link>
              <form action={toggleCategory}>
                <input type="hidden" name="id" value={category.id} />
                <button type="submit" className={`${small} ${category.is_active ? "" : "text-danger"}`}>
                  {category.is_active ? "Visible" : "Masquée"}
                </button>
              </form>
              <form action={moveCategory}>
                <input type="hidden" name="id" value={category.id} />
                <input type="hidden" name="direction" value="up" />
                <button type="submit" disabled={index === 0} aria-label="Monter" className={small}>
                  ↑
                </button>
              </form>
              <form action={moveCategory}>
                <input type="hidden" name="id" value={category.id} />
                <input type="hidden" name="direction" value="down" />
                <button type="submit" disabled={index === categories.length - 1} aria-label="Descendre" className={small}>
                  ↓
                </button>
              </form>
              {category.product_count === 0 ? (
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={category.id} />
                  <button type="submit" className={`${small} text-danger`}>
                    Supprimer
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <form action={createCategory} className="flex gap-2">
        <input name="name" placeholder="Nouvelle catégorie, ex. Robes" aria-label="Nouvelle catégorie" className={field} maxLength={60} required />
        <button type="submit" className="min-h-11 shrink-0 bg-ink px-4 text-sm text-ivory">
          Ajouter
        </button>
      </form>
    </div>
  );
}

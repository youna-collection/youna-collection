import type { Metadata } from "next";
import Link from "next/link";
import { createColor, deleteColor, moveColor, updateColor } from "@/app/actions/admin-colors";
import { listColors } from "@/lib/admin/products";

export const metadata: Metadata = { title: "Couleurs" };
export const dynamic = "force-dynamic";

const field = "min-h-11 w-full min-w-0 border border-sand bg-white px-3 text-base outline-none focus:border-ink";
const swatch = "size-11 shrink-0 cursor-pointer border border-sand bg-white p-0.5";
const small = "flex min-h-10 min-w-10 items-center justify-center px-2 text-sm disabled:text-sand";

export default async function AdminColorsPage() {
  const colors = await listColors();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-xl">Couleurs</h1>
      <p className="-mt-3 text-sm text-muted">
        Votre liste de couleurs : sur une fiche produit, choisissez-en une dans le champ « Couleur » et sa pastille se remplit toute seule. Une couleur
        tapée à la main sur un produit est ajoutée ici automatiquement.
      </p>

      <ul className="flex flex-col divide-y divide-sand border-y border-sand bg-ivory">
        {colors.map((color, index) => (
          <li key={color.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <form action={updateColor} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="id" value={color.id} />
              <input type="color" name="hex" defaultValue={color.hex ?? "#cccccc"} aria-label={`Pastille de ${color.name}`} className={swatch} />
              <input name="name" defaultValue={color.name} aria-label="Nom de la couleur" className={field} maxLength={40} required />
              <button type="submit" className="min-h-11 shrink-0 border border-sand px-3 text-sm">
                Enregistrer
              </button>
            </form>
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <Link href={`/admin/produits?q=${encodeURIComponent(color.name)}`} className="px-2 text-muted underline underline-offset-4">
                {color.uses} variante{color.uses > 1 ? "s" : ""}
              </Link>
              <form action={moveColor}>
                <input type="hidden" name="id" value={color.id} />
                <input type="hidden" name="direction" value="up" />
                <button type="submit" disabled={index === 0} aria-label="Monter" className={small}>
                  ↑
                </button>
              </form>
              <form action={moveColor}>
                <input type="hidden" name="id" value={color.id} />
                <input type="hidden" name="direction" value="down" />
                <button type="submit" disabled={index === colors.length - 1} aria-label="Descendre" className={small}>
                  ↓
                </button>
              </form>
              <form action={deleteColor}>
                <input type="hidden" name="id" value={color.id} />
                <button type="submit" className={`${small} text-danger`}>
                  Retirer
                </button>
              </form>
            </div>
          </li>
        ))}
        {!colors.length ? <li className="p-4 text-sm text-muted">Aucune couleur pour l&apos;instant.</li> : null}
      </ul>
      <p className="-mt-3 text-xs text-muted">
        Renommer une couleur ou changer sa pastille met à jour les produits qui la portent. « Retirer » l&apos;enlève seulement de cette liste : les
        produits gardent leur couleur.
      </p>

      <form action={createColor} className="flex items-center gap-2">
        <input type="color" name="hex" defaultValue="#cccccc" aria-label="Pastille de la nouvelle couleur" className={swatch} />
        <input name="name" placeholder="Nouvelle couleur, ex. Olive" aria-label="Nouvelle couleur" className={field} maxLength={40} required />
        <button type="submit" className="min-h-11 shrink-0 bg-ink px-4 text-sm text-ivory">
          Ajouter
        </button>
      </form>
    </div>
  );
}

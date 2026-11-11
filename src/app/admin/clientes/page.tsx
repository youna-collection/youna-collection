import type { Metadata } from "next";
import Link from "next/link";
import { listCustomers } from "@/lib/admin/customers";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

const field = "min-h-11 border border-sand bg-white px-3 text-base outline-none focus:border-ink";
const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

const SORTS = {
  recentes: { label: "Dernière commande" },
  depenses: { label: "Montant dépensé" },
  commandes: { label: "Nombre de commandes" },
} as const;

const PAGE = 100;

export default async function CustomersPage({ searchParams }: PageProps<"/admin/clientes">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const kind = typeof params.type === "string" ? params.type : "";
  const sort = (typeof params.tri === "string" && params.tri in SORTS ? params.tri : "recentes") as keyof typeof SORTS;
  const page = Math.max(1, Number(params.page) || 1);

  const all = await listCustomers();
  const filtered = all
    .filter((c) => {
      if (kind === "compte" && !c.has_account) return false;
      if (kind === "invitee" && c.has_account) return false;
      if (kind === "fideles" && c.orders_count < 2) return false;
      if (kind === "sans-commande" && c.orders_count > 0) return false;
      if (q && ![c.email, c.first_name, c.last_name, c.phone].join(" ").toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "depenses") return b.spent_cents - a.spent_cents;
      if (sort === "commandes") return b.orders_count - a.orders_count || b.spent_cents - a.spent_cents;
      const da = a.last_order_at ?? a.account_created_at ?? "";
      const db = b.last_order_at ?? b.account_created_at ?? "";
      return db.localeCompare(da);
    });
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);
  const withOrders = all.filter((c) => c.orders_count > 0);
  const loyal = withOrders.filter((c) => c.orders_count > 1).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl">Clientes</h1>
        <a href="/admin/clientes/export" className="flex min-h-11 items-center border border-ink px-4 text-sm">
          Exporter (tableur CSV)
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1 border border-sand bg-ivory p-3">
          <span className="text-xs text-muted">Clientes</span>
          <span className="text-xl">{all.length}</span>
        </div>
        <div className="flex flex-col gap-1 border border-sand bg-ivory p-3">
          <span className="text-xs text-muted">Avec un compte</span>
          <span className="text-xl">{all.filter((c) => c.has_account).length}</span>
        </div>
        <div className="flex flex-col gap-1 border border-sand bg-ivory p-3">
          <span className="text-xs text-muted">Ont commandé</span>
          <span className="text-xl">{withOrders.length}</span>
        </div>
        <div className="flex flex-col gap-1 border border-sand bg-ivory p-3">
          <span className="text-xs text-muted">Fidèles (2 commandes ou +)</span>
          <span className="text-xl">{loyal}</span>
        </div>
      </div>

      <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input type="search" name="q" defaultValue={q} placeholder="Nom, e-mail ou téléphone…" className={field} aria-label="Rechercher" />
        <select name="type" defaultValue={kind} className={field} aria-label="Type">
          <option value="">Toutes</option>
          <option value="compte">Avec un compte</option>
          <option value="invitee">Sans compte</option>
          <option value="fideles">Fidèles</option>
          <option value="sans-commande">Inscrites sans commande</option>
        </select>
        <select name="tri" defaultValue={sort} className={field} aria-label="Trier par">
          {Object.entries(SORTS).map(([value, s]) => (
            <option key={value} value={value}>
              Tri : {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className="min-h-11 border border-ink px-4 text-sm">
          Afficher
        </button>
      </form>

      <p className="text-sm text-muted">
        {filtered.length} cliente{filtered.length > 1 ? "s" : ""}
      </p>

      <ul className="flex flex-col divide-y divide-sand border-y border-sand bg-ivory">
        {shown.map((c) => {
          const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
          return (
            <li key={c.email}>
              <Link
                href={`/admin/commandes?statut=toutes&q=${encodeURIComponent(c.email)}`}
                className="flex flex-col gap-1 p-3 hover:bg-white sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate">{name || c.email}</span>
                  <span className="truncate text-xs text-muted">
                    {name ? c.email : ""}
                    {c.phone ? `${name ? " · " : ""}${c.phone}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:justify-end">
                  <span>
                    {c.orders_count} commande{c.orders_count > 1 ? "s" : ""}
                  </span>
                  <span>{formatPrice(c.spent_cents)}</span>
                  <span className="text-xs text-muted">
                    {c.last_order_at ? `dernière le ${date.format(new Date(c.last_order_at))}` : "aucune commande"}
                  </span>
                  <span className={`px-1.5 py-0.5 text-[11px] ${c.has_account ? "bg-ink/10" : "bg-sand/60 text-muted"}`}>
                    {c.has_account ? "Compte" : "Invitée"}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
        {!shown.length ? <li className="p-4 text-sm text-muted">Aucune cliente ne correspond.</li> : null}
      </ul>

      {filtered.length > PAGE ? (
        <nav aria-label="Pages" className="flex justify-between text-sm">
          {page > 1 ? (
            <Link href={`/admin/clientes?${new URLSearchParams({ q, type: kind, tri: sort, page: String(page - 1) })}`} className="underline">
              ← Précédentes
            </Link>
          ) : (
            <span />
          )}
          {page * PAGE < filtered.length ? (
            <Link href={`/admin/clientes?${new URLSearchParams({ q, type: kind, tri: sort, page: String(page + 1) })}`} className="underline">
              Suivantes →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

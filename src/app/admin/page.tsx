import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { countOrdersByStatus } from "@/lib/admin/orders";
import { listAdminProducts } from "@/lib/admin/products";
import { countTicketsToHandle } from "@/lib/admin/support";
import { getStats, periodRange } from "@/lib/admin/stats";
import { getShopStatus } from "@/lib/shop-status";
import { formatPrice } from "@/lib/format";
import { RevenueChart } from "@/components/admin/revenue-chart";

export const metadata: Metadata = { title: "Accueil" };
export const dynamic = "force-dynamic";

/** Une tuile du tableau de bord : un liseré de couleur à gauche dit ce qu'elle surveille, le chiffre reste en couleur de texte. */
function Tile({
  href,
  label,
  value,
  detail,
  tone,
  alert = false,
}: {
  href: string;
  label: string;
  value: string | number;
  detail?: string;
  tone: "gold" | "sky" | "warning" | "danger" | "success";
  alert?: boolean;
}) {
  const stripe = { gold: "border-l-gold", sky: "border-l-sky", warning: "border-l-warning", danger: "border-l-danger", success: "border-l-success" }[tone];
  const dot = { gold: "bg-gold", sky: "bg-sky", warning: "bg-warning", danger: "bg-danger", success: "bg-success" }[tone];
  return (
    <Link
      href={href}
      className={`flex flex-col gap-1 border border-l-4 p-4 transition-colors hover:border-ink ${stripe} ${alert ? "border-ink bg-white" : "border-sand bg-ivory"}`}
    >
      <span className="flex items-center gap-2 text-sm text-muted">
        <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
        {label}
      </span>
      <span className="text-2xl">{value}</span>
      {detail ? <span className="text-xs text-muted">{detail}</span> : null}
    </Link>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export default async function AdminHome() {
  const week = periodRange("7j");
  const [profile, products, orders, stats, status, tickets] = await Promise.all([
    getCurrentProfile(),
    listAdminProducts(),
    countOrdersByStatus(),
    getStats(week.from, week.to, "day"),
    getShopStatus(),
    countTicketsToHandle(),
  ]);
  const today = stats.series.at(-1);
  const variants = products.filter((p) => p.status === "active").flatMap((p) => p.variants.filter((v) => v.is_active && v.track_stock));
  const soldOut = variants.filter((v) => v.stock - v.reserved <= 0).length;
  const low = variants.filter((v) => v.stock - v.reserved > 0 && v.stock - v.reserved <= v.low_stock_threshold).length;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl">Bonjour{profile?.first_name ? ` ${profile.first_name}` : ""}</h1>
      {status.maintenance ? (
        <Link href="/admin/parametres#gel" className="border border-danger bg-white p-3 text-sm text-danger">
          La boutique est gelée : les clientes voient la page d&apos;attente. Rouvrir →
        </Link>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          href="/admin/statistiques?periode=7j"
          label="Aujourd'hui"
          value={formatPrice(today?.net_cents ?? 0)}
          detail={plural(today?.orders ?? 0, "commande")}
          tone="gold"
        />
        <Tile
          href="/admin/statistiques?periode=7j"
          label="7 derniers jours"
          value={formatPrice(stats.totals.net_cents)}
          detail={plural(stats.totals.orders, "commande")}
          tone="gold"
        />
        <Tile href="/admin/commandes" label="À préparer" value={orders.paid ?? 0} detail="commandes payées" tone="sky" alert={Boolean(orders.paid)} />
        <Tile href="/admin/sav" label="SAV" value={tickets} detail={tickets ? "en attente de réponse" : "rien en attente"} tone="success" alert={tickets > 0} />
      </div>

      <section className="flex flex-col gap-3 border border-sand bg-ivory p-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base">Ventes des 7 derniers jours</h2>
          <Link href="/admin/statistiques" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            Toutes les statistiques
          </Link>
        </div>
        <RevenueChart points={stats.series} bucket="day" />
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile href="/admin/commandes?statut=preparation" label="En préparation" value={orders.preparing ?? 0} tone="sky" />
        <Tile href="/admin/stock?filtre=bas" label="Stock bas" value={low} detail={low ? "à réassortir bientôt" : "tout va bien"} tone="warning" alert={low > 0} />
        <Tile
          href="/admin/stock?filtre=epuise"
          label="Couleurs épuisées"
          value={soldOut}
          detail={soldOut ? "invisibles à l'achat" : "aucune"}
          tone="danger"
          alert={soldOut > 0}
        />
      </div>
      <p className="text-sm text-muted">{products.length} produits au catalogue.</p>
    </div>
  );
}

import "server-only";
import { createClient } from "../supabase/server";

export type StatsPoint = { date: string; orders: number; net_cents: number };

export type Stats = {
  totals: {
    orders: number;
    gross_cents: number;
    refunded_cents: number;
    net_cents: number;
    shipping_cents: number;
    discount_cents: number;
    items: number;
    cancelled: number;
  };
  series: StatsPoint[];
  by_source: { source: "web" | "in_person" | "shopify_import"; orders: number; net_cents: number }[];
  by_carrier: { carrier: string | null; orders: number }[];
  top_products: { name: string; quantity: number; revenue_cents: number }[];
  top_variants: { name: string; variant: string | null; quantity: number }[];
  promos: { code: string; orders: number; discount_cents: number }[];
  new_accounts: number;
  returning_customers: number;
  customers: number;
};

export const PERIODS = {
  "7j": { label: "7 jours", days: 7, bucket: "day" },
  "30j": { label: "30 jours", days: 30, bucket: "day" },
  "90j": { label: "3 mois", days: 90, bucket: "week" },
  "12m": { label: "12 mois", days: 365, bucket: "month" },
  // Couvre aussi les ventes reprises de l'ancien site Shopify (depuis septembre 2025).
  "24m": { label: "2 ans", days: 730, bucket: "month" },
} as const;

export type PeriodKey = keyof typeof PERIODS;

/** Minuit à Paris, il y a `days - 1` jours : la période inclut aujourd'hui. */
function parisMidnight(daysAgo: number) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = parts.split("-").map(Number);
  // Décalage de Paris à cette date (heure d'hiver/été).
  const guess = new Date(Date.UTC(y, m - 1, d - daysAgo));
  const offset = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Paris" })).getTime() - new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess.getTime() - offset);
}

export function periodRange(key: PeriodKey) {
  const p = PERIODS[key];
  const from = p.bucket === "month" ? firstOfMonthMonthsAgo(Math.round(p.days / 30.4) - 1) : parisMidnight(p.days - 1);
  const to = new Date(Date.now() + 60_000);
  const length = to.getTime() - from.getTime();
  return { from, to, previousFrom: new Date(from.getTime() - length), previousTo: from, bucket: p.bucket };
}

function firstOfMonthMonthsAgo(months: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(new Date());
  const [y, m] = parts.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1 - months, 1));
  const offset = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Paris" })).getTime() - new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess.getTime() - offset);
}

export async function getStats(from: Date, to: Date, bucket: "day" | "week" | "month"): Promise<Stats> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_stats", { p_from: from.toISOString(), p_to: to.toISOString(), p_bucket: bucket });
  if (error) throw new Error(`Statistiques : ${error.message}`);
  return data as Stats;
}

/** Variation en % (null si la période précédente est vide). */
export function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

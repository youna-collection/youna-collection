import "server-only";
import type { TicketSummary } from "../support";
import { createClient } from "../supabase/server";

/** Demandes SAV lues par l'admin, avec sa session (règles RLS : elle seule voit tout). */

export const SUPPORT_FILTERS = [
  { value: "a-traiter", label: "À traiter" },
  { value: "en-cours", label: "En cours" },
  { value: "toutes", label: "Toutes" },
] as const;
export type SupportFilter = (typeof SUPPORT_FILTERS)[number]["value"];

const SELECT = "id, number, type, status, email, created_at, last_message_at, last_author, order:orders!inner ( order_number, shipping_address )";
const PAGE = 50;

export async function listAdminTickets({ filter, page = 1 }: { filter: SupportFilter; page?: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("support_tickets")
    .select(SELECT, { count: "exact" })
    .order("last_message_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  // À traiter : la cliente a écrit en dernier. En cours : pas encore résolue.
  if (filter === "a-traiter") query = query.eq("last_author", "customer").neq("status", "closed");
  if (filter === "en-cours") query = query.not("status", "in", "(resolved,closed)");
  const { data, count, error } = await query;
  if (error) throw new Error(`SAV : ${error.message}`);
  return { tickets: (data ?? []) as unknown as TicketSummary[], pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE)) };
}

/** Nombre de demandes qui attendent une réponse de la boutique (pastille du menu). */
export async function countTicketsToHandle(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("last_author", "customer")
    .neq("status", "closed");
  return count ?? 0;
}

export async function listOrderTickets(orderId: string): Promise<TicketSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("support_tickets").select(SELECT).eq("order_id", orderId).order("created_at", { ascending: false });
  return (data ?? []) as unknown as TicketSummary[];
}

import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "./auth";
import { siteUrl } from "./email/layout";
import { createAdminClient } from "./supabase/admin";
import type { TicketStatus, TicketType } from "./support-rules";
import { parseSupportToken, signSupportToken, verifySupportToken } from "./support-token";

/**
 * Accès au SAV. Les lectures et écritures passent par la clé serveur (les clientes sans compte
 * n'ont pas de session) : chaque fonction vérifie donc elle-même qui a le droit de voir quoi.
 * - avec compte : la commande doit appartenir à la cliente connectée ;
 * - sans compte : un lien signé, reçu à l'adresse de la commande, ouvre l'accès à cette commande.
 */

export const SUPPORT_COOKIE = "youna_sav";
export const SUPPORT_PHOTO_BUCKET = "support-photos";

function secret(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY doit être renseignée.");
  return key;
}

export type SupportOrder = {
  id: string;
  order_number: number;
  email: string;
  user_id: string | null;
  status: string;
  source: string;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  shipping_address: Record<string, string> | null;
  items: { id: string; product_name: string; variant_label: string | null; quantity: number }[];
};

const ORDER_SELECT =
  "id, order_number, email, user_id, status, source, created_at, shipped_at, delivered_at, shipping_address, items:order_items ( id, product_name, variant_label, quantity )";

async function loadOrder(filter: { id: string } | { order_number: number }): Promise<SupportOrder | null> {
  let query = createAdminClient().from("orders").select(ORDER_SELECT);
  query = "id" in filter ? query.eq("id", filter.id) : query.eq("order_number", filter.order_number);
  const { data } = await query.maybeSingle();
  const order = data as unknown as SupportOrder | null;
  // Une vente en boutique sans e-mail ne peut pas avoir de suivi en ligne.
  return order?.email ? order : null;
}

export type SupportAccess = { mode: "account"; userId: string; order: SupportOrder } | { mode: "guest"; order: SupportOrder };

/** Commande ouverte par le lien reçu par e-mail (cookie), si le lien est encore valable. */
export async function getGuestOrder(): Promise<SupportOrder | null> {
  const token = (await cookies()).get(SUPPORT_COOKIE)?.value;
  return token ? orderFromToken(token) : null;
}

export async function orderFromToken(token: string): Promise<SupportOrder | null> {
  const parsed = parseSupportToken(token);
  if (!parsed || parsed.exp * 1000 < Date.now()) return null;
  const order = await loadOrder({ id: parsed.orderId });
  return order && verifySupportToken(secret(), token, order) ? order : null;
}

/** Droit d'accès à une commande, par le compte connecté ou par le lien reçu par e-mail. */
export async function getOrderAccess(orderNumber: number): Promise<SupportAccess | null> {
  const user = await getCurrentUser();
  const order = await loadOrder({ order_number: orderNumber });
  if (!order) return null;
  if (user && order.user_id === user.id) return { mode: "account", userId: user.id, order };
  const guest = await getGuestOrder();
  if (guest && guest.id === order.id) return { mode: "guest", order };
  return null;
}

export function supportToken(order: { id: string; email: string }): string {
  return signSupportToken(secret(), order.id, order.email);
}

/** Lien à mettre dans les e-mails : l'espace client si la commande a un compte, sinon un lien signé. */
export function customerSupportLink(order: { id: string; email: string; user_id: string | null }, ticketNumber?: number): string {
  if (order.user_id) return siteUrl(ticketNumber ? `/compte/sav/${ticketNumber}` : "/compte/sav");
  const params = new URLSearchParams({ t: supportToken(order) });
  if (ticketNumber) params.set("demande", String(ticketNumber));
  return siteUrl(`/sav/lien?${params}`);
}

// --- Lectures -----------------------------------------------------------------------------

export type TicketSummary = {
  id: string;
  number: number;
  type: TicketType;
  status: TicketStatus;
  email: string;
  created_at: string;
  last_message_at: string;
  last_author: "customer" | "admin";
  order: { order_number: number; shipping_address: Record<string, string> | null };
};

const SUMMARY_SELECT = "id, number, type, status, email, created_at, last_message_at, last_author, order:orders!inner ( order_number, shipping_address )";

export async function listTicketsForUser(userId: string): Promise<TicketSummary[]> {
  const { data, error } = await createAdminClient()
    .from("support_tickets")
    .select(SUMMARY_SELECT)
    .eq("order.user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`SAV : ${error.message}`);
  return data as unknown as TicketSummary[];
}

export async function listTicketsForOrder(orderId: string): Promise<TicketSummary[]> {
  const { data, error } = await createAdminClient()
    .from("support_tickets")
    .select(SUMMARY_SELECT)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`SAV : ${error.message}`);
  return data as unknown as TicketSummary[];
}

export type TicketMessage = {
  id: string;
  author_role: "customer" | "admin";
  body: string;
  created_at: string;
  photos: { id: string; url: string }[];
};

export type TicketDetail = Omit<TicketSummary, "order"> & {
  subject: string;
  order: SupportOrder;
  items: { order_item_id: string; quantity: number; product_name: string; variant_label: string | null }[];
  messages: TicketMessage[];
};

/** Demande complète, avec des liens temporaires (1 h) vers les photos. Aucun contrôle d'accès ici. */
export async function loadTicket(number: number): Promise<TicketDetail | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("support_tickets")
    .select(
      `id, number, type, status, subject, email, created_at, last_message_at, last_author, order_id,
       items:support_ticket_items ( order_item_id, quantity, item:order_items ( product_name, variant_label ) ),
       messages:support_messages ( id, author_role, body, created_at, attachments:support_attachments ( id, path, created_at ) )`,
    )
    .eq("number", number)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as Omit<TicketDetail, "order" | "items" | "messages"> & {
    order_id: string;
    items: { order_item_id: string; quantity: number; item: { product_name: string; variant_label: string | null } | null }[];
    messages: { id: string; author_role: "customer" | "admin"; body: string; created_at: string; attachments: { id: string; path: string; created_at: string }[] }[];
  };
  const order = await loadOrder({ id: row.order_id });
  if (!order) return null;

  const paths = row.messages.flatMap((m) => m.attachments.map((a) => a.path));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await admin.storage.from(SUPPORT_PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const { items, messages } = row;
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    status: row.status,
    subject: row.subject,
    email: row.email,
    created_at: row.created_at,
    last_message_at: row.last_message_at,
    last_author: row.last_author,
    order,
    items: items.map((i) => ({ order_item_id: i.order_item_id, quantity: i.quantity, product_name: i.item?.product_name ?? "Article", variant_label: i.item?.variant_label ?? null })),
    messages: messages
      .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m) => ({
        id: m.id,
        author_role: m.author_role,
        body: m.body,
        created_at: m.created_at,
        photos: m.attachments
          .toSorted((a, b) => a.created_at.localeCompare(b.created_at))
          .flatMap((a) => (urls.has(a.path) ? [{ id: a.id, url: urls.get(a.path)! }] : [])),
      })),
  };
}

/** Demande vue par la cliente : par son compte, ou par le lien reçu pour cette commande. */
export async function getTicketForCustomer(number: number, mode: "account" | "guest"): Promise<TicketDetail | null> {
  const ticket = await loadTicket(number);
  if (!ticket) return null;
  if (mode === "account") {
    const user = await getCurrentUser();
    return user && ticket.order.user_id === user.id ? ticket : null;
  }
  const guest = await getGuestOrder();
  return guest && guest.id === ticket.order.id ? ticket : null;
}

/** Une demande encore ouverte pour cette commande (on y répond plutôt que d'en ouvrir une autre). */
export async function activeTicketNumber(orderId: string): Promise<number | null> {
  const { data } = await createAdminClient()
    .from("support_tickets")
    .select("number")
    .eq("order_id", orderId)
    .not("status", "in", "(resolved,closed)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.number as number | undefined) ?? null;
}

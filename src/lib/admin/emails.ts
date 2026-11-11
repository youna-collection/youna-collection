import "server-only";
import { createClient } from "../supabase/server";

/** Journal des e-mails, lu par l'admin (règles RLS : elle seule y a accès). */

export const EMAIL_KIND_LABELS: Record<string, string> = {
  order_confirmation: "Confirmation de commande",
  order_shipped: "Commande expédiée",
  order_refunded: "Remboursement",
  admin_new_order: "Alerte : nouvelle commande",
  admin_sold_out: "Alerte : rupture de stock",
  support_link: "SAV : lien d'accès",
  support_received: "SAV : demande reçue",
  support_update: "SAV : réponse ou mise à jour",
  admin_support_new: "Alerte : nouvelle demande SAV",
  admin_support_reply: "Alerte : réponse d'une cliente (SAV)",
  cart_reminder: "Rappel de panier",
};

export const EMAIL_STATUS_LABELS: Record<string, string> = {
  pending: "En cours",
  sent: "Envoyé",
  failed: "Échec",
  not_configured: "Non envoyé (Resend pas configuré)",
};

export type EmailRow = {
  id: string;
  kind: string;
  to_email: string;
  delivered_to: string | null;
  subject: string;
  status: string;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  order: { order_number: number } | null;
};

const SELECT = "id, kind, to_email, delivered_to, subject, status, error, created_at, sent_at, order:orders ( order_number )";
const PAGE = 50;

export async function listEmails({ orderId, page = 1 }: { orderId?: string; page?: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("email_log")
    .select(SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (orderId) query = query.eq("order_id", orderId);
  const { data, count } = await query;
  return { emails: (data ?? []) as unknown as EmailRow[], pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE)) };
}

export async function getEmail(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("email_log").select(`${SELECT}, html`).eq("id", id).maybeSingle();
  return data as unknown as (EmailRow & { html: string }) | null;
}

export type EmailSetup = { configured: boolean; real: boolean; shopEmail: string | null };

/** Réglage actuel des envois, pour l'afficher à l'admin (sans jamais montrer la clé). */
export function emailSetup(): EmailSetup {
  return {
    configured: Boolean(process.env.RESEND_API_KEY),
    real: process.env.EMAIL_ALLOW_REAL === "true",
    shopEmail: process.env.SHOP_EMAIL?.trim() || null,
  };
}

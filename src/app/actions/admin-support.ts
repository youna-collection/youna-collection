"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { notifyTicketUpdate } from "@/lib/email/support-emails";
import { MESSAGE_MAX, TICKET_STATUSES } from "@/lib/support-rules";
import { createClient } from "@/lib/supabase/server";

/** Réponses et changements d'état par l'admin. La base vérifie elle aussi le rôle admin. */

export type SupportActionResult = { ok: true; message: string } | { ok: false; error: string };

const schema = z.object({
  ticketId: z.uuid(),
  from: z.enum(TICKET_STATUSES),
  status: z.enum(TICKET_STATUSES),
  message: z.string().trim().max(MESSAGE_MAX, `Message trop long (${MESSAGE_MAX} caractères au plus).`),
  notify: z.boolean(),
});

export async function updateTicket(input: z.input<typeof schema>): Promise<SupportActionResult> {
  const profile = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Demande invalide." };
  const { ticketId, from, status, message, notify } = parsed.data;
  const statusChanged = status !== from;
  if (!message && !statusChanged) return { ok: false, error: "Écrivez une réponse ou changez l'état de la demande." };

  const supabase = await createClient();
  const { data: ticket } = await supabase.from("support_tickets").select("number, status").eq("id", ticketId).maybeSingle();
  if (!ticket) return { ok: false, error: "Demande introuvable." };
  if (ticket.status !== from) return { ok: false, error: "La demande a changé entre-temps (la cliente a peut-être répondu) : rechargez la page." };

  if (message) {
    const { error } = await supabase.from("support_messages").insert({ ticket_id: ticketId, author_id: profile.id, author_role: "admin", body: message });
    if (error) return { ok: false, error: "La réponse n'a pas pu être enregistrée." };
  }
  if (statusChanged) {
    const { error } = await supabase.from("support_tickets").update({ status }).eq("id", ticketId);
    if (error) return { ok: false, error: message ? "Réponse enregistrée, mais l'état n'a pas pu être changé." : "L'état n'a pas pu être changé." };
  }

  const number = ticket.number as number;
  if (notify) after(() => notifyTicketUpdate(number, { key: randomUUID(), message: message || null, statusChanged }));
  revalidatePath("/admin/sav");
  revalidatePath(`/admin/sav/${number}`);
  revalidatePath("/admin", "layout");
  return { ok: true, message: message ? (notify ? "Réponse envoyée à la cliente." : "Réponse enregistrée (sans e-mail).") : "État mis à jour." };
}

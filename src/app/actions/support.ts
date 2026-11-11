"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { ActionState } from "@/app/actions/auth";
import { notifyCustomerReply, notifyTicketCreated, sendSupportLink } from "@/lib/email/support-emails";
import { activeTicketNumber, getOrderAccess, getTicketForCustomer, SUPPORT_PHOTO_BUCKET } from "@/lib/support";
import { detectImageType, MAX_PHOTO_BYTES, MAX_PHOTOS, MESSAGE_MAX, TICKET_TYPE_LABELS, ticketTypeAvailability } from "@/lib/support-rules";
import { createAdminClient } from "@/lib/supabase/admin";

/** Demandes SAV des clientes, avec ou sans compte. Tout est revérifié ici, côté serveur. */

const error = (message: string): ActionState => ({ status: "error", message });

type Photo = { bytes: Uint8Array; type: "image/jpeg" | "image/png" | "image/webp" };

async function readPhotos(formData: FormData): Promise<Photo[] | string> {
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_PHOTOS) return `${MAX_PHOTOS} photos au maximum.`;
  const photos: Photo[] = [];
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) return "Une photo est trop lourde (5 Mo au maximum).";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type) return "Format de photo non pris en charge : utilisez des photos JPEG ou PNG.";
    photos.push({ bytes, type });
  }
  return photos;
}

async function storePhotos(ticketId: string, messageId: string, photos: Photo[]) {
  const admin = createAdminClient();
  for (const photo of photos) {
    const path = `${ticketId}/${randomUUID()}.${photo.type.split("/")[1].replace("jpeg", "jpg")}`;
    const { error: uploadError } = await admin.storage.from(SUPPORT_PHOTO_BUCKET).upload(path, photo.bytes, { contentType: photo.type });
    if (uploadError) throw new Error(`Photo : ${uploadError.message}`);
    const { error: rowError } = await admin
      .from("support_attachments")
      .insert({ message_id: messageId, path, content_type: photo.type, size_bytes: photo.bytes.length });
    if (rowError) throw new Error(`Photo : ${rowError.message}`);
  }
}

const messageSchema = z
  .string()
  .trim()
  .min(10, "Décrivez votre demande en quelques mots (10 caractères au moins).")
  .max(MESSAGE_MAX, `Votre message est trop long (${MESSAGE_MAX} caractères au plus).`);

const createSchema = z.object({
  orderNumber: z.coerce.number().int().positive(),
  type: z.enum(["return", "exchange", "complaint"], { message: "Choisissez le type de demande." }),
  message: messageSchema,
});

export async function createTicket(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse({ orderNumber: formData.get("orderNumber"), type: formData.get("type"), message: formData.get("message") });
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Demande invalide.");
  const { orderNumber, type, message } = parsed.data;

  const access = await getOrderAccess(orderNumber);
  if (!access) return error("Vous n'avez pas accès à cette commande. Reconnectez-vous ou redemandez un lien.");
  const { order } = access;
  const base = access.mode === "account" ? "/compte/sav" : "/sav/suivi";

  const availability = ticketTypeAvailability(order).find((a) => a.type === type);
  if (!availability?.allowed) return error(availability?.reason ?? "Ce type de demande n'est pas possible.");

  // Articles concernés : obligatoires pour un retour ou un échange.
  const items: { order_item_id: string; quantity: number }[] = [];
  for (const item of order.items) {
    const quantity = Number(formData.get(`qty_${item.id}`) ?? 0);
    if (formData.get(`item_${item.id}`) !== "on" || !Number.isInteger(quantity) || quantity < 1) continue;
    items.push({ order_item_id: item.id, quantity: Math.min(quantity, item.quantity) });
  }
  if (type !== "complaint" && !items.length) return error("Cochez le ou les articles concernés.");

  const photos = await readPhotos(formData);
  if (typeof photos === "string") return error(photos);

  const existing = await activeTicketNumber(order.id);
  if (existing) redirect(`${base}/${existing}?deja=1`);

  const admin = createAdminClient();
  const { data: ticket, error: ticketError } = await admin
    .from("support_tickets")
    .insert({ order_id: order.id, user_id: order.user_id, email: order.email, type, subject: `${TICKET_TYPE_LABELS[type]} — commande n° ${order.order_number}` })
    .select("id, number")
    .single();
  if (ticketError || !ticket) return error("Votre demande n'a pas pu être enregistrée. Merci de réessayer.");

  try {
    if (items.length) {
      const { error: itemsError } = await admin.from("support_ticket_items").insert(items.map((i) => ({ ...i, ticket_id: ticket.id })));
      if (itemsError) throw new Error(itemsError.message);
    }
    const { data: first, error: messageError } = await admin
      .from("support_messages")
      .insert({ ticket_id: ticket.id, author_role: "customer", author_id: access.mode === "account" ? access.userId : null, body: message })
      .select("id")
      .single();
    if (messageError || !first) throw new Error(messageError?.message ?? "message");
    await storePhotos(ticket.id, first.id as string, photos);
  } catch (cause) {
    console.error("SAV : demande annulée", cause instanceof Error ? cause.message : cause);
    await admin.from("support_tickets").delete().eq("id", ticket.id);
    return error("Votre demande n'a pas pu être enregistrée. Merci de réessayer.");
  }

  const number = ticket.number as number;
  after(() => notifyTicketCreated(number));
  revalidatePath("/admin/sav");
  redirect(`${base}/${number}?envoyee=1`);
}

const replySchema = z.object({
  ticketNumber: z.coerce.number().int().positive(),
  mode: z.enum(["account", "guest"]),
  message: z.string().trim().min(1, "Écrivez votre message.").max(MESSAGE_MAX, `Votre message est trop long (${MESSAGE_MAX} caractères au plus).`),
});

export async function replyToTicket(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = replySchema.safeParse({ ticketNumber: formData.get("ticketNumber"), mode: formData.get("mode"), message: formData.get("message") });
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Message invalide.");
  const { ticketNumber, mode, message } = parsed.data;

  const ticket = await getTicketForCustomer(ticketNumber, mode);
  if (!ticket) return error("Vous n'avez plus accès à cette demande. Reconnectez-vous ou redemandez un lien.");
  if (ticket.status === "closed") return error("Cette demande est fermée. Ouvrez une nouvelle demande si besoin.");

  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("support_messages")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticket.id)
    .eq("author_role", "customer")
    .gte("created_at", since);
  if ((count ?? 0) >= 6) return error("Vous avez envoyé beaucoup de messages : merci d'attendre notre réponse.");

  const photos = await readPhotos(formData);
  if (typeof photos === "string") return error(photos);

  const user = mode === "account" ? ticket.order.user_id : null;
  const { data: row, error: insertError } = await admin
    .from("support_messages")
    .insert({ ticket_id: ticket.id, author_role: "customer", author_id: user, body: message })
    .select("id")
    .single();
  if (insertError || !row) return error("Votre message n'a pas pu être envoyé. Merci de réessayer.");
  try {
    await storePhotos(ticket.id, row.id as string, photos);
  } catch (cause) {
    console.error("SAV : photos non enregistrées", cause instanceof Error ? cause.message : cause);
    return { status: "error", message: "Votre message est envoyé, mais les photos n'ont pas pu être ajoutées. Réessayez de les envoyer." };
  }

  const messageId = row.id as string;
  after(() => notifyCustomerReply(ticketNumber, messageId));
  revalidatePath(mode === "account" ? `/compte/sav/${ticketNumber}` : `/sav/suivi/${ticketNumber}`);
  revalidatePath("/admin/sav");
  return { status: "success", message: "Message envoyé." };
}

const linkSchema = z.object({
  orderNumber: z.coerce.number().int().positive().max(999_999_999),
  email: z.email().transform((v) => v.toLowerCase()),
});

/** Sans compte : on envoie un lien à l'adresse de la commande. La réponse est la même dans tous les cas. */
export async function requestSupportLink(_state: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = linkSchema.safeParse({ orderNumber: String(formData.get("orderNumber") ?? "").replace(/\D/g, ""), email: String(formData.get("email") ?? "").trim() });
  if (!parsed.success) return error("Vérifiez le numéro de commande et l'adresse e-mail.");
  const { data: order } = await createAdminClient()
    .from("orders")
    .select("id, order_number, email, user_id")
    .eq("order_number", parsed.data.orderNumber)
    .eq("email", parsed.data.email)
    .maybeSingle();
  if (order?.email) {
    const found = order as { id: string; order_number: number; email: string; user_id: string | null };
    after(() => sendSupportLink(found));
  }
  return {
    status: "success",
    message: "Si ce numéro correspond à une commande passée avec cette adresse, vous allez recevoir un e-mail avec votre lien (pensez à regarder dans les indésirables).",
  };
}

import "server-only";
import { customerSupportLink, loadTicket, type TicketDetail } from "../support";
import { sendEmail, shopEmail } from "./send";
import { adminSupportEmail, type EmailTicket, supportLinkEmail, supportReceivedEmail, supportUpdateEmail } from "./support-templates";

/** E-mails du SAV. Comme pour les commandes : jamais deux fois le même, et jamais bloquants. */

async function safely(label: string, task: () => Promise<unknown>) {
  try {
    await task();
  } catch (error) {
    console.error(`E-mails SAV (${label})`, error instanceof Error ? error.message : error);
  }
}

function toEmailTicket(t: TicketDetail): EmailTicket & { email: string } {
  return {
    number: t.number,
    type: t.type,
    status: t.status,
    order_number: t.order.order_number,
    first_name: t.order.shipping_address?.first_name?.trim() || null,
    email: t.email,
    items: t.items.map((i) => ({ quantity: i.quantity, label: `${i.product_name}${i.variant_label ? ` — ${i.variant_label}` : ""}` })),
  };
}

/** Lien d'accès sans compte : un seul par commande et par heure, pour éviter les abus. */
export async function sendSupportLink(order: { id: string; order_number: number; email: string; user_id: string | null }): Promise<void> {
  await safely("lien", async () => {
    const hour = new Date().toISOString().slice(0, 13);
    const email = supportLinkEmail(order.order_number, customerSupportLink({ ...order, user_id: null }));
    await sendEmail({ kind: "support_link", dedupeKey: `lien-sav:${order.id}:${hour}`, to: order.email, orderId: order.id, ...email });
  });
}

/** Nouvelle demande : accusé de réception à la cliente, alerte à la boutique. */
export async function notifyTicketCreated(ticketNumber: number): Promise<void> {
  await safely("nouvelle demande", async () => {
    const ticket = await loadTicket(ticketNumber);
    const first = ticket?.messages[0];
    if (!ticket || !first) return;
    const t = toEmailTicket(ticket);
    const link = customerSupportLink(ticket.order, ticket.number);
    await sendEmail({ kind: "support_received", dedupeKey: `sav-recue:${ticket.id}`, to: ticket.email, orderId: ticket.order.id, ...supportReceivedEmail(t, first.body, link) });
    const shop = shopEmail();
    if (shop) {
      await sendEmail({ kind: "admin_support_new", dedupeKey: `alerte-sav:${ticket.id}`, to: shop, orderId: ticket.order.id, ...adminSupportEmail(t, first.body, first.photos.length, "new") });
    }
  });
}

/** Réponse de la cliente : alerte à la boutique, au plus une par demande et par heure. */
export async function notifyCustomerReply(ticketNumber: number, messageId: string): Promise<void> {
  await safely("réponse cliente", async () => {
    const shop = shopEmail();
    const ticket = await loadTicket(ticketNumber);
    const message = ticket?.messages.find((m) => m.id === messageId);
    if (!shop || !ticket || !message) return;
    const hour = new Date().toISOString().slice(0, 13);
    await sendEmail({
      kind: "admin_support_reply",
      dedupeKey: `alerte-sav-reponse:${ticket.id}:${hour}`,
      to: shop,
      orderId: ticket.order.id,
      ...adminSupportEmail(toEmailTicket(ticket), message.body, message.photos.length, "reply"),
    });
  });
}

/** Réponse ou changement d'état par la boutique : un e-mail à la cliente. */
export async function notifyTicketUpdate(ticketNumber: number, update: { key: string; message: string | null; statusChanged: boolean }): Promise<void> {
  await safely("mise à jour", async () => {
    const ticket = await loadTicket(ticketNumber);
    if (!ticket) return;
    const link = customerSupportLink(ticket.order, ticket.number);
    await sendEmail({
      kind: "support_update",
      dedupeKey: `sav-maj:${update.key}`,
      to: ticket.email,
      orderId: ticket.order.id,
      ...supportUpdateEmail(toEmailTicket(ticket), update, link),
    });
  });
}

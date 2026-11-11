import Link from "next/link";
import type { SupportOrder, TicketDetail, TicketMessage, TicketSummary } from "@/lib/support";
import { ADMIN_TICKET_STATUS_LABELS, returnDeadline, TICKET_STATUS_LABELS, TICKET_TYPE_LABELS, type TicketStatus, ticketTypeAvailability } from "@/lib/support-rules";
import { formatDate } from "@/lib/order-display";
import { NewTicketForm, ReplyForm } from "./ticket-forms";

const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: "border-ink",
  in_progress: "border-ink",
  waiting_customer: "border-ink bg-ink text-ivory",
  resolved: "border-sand text-muted",
  closed: "border-sand text-muted",
};

export function TicketStatusBadge({ status, admin = false }: { status: TicketStatus; admin?: boolean }) {
  const labels = admin ? ADMIN_TICKET_STATUS_LABELS : TICKET_STATUS_LABELS;
  // Côté admin, c'est « Nouvelle » qui doit sauter aux yeux.
  const style = admin ? (status === "open" ? "border-ink bg-ink text-ivory" : status === "waiting_customer" ? "border-sand" : STATUS_STYLES[status]) : STATUS_STYLES[status];
  return <span className={`inline-flex items-center border px-2 py-0.5 text-xs whitespace-nowrap ${style}`}>{labels[status]}</span>;
}

export function TicketThread({ messages, viewer }: { messages: TicketMessage[]; viewer: "customer" | "admin" }) {
  return (
    <ol className="flex flex-col gap-4">
      {messages.map((m) => {
        const mine = m.author_role === viewer;
        const author = m.author_role === "admin" ? (viewer === "admin" ? "Vous" : "Youna Collection") : viewer === "admin" ? "Cliente" : "Vous";
        return (
          <li key={m.id} className={`flex flex-col gap-2 border p-4 text-sm ${mine ? "border-sand bg-white sm:ml-10" : "border-ink/30 bg-ivory sm:mr-10"}`}>
            <p className="text-xs text-muted">
              <span className="font-medium text-ink">{author}</span> · {dateTime.format(new Date(m.created_at))}
            </p>
            <p className="break-words whitespace-pre-line">{m.body}</p>
            {m.photos.length ? (
              <div className="flex flex-wrap gap-2">
                {m.photos.map((photo, i) => (
                  <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" className="block size-24 border border-sand bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element -- lien temporaire vers une photo privée */}
                    <img src={photo.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                  </a>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function itemLabel(i: { product_name: string; variant_label: string | null }) {
  return `${i.product_name}${i.variant_label ? ` — ${i.variant_label}` : ""}`;
}

/** Une demande vue par la cliente (avec compte ou par lien). */
export function CustomerTicketView({ ticket, mode, flash, backHref, backLabel }: { ticket: TicketDetail; mode: "account" | "guest"; flash?: "envoyee" | "deja"; backHref: string; backLabel: string }) {
  const orderHref = mode === "account" ? `/compte/commandes/${ticket.order.order_number}` : null;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href={backHref} className="text-xs tracking-widest text-muted uppercase hover:underline">
          ← {backLabel}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Demande n° {ticket.number}</h1>
          <TicketStatusBadge status={ticket.status} />
        </div>
        <p className="text-sm text-muted">
          {TICKET_TYPE_LABELS[ticket.type]} · commande{" "}
          {orderHref ? (
            <Link href={orderHref} className="underline underline-offset-4">
              n° {ticket.order.order_number}
            </Link>
          ) : (
            `n° ${ticket.order.order_number}`
          )}{" "}
          · ouverte le {formatDate(ticket.created_at)}
        </p>
      </div>

      {flash === "envoyee" ? (
        <p role="status" className="border border-ink p-4 text-sm">
          Votre demande est envoyée. Nous vous répondons par e-mail et ici même. Merci d&apos;attendre notre réponse avant de renvoyer un article.
        </p>
      ) : null}
      {flash === "deja" ? (
        <p role="status" className="border border-ink p-4 text-sm">
          Une demande est déjà en cours pour cette commande : écrivez-nous ci-dessous.
        </p>
      ) : null}

      {ticket.items.length ? (
        <section className="flex flex-col gap-2 text-sm">
          <h2 className="text-xs tracking-[0.2em] text-muted uppercase">Articles concernés</h2>
          <ul>
            {ticket.items.map((i) => (
              <li key={i.order_item_id}>
                {i.quantity} × {itemLabel(i)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs tracking-[0.2em] text-muted uppercase">Échanges</h2>
        <TicketThread messages={ticket.messages} viewer="customer" />
      </section>

      {ticket.status === "closed" ? (
        <p className="text-sm text-muted">Cette demande est fermée. Pour un nouveau souci, ouvrez une nouvelle demande.</p>
      ) : (
        <section className="flex flex-col gap-3 border-t border-sand pt-6">
          <ReplyForm ticketNumber={ticket.number} mode={mode} />
        </section>
      )}
    </div>
  );
}

/** Formulaire de nouvelle demande pour une commande, ou rappel de la demande déjà ouverte. */
export function NewTicketSection({ order, activeHref }: { order: SupportOrder; activeHref: string | null }) {
  if (activeHref) {
    return (
      <p className="border border-ink p-4 text-sm">
        Une demande est déjà en cours pour cette commande.{" "}
        <Link href={activeHref} className="underline underline-offset-4">
          Voir la demande et y répondre
        </Link>
      </p>
    );
  }
  const deadline = returnDeadline(order);
  const availability = ticketTypeAvailability(order);
  const canReturn = availability.some((a) => a.type === "return" && a.allowed);
  return (
    <div className="flex flex-col gap-4">
      {canReturn && deadline ? (
        <p className="text-sm text-muted">Retour ou échange possible jusqu&apos;au {formatDate(deadline)}.</p>
      ) : null}
      <NewTicketForm
        orderNumber={order.order_number}
        items={order.items.map((i) => ({ id: i.id, label: `${i.quantity} × ${itemLabel(i)}`, quantity: i.quantity }))}
        availability={availability}
      />
    </div>
  );
}

export function TicketList({ tickets, hrefFor }: { tickets: TicketSummary[]; hrefFor: (t: TicketSummary) => string }) {
  return (
    <ul className="flex flex-col divide-y divide-sand border-y border-sand">
      {tickets.map((t) => (
        <li key={t.id}>
          <Link href={hrefFor(t)} className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm hover:bg-paper">
            <span>
              Demande n° {t.number} · {TICKET_TYPE_LABELS[t.type]}
              <span className="block text-xs text-muted">
                Commande n° {t.order.order_number} · dernier message le {formatDate(t.last_message_at)}
              </span>
            </span>
            <TicketStatusBadge status={t.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

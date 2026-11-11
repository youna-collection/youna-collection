import Link from "next/link";
import { EMAIL_KIND_LABELS, EMAIL_STATUS_LABELS, type EmailRow, type EmailSetup } from "@/lib/admin/emails";

const dateTime = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/** Liste compacte d'e-mails, chacun ouvrant son aperçu. */
export function EmailList({ emails, showOrder = true }: { emails: EmailRow[]; showOrder?: boolean }) {
  if (!emails.length) return <p className="text-sm text-muted">Aucun e-mail pour l&apos;instant.</p>;
  return (
    <ul className="flex flex-col divide-y divide-sand border-y border-sand">
      {emails.map((e) => (
        <li key={e.id}>
          <Link href={`/admin/emails/${e.id}`} className="flex flex-col gap-0.5 py-3 hover:bg-white/60">
            <span className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm">{EMAIL_KIND_LABELS[e.kind] ?? e.kind}</span>
              <span className={`text-xs ${e.status === "sent" ? "text-success" : e.status === "failed" ? "text-danger" : "text-muted"}`}>
                {EMAIL_STATUS_LABELS[e.status] ?? e.status}
              </span>
            </span>
            <span className="text-xs break-all text-muted">
              {dateTime.format(new Date(e.created_at))} · à {e.to_email}
              {e.delivered_to ? ` (essai : reçu par ${e.delivered_to})` : ""}
              {showOrder && e.order ? ` · commande n° ${e.order.order_number}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Explique où partent les e-mails en ce moment. */
export function EmailSetupNotice({ setup }: { setup: EmailSetup }) {
  if (!setup.configured) {
    return (
      <p className="border border-ink p-3 text-sm">
        Les e-mails ne partent pas encore : la clé Resend n&apos;est pas configurée. Ils sont tout de même préparés et visibles dans le journal.
      </p>
    );
  }
  if (!setup.real) {
    return (
      <p className="border border-ink p-3 text-sm">
        Mode essai : tous les e-mails, y compris ceux destinés aux clientes, arrivent sur{" "}
        {setup.shopEmail ?? "l'adresse de la boutique (SHOP_EMAIL, à renseigner)"}. Aucune cliente ne reçoit rien tant que le site n&apos;est pas lancé.
      </p>
    );
  }
  return <p className="border border-success p-3 text-sm text-success">Les e-mails partent vers les clientes.</p>;
}

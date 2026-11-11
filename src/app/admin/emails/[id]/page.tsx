import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EMAIL_KIND_LABELS, EMAIL_STATUS_LABELS, getEmail } from "@/lib/admin/emails";

export const metadata: Metadata = { title: "E-mail" };
export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

export default async function EmailPage({ params }: PageProps<"/admin/emails/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const email = await getEmail(id);
  if (!email) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link href={email.order ? `/admin/commandes/${email.order.order_number}` : "/admin/emails"} className="text-sm text-muted hover:text-ink">
        ← {email.order ? `Commande n° ${email.order.order_number}` : "E-mails"}
      </Link>
      <h1 className="text-xl">{EMAIL_KIND_LABELS[email.kind] ?? email.kind}</h1>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted">Objet</dt>
        <dd>{email.subject}</dd>
        <dt className="text-muted">Destinataire</dt>
        <dd className="break-all">
          {email.to_email}
          {email.delivered_to ? ` (mode essai : reçu par ${email.delivered_to})` : ""}
        </dd>
        <dt className="text-muted">État</dt>
        <dd>
          {EMAIL_STATUS_LABELS[email.status] ?? email.status}
          {email.sent_at ? ` le ${dateTime.format(new Date(email.sent_at))}` : ` (préparé le ${dateTime.format(new Date(email.created_at))})`}
          {email.error ? <span className="block text-xs text-danger">{email.error}</span> : null}
        </dd>
      </dl>
      {/* Aperçu isolé : aucun script ne s'exécute. */}
      <iframe title="Aperçu de l'e-mail" srcDoc={email.html} sandbox="" className="h-[70vh] w-full border border-sand bg-white" />
    </div>
  );
}

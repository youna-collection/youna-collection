import type { Metadata } from "next";
import Link from "next/link";
import { EmailList, EmailSetupNotice } from "@/components/admin/email-list";
import { emailSetup, listEmails } from "@/lib/admin/emails";

export const metadata: Metadata = { title: "E-mails" };
export const dynamic = "force-dynamic";

export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const { emails, pageCount } = await listEmails({ page });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/parametres#emails" className="text-sm text-muted hover:text-ink">
          ← Paramètres
        </Link>
        <h1 className="text-xl">E-mails envoyés</h1>
      </div>
      <EmailSetupNotice setup={emailSetup()} />
      <EmailList emails={emails} />
      {pageCount > 1 ? (
        <nav aria-label="Pages" className="flex gap-4 text-sm">
          {page > 1 ? <Link href={`/admin/emails?page=${page - 1}`}>← Plus récents</Link> : null}
          {page < pageCount ? <Link href={`/admin/emails?page=${page + 1}`}>Plus anciens →</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}

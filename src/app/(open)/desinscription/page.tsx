import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribe } from "@/app/actions/reminders";
import { ActionForm } from "@/components/action-form";
import { verifyUnsubscribeToken } from "@/lib/reminder-rules";

export const metadata: Metadata = { title: "Désinscription", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Masque l'adresse (« ma•••@gmail.com ») : la page peut être ouverte par quelqu'un d'autre. */
function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}•••@${domain}`;
}

// La désinscription demande un clic : certaines messageries ouvrent les liens toutes seules pour les vérifier.
export default async function UnsubscribePage({ searchParams }: PageProps<"/desinscription">) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const secret = process.env.SUPABASE_SECRET_KEY;
  const email = secret ? verifyUnsubscribeToken(secret, token) : null;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-light tracking-[0.2em] uppercase">Rappels de panier</h1>
      {email ? (
        <>
          <p className="text-sm text-muted">
            Confirmez ci-dessous pour ne plus recevoir de rappel lorsque vous laissez des articles dans votre panier (adresse {maskEmail(email)}). Les
            e-mails liés à vos commandes (confirmation, expédition, service client) continueront d&apos;arriver normalement.
          </p>
          <ActionForm action={unsubscribe} submitLabel="Ne plus recevoir de rappel">
            <input type="hidden" name="t" value={token} />
          </ActionForm>
        </>
      ) : (
        <p role="status" className="border border-ink p-4 text-sm">
          Ce lien n&apos;est pas valable. Pour ne plus recevoir de rappel, répondez simplement à notre e-mail : nous vous désinscrirons.
        </p>
      )}
      <Link href="/" className="text-sm underline underline-offset-4">
        Retour à la boutique
      </Link>
    </main>
  );
}

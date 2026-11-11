import type { Metadata } from "next";
import Link from "next/link";
import { requestSupportLink } from "@/app/actions/support";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/auth-ui";
import { getCurrentUser } from "@/lib/auth";
import { getGuestOrder } from "@/lib/support";

export const metadata: Metadata = {
  title: "Service client",
  description: "Retour, échange ou réclamation sur une commande Youna Collection.",
};
export const dynamic = "force-dynamic";

export default async function SupportPage({ searchParams }: PageProps<"/sav">) {
  const { lien } = await searchParams;
  const [user, guestOrder] = await Promise.all([getCurrentUser(), getGuestOrder()]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-light tracking-[0.2em] uppercase">Service client</h1>
        <p className="text-sm text-muted">
          Retour, échange ou réclamation. Retours et échanges sont possibles pendant 14 jours après la réception du colis. Pour un souci (colis abîmé, article
          manquant ou défectueux…), écrivez-nous à tout moment.
        </p>
      </div>

      {lien === "expire" ? (
        <p role="status" className="border border-ink p-4 text-sm">
          Ce lien n&apos;est plus valable. Demandez-en un nouveau ci-dessous.
        </p>
      ) : null}

      {guestOrder ? (
        <Link href="/sav/suivi" className="flex min-h-12 items-center justify-center border border-ink px-4 text-sm">
          Reprendre : commande n° {guestOrder.order_number} →
        </Link>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm tracking-[0.2em] uppercase">Vous avez un compte</h2>
        <Link href={user ? "/compte/sav" : "/connexion?next=/compte/sav"} className="flex min-h-12 items-center justify-center bg-ink px-4 text-sm tracking-widest text-ivory uppercase">
          {user ? "Mon service client" : "Me connecter"}
        </Link>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm tracking-[0.2em] uppercase">Commande passée sans compte</h2>
        <p className="text-sm text-muted">Indiquez votre numéro de commande et l&apos;e-mail utilisé : nous vous envoyons un lien pour faire votre demande.</p>
        <ActionForm action={requestSupportLink} submitLabel="Recevoir mon lien" secondary>
          <Field label="Numéro de commande" name="orderNumber" inputMode="numeric" autoComplete="off" placeholder="Ex. 2045" required />
          <Field label="E-mail de la commande" name="email" type="email" autoComplete="email" required />
        </ActionForm>
      </section>
    </main>
  );
}

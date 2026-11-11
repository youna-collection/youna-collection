import type { Metadata } from "next";
import Link from "next/link";
import { deleteAccount } from "@/app/actions/account";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/auth-ui";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Supprimer mon compte" };
export const dynamic = "force-dynamic";

export default async function DeleteAccountPage() {
  const profile = await requireProfile("/compte/supprimer");

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Link href="/compte/profil" className="text-xs tracking-widest text-muted uppercase hover:underline">
        ← Mon profil
      </Link>
      <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Supprimer mon compte</h1>
      <div className="flex flex-col gap-3 text-sm leading-relaxed">
        <p>La suppression est définitive. Seront effacés :</p>
        <ul className="list-disc pl-5">
          <li>votre compte et votre mot de passe ;</li>
          <li>votre profil ({profile.email}) ;</li>
          <li>vos adresses, vos favoris et votre panier.</li>
        </ul>
        <p className="text-muted">
          Vos commandes passées et leurs factures sont conservées pendant 10 ans, comme la loi l&apos;impose pour la
          comptabilité. Elles ne seront plus rattachées à un compte.
        </p>
      </div>
      {profile.role === "admin" ? (
        <p className="border border-danger p-3 text-sm text-danger">Le compte administrateur ne peut pas être supprimé depuis le site.</p>
      ) : (
        <div className="border border-danger p-4">
          <ActionForm action={deleteAccount} submitLabel="Supprimer définitivement">
            <Field label="Pour confirmer, écrivez SUPPRIMER" name="confirmation" autoComplete="off" required />
          </ActionForm>
        </div>
      )}
    </div>
  );
}

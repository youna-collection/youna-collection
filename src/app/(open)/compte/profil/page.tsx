import type { Metadata } from "next";
import Link from "next/link";
import { updateProfile } from "@/app/actions/account";
import { updatePassword } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/auth-ui";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Mon profil" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await requireProfile("/compte/profil");

  return (
    <div className="flex max-w-xl flex-col gap-12">
      <section className="flex flex-col gap-6">
        <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Mon profil</h1>
        <ActionForm action={updateProfile} submitLabel="Enregistrer">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" name="first_name" autoComplete="given-name" defaultValue={profile.first_name ?? ""} maxLength={80} />
            <Field label="Nom" name="last_name" autoComplete="family-name" defaultValue={profile.last_name ?? ""} maxLength={80} />
          </div>
          <Field label="Téléphone" name="phone" type="tel" autoComplete="tel" defaultValue={profile.phone ?? ""} />
          <div className="flex flex-col gap-1 text-sm">
            E-mail
            <p className="min-h-12 border border-sand bg-paper px-3 py-3 text-base text-muted">{profile.email}</p>
            <p className="text-xs text-muted">Pour changer d&apos;adresse e-mail, contactez-nous.</p>
          </div>
        </ActionForm>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-sm tracking-[0.2em] uppercase">Changer de mot de passe</h2>
        <ActionForm action={updatePassword} submitLabel="Changer le mot de passe" secondary>
          <Field label="Nouveau mot de passe" name="password" type="password" autoComplete="new-password" minLength={8} required />
          <Field
            label="Confirmer le mot de passe"
            name="password_confirmation"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </ActionForm>
      </section>

      <section className="flex flex-col gap-3 border-t border-sand pt-8">
        <h2 className="text-sm tracking-[0.2em] uppercase">Supprimer mon compte</h2>
        <p className="text-sm text-muted">Vos données personnelles seront effacées définitivement.</p>
        <Link href="/compte/supprimer" className="self-start text-sm text-danger underline underline-offset-4">
          Supprimer mon compte
        </Link>
      </section>
    </div>
  );
}

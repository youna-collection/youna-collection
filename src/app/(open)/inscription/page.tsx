import type { Metadata } from "next";
import Link from "next/link";
import { signUp } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { AuthCard, Field } from "@/components/auth-ui";
import { safePath } from "@/lib/safe-path";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function SignUpPage({ searchParams }: PageProps<"/inscription">) {
  const params = await searchParams;
  const next = safePath(params.next);

  return (
    <AuthCard title="Créer un compte">
      <ActionForm action={signUp} submitLabel="Créer mon compte">
        <input type="hidden" name="next" value={next} />
        <Field label="Prénom" name="first_name" autoComplete="given-name" required />
        <Field label="Nom" name="last_name" autoComplete="family-name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field
          label="Mot de passe (8 caractères minimum)"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </ActionForm>
      <p className="text-xs text-muted">
        Vos données servent uniquement à gérer votre compte et vos commandes.{" "}
        <Link href="/confidentialite" className="underline">
          En savoir plus
        </Link>
      </p>

      <p className="text-center text-sm">
        Déjà un compte ?{" "}
        <Link href={`/connexion?next=${encodeURIComponent(next)}`} className="underline">
          Se connecter
        </Link>
      </p>
    </AuthCard>
  );
}

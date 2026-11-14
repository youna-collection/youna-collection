import type { Metadata } from "next";
import Link from "next/link";
import { sendMagicLink, signIn, signInWithGoogle } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { AuthCard, Divider, Field } from "@/components/auth-ui";
import { safePath } from "@/lib/safe-path";
import { isGoogleAuthEnabled } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Connexion" };

const ERRORS: Record<string, string> = {
  lien: "Ce lien n'est plus valide. Merci d'en demander un nouveau.",
  google: "La connexion avec Google a échoué. Merci de réessayer.",
};

export default async function LoginPage({ searchParams }: PageProps<"/connexion">) {
  const params = await searchParams;
  const next = safePath(params.next);
  const errorKey = typeof params.erreur === "string" ? params.erreur : "";
  const error = Object.hasOwn(ERRORS, errorKey) ? ERRORS[errorKey] : undefined;

  return (
    <AuthCard title="Connexion">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {params.raison === "commande" ? (
        <p className="border border-ink bg-white p-3 text-sm">
          Pour commander, connectez-vous ou créez votre compte en quelques secondes. Votre panier est gardé.
        </p>
      ) : null}

      <ActionForm action={signIn} submitLabel="Se connecter">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
        <Link href="/mot-de-passe-oublie" className="self-end text-sm underline">
          Mot de passe oublié ?
        </Link>
      </ActionForm>

      <Divider label="ou" />

      <ActionForm action={sendMagicLink} submitLabel="Recevoir un lien de connexion" secondary>
        <input type="hidden" name="next" value={next} />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
      </ActionForm>

      {isGoogleAuthEnabled ? (
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="min-h-12 w-full border border-ink px-6 text-sm tracking-widest uppercase">
            Continuer avec Google
          </button>
        </form>
      ) : null}

      <p className="text-center text-sm">
        Pas encore de compte ?{" "}
        <Link href={`/inscription?next=${encodeURIComponent(next)}`} className="underline">
          Créer un compte
        </Link>
      </p>
    </AuthCard>
  );
}

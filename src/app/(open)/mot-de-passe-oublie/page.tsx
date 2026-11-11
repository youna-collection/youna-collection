import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { AuthCard, Field } from "@/components/auth-ui";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Mot de passe oublié">
      <ActionForm action={requestPasswordReset} submitLabel="Recevoir le lien">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
      </ActionForm>
      <Link href="/connexion" className="text-center text-sm underline">
        Retour à la connexion
      </Link>
    </AuthCard>
  );
}

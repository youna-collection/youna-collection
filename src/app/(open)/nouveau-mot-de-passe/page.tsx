import type { Metadata } from "next";
import { updatePassword } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { AuthCard, Field } from "@/components/auth-ui";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Nouveau mot de passe" };
export const dynamic = "force-dynamic";

export default async function NewPasswordPage() {
  await requireProfile("/nouveau-mot-de-passe");

  return (
    <AuthCard title="Nouveau mot de passe">
      <ActionForm action={updatePassword} submitLabel="Enregistrer">
        <Field
          label="Nouveau mot de passe (8 caractères minimum)"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <Field
          label="Confirmer le mot de passe"
          name="password_confirmation"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </ActionForm>
    </AuthCard>
  );
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { setCartCountCookie } from "@/lib/cart";
import { safePath } from "@/lib/safe-path";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

const NOT_CONFIGURED: ActionState = {
  status: "error",
  message: "La connexion n'est pas encore activée sur ce site.",
};
const INVALID_EMAIL: ActionState = { status: "error", message: "Cette adresse email n'est pas valide." };
const TOO_MANY: ActionState = {
  status: "error",
  message: "Trop de tentatives. Merci de réessayer dans quelques minutes.",
};
const GENERIC_ERROR: ActionState = { status: "error", message: "Une erreur est survenue. Merci de réessayer." };

const email = z.email().transform((value) => value.toLowerCase());
const password = z.string().min(8).max(72);

async function siteOrigin(): Promise<string> {
  return process.env.NEXT_PUBLIC_SITE_URL ?? (await headers()).get("origin") ?? "";
}

function confirmUrl(origin: string, next: string): string {
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const parsed = z.object({ email, password: z.string().min(1) }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Merci de renseigner votre email et votre mot de passe." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.status === 429) return TOO_MANY;
    if (error.code === "email_not_confirmed") {
      return { status: "error", message: "Merci de confirmer votre email avec le lien reçu." };
    }
    return { status: "error", message: "Email ou mot de passe incorrect." };
  }

  redirect(safePath(formData.get("next")));
}

export async function signUp(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const parsed = z
    .object({
      first_name: z.string().trim().min(1).max(80),
      last_name: z.string().trim().min(1).max(80),
      email,
      password,
    })
    .safeParse({
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Merci de remplir tous les champs. Le mot de passe doit contenir au moins 8 caractères.",
    };
  }

  const { email: address, password: secret, ...profile } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: address,
    password: secret,
    options: {
      data: profile,
      emailRedirectTo: confirmUrl(await siteOrigin(), safePath(formData.get("next"))),
    },
  });

  if (error) {
    if (error.status === 429) return TOO_MANY;
    if (error.code === "weak_password") {
      return { status: "error", message: "Ce mot de passe est trop simple. Merci d'en choisir un autre." };
    }
    return GENERIC_ERROR;
  }

  if (data.session) {
    redirect(safePath(formData.get("next")));
  }

  // Message identique que l'adresse soit déjà connue ou non, pour ne rien révéler.
  return { status: "success", message: "Vérifiez votre boîte mail pour confirmer votre compte." };
}

export async function sendMagicLink(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return INVALID_EMAIL;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: confirmUrl(await siteOrigin(), safePath(formData.get("next"))) },
  });

  if (error?.status === 429) return TOO_MANY;
  return { status: "success", message: "Si l'adresse est valide, un lien de connexion vient de vous être envoyé." };
}

export async function requestPasswordReset(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return INVALID_EMAIL;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: confirmUrl(await siteOrigin(), "/nouveau-mot-de-passe"),
  });

  if (error?.status === 429) return TOO_MANY;
  return { status: "success", message: "Si un compte existe avec cette adresse, un email vient de lui être envoyé." };
}

export async function updatePassword(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const parsed = password.safeParse(formData.get("password"));
  if (!parsed.success) {
    return { status: "error", message: "Le mot de passe doit contenir au moins 8 caractères." };
  }
  if (parsed.data !== formData.get("password_confirmation")) {
    return { status: "error", message: "Les deux mots de passe ne sont pas identiques." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });

  if (error) {
    if (error.status === 429) return TOO_MANY;
    if (error.code === "same_password") {
      return { status: "error", message: "Merci de choisir un mot de passe différent de l'ancien." };
    }
    if (error.code === "weak_password") {
      return { status: "error", message: "Ce mot de passe est trop simple. Merci d'en choisir un autre." };
    }
    return GENERIC_ERROR;
  }

  redirect("/compte");
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured) redirect("/connexion");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: confirmUrl(await siteOrigin(), safePath(formData.get("next"))) },
  });

  if (error || !data.url) redirect("/connexion?erreur=google");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  // Le panier d'une cliente connectée reste dans son compte : l'icône repart à zéro.
  await setCartCountCookie(0);
  redirect("/");
}

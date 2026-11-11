"use server";

import type { ActionState } from "./auth";
import { unsubscribeEmail } from "@/lib/cart-reminders";
import { verifyUnsubscribeToken } from "@/lib/reminder-rules";

/** Bouton « Ne plus recevoir de rappel » de la page de désinscription. */
export async function unsubscribe(_: ActionState, formData: FormData): Promise<ActionState> {
  const secret = process.env.SUPABASE_SECRET_KEY;
  const token = formData.get("t");
  const email = secret && typeof token === "string" ? verifyUnsubscribeToken(secret, token) : null;
  if (!email) return { status: "error", message: "Ce lien n'est pas valable. Répondez simplement à notre e-mail : nous vous désinscrirons." };
  try {
    await unsubscribeEmail(email);
  } catch {
    return { status: "error", message: "Une erreur est survenue. Merci de réessayer." };
  }
  return { status: "success", message: "C'est fait : vous ne recevrez plus de rappel de panier." };
}

import "server-only";
import { createAdminClient } from "../supabase/admin";

/**
 * Envoi des e-mails par Resend, avec deux sécurités :
 * - chaque e-mail a une clé unique (dedupeKey) : il n'est jamais envoyé deux fois ;
 * - tant que EMAIL_ALLOW_REAL n'est pas à true, tout part vers l'adresse de la boutique
 *   (SHOP_EMAIL), jamais vers une cliente. On le passe à true au lancement.
 * Un e-mail qui échoue ne bloque jamais une commande : l'erreur est notée dans le journal.
 */

export type EmailInput = {
  kind: string;
  dedupeKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  orderId?: string | null;
  /** En-têtes en plus (ex. désinscription en un clic pour les relances). */
  headers?: Record<string, string>;
};

type Env = Partial<Record<"RESEND_API_KEY" | "EMAIL_FROM" | "SHOP_EMAIL" | "EMAIL_ALLOW_REAL", string>>;

export const DEFAULT_FROM = "Youna Collection <onboarding@resend.dev>";

/** À qui l'e-mail part vraiment, et avec quel objet. */
export function resolveDelivery(to: string, subject: string, env: Env) {
  const shop = env.SHOP_EMAIL?.trim().toLowerCase() || null;
  if (env.EMAIL_ALLOW_REAL === "true") return { deliverTo: to, subject, reason: null };
  if (!shop) return { deliverTo: null, subject, reason: "SHOP_EMAIL manquant (mode essai)" };
  if (to.toLowerCase() === shop) return { deliverTo: shop, subject, reason: null };
  return { deliverTo: shop, subject: `[Essai pour ${to}] ${subject}`, reason: null };
}

export function shopEmail(): string | null {
  return process.env.SHOP_EMAIL?.trim().toLowerCase() || null;
}

export async function sendEmail(input: EmailInput): Promise<"sent" | "skipped" | "failed" | "not_configured"> {
  try {
    const admin = createAdminClient();
    const to = input.to.trim().toLowerCase();

    // Réserve la clé : si l'e-mail est déjà parti, on s'arrête là.
    const { data: existing } = await admin.from("email_log").select("id, status, attempts").eq("dedupe_key", input.dedupeKey).maybeSingle();
    if (existing?.status === "sent") return "skipped";
    let logId = existing?.id as string | undefined;
    if (!logId) {
      const { data: created, error } = await admin
        .from("email_log")
        .insert({ kind: input.kind, dedupe_key: input.dedupeKey, to_email: to, subject: input.subject, html: input.html, order_id: input.orderId ?? null })
        .select("id")
        .single();
      // Clé prise entre-temps par un envoi simultané : c'est lui qui envoie.
      if (error) return "skipped";
      logId = created.id as string;
    }

    const env = process.env as Env;
    const delivery = resolveDelivery(to, input.subject, env);
    if (!env.RESEND_API_KEY || !delivery.deliverTo) {
      await admin
        .from("email_log")
        .update({ status: "not_configured", error: delivery.reason ?? "RESEND_API_KEY manquante" })
        .eq("id", logId);
      return "not_configured";
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        // Resend ignore un second envoi avec la même clé (sécurité en plus du journal).
        "Idempotency-Key": input.dedupeKey,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM?.trim() || DEFAULT_FROM,
        to: [delivery.deliverTo],
        subject: delivery.subject,
        html: input.html,
        text: input.text,
        ...(shopEmail() ? { reply_to: shopEmail() } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    const ok = response.ok && body.id;
    await admin
      .from("email_log")
      .update({
        status: ok ? "sent" : "failed",
        provider_id: body.id ?? null,
        error: ok ? null : `${response.status} ${body.message ?? ""}`.trim().slice(0, 500),
        delivered_to: delivery.deliverTo === to ? null : delivery.deliverTo,
        subject: delivery.subject,
        attempts: ((existing?.attempts as number | undefined) ?? 0) + 1,
        sent_at: ok ? new Date().toISOString() : null,
      })
      .eq("id", logId);
    return ok ? "sent" : "failed";
  } catch (error) {
    console.error("E-mail non envoyé", input.kind, error instanceof Error ? error.message : error);
    return "failed";
  }
}

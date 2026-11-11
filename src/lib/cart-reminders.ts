import "server-only";
import { fetchVariants, loadCartItems } from "./cart";
import { evaluateCart } from "./cart-rules";
import { siteUrl } from "./email/layout";
import { cartReminderEmail } from "./email/reminder-templates";
import { sendEmail } from "./email/send";
import { newestActivity, oldestActivity, reminderStep, signResumeToken, signUnsubscribeToken } from "./reminder-rules";
import { createAdminClient } from "./supabase/admin";

/**
 * Relance des paniers abandonnés, lancée chaque heure par la tâche planifiée Netlify.
 * Une relance ne part que si : la cliente l'a demandé (case cochée), elle ne s'est pas désinscrite,
 * le panier n'est pas vide, et elle n'a pas commandé depuis. Chaque relance est d'abord « réservée »
 * dans le panier : deux passages simultanés n'envoient jamais deux fois la même.
 */

const BATCH = 100;

export type ReminderRun = {
  status: "ok" | "disabled" | "maintenance";
  checked: number;
  sent: number;
  skipped: Record<string, number>;
};

type CartRow = {
  id: string;
  email: string;
  user_id: string | null;
  reminder_count: number;
  last_activity_at: string;
  last_reminder_at: string | null;
};

const secret = () => {
  const value = process.env.SUPABASE_SECRET_KEY;
  if (!value) throw new Error("SUPABASE_SECRET_KEY manquante");
  return value;
};

export const unsubscribeUrl = (email: string) => siteUrl(`/desinscription?t=${signUnsubscribeToken(secret(), email)}`);
export const resumeUrl = (cartId: string, now = Date.now()) => siteUrl(`/panier/reprendre?t=${signResumeToken(secret(), cartId, now)}`);

function groupLabels(labels: string[]) {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].map(([label, n]) => (n > 1 ? `${n} × ${label}` : label));
}

export async function runCartReminders(now = Date.now()): Promise<ReminderRun> {
  const admin = createAdminClient();
  const run: ReminderRun = { status: "ok", checked: 0, sent: 0, skipped: {} };
  const skip = (reason: string) => {
    run.skipped[reason] = (run.skipped[reason] ?? 0) + 1;
  };

  const { data: settings } = await admin
    .from("shop_settings")
    .select("cart_reminders_enabled, cart_reminder_second, maintenance_enabled")
    .eq("id", 1)
    .maybeSingle<{ cart_reminders_enabled: boolean; cart_reminder_second: boolean; maintenance_enabled: boolean }>();
  if (settings && !settings.cart_reminders_enabled) return { ...run, status: "disabled" };
  // Boutique gelée : inutile d'inviter à commander.
  if (settings?.maintenance_enabled) return { ...run, status: "maintenance" };
  const second = settings?.cart_reminder_second ?? true;

  const { data, error } = await admin
    .from("carts")
    .select("id, email, user_id, reminder_count, last_activity_at, last_reminder_at")
    .eq("status", "active")
    .eq("reminder_consent", true)
    .not("email", "is", null)
    .lt("reminder_count", second ? 2 : 1)
    .gte("last_activity_at", oldestActivity(now))
    .lte("last_activity_at", newestActivity(now))
    .order("last_activity_at")
    .limit(BATCH);
  if (error) throw new Error(`Paniers : ${error.message}`);
  const carts = (data ?? []) as CartRow[];
  run.checked = carts.length;
  if (!carts.length) return run;

  const { data: suppressed } = await admin
    .from("email_suppressions")
    .select("email")
    .in("email", [...new Set(carts.map((c) => c.email))]);
  const unsubscribed = new Set((suppressed ?? []).map((s) => s.email as string));

  for (const cart of carts) {
    try {
      const step = reminderStep(cart, now, { second });
      if (!step) {
        skip("pas encore l'heure");
        continue;
      }
      if (unsubscribed.has(cart.email)) {
        skip("désinscrite");
        continue;
      }

      // A-t-elle commandé depuis (avec la même adresse ou le même compte) ?
      const since = cart.last_activity_at;
      const byEmail = await admin.from("orders").select("id").eq("email", cart.email).gte("paid_at", since).limit(1);
      const byUser = cart.user_id ? await admin.from("orders").select("id").eq("user_id", cart.user_id).gte("paid_at", since).limit(1) : null;
      if (byEmail.data?.length || byUser?.data?.length) {
        skip("a commandé depuis");
        continue;
      }

      const items = await loadCartItems(cart.id);
      const variants = await fetchVariants(items.flatMap((i) => [i.variantId, ...i.veilIds]));
      const lines = evaluateCart(items, variants).lines.filter((l) => !l.problem && l.variant);
      if (!lines.length) {
        skip("panier vide ou épuisé");
        continue;
      }

      // Réserve la relance : si un autre passage l'a déjà prise, on s'arrête.
      const { data: claimed } = await admin
        .from("carts")
        .update({ reminder_count: step, last_reminder_at: new Date(now).toISOString() })
        .eq("id", cart.id)
        .eq("reminder_count", step - 1)
        .eq("status", "active")
        .select("id");
      if (!claimed?.length) {
        skip("déjà relancée");
        continue;
      }

      let firstName: string | null = null;
      if (cart.user_id) {
        const { data: profile } = await admin.from("profiles").select("first_name").eq("id", cart.user_id).maybeSingle();
        firstName = (profile?.first_name as string | null)?.trim() || null;
      }

      const unsubscribe = unsubscribeUrl(cart.email);
      const email = cartReminderEmail({
        step,
        firstName,
        lines: lines.map((l) => ({
          label: `${l.quantity} × ${l.productName}${l.label ? ` — ${l.label}` : ""}`,
          detail: l.components.length ? `Voiles : ${groupLabels(l.components.map((c) => c.label)).join(", ")}` : null,
          totalCents: l.lineTotalCents,
        })),
        subtotalCents: lines.reduce((total, l) => total + l.lineTotalCents, 0),
        resumeUrl: resumeUrl(cart.id, now),
        unsubscribeUrl: unsubscribe,
      });
      const result = await sendEmail({
        kind: "cart_reminder",
        dedupeKey: `relance-panier:${cart.id}:${step}`,
        to: cart.email,
        ...email,
        headers: {
          "List-Unsubscribe": `<${unsubscribe.replace("/desinscription?", "/api/desinscription?")}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      if (result === "failed") skip("échec d'envoi");
      else run.sent += 1;
    } catch (error) {
      console.error("Relance panier", cart.id, error instanceof Error ? error.message : error);
      skip("erreur");
    }
  }
  return run;
}

/** Désinscription : plus aucune relance pour cette adresse, et les paniers en cours sont mis à jour. */
export async function unsubscribeEmail(email: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("email_suppressions").upsert({ email, reason: "unsubscribe" }, { onConflict: "email", ignoreDuplicates: true });
  if (error) throw new Error(`Désinscription : ${error.message}`);
  await admin.from("carts").update({ reminder_consent: false }).eq("email", email).eq("status", "active");
}

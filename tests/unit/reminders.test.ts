import { describe, expect, it } from "vitest";
import { cartReminderEmail } from "@/lib/email/reminder-templates";
import { reminderStep, signResumeToken, signUnsubscribeToken, verifyResumeToken, verifyUnsubscribeToken } from "@/lib/reminder-rules";

const hour = 60 * 60 * 1000;
const now = Date.parse("2026-11-20T12:00:00Z");
const ago = (hours: number) => new Date(now - hours * hour).toISOString();
const secret = "secret-de-test-assez-long-pour-hmac";

describe("quand relancer un panier", () => {
  it("attend 24 h d'inactivité pour la première relance", () => {
    expect(reminderStep({ reminder_count: 0, last_activity_at: ago(23), last_reminder_at: null }, now)).toBeNull();
    expect(reminderStep({ reminder_count: 0, last_activity_at: ago(24), last_reminder_at: null }, now)).toBe(1);
  });

  it("envoie la deuxième au bout de 3 jours, au moins 24 h après la première", () => {
    expect(reminderStep({ reminder_count: 1, last_activity_at: ago(48), last_reminder_at: ago(24) }, now)).toBeNull();
    expect(reminderStep({ reminder_count: 1, last_activity_at: ago(72), last_reminder_at: ago(48) }, now)).toBe(2);
    // Relance tardive (tâche arrêtée un moment) : on laisse 24 h entre les deux.
    expect(reminderStep({ reminder_count: 1, last_activity_at: ago(80), last_reminder_at: ago(3) }, now)).toBeNull();
  });

  it("n'envoie pas la deuxième si elle est désactivée", () => {
    expect(reminderStep({ reminder_count: 1, last_activity_at: ago(72), last_reminder_at: ago(48) }, now, { second: false })).toBeNull();
  });

  it("ne dépasse jamais deux relances", () => {
    expect(reminderStep({ reminder_count: 2, last_activity_at: ago(100), last_reminder_at: ago(30) }, now)).toBeNull();
  });

  it("ignore les paniers abandonnés depuis plus de 7 jours", () => {
    expect(reminderStep({ reminder_count: 0, last_activity_at: ago(7 * 24 + 1), last_reminder_at: null }, now)).toBeNull();
  });
});

describe("liens signés", () => {
  it("désinscription : retrouve l'adresse, refuse un lien modifié", () => {
    const token = signUnsubscribeToken(secret, "Cliente@Example.com");
    expect(verifyUnsubscribeToken(secret, token)).toBe("cliente@example.com");
    const [, sig] = token.split(".");
    const other = `${Buffer.from("autre@example.com").toString("base64url")}.${sig}`;
    expect(verifyUnsubscribeToken(secret, other)).toBeNull();
    expect(verifyUnsubscribeToken("autre-secret-de-test-assez-long", token)).toBeNull();
    expect(verifyUnsubscribeToken(secret, "n'importe quoi")).toBeNull();
  });

  it("reprise du panier : valable 14 jours, pour ce panier seulement", () => {
    const cartId = "11111111-2222-3333-4444-555555555555";
    const token = signResumeToken(secret, cartId, now);
    expect(verifyResumeToken(secret, token, now)).toBe(cartId);
    expect(verifyResumeToken(secret, token, now + 15 * 24 * hour)).toBeNull();
    expect(verifyResumeToken(secret, token.replace("1111", "9999"), now)).toBeNull();
  });
});

describe("e-mail de rappel", () => {
  const input = {
    firstName: "Inès",
    lines: [{ label: "2 × Liquid Jersey — Noir", totalCents: 2398 }],
    subtotalCents: 2398,
    resumeUrl: "http://localhost:3000/panier/reprendre?t=abc",
    unsubscribeUrl: "http://localhost:3000/desinscription?t=xyz",
  };

  it("contient le panier, le lien pour le reprendre et la désinscription", () => {
    const email = cartReminderEmail({ ...input, step: 1 });
    expect(email.subject).toBe("Votre panier vous attend");
    expect(email.html).toContain("Liquid Jersey");
    expect(email.html).toContain("23,98");
    expect(email.html).toContain(input.resumeUrl);
    expect(email.html).toContain(input.unsubscribeUrl);
    expect(email.text).toContain(`Ne plus recevoir de rappel : ${input.unsubscribeUrl}`);
  });

  it("reste informatif : ni code promo, ni réduction", () => {
    for (const step of [1, 2] as const) {
      const { html, text } = cartReminderEmail({ ...input, step });
      expect(`${html} ${text}`).not.toMatch(/promo|réduction|remise|-\s?\d+ ?%/i);
    }
    expect(cartReminderEmail({ ...input, step: 2 }).text).toContain("dernier message");
  });

  it("échappe le prénom", () => {
    expect(cartReminderEmail({ ...input, firstName: "<b>Inès</b>", step: 1 }).html).not.toContain("<b>Inès</b>");
  });
});

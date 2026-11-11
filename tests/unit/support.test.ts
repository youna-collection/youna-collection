import { describe, expect, it } from "vitest";
import { adminSupportEmail, supportReceivedEmail, supportUpdateEmail } from "@/lib/email/support-templates";
import { detectImageType, returnDeadline, ticketTypeAvailability } from "@/lib/support-rules";
import { signSupportToken, verifySupportToken } from "@/lib/support-token";

const day = 24 * 60 * 60 * 1000;
const delivered = "2026-11-01T10:00:00Z";

describe("délai de retour", () => {
  it("compte 14 jours après la livraison", () => {
    expect(returnDeadline({ status: "delivered", shipped_at: "2026-10-29T10:00:00Z", delivered_at: delivered })?.toISOString()).toBe("2026-11-15T10:00:00.000Z");
  });

  it("sans date de livraison, ajoute 7 jours d'acheminement à l'expédition", () => {
    expect(returnDeadline({ status: "shipped", shipped_at: delivered, delivered_at: null })?.toISOString()).toBe("2026-11-22T10:00:00.000Z");
    expect(returnDeadline({ status: "paid", shipped_at: null, delivered_at: null })).toBeNull();
  });

  it("laisse toujours la réclamation ouverte", () => {
    const order = { status: "delivered", shipped_at: null, delivered_at: delivered };
    const inTime = ticketTypeAvailability(order, new Date(Date.parse(delivered) + 13 * day));
    expect(inTime.every((a) => a.allowed)).toBe(true);

    const late = ticketTypeAvailability(order, new Date(Date.parse(delivered) + 15 * day));
    expect(late.filter((a) => a.allowed).map((a) => a.type)).toEqual(["complaint"]);
    expect(late.find((a) => a.type === "return")?.reason).toContain("14 jours");

    const notShipped = ticketTypeAvailability({ status: "paid", shipped_at: null, delivered_at: null });
    expect(notShipped.filter((a) => a.allowed).map((a) => a.type)).toEqual(["complaint"]);
    const refunded = ticketTypeAvailability({ status: "refunded", shipped_at: null, delivered_at: delivered });
    expect(refunded.filter((a) => a.allowed).map((a) => a.type)).toEqual(["complaint"]);
  });
});

describe("lien d'accès sans compte", () => {
  const order = { id: "0b7e2a4c-1f3d-4c5b-9a8e-123456789abc", email: "alice@test.fr" };
  const now = Date.parse("2026-11-11T12:00:00Z");

  it("ouvre la bonne commande pendant 30 jours", () => {
    const token = signSupportToken("secret", order.id, order.email, now);
    expect(verifySupportToken("secret", token, order, now + 29 * day)).toBe(true);
    expect(verifySupportToken("secret", token, order, now + 31 * day)).toBe(false);
  });

  it("refuse un lien modifié, une autre commande ou une autre clé", () => {
    const token = signSupportToken("secret", order.id, order.email, now);
    expect(verifySupportToken("autre", token, order, now)).toBe(false);
    expect(verifySupportToken("secret", token, { ...order, email: "bob@test.fr" }, now)).toBe(false);
    expect(verifySupportToken("secret", token, { ...order, id: "0b7e2a4c-1f3d-4c5b-9a8e-123456789abd" }, now)).toBe(false);
    const [id, exp, sig] = token.split(".");
    expect(verifySupportToken("secret", `${id}.${Number(exp) + 999999}.${sig}`, order, now)).toBe(false);
    expect(verifySupportToken("secret", "n'importe quoi", order, now)).toBe(false);
  });
});

describe("photos", () => {
  it("reconnaît le format au contenu du fichier", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageType(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("image/webp");
    expect(detectImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("e-mails du SAV", () => {
  const ticket = {
    number: 104,
    type: "exchange" as const,
    status: "waiting_customer" as const,
    order_number: 2042,
    first_name: "Alice",
    email: "alice@test.fr",
    items: [{ quantity: 1, label: "Liquid Jersey — Noir" }],
  };

  it("accuse réception avec les articles et le message échappé", () => {
    const email = supportReceivedEmail(ticket, "Je voudrais <b>Misty</b>\nmerci", "https://youna.fr/sav/lien?t=x");
    expect(email.subject).toBe("Demande n° 104 bien reçue");
    expect(email.html).toContain("1 × Liquid Jersey — Noir");
    expect(email.html).toContain("Je voudrais &lt;b&gt;Misty&lt;/b&gt;<br>merci");
    expect(email.html).toContain("https://youna.fr/sav/lien?t=x");
  });

  it("annonce la réponse de la boutique ou le nouvel état", () => {
    expect(supportUpdateEmail(ticket, { message: "Bonjour", statusChanged: false }, "x").subject).toBe("Réponse à votre demande n° 104");
    const status = supportUpdateEmail({ ...ticket, status: "resolved" }, { message: null, statusChanged: true }, "x");
    expect(status.subject).toBe("Demande n° 104 : résolue");
  });

  it("alerte la boutique avec le lien vers l'admin", () => {
    const email = adminSupportEmail(ticket, "Bonjour", 2, "new");
    expect(email.subject).toBe("SAV : échange — commande n° 2042");
    expect(email.html).toContain("/admin/sav/104");
    expect(email.html).toContain("2 photos jointes");
  });
});

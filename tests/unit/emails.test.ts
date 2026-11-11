import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveDelivery } = await import("@/lib/email/send");
const { adminSoldOutEmail, orderConfirmationEmail, orderRefundedEmail, orderShippedEmail } = await import("@/lib/email/templates");
const { trackingLink } = await import("@/lib/order-display");
const { csvCell } = await import("@/lib/csv");

const order = {
  id: "o1",
  order_number: 2042,
  email: "alice@test.fr",
  user_id: null,
  carrier: "mondial_relay",
  subtotal_cents: 3597,
  discount_cents: 360,
  shipping_cents: 540,
  total_cents: 3777,
  promo_code: "BIENVENUE",
  shipping_address: { first_name: "Alice <b>", last_name: "Martin", country: "FR" },
  relay_point: { id: "012345", name: "Tabac du Centre", address1: "1 rue Haute", postal_code: "75001", city: "Paris" },
  tracking_number: "12345678",
  tracking_url: null,
  items: [
    { product_name: "Liquid Jersey", variant_label: "Noir", quantity: 2, line_total_cents: 2398, components: [] },
    { product_name: "Bouquet Youna", variant_label: "S", quantity: 1, line_total_cents: 1199, components: [{ label: "Noir" }, { label: "Noir" }, { label: "Misty" }] },
  ],
};

describe("garde-fou d'envoi", () => {
  it("en mode essai, tout part vers la boutique, avec la vraie destinataire dans l'objet", () => {
    expect(resolveDelivery("alice@test.fr", "Merci", { SHOP_EMAIL: "Boutique@Test.fr" })).toEqual({
      deliverTo: "boutique@test.fr",
      subject: "[Essai pour alice@test.fr] Merci",
      reason: null,
    });
    expect(resolveDelivery("boutique@test.fr", "Alerte", { SHOP_EMAIL: "boutique@test.fr" }).subject).toBe("Alerte");
  });

  it("n'envoie rien en mode essai sans adresse de boutique", () => {
    expect(resolveDelivery("alice@test.fr", "Merci", {}).deliverTo).toBeNull();
    expect(resolveDelivery("alice@test.fr", "Merci", { EMAIL_ALLOW_REAL: "1", SHOP_EMAIL: "b@t.fr" }).deliverTo).toBe("b@t.fr");
  });

  it("n'écrit aux clientes qu'une fois le lancement autorisé", () => {
    expect(resolveDelivery("alice@test.fr", "Merci", { EMAIL_ALLOW_REAL: "true", SHOP_EMAIL: "b@t.fr" })).toEqual({
      deliverTo: "alice@test.fr",
      subject: "Merci",
      reason: null,
    });
  });
});

describe("contenu des e-mails", () => {
  it("confirme la commande avec les articles, les voiles, les totaux et le point relais", () => {
    const email = orderConfirmationEmail(order);
    expect(email.subject).toBe("Merci pour votre commande n° 2042");
    for (const text of ["2 × Liquid Jersey — Noir", "Voiles : 2 × Noir, Misty", "Réduction (BIENVENUE)", "Tabac du Centre", "75001 Paris"]) {
      expect(email.html).toContain(text);
      expect(email.text).toContain(text);
    }
    expect(email.html).toContain("/inscription");
  });

  it("échappe ce que la cliente a saisi", () => {
    const email = orderConfirmationEmail(order);
    expect(email.html).toContain("Bonjour Alice &lt;b&gt;,");
    expect(email.html).not.toContain("Alice <b>");
  });

  it("donne le lien de suivi Mondial Relay avec le code postal du point relais", () => {
    const email = orderShippedEmail(order);
    expect(email.subject).toBe("Votre commande n° 2042 est en route");
    expect(email.html).toContain("https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=12345678&amp;codePostal=75001");
    expect(orderShippedEmail({ ...order, carrier: "pickup", relay_point: null }).subject).toBe("Votre commande n° 2042 est prête");
  });

  it("annonce un remboursement par carte avec le délai bancaire", () => {
    const email = orderRefundedEmail(order, { amount_cents: 1199, method: "stripe" });
    expect(email.subject).toContain("Remboursement de 11,99");
    expect(email.text).toContain("5 à 10 jours");
  });

  it("alerte la boutique en cas de rupture", () => {
    expect(adminSoldOutEmail([{ label: "Liquid Jersey — Noir" }]).subject).toBe("Épuisé : Liquid Jersey — Noir");
    expect(adminSoldOutEmail([{ label: "A" }, { label: "B" }]).subject).toBe("2 articles épuisés");
  });
});

describe("suivi et exports", () => {
  it("construit les liens de suivi", () => {
    expect(trackingLink("colissimo", "6A123", null)).toBe("https://www.laposte.fr/outils/suivre-vos-envois?code=6A123");
    expect(trackingLink("mondial_relay", "123", null, null)).toBeNull();
    expect(trackingLink("mondial_relay", "123", "https://exemple.fr/x", "75001")).toBe("https://exemple.fr/x");
  });

  it("neutralise les formules dans les CSV", () => {
    expect(csvCell("=SOMME(A1)")).toBe(`"'=SOMME(A1)"`);
    expect(csvCell('Dit "bonjour"')).toBe(`"Dit ""bonjour"""`);
    expect(csvCell(null)).toBe(`""`);
  });
});

import { describe, expect, it, vi } from "vitest";
import { normalizeSocialLink } from "@/lib/social";

vi.mock("server-only", () => ({}));
const { toShopInfo, DEFAULT_CONTACT_EMAIL } = await import("@/lib/shop-info");

describe("liens des réseaux sociaux", () => {
  it("transforme un pseudo en lien de profil", () => {
    expect(normalizeSocialLink("instagram", "@youna.collection")).toEqual({ url: "https://www.instagram.com/youna.collection/" });
    expect(normalizeSocialLink("tiktok", "younacollection")).toEqual({ url: "https://www.tiktok.com/@younacollection" });
    expect(normalizeSocialLink("snapchat", " @youna_83 ")).toEqual({ url: "https://www.snapchat.com/add/youna_83" });
  });

  it("garde un lien complet du bon réseau, en https", () => {
    expect(normalizeSocialLink("instagram", "https://www.instagram.com/younacollection?igsh=abc")).toEqual({
      url: "https://www.instagram.com/younacollection?igsh=abc",
    });
    expect(normalizeSocialLink("tiktok", "http://tiktok.com/@youna")).toEqual({ url: "https://tiktok.com/@youna" });
    expect(normalizeSocialLink("instagram", "instagram.com/youna")).toEqual({ url: "https://instagram.com/youna" });
  });

  it("vide = pas d'icône", () => {
    expect(normalizeSocialLink("snapchat", "  ")).toEqual({ url: null });
  });

  it("refuse un lien d'un autre site", () => {
    expect(normalizeSocialLink("instagram", "https://www.tiktok.com/@youna")).toHaveProperty("error");
    expect(normalizeSocialLink("tiktok", "https://evil.example/tiktok.com")).toHaveProperty("error");
    expect(normalizeSocialLink("snapchat", "javascript:alert(1)")).toHaveProperty("error");
  });
});

describe("informations publiques de la boutique", () => {
  it("utilise l'adresse de contact par défaut et le nom commercial par défaut", () => {
    const info = toShopInfo(null);
    expect(info.contactEmail).toBe(DEFAULT_CONTACT_EMAIL);
    expect(info.tradeName).toBe("Youna Collection");
    expect(info.address).toEqual([]);
    expect(info.mediator).toBeNull();
  });

  it("assemble l'adresse et les réseaux", () => {
    const info = toShopInfo({
      legal_name: "Jeanne Exemple",
      address_line1: "1 rue des Fleurs",
      postal_code: "83000",
      city: "Toulon",
      country: "France",
      email: "contact@exemple.fr",
      instagram_url: "https://www.instagram.com/x/",
      mediator_name: "Médiateur X",
    });
    expect(info.address).toEqual(["1 rue des Fleurs", "83000 Toulon", "France"]);
    expect(info.contactEmail).toBe("contact@exemple.fr");
    expect(info.social).toEqual({ instagram: "https://www.instagram.com/x/", tiktok: null, snapchat: null });
    expect(info.mediator).toEqual({ name: "Médiateur X", url: null });
  });
});

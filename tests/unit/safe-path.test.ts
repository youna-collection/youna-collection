import { describe, expect, it } from "vitest";
import { safePath } from "@/lib/safe-path";

describe("safePath", () => {
  it("accepte un chemin interne", () => {
    expect(safePath("/compte/commandes?page=2")).toBe("/compte/commandes?page=2");
  });

  it.each([
    "https://site-pirate.example",
    "//site-pirate.example",
    "/\\site-pirate.example",
    "/\t/site-pirate.example",
    "javascript:alert(1)",
    "compte",
    "",
    null,
    undefined,
    42,
  ])("refuse %j", (value) => {
    expect(safePath(value)).toBe("/compte");
  });

  it("utilise la valeur de repli fournie", () => {
    expect(safePath("//x.example", "/")).toBe("/");
  });
});

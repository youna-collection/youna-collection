import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { actingAs, createTestDb, rows } from "./harness";

const admin = "00000000-0000-4000-8000-0000000000ad";
const alice = "00000000-0000-4000-8000-0000000000a1";
const product = "10000000-0000-4000-8000-000000000001";
const scheduled = "10000000-0000-4000-8000-000000000002";
const noir = "20000000-0000-4000-8000-000000000001";
const ivory = "20000000-0000-4000-8000-000000000002";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${admin}', 'admin@test.fr', now()), ('${alice}', 'alice@test.fr', now());
    update public.profiles set role = 'admin' where id = '${admin}';
    insert into public.products (id, slug, name, status, bouquet_eligible) values
      ('${product}', 'liquid-jersey', 'Liquid Jersey', 'active', true);
    insert into public.products (id, slug, name, status, publish_at) values
      ('${scheduled}', 'nouveaute', 'Nouveauté', 'active', now() + interval '2 days');
    insert into public.product_variants (id, product_id, sku, color_name, price_cents, stock, position) values
      ('${noir}', '${product}', 'lj-noir', 'Noir', 1199, 5, 0),
      ('${ivory}', '${product}', 'lj-ivory', 'Ivory', 1199, 2, 1);
    insert into public.product_images (product_id, variant_id, storage_path, position) values
      ('${product}', '${noir}', 'a/noir.webp', 0),
      ('${product}', null, 'a/commune.webp', 1);
  `);
});

describe("publication programmée", () => {
  it("cache un produit dont la date de publication n'est pas arrivée", async () => {
    const visible = await actingAs(db, "anon", (tx) => rows<{ slug: string }>(tx, "select slug from public.products order by slug"));
    expect(visible.map((p) => p.slug)).toEqual(["liquid-jersey"]);
  });

  it("le montre à l'admin", async () => {
    const all = await actingAs(db, { userId: admin }, (tx) => rows(tx, "select slug from public.products"));
    expect(all).toHaveLength(2);
  });

  it("le montre une fois la date passée", async () => {
    await db.exec(`update public.products set publish_at = now() - interval '1 minute' where id = '${scheduled}'`);
    const visible = await actingAs(db, "anon", (tx) => rows(tx, "select slug from public.products"));
    expect(visible).toHaveLength(2);
    await db.exec(`update public.products set publish_at = now() + interval '2 days' where id = '${scheduled}'`);
  });
});

describe("duplication", () => {
  it("copie la fiche en brouillon, sans stock ni SKU, avec ses photos", async () => {
    const result = await actingAs(db, { userId: admin }, async (tx) => {
      const [{ id }] = await rows<{ id: string }>(tx, "select public.duplicate_product($1) as id", [product]);
      const [copy] = await rows<{ slug: string; name: string; status: string; bouquet_eligible: boolean }>(
        tx,
        "select slug, name, status, bouquet_eligible from public.products where id = $1",
        [id],
      );
      const variants = await rows<{ id: string; color_name: string; sku: string | null; stock: number }>(
        tx,
        "select id, color_name, sku, stock from public.product_variants where product_id = $1 order by position",
        [id],
      );
      const images = await rows<{ storage_path: string; variant_id: string | null }>(
        tx,
        "select storage_path, variant_id from public.product_images where product_id = $1 order by position",
        [id],
      );
      const [{ id: second }] = await rows<{ id: string }>(tx, "select public.duplicate_product($1) as id", [product]);
      const [{ slug: secondSlug }] = await rows<{ slug: string }>(tx, "select slug from public.products where id = $1", [second]);
      return { copy, variants, images, secondSlug };
    });

    expect(result.copy).toEqual({ slug: "liquid-jersey-copie", name: "Liquid Jersey (copie)", status: "draft", bouquet_eligible: true });
    expect(result.variants.map((v) => [v.color_name, v.sku, v.stock])).toEqual([
      ["Noir", null, 0],
      ["Ivory", null, 0],
    ]);
    expect(result.images.map((i) => i.storage_path)).toEqual(["a/noir.webp", "a/commune.webp"]);
    // La photo de la couleur Noir est rattachée au Noir de la copie, pas à l'original.
    expect(result.images[0].variant_id).toBe(result.variants[0].id);
    expect(result.images[1].variant_id).toBeNull();
    expect(result.secondSlug).toBe("liquid-jersey-copie-2");
  });

  it("est refusée à une cliente", async () => {
    await expect(
      actingAs(db, { userId: alice }, (tx) => rows(tx, "select public.duplicate_product($1)", [product])),
    ).rejects.toThrow(/reserve_admin/);
  });
});

describe("ajustement du stock", () => {
  it("ajoute au stock existant et note le motif dans l'historique", async () => {
    const result = await actingAs(db, { userId: admin }, async (tx) => {
      const [{ stock }] = await rows<{ stock: number }>(tx, "select public.adjust_stock($1, 3, 'manual', 'Réassort') as stock", [noir]);
      const [movement] = await rows<{ delta: number; reason: string; note: string; created_by: string }>(
        tx,
        "select delta, reason, note, created_by from public.stock_movements where variant_id = $1 order by created_at desc limit 1",
        [noir],
      );
      return { stock, movement };
    });
    expect(result).toEqual({ stock: 8, movement: { delta: 3, reason: "manual", note: "Réassort", created_by: admin } });
  });

  it("refuse un stock négatif", async () => {
    await expect(
      actingAs(db, { userId: admin }, (tx) => rows(tx, "select public.adjust_stock($1, -10)", [ivory])),
    ).rejects.toThrow(/stock_negatif/);
  });

  it("est refusé à une cliente", async () => {
    await expect(
      actingAs(db, { userId: alice }, (tx) => rows(tx, "select public.adjust_stock($1, 5)", [ivory])),
    ).rejects.toThrow(/reserve_admin/);
  });

  it("empêche de supprimer une couleur qui a un historique de stock", async () => {
    await expect(
      actingAs(db, { userId: admin }, (tx) => rows(tx, "delete from public.product_variants where id = $1", [noir])),
    ).rejects.toThrow(/foreign key/);
  });
});

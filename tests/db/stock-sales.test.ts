import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { actingAs, createTestDb, rows } from "./harness";

const admin = "00000000-0000-4000-8000-0000000000ad";
const alice = "00000000-0000-4000-8000-0000000000a1";
const voile = "10000000-0000-4000-8000-000000000001";
const bouquet = "10000000-0000-4000-8000-000000000002";
const noir = "20000000-0000-4000-8000-000000000001"; // stock 5
const ivory = "20000000-0000-4000-8000-000000000002"; // stock 1
const bouquetS = "20000000-0000-4000-8000-000000000003"; // stock 2
const surMesure = "20000000-0000-4000-8000-000000000004"; // sans suivi

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${admin}', 'admin@test.fr', now()), ('${alice}', 'alice@test.fr', now());
    update public.profiles set role = 'admin' where id = '${admin}';
    insert into public.products (id, slug, name, status, kind) values
      ('${voile}', 'liquid-jersey', 'Liquid Jersey', 'active', 'standard'),
      ('${bouquet}', 'bouquet', 'Bouquet Youna', 'active', 'bouquet');
    insert into public.product_variants (id, product_id, color_name, size, price_cents, stock, track_stock, bouquet_veil_count) values
      ('${noir}', '${voile}', 'Noir', null, 1199, 5, true, null),
      ('${ivory}', '${voile}', 'Ivory', null, 1199, 1, true, null),
      ('${bouquetS}', '${bouquet}', null, 'S', 3699, 2, true, 3),
      ('${surMesure}', '${voile}', 'Sur mesure', null, 2000, 0, false, null);
  `);
});

const items = (list: { variant_id: string; quantity: number; unit_price_cents: number; components?: string[] }[]) => JSON.stringify(list);

const sell = (tx: Transaction, list: Parameters<typeof items>[0], options: { payment?: string; email?: string | null; discount?: number } = {}) =>
  rows<{ id: string }>(tx, "select public.record_in_person_sale($1::jsonb, $2, $3, 'Fatima', $4) as id", [
    items(list),
    options.payment ?? "especes",
    options.email ?? null,
    options.discount ?? 0,
  ]).then((r) => r[0].id);

const stock = async (tx: Transaction, id: string) =>
  (await rows<{ stock: number }>(tx, "select stock from public.product_variants where id = $1", [id]))[0].stock;

describe("vente en boutique", () => {
  it("crée une commande livrée, sans e-mail, et retire le stock (voiles des bouquets compris)", async () => {
    const result = await actingAs(db, { userId: admin }, async (tx) => {
      const id = await sell(
        tx,
        [
          { variant_id: noir, quantity: 2, unit_price_cents: 1000 },
          { variant_id: bouquetS, quantity: 1, unit_price_cents: 3699, components: [noir, noir, ivory] },
          { variant_id: surMesure, quantity: 1, unit_price_cents: 2000 },
        ],
        { payment: "carte", discount: 199 },
      );
      const [order] = await rows<Record<string, unknown>>(
        tx,
        "select status, source, email, payment_method, subtotal_cents, discount_cents, total_cents, shipping_address from public.orders where id = $1",
        [id],
      );
      const lines = await rows<{ variant_label: string; components: number }>(
        tx,
        `select i.variant_label, (select count(*)::int from public.order_item_components c where c.order_item_id = i.id) as components
         from public.order_items i where i.order_id = $1 order by i.unit_price_cents`,
        [id],
      );
      const reasons = await rows<{ reason: string }>(tx, "select distinct reason from public.stock_movements where order_id = $1", [id]);
      return {
        order,
        lines,
        reasons,
        noir: await stock(tx, noir),
        ivory: await stock(tx, ivory),
        bouquet: await stock(tx, bouquetS),
        surMesure: await stock(tx, surMesure),
      };
    });

    expect(result.order).toEqual({
      status: "delivered",
      source: "in_person",
      email: null,
      payment_method: "carte",
      subtotal_cents: 7699,
      discount_cents: 199,
      total_cents: 7500,
      shipping_address: { name: "Fatima" },
    });
    expect(result.lines).toEqual([
      { variant_label: "Noir", components: 0 },
      { variant_label: "Sur mesure", components: 0 },
      { variant_label: "S · 3 voiles", components: 3 },
    ]);
    expect(result.reasons).toEqual([{ reason: "in_person_sale" }]);
    // Noir : 2 vendus seuls + 2 dans le bouquet.
    expect([result.noir, result.ivory, result.bouquet, result.surMesure]).toEqual([1, 0, 1, 0]);
  });

  it("rattache la vente au compte de la cliente si son e-mail est donné", async () => {
    const userId = await actingAs(db, { userId: admin }, async (tx) => {
      const id = await sell(tx, [{ variant_id: noir, quantity: 1, unit_price_cents: 1199 }], { email: "Alice@Test.fr" });
      return (await rows<{ user_id: string }>(tx, "select user_id from public.orders where id = $1", [id]))[0].user_id;
    });
    expect(userId).toBe(alice);
  });

  it("refuse de vendre plus que le stock disponible, sans rien enregistrer", async () => {
    await expect(
      actingAs(db, { userId: admin }, (tx) => sell(tx, [{ variant_id: ivory, quantity: 2, unit_price_cents: 1199 }])),
    ).rejects.toThrow(/stock_insuffisant/);
    const [{ count }] = await rows<{ count: number }>(db, "select count(*)::int as count from public.orders");
    expect(count).toBe(0);
  });

  it("refuse une remise plus grande que la vente, ou un moyen de paiement inconnu", async () => {
    await expect(
      actingAs(db, { userId: admin }, (tx) => sell(tx, [{ variant_id: noir, quantity: 1, unit_price_cents: 1000 }], { discount: 1001 })),
    ).rejects.toThrow(/remise_invalide/);
    await expect(
      actingAs(db, { userId: admin }, (tx) => sell(tx, [{ variant_id: noir, quantity: 1, unit_price_cents: 1000 }], { payment: "bitcoin" })),
    ).rejects.toThrow(/paiement_invalide/);
  });

  it("est réservée à l'admin", async () => {
    await expect(
      actingAs(db, { userId: alice }, (tx) => sell(tx, [{ variant_id: noir, quantity: 1, unit_price_cents: 1 }])),
    ).rejects.toThrow(/reserve_admin/);
  });

  it("exige toujours un e-mail pour une commande en ligne", async () => {
    await expect(
      actingAs(db, "service_role", (tx) =>
        rows(tx, "insert into public.orders (subtotal_cents, total_cents) values (100, 100)"),
      ),
    ).rejects.toThrow(/orders_email_required/);
  });
});

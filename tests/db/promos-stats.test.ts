import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { actingAs, createTestDb, rows } from "./harness";

const admin = "00000000-0000-4000-8000-0000000000ad";
const alice = "00000000-0000-4000-8000-0000000000a1";
const carla = "00000000-0000-4000-8000-0000000000c1";
const product = "10000000-0000-4000-8000-000000000001";
const noir = "20000000-0000-4000-8000-000000000001";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${admin}', 'admin@test.fr', now()), ('${alice}', 'alice@test.fr', now()), ('${carla}', 'carla@test.fr', now());
    update public.profiles set role = 'admin' where id = '${admin}';
    update public.profiles set first_name = 'Alice' where id = '${alice}';
    insert into public.products (id, slug, name, status) values ('${product}', 'liquid-jersey', 'Liquid Jersey', 'active');
    insert into public.product_variants (id, product_id, color_name, price_cents, stock, track_stock) values ('${noir}', '${product}', 'Noir', 1199, 10, true);
    insert into public.promo_codes (code, type, value, min_subtotal_cents, max_uses, used_count, once_per_customer, starts_at, ends_at, is_active) values
      ('BIENVENUE', 'percent', 10, 0, null, 0, true, null, null, true),
      ('MOINS5', 'fixed', 500, 3000, null, 0, false, null, null, true),
      ('PORTOFFERT', 'free_shipping', 0, 0, 2, 2, false, null, null, true),
      ('FUTUR', 'percent', 20, 0, null, 0, false, now() + interval '1 day', null, true),
      ('FINI', 'percent', 20, 0, null, 0, false, null, now() - interval '1 day', true),
      ('OFF', 'percent', 20, 0, null, 0, false, null, null, false);
    -- Historique : Alice a déjà utilisé BIENVENUE le mois dernier ; une invitée (dina) a commandé il y a 2 jours.
    insert into public.orders (email, status, subtotal_cents, discount_cents, total_cents, promo_code, paid_at, created_at) values
      ('alice@test.fr', 'delivered', 2398, 240, 2158, 'BIENVENUE', now() - interval '40 days', now() - interval '40 days'),
      ('alice@test.fr', 'paid', 1199, 0, 1199, null, now() - interval '1 day', now() - interval '1 day'),
      ('dina@test.fr', 'shipped', 3000, 0, 3500, null, now() - interval '2 days', now() - interval '2 days'),
      ('eve@test.fr', 'cancelled', 1000, 0, 1000, null, now() - interval '3 days', now() - interval '3 days');
    insert into public.orders (email, status, source, subtotal_cents, total_cents, refunded_cents, payment_method, paid_at, created_at)
    values (null, 'delivered', 'in_person', 2000, 2000, 500, 'especes', now() - interval '1 day', now() - interval '1 day');
    insert into public.order_items (order_id, variant_id, product_name, variant_label, unit_price_cents, quantity, line_total_cents)
      select id, '${noir}', 'Liquid Jersey', 'Noir', 1199, 1, 1199 from public.orders where status <> 'cancelled';
  `);
}, 60_000);

const quote = (code: string, subtotal: number, email: string | null = null) =>
  actingAs(db, "service_role", (tx) => rows<{ q: Record<string, unknown> }>(tx, "select public.promo_quote($1, $2, $3) as q", [code, subtotal, email])).then(
    (r) => r[0].q,
  );

describe("codes promo", () => {
  it("accepte un code valide, quelle que soit la casse", async () => {
    expect(await quote(" moins5 ", 3000)).toEqual({ code: "MOINS5", type: "fixed", value: 500 });
    expect(await quote("BIENVENUE", 100, "carla@test.fr")).toEqual({ code: "BIENVENUE", type: "percent", value: 10 });
  });

  it.each([
    ["INCONNU", 5000, null, /promo_inconnu/],
    ["OFF", 5000, null, /promo_inconnu/],
    ["FUTUR", 5000, null, /promo_pas_encore/],
    ["FINI", 5000, null, /promo_expire/],
    ["PORTOFFERT", 5000, null, /promo_epuise/],
    ["MOINS5", 2999, null, /promo_minimum/],
    ["BIENVENUE", 5000, "Alice@test.fr", /promo_deja_utilise/],
  ])("refuse %s", async (code, subtotal, email, error) => {
    await expect(quote(code, subtotal, email)).rejects.toThrow(error);
  });

  it("n'est pas appelable depuis le navigateur", async () => {
    await expect(actingAs(db, "anon", (tx) => rows(tx, "select public.promo_quote('MOINS5', 5000)"))).rejects.toThrow(/permission denied/);
    await expect(actingAs(db, { userId: alice }, (tx) => rows(tx, "select public.promo_quote('MOINS5', 5000)"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("recopie le code dans la commande payée et compte une utilisation", async () => {
    const result = await actingAs(db, "service_role", async (tx) => {
      const snapshot = JSON.stringify({
        items: [{ variant_id: noir, product_name: "Liquid Jersey", variant_label: "Noir", unit_price_cents: 1199, quantity: 3, line_total_cents: 3597, components: [] }],
        stock_items: [{ variant_id: noir, quantity: 3 }],
        shipping: { method_code: "colissimo", carrier: "colissimo", address: { line1: "x" } },
        totals: { subtotal_cents: 3597, discount_cents: 500, shipping_cents: 1026, total_cents: 4123, promo_code: "MOINS5" },
      });
      const [{ id }] = await rows<{ id: string }>(
        tx,
        "select public.create_checkout(null, null, 'carla@test.fr', $1::jsonb, $2::jsonb, now() + interval '30 minutes') as id",
        [snapshot, JSON.stringify([{ variant_id: noir, quantity: 3 }])],
      );
      const [{ order }] = await rows<{ order: string }>(tx, "select public.fulfill_checkout($1, 'cs_promo', 'pi_promo', 4123) as order", [id]);
      const [o] = await rows(tx, "select promo_code, discount_cents, total_cents from public.orders where id = $1", [order]);
      const [p] = await rows(tx, "select used_count from public.promo_codes where code = 'MOINS5'");
      const notes = await rows(tx, "select body from public.order_notes where order_id = $1", [order]);
      return { o, p, notes };
    });
    expect(result.o).toEqual({ promo_code: "MOINS5", discount_cents: 500, total_cents: 4123 });
    expect(result.p).toEqual({ used_count: 1 });
    expect(result.notes).toEqual([]);
  });
});

describe("gel du site", () => {
  it("donne l'état de la boutique à tout le monde, et rien d'autre", async () => {
    await db.exec("update public.shop_settings set maintenance_enabled = true, maintenance_title = 'On revient vite', siret = '12345678900011' where id = 1");
    const [{ s }] = await actingAs(db, "anon", (tx) => rows<{ s: unknown }>(tx, "select public.shop_status() as s"));
    expect(s).toEqual({ maintenance: true, title: "On revient vite", message: null });
    await db.exec("update public.shop_settings set maintenance_enabled = false, maintenance_title = null, siret = null where id = 1");
  });

  it("seule l'admin peut geler la boutique", async () => {
    const changed = await actingAs(db, { userId: alice }, (tx) =>
      rows(tx, "update public.shop_settings set maintenance_enabled = true where id = 1 returning id"),
    );
    expect(changed).toEqual([]);
    const done = await actingAs(db, { userId: admin }, (tx) =>
      rows(tx, "update public.shop_settings set maintenance_enabled = true where id = 1 returning maintenance_enabled"),
    );
    expect(done).toEqual([{ maintenance_enabled: true }]);
  });
});

describe("clientes et statistiques", () => {
  it("regroupe comptes et invitées par e-mail, sans les commandes annulées", async () => {
    const list = await actingAs(db, { userId: admin }, (tx) =>
      rows<{ email: string; has_account: boolean; orders_count: number; spent_cents: number; first_name: string | null }>(
        tx,
        "select email, has_account, orders_count, spent_cents::int as spent_cents, first_name from public.admin_customers() order by email",
      ),
    );
    expect(list).toEqual([
      { email: "alice@test.fr", has_account: true, orders_count: 2, spent_cents: 3357, first_name: "Alice" },
      { email: "carla@test.fr", has_account: true, orders_count: 0, spent_cents: 0, first_name: null },
      { email: "dina@test.fr", has_account: false, orders_count: 1, spent_cents: 3500, first_name: null },
    ]);
    await expect(actingAs(db, { userId: alice }, (tx) => rows(tx, "select * from public.admin_customers()"))).rejects.toThrow(/reserve_admin/);
  });

  it("calcule le chiffre d'affaires net, par jour, avec les meilleures ventes", async () => {
    const [{ s }] = await actingAs(db, { userId: admin }, (tx) =>
      rows<{ s: { totals: Record<string, number>; series: { net_cents: number }[]; by_source: unknown[]; top_products: unknown[]; returning_customers: number } }>(tx, "select public.admin_stats(now() - interval '7 days', now() + interval '1 minute', 'day') as s"),
    );
    // 3 commandes valides sur 7 jours : 1199 (Alice) + 3500 (Dina) + 2000 − 500 (boutique). L'annulée est exclue.
    expect(s.totals).toMatchObject({ orders: 3, gross_cents: 6699, refunded_cents: 500, net_cents: 6199, items: 3, cancelled: 1 });
    expect(s.series).toHaveLength(8);
    expect(s.series.reduce((n: number, d: { net_cents: number }) => n + d.net_cents, 0)).toBe(6199);
    expect(s.by_source).toEqual([
      { source: "web", orders: 2, net_cents: 4699 },
      { source: "in_person", orders: 1, net_cents: 1500 },
    ]);
    expect(s.top_products).toEqual([{ name: "Liquid Jersey", quantity: 3, revenue_cents: 3597 }]);
    expect(s.returning_customers).toBe(1); // Alice avait déjà commandé avant la période
    await expect(actingAs(db, { userId: alice }, (tx) => rows(tx, "select public.admin_stats(now(), now())"))).rejects.toThrow(/reserve_admin/);
  });
});

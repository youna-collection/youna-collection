import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { actingAs, createTestDb, rows } from "./harness";

const alice = "00000000-0000-4000-8000-00000000000a";
const product = "10000000-0000-4000-8000-000000000001";
const draft = "10000000-0000-4000-8000-000000000002";
const noir = "20000000-0000-4000-8000-000000000001"; // stock 3
const matcha = "20000000-0000-4000-8000-000000000002"; // stock 1
const unlimited = "20000000-0000-4000-8000-000000000003"; // sans suivi de stock
const hidden = "20000000-0000-4000-8000-000000000004"; // produit brouillon
const cart = "70000000-0000-4000-8000-000000000001";

let db: PGlite;

const snapshot = (total = 2398, stockItems: { variant_id: string; quantity: number }[] = [{ variant_id: noir, quantity: 2 }]) =>
  JSON.stringify({
    items: [
      {
        variant_id: noir,
        product_name: "Liquid Jersey",
        variant_label: "Noir",
        sku: "liquid-jersey-noir",
        unit_price_cents: 1199,
        quantity: 2,
        line_total_cents: 2398,
        components: [],
      },
    ],
    stock_items: stockItems,
    shipping: { method_code: "mondial_relay", carrier: "mondial_relay", relay_point: { id: "012345" } },
    totals: { subtotal_cents: 2398, discount_cents: 0, shipping_cents: 0, total_cents: total },
  });

const items = (...list: [string, number][]) => JSON.stringify(list.map(([variant_id, quantity]) => ({ variant_id, quantity })));

async function createCheckout(tx: Transaction, list: [string, number][], options: { cartId?: string | null; expiresIn?: string; snapshot?: string } = {}) {
  const [{ id }] = await rows<{ id: string }>(
    tx,
    `select public.create_checkout($1, $2, 'Alice@Test.fr', $3::jsonb, $4::jsonb, now() + $5::interval) as id`,
    [options.cartId === undefined ? cart : options.cartId, alice, options.snapshot ?? snapshot(), items(...list), options.expiresIn ?? "35 minutes"],
  );
  return id;
}

const variant = async (tx: Transaction, id: string) =>
  (await rows<{ stock: number; reserved: number; available: number }>(
    tx,
    "select stock, reserved, available from public.product_variants where id = $1",
    [id],
  ))[0];

const fulfill = (tx: Transaction, checkoutId: string, session = "cs_test_1", amount = 2398) =>
  rows<{ id: string }>(tx, "select public.fulfill_checkout($1, $2, 'pi_test_1', $3) as id", [checkoutId, session, amount]).then((r) => r[0].id);

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${alice}', 'alice@test.fr', now());
    insert into public.products (id, slug, name, status) values
      ('${product}', 'liquid-jersey', 'Liquid Jersey', 'active'),
      ('${draft}', 'brouillon', 'Brouillon', 'draft');
    insert into public.product_variants (id, product_id, color_name, price_cents, stock, track_stock) values
      ('${noir}', '${product}', 'Noir', 1199, 3, true),
      ('${matcha}', '${product}', 'Matcha', 1199, 1, true),
      ('${unlimited}', '${product}', 'Sur commande', 1199, 0, false),
      ('${hidden}', '${draft}', 'Gris', 1199, 5, true);
    insert into public.carts (id, user_id) values ('${cart}', '${alice}');
  `);
}, 60_000);

describe("livraison", () => {
  it("installe les 4 modes de livraison avec les tarifs Shopify", async () => {
    const result = await rows(
      db,
      `select m.code, r.country, r.max_weight_grams, r.price_cents from public.shipping_rates r
       join public.shipping_methods m on m.id = r.method_id where r.country = 'FR' order by m.position, r.max_weight_grams`,
    );
    expect(result).toEqual([
      { code: "mondial_relay", country: "FR", max_weight_grams: 500, price_cents: 430 },
      { code: "mondial_relay", country: "FR", max_weight_grams: 30000, price_cents: 540 },
      { code: "colissimo", country: "FR", max_weight_grams: 30000, price_cents: 1026 },
      { code: "retrait_avenue83", country: "FR", max_weight_grams: 30000, price_cents: 0 },
    ]);
  });
});

describe("sécurité des fonctions de paiement", () => {
  it.each(["anon", { userId: alice }] as const)("refuse l'appel direct depuis le navigateur (%j)", async (actor) => {
    for (const call of [
      `select public.create_checkout(null, null, 'x@x.fr', '{}'::jsonb, '[]'::jsonb, now())`,
      `select public.fulfill_checkout('${cart}', 'cs', 'pi', 0)`,
      `select public.release_checkout('${cart}')`,
      `select public.release_expired_checkouts()`,
    ]) {
      await expect(actingAs(db, actor, (tx) => rows(tx, call))).rejects.toThrow(/permission denied/);
    }
  });
});

describe("réservation du stock", () => {
  it("réserve le stock sans encore le retirer", async () => {
    await actingAs(db, "service_role", async (tx) => {
      const id = await createCheckout(tx, [[noir, 2]]);
      expect(await variant(tx, noir)).toEqual({ stock: 3, reserved: 2, available: 1 });
      expect(await rows(tx, "select email, status from public.checkouts where id = $1", [id])).toEqual([
        { email: "alice@test.fr", status: "open" },
      ]);
    });
  });

  it("additionne les quantités d'un même article (voile seul + voile d'un bouquet)", async () => {
    await actingAs(db, "service_role", async (tx) => {
      await createCheckout(tx, [[noir, 1], [noir, 2]]);
      expect((await variant(tx, noir)).reserved).toBe(3);
    });
  });

  it("refuse tout le paiement si un seul article manque, sans rien bloquer", async () => {
    await actingAs(db, "service_role", async (tx) => {
      await expect(createCheckout(tx, [[noir, 1], [matcha, 2]])).rejects.toThrow(/stock_insuffisant/);
    });
    await actingAs(db, "service_role", async (tx) => {
      expect((await variant(tx, noir)).reserved).toBe(0);
      expect(await rows(tx, "select id from public.checkouts")).toEqual([]);
    });
  });

  it("empêche deux clientes de payer le dernier article en même temps", async () => {
    await actingAs(db, "service_role", async (tx) => {
      await createCheckout(tx, [[matcha, 1]], { cartId: null });
      await expect(createCheckout(tx, [[matcha, 1]], { cartId: null })).rejects.toThrow(/stock_insuffisant/);
    });
  });

  it("refuse un produit non publié", async () => {
    await actingAs(db, "service_role", async (tx) => {
      await expect(createCheckout(tx, [[hidden, 1]])).rejects.toThrow(/stock_insuffisant/);
    });
  });

  it("accepte un article sans suivi de stock", async () => {
    await actingAs(db, "service_role", async (tx) => {
      await createCheckout(tx, [[unlimited, 4]]);
      expect(await rows(tx, "select variant_id from public.checkout_reservations")).toEqual([]);
    });
  });

  it("refuse une quantité nulle ou négative", async () => {
    await actingAs(db, "service_role", async (tx) => {
      await expect(createCheckout(tx, [[noir, -1]])).rejects.toThrow(/quantite_invalide/);
    });
  });

  it("libère le paiement précédent quand la cliente relance le paiement", async () => {
    await actingAs(db, "service_role", async (tx) => {
      const first = await createCheckout(tx, [[noir, 2]]);
      await createCheckout(tx, [[noir, 3]]);
      expect((await variant(tx, noir)).reserved).toBe(3);
      expect(await rows(tx, "select status from public.checkouts where id = $1", [first])).toEqual([{ status: "expired" }]);
    });
  });

  it("libère automatiquement les paiements expirés", async () => {
    await actingAs(db, "service_role", async (tx) => {
      await createCheckout(tx, [[matcha, 1]], { cartId: null, expiresIn: "-1 minute" });
      expect((await variant(tx, matcha)).available).toBe(0);
      await createCheckout(tx, [[matcha, 1]], { cartId: null });
      expect((await variant(tx, matcha)).reserved).toBe(1);
    });
  });

  it("libère une seule fois", async () => {
    await actingAs(db, "service_role", async (tx) => {
      const id = await createCheckout(tx, [[noir, 2]]);
      expect(await rows(tx, "select public.release_checkout($1) as ok", [id])).toEqual([{ ok: true }]);
      expect(await rows(tx, "select public.release_checkout($1) as ok", [id])).toEqual([{ ok: false }]);
      expect(await variant(tx, noir)).toEqual({ stock: 3, reserved: 0, available: 3 });
    });
  });
});

describe("création de la commande", () => {
  it("crée la commande, retire le stock et vide le panier", async () => {
    await actingAs(db, "service_role", async (tx) => {
      const checkout = await createCheckout(tx, [[noir, 2]]);
      const orderId = await fulfill(tx, checkout);

      const [order] = await rows(
        tx,
        "select order_number, status, email, user_id, total_cents, relay_point, carrier from public.orders where id = $1",
        [orderId],
      );
      expect(order).toMatchObject({
        status: "paid",
        email: "alice@test.fr",
        user_id: alice,
        total_cents: 2398,
        relay_point: { id: "012345" },
        carrier: "mondial_relay",
      });
      expect(Number(order.order_number)).toBeGreaterThanOrEqual(2001);
      expect(await rows(tx, "select product_name, quantity from public.order_items where order_id = $1", [orderId])).toEqual([
        { product_name: "Liquid Jersey", quantity: 2 },
      ]);
      expect(await variant(tx, noir)).toEqual({ stock: 1, reserved: 0, available: 1 });
      expect(await rows(tx, "select reason, delta, order_id from public.stock_movements where order_id = $1", [orderId])).toEqual([
        { reason: "order", delta: -2, order_id: orderId },
      ]);
      expect(await rows(tx, "select status from public.carts where id = $1", [cart])).toEqual([{ status: "converted" }]);
      expect(await rows(tx, "select id from public.order_notes where order_id = $1", [orderId])).toEqual([]);
    });
  });

  it("ne crée jamais deux commandes pour un même paiement", async () => {
    await actingAs(db, "service_role", async (tx) => {
      const checkout = await createCheckout(tx, [[noir, 2]]);
      const first = await fulfill(tx, checkout);
      const second = await fulfill(tx, checkout);
      expect(second).toBe(first);
      expect(await rows(tx, "select id from public.orders")).toHaveLength(1);
      expect((await variant(tx, noir)).stock).toBe(1);
    });
  });

  it("enregistre la composition d'un bouquet", async () => {
    const bouquetSnapshot = JSON.stringify({
      items: [
        {
          variant_id: unlimited,
          product_name: "Bouquet Youna",
          variant_label: "S · 3 voiles",
          unit_price_cents: 3699,
          quantity: 1,
          line_total_cents: 3699,
          components: [
            { variant_id: noir, label: "Liquid Jersey Noir" },
            { variant_id: noir, label: "Liquid Jersey Noir" },
            { variant_id: matcha, label: "Liquid Jersey Matcha" },
          ],
        },
      ],
      stock_items: [],
      shipping: { method_code: "retrait_avenue83", carrier: "pickup" },
      totals: { subtotal_cents: 3699, shipping_cents: 0, total_cents: 3699 },
    });
    await actingAs(db, "service_role", async (tx) => {
      const checkout = await createCheckout(tx, [[unlimited, 1], [noir, 2], [matcha, 1]], { snapshot: bouquetSnapshot });
      const orderId = await fulfill(tx, checkout, "cs_bouquet", 3699);
      expect(
        await rows(
          tx,
          `select c.label from public.order_item_components c join public.order_items i on i.id = c.order_item_id
           where i.order_id = $1 order by c.label`,
          [orderId],
        ),
      ).toEqual([{ label: "Liquid Jersey Matcha" }, { label: "Liquid Jersey Noir" }, { label: "Liquid Jersey Noir" }]);
      expect((await variant(tx, noir)).stock).toBe(1);
      expect((await variant(tx, matcha)).stock).toBe(0);
    });
  });

  it("refuse une session Stripe qui n'est pas celle du paiement", async () => {
    await actingAs(db, "service_role", async (tx) => {
      const checkout = await createCheckout(tx, [[noir, 1]]);
      await rows(tx, "update public.checkouts set stripe_session_id = 'cs_vrai' where id = $1", [checkout]);
      await expect(fulfill(tx, checkout, "cs_pirate")).rejects.toThrow(/session_differente/);
    });
  });

  it("signale un montant payé différent du total", async () => {
    await actingAs(db, "service_role", async (tx) => {
      const checkout = await createCheckout(tx, [[noir, 2]]);
      const orderId = await fulfill(tx, checkout, "cs_test_1", 100);
      const [note] = await rows<{ body: string }>(tx, "select body from public.order_notes where order_id = $1", [orderId]);
      expect(note.body).toMatch(/Montant payé \(100 centimes\)/);
    });
  });

  it("honore un paiement arrivé après l'expiration, en signalant le stock manquant", async () => {
    await actingAs(db, "service_role", async (tx) => {
      const checkout = await createCheckout(tx, [[noir, 3]], { snapshot: snapshot(2398, [{ variant_id: noir, quantity: 3 }]) });
      await rows(tx, "select public.release_checkout($1)", [checkout]);
      // Entre-temps, une autre cliente a réservé 1 voile noir.
      await createCheckout(tx, [[noir, 1]], { cartId: null });

      const orderId = await fulfill(tx, checkout);
      expect(await variant(tx, noir)).toEqual({ stock: 1, reserved: 1, available: 0 });
      const [note] = await rows<{ body: string }>(tx, "select body from public.order_notes where order_id = $1", [orderId]);
      expect(note.body).toMatch(/1 manquant/);
    });
  });
});

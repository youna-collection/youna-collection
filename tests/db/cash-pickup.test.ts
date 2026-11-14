import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { actingAs, createTestDb, rows } from "./harness";

const admin = "00000000-0000-4000-8000-0000000000ad";
const product = "10000000-0000-4000-8000-000000000001";
const noir = "20000000-0000-4000-8000-000000000001"; // stock 5

let db: PGlite;

const snapshot = (carrier: string) =>
  JSON.stringify({
    items: [
      {
        variant_id: noir,
        product_name: "Liquid Jersey",
        variant_label: "Noir",
        sku: null,
        unit_price_cents: 1199,
        quantity: 2,
        line_total_cents: 2398,
        components: [],
      },
    ],
    stock_items: [{ variant_id: noir, quantity: 2 }],
    shipping: { method_code: carrier === "pickup" ? "retrait_avenue83" : "colissimo", carrier, address: { first_name: "Alice" }, relay_point: null },
    totals: { subtotal_cents: 2398, discount_cents: 0, shipping_cents: 0, total_cents: 2398 },
  });

const one = async <T>(tx: Transaction, sql: string, params: unknown[] = []) => (await rows<T>(tx, sql, params))[0];
const stock = async (tx: Transaction) => (await one<{ stock: number; reserved: number }>(tx, "select stock, reserved from public.product_variants where id = $1", [noir]));

/** Commande en espèces passée par le serveur (droits service_role), dans la transaction du test. */
async function placeCashOrder(tx: Transaction, carrier = "pickup") {
  const { id } = await one<{ id: string }>(
    tx,
    `select public.create_checkout(null, null, 'alice@test.fr', $1::jsonb, $2::jsonb, now() + interval '30 minutes') as id`,
    [snapshot(carrier), JSON.stringify([{ variant_id: noir, quantity: 2 }])],
  );
  return (await one<{ id: string }>(tx, "select public.place_cash_order($1) as id", [id])).id;
}

/** Puis la suite du test se fait avec la session de l'admin. */
async function becomeAdmin(tx: Transaction) {
  await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: admin, role: "authenticated" })]);
  await tx.exec("set local role authenticated");
}

const paidAt = async (tx: Transaction, id: string) => (await one<{ paid_at: unknown }>(tx, "select paid_at from public.orders where id = $1", [id])).paid_at;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${admin}', 'admin@test.fr', now());
    update public.profiles set role = 'admin' where id = '${admin}';
    insert into public.products (id, slug, name, status) values ('${product}', 'liquid-jersey', 'Liquid Jersey', 'active');
    insert into public.product_variants (id, product_id, color_name, price_cents, stock, track_stock) values ('${noir}', '${product}', 'Noir', 1199, 5, true);
  `);
}, 60_000);

describe("espèces au click & collect", () => {
  it("enregistre la commande, garde le stock, et la laisse à payer", async () => {
    await actingAs(db, "service_role", async (tx) => {
      const orderId = await placeCashOrder(tx);
      expect(await one(tx, "select status, payment_method, paid_at, stripe_session_id, carrier from public.orders where id = $1", [orderId])).toEqual({
        status: "paid",
        payment_method: "especes",
        paid_at: null,
        stripe_session_id: null,
        carrier: "pickup",
      });
      expect(await stock(tx)).toEqual({ stock: 3, reserved: 0 });
    });
  });

  it("refuse les espèces pour un colis", async () => {
    await expect(actingAs(db, "service_role", (tx) => placeCashOrder(tx, "colissimo"))).rejects.toThrow(/especes_retrait_seulement/);
  });

  it("ne peut pas être appelée depuis le navigateur", async () => {
    await expect(actingAs(db, { userId: admin }, (tx) => rows(tx, `select public.place_cash_order('${noir}')`))).rejects.toThrow(/permission denied/);
  });

  it("le retrait note le paiement reçu, et revenir en arrière l'annule", async () => {
    await actingAs(db, "service_role", async (tx) => {
      const orderId = await placeCashOrder(tx);
      await becomeAdmin(tx);
      await tx.query("update public.orders set status = 'delivered', delivered_at = now() where id = $1", [orderId]);
      expect(await paidAt(tx, orderId)).not.toBeNull();
      await tx.query("update public.orders set status = 'shipped', delivered_at = null where id = $1", [orderId]);
      expect(await paidAt(tx, orderId)).toBeNull();
    });
  });

  it("une cliente absente : l'annulation remet le stock", async () => {
    await actingAs(db, "service_role", async (tx) => {
      const orderId = await placeCashOrder(tx);
      await becomeAdmin(tx);
      await tx.query("select public.cancel_unpaid_order($1)", [orderId]);
      expect(await one(tx, "select status from public.orders where id = $1", [orderId])).toEqual({ status: "cancelled" });
      expect(await stock(tx)).toEqual({ stock: 5, reserved: 0 });
      expect(await rows(tx, "select reason, delta from public.stock_movements where order_id = $1 order by created_at, delta", [orderId])).toEqual([
        { reason: "order", delta: -2 },
        { reason: "cancellation", delta: 2 },
      ]);
    });
  });

  it("impossible d'annuler ainsi une commande déjà payée", async () => {
    await expect(
      actingAs(db, "service_role", async (tx) => {
        const orderId = await placeCashOrder(tx);
        await becomeAdmin(tx);
        await tx.query("update public.orders set status = 'delivered' where id = $1", [orderId]);
        await tx.query("select public.cancel_unpaid_order($1)", [orderId]);
      }),
    ).rejects.toThrow(/commande_non_annulable/);
  });
});

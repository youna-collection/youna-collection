import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { actingAs, createTestDb, rows } from "./harness";

const admin = "00000000-0000-4000-8000-0000000000ad";
const alice = "00000000-0000-4000-8000-0000000000a1";
const bob = "00000000-0000-4000-8000-0000000000b0";
const voile = "10000000-0000-4000-8000-000000000001";
const bouquet = "10000000-0000-4000-8000-000000000002";
const noir = "20000000-0000-4000-8000-000000000001";
const ivory = "20000000-0000-4000-8000-000000000002";
const bouquetS = "20000000-0000-4000-8000-000000000003";
const order = "30000000-0000-4000-8000-000000000001";
const lineVoile = "40000000-0000-4000-8000-000000000001";
const lineBouquet = "40000000-0000-4000-8000-000000000002";
const unshipped = "30000000-0000-4000-8000-000000000002";
const shipped = "30000000-0000-4000-8000-000000000003";

let db: PGlite;

const SELLER = `update public.shop_settings set legal_name = 'Youna Collection', siret = '12345678900011',
  address_line1 = '1 rue des Fleurs', postal_code = '83000', city = 'Toulon' where id = 1`;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${admin}', 'admin@test.fr', now()), ('${alice}', 'alice@test.fr', now()), ('${bob}', 'bob@test.fr', now());
    update public.profiles set role = 'admin' where id = '${admin}';
    insert into public.products (id, slug, name, status, kind) values
      ('${voile}', 'liquid-jersey', 'Liquid Jersey', 'active', 'standard'),
      ('${bouquet}', 'bouquet', 'Bouquet Youna', 'active', 'bouquet');
    insert into public.product_variants (id, product_id, color_name, size, price_cents, stock, track_stock, bouquet_veil_count) values
      ('${noir}', '${voile}', 'Noir', null, 1199, 5, true, null),
      ('${ivory}', '${voile}', 'Ivory', null, 1199, 5, true, null),
      ('${bouquetS}', '${bouquet}', null, 'S', 3699, 5, true, 3);
    -- Commande d'Alice : 2 voiles noirs + 1 bouquet (noir, noir, ivory), livraison 4,99.
    insert into public.orders (id, user_id, email, status, subtotal_cents, shipping_cents, total_cents, shipping_address, paid_at)
    values ('${order}', '${alice}', 'alice@test.fr', 'paid', 6097, 499, 6596,
      '{"first_name":"Alice","last_name":"Martin","line1":"2 rue Haute","postal_code":"75001","city":"Paris","country":"FR"}', now());
    insert into public.order_items (id, order_id, variant_id, product_name, variant_label, unit_price_cents, quantity, line_total_cents) values
      ('${lineVoile}', '${order}', '${noir}', 'Liquid Jersey', 'Noir', 1199, 2, 2398),
      ('${lineBouquet}', '${order}', '${bouquetS}', 'Bouquet Youna', 'S · 3 voiles', 3699, 1, 3699);
    insert into public.order_item_components (order_item_id, variant_id, label) values
      ('${lineBouquet}', '${noir}', 'Liquid Jersey Noir'), ('${lineBouquet}', '${noir}', 'Liquid Jersey Noir'),
      ('${lineBouquet}', '${ivory}', 'Liquid Jersey Ivory');
    insert into public.orders (id, email, status, subtotal_cents, total_cents, paid_at, shipped_at) values
      ('${unshipped}', 'c@test.fr', 'preparing', 1000, 1000, now(), null),
      ('${shipped}', 'd@test.fr', 'shipped', 1000, 1000, now(), now());
  `);
});

const one = async <T>(tx: Transaction, sql: string, params: unknown[] = []) => (await rows<T>(tx, sql, params))[0];
const stocks = async (tx: Transaction) =>
  Object.fromEntries(
    (await rows<{ id: string; stock: number }>(tx, "select id, stock from public.product_variants")).map((r) => [r.id, r.stock]),
  );

describe("factures", () => {
  it("refuse d'émettre une facture tant que les infos du vendeur manquent", async () => {
    await expect(actingAs(db, { userId: admin }, (tx) => rows(tx, "select public.issue_invoice($1)", [order]))).rejects.toThrow(
      /vendeur_incomplet/,
    );
  });

  it("émet une facture figée, numérotée, une seule fois ; la cliente peut la demander, pas une autre", async () => {
    const result = await actingAs(db, { userId: admin }, async (tx) => {
      await tx.exec(SELLER);
      const first = await one<{ id: string }>(tx, "select public.issue_invoice($1) as id", [order]);
      const again = await one<{ id: string }>(tx, "select public.issue_invoice($1) as id", [order]);
      const invoice = await one<{ number: number; seller: { siret: string; vat_mention: string }; buyer: { name: string }; lines: { label: string; details: string[] }[]; totals: { total_cents: number; order_number: number } }>(
        tx,
        "select number, seller, buyer, lines, totals from public.invoices where id = $1",
        [first.id],
      );
      let blocked = "";
      await tx.exec("savepoint s");
      try {
        await tx.exec(`update public.invoices set totals = '{}' where id = '${first.id}'`);
      } catch (e) {
        blocked = String(e);
      }
      await tx.exec("rollback to savepoint s");
      return { same: first.id === again.id, invoice, blocked };
    });
    expect(result.same).toBe(true);
    expect(result.invoice.number).toBe(1);
    expect(result.invoice.seller.siret).toBe("12345678900011");
    expect(result.invoice.seller.vat_mention).toBe("TVA non applicable, art. 293 B du CGI");
    expect(result.invoice.buyer.name).toBe("Alice Martin");
    expect(result.invoice.totals.total_cents).toBe(6596);
    expect(result.invoice.lines.map((l) => l.label)).toEqual(["Bouquet Youna — S · 3 voiles", "Liquid Jersey — Noir"]);
    expect(result.invoice.lines[0].details).toHaveLength(3);
    expect(result.blocked).toMatch(/permission denied|ne peut pas être modifiée/);

    // La propriétaire peut obtenir sa facture ; une autre cliente non.
    await db.exec(SELLER);
    const own = await actingAs(db, { userId: alice }, (tx) => one<{ id: string }>(tx, "select public.issue_invoice($1) as id", [order]));
    expect(own.id).toBeTruthy();
    await expect(actingAs(db, { userId: bob }, (tx) => rows(tx, "select public.issue_invoice($1)", [order]))).rejects.toThrow(
      /commande_introuvable/,
    );
  });
});

describe("remboursements", () => {
  it("rembourse en partie, remet en stock (voiles du bouquet compris) et émet un avoir", async () => {
    const result = await actingAs(db, { userId: admin }, async (tx) => {
      await tx.exec(SELLER);
      const before = await stocks(tx);
      const refund = await one<{ id: string }>(tx, "select public.record_refund($1, $2, $3::jsonb, 'Bouquet abîmé', 're_123') as id", [
        order,
        3699,
        JSON.stringify([{ order_item_id: lineBouquet, quantity: 1 }]),
      ]);
      const again = await one<{ id: string }>(tx, "select public.record_refund($1, $2, $3::jsonb, null, 're_123') as id", [
        order,
        3699,
        JSON.stringify([{ order_item_id: lineBouquet, quantity: 1 }]),
      ]);
      const after = await stocks(tx);
      const o = await one<{ status: string; refunded_cents: number }>(tx, "select status, refunded_cents from public.orders where id = $1", [order]);
      const docs = await rows<{ kind: string; number: number; credit_of: string | null; total: number }>(
        tx,
        "select kind, number, credit_of, (totals ->> 'total_cents')::int as total from public.invoices where order_id = $1 order by number",
        [order],
      );
      const reasons = await rows<{ reason: string }>(tx, "select distinct reason from public.stock_movements where order_id = $1", [order]);
      return { same: refund.id === again.id, before, after, o, docs, reasons };
    });
    expect(result.same).toBe(true);
    expect(result.after[bouquetS] - result.before[bouquetS]).toBe(1);
    expect(result.after[noir] - result.before[noir]).toBe(2);
    expect(result.after[ivory] - result.before[ivory]).toBe(1);
    expect(result.o).toEqual({ status: "paid", refunded_cents: 3699 });
    expect(result.docs.map((d) => [d.kind, d.total, d.credit_of != null])).toEqual([
      ["invoice", 6596, false],
      ["credit_note", 3699, true],
    ]);
    expect(result.reasons).toEqual([{ reason: "cancellation" }]);
  });

  it("annule la commande quand tout est remboursé avant l'envoi ; « remboursée » après l'envoi", async () => {
    const statuses = await actingAs(db, { userId: admin }, async (tx) => {
      await rows(tx, "select public.record_refund($1, 1000)", [unshipped]);
      await rows(tx, "select public.record_refund($1, 1000)", [shipped]);
      return rows<{ status: string; cancelled: boolean }>(
        tx,
        "select status, cancelled_at is not null as cancelled from public.orders where id in ($1, $2) order by shipped_at nulls first",
        [unshipped, shipped],
      );
    });
    expect(statuses).toEqual([
      { status: "cancelled", cancelled: true },
      { status: "refunded", cancelled: false },
    ]);
  });

  it("refuse de rembourser plus que payé, ou de remettre en stock plus que vendu", async () => {
    await expect(actingAs(db, { userId: admin }, (tx) => rows(tx, "select public.record_refund($1, 6597)", [order]))).rejects.toThrow(
      /montant_invalide/,
    );
    await expect(
      actingAs(db, { userId: admin }, (tx) =>
        rows(tx, "select public.record_refund($1, 100, $2::jsonb)", [order, JSON.stringify([{ order_item_id: lineVoile, quantity: 3 }])]),
      ),
    ).rejects.toThrow(/quantite_trop_grande/);
    await expect(
      actingAs(db, { userId: admin }, async (tx) => {
        await rows(tx, "select public.record_refund($1, 100, $2::jsonb)", [order, JSON.stringify([{ order_item_id: lineVoile, quantity: 2 }])]);
        await rows(tx, "select public.record_refund($1, 100, $2::jsonb)", [order, JSON.stringify([{ order_item_id: lineVoile, quantity: 1 }])]);
      }),
    ).rejects.toThrow(/quantite_trop_grande/);
  });

  it("rembourse sans avoir quand les infos du vendeur manquent", async () => {
    const docs = await actingAs(db, { userId: admin }, async (tx) => {
      await tx.exec("update public.shop_settings set siret = null where id = 1");
      const before = await one<{ count: number }>(tx, "select count(*)::int as count from public.invoices");
      const refund = await one<{ id: string }>(tx, "select public.record_refund($1, 500) as id", [order]);
      const after = await one<{ count: number }>(tx, "select count(*)::int as count from public.invoices");
      const r = await one<{ credit_note_id: string | null }>(tx, "select credit_note_id from public.refunds where id = $1", [refund.id]);
      return { added: after.count - before.count, credit: r.credit_note_id };
    });
    expect(docs).toEqual({ added: 0, credit: null });
  });

  it("est réservé à l'admin", async () => {
    await expect(actingAs(db, { userId: alice }, (tx) => rows(tx, "select public.record_refund($1, 100)", [order]))).rejects.toThrow(
      /reserve_admin/,
    );
    await expect(actingAs(db, { userId: alice }, (tx) => rows(tx, "select * from public.shop_settings"))).resolves.toEqual([]);
  });
});

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { actingAs, createTestDb, rows } from "./harness";

const admin = "00000000-0000-4000-8000-0000000000ad";
const alice = "00000000-0000-4000-8000-0000000000a1";
const bob = "00000000-0000-4000-8000-0000000000b0";
const order = "00000000-0000-4000-8000-00000000000a";
const item = "00000000-0000-4000-8000-0000000000e1";

let db: PGlite;
let ticket: string;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${admin}', 'admin@test.fr', now()), ('${alice}', 'alice@test.fr', now()), ('${bob}', 'bob@test.fr', now());
    update public.profiles set role = 'admin' where id = '${admin}';
    insert into public.orders (id, user_id, email, subtotal_cents, total_cents, status) values ('${order}', '${alice}', 'alice@test.fr', 1000, 1000, 'delivered');
    insert into public.order_items (id, order_id, product_name, unit_price_cents, quantity, line_total_cents) values ('${item}', '${order}', 'Voile', 1000, 1, 1000);
  `);
  const [row] = await rows<{ id: string; number: number }>(
    db,
    `insert into public.support_tickets (order_id, user_id, email, type, subject) values ('${order}', '${alice}', 'alice@test.fr', 'return', 'Retour') returning id, number`,
  );
  ticket = row.id;
  expect(row.number).toBe(101);
  await db.exec(`
    insert into public.support_ticket_items (ticket_id, order_item_id, quantity) values ('${ticket}', '${item}', 1);
    insert into public.support_messages (ticket_id, author_id, author_role, body) values ('${ticket}', '${alice}', 'customer', 'Trop grand');
  `);
}, 60_000);

describe("SAV", () => {
  it("la cliente ne peut plus écrire directement : tout passe par le serveur", async () => {
    await expect(
      actingAs(db, { userId: alice }, (tx) =>
        rows(tx, `insert into public.support_tickets (order_id, user_id, email, type, subject) values ('${order}', '${alice}', 'alice@test.fr', 'complaint', 'x')`),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      actingAs(db, { userId: alice }, (tx) =>
        rows(tx, `insert into public.support_messages (ticket_id, author_id, author_role, body) values ('${ticket}', '${alice}', 'customer', 'x')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("chaque cliente ne voit que ses demandes ; les photos et articles restent réservés à l'admin", async () => {
    expect(await actingAs(db, { userId: alice }, (tx) => rows(tx, "select type from public.support_tickets"))).toEqual([{ type: "return" }]);
    expect(await actingAs(db, { userId: bob }, (tx) => rows(tx, "select type from public.support_tickets"))).toEqual([]);
    expect(await actingAs(db, { userId: bob }, (tx) => rows(tx, "select body from public.support_messages"))).toEqual([]);
    expect(await actingAs(db, { userId: alice }, (tx) => rows(tx, "select * from public.support_ticket_items"))).toEqual([]);
    expect(await actingAs(db, { userId: admin }, (tx) => rows(tx, "select quantity from public.support_ticket_items"))).toEqual([{ quantity: 1 }]);
    await expect(actingAs(db, "anon", (tx) => rows(tx, "select * from public.support_attachments"))).rejects.toThrow(/permission denied/);
  });

  it("l'admin répond ; la réponse de la cliente rouvre la demande", async () => {
    await actingAs(db, { userId: admin }, async (tx) => {
      await rows(tx, `insert into public.support_messages (ticket_id, author_id, author_role, body) values ('${ticket}', '${admin}', 'admin', 'Bonjour')`);
      await rows(tx, `update public.support_tickets set status = 'waiting_customer' where id = '${ticket}'`);
      expect(await rows(tx, `select status, last_author from public.support_tickets where id = '${ticket}'`)).toEqual([{ status: "waiting_customer", last_author: "admin" }]);
      await rows(tx, "reset role");
      await rows(tx, `insert into public.support_messages (ticket_id, author_id, author_role, body) values ('${ticket}', '${alice}', 'customer', 'Merci')`);
      expect(await rows(tx, `select status, last_author from public.support_tickets where id = '${ticket}'`)).toEqual([{ status: "open", last_author: "customer" }]);
    });
  });

  it("une cliente ne peut ni se faire passer pour l'admin ni changer l'état", async () => {
    await expect(
      actingAs(db, { userId: alice }, (tx) =>
        rows(tx, `insert into public.support_messages (ticket_id, author_id, author_role, body) values ('${ticket}', '${alice}', 'admin', 'x')`),
      ),
    ).rejects.toThrow(/row-level security/);
    const updated = await actingAs(db, { userId: alice }, (tx) => rows(tx, `update public.support_tickets set status = 'closed' where id = '${ticket}' returning id`));
    expect(updated).toEqual([]);
  });

  it("refuse plus de 5 Mo ou un format autre qu'une photo", async () => {
    const [message] = await rows<{ id: string }>(db, `select id from public.support_messages limit 1`);
    await expect(
      actingAs(db, "service_role", (tx) =>
        rows(tx, `insert into public.support_attachments (message_id, path, content_type, size_bytes) values ('${message.id}', 'a/b.svg', 'image/svg+xml', 10)`),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      actingAs(db, "service_role", (tx) =>
        rows(tx, `insert into public.support_attachments (message_id, path, content_type, size_bytes) values ('${message.id}', 'a/b.jpg', 'image/jpeg', 6000000)`),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

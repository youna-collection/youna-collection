import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { actingAs, createTestDb, rows } from "./harness";

const alice = "00000000-0000-4000-8000-00000000000a";
const bea = "00000000-0000-4000-8000-00000000000b";
const admin = "00000000-0000-4000-8000-00000000000c";

const activeProduct = "10000000-0000-4000-8000-000000000001";
const draftProduct = "10000000-0000-4000-8000-000000000002";
const activeVariant = "20000000-0000-4000-8000-000000000001";
const draftVariant = "20000000-0000-4000-8000-000000000002";

const aliceOrder = "30000000-0000-4000-8000-00000000000a";
const beaOrder = "30000000-0000-4000-8000-00000000000b";
const beaAddress = "40000000-0000-4000-8000-00000000000b";
const aliceTicket = "50000000-0000-4000-8000-00000000000a";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${alice}', 'alice@test.fr', now()),
      ('${bea}', 'bea@test.fr', now()),
      ('${admin}', 'admin@test.fr', now());
    update public.profiles set role = 'admin' where id = '${admin}';

    insert into public.products (id, slug, name, status) values
      ('${activeProduct}', 'jersey', 'Jersey', 'active'),
      ('${draftProduct}', 'brouillon', 'Brouillon', 'draft');
    insert into public.product_variants (id, product_id, color_name, price_cents, stock) values
      ('${activeVariant}', '${activeProduct}', 'Peach', 899, 5),
      ('${draftVariant}', '${draftProduct}', 'Grey', 899, 1);

    insert into public.addresses (id, user_id, first_name, last_name, line1, postal_code, city) values
      ('${beaAddress}', '${bea}', 'Bea', 'Test', '1 rue', '83000', 'Toulon');

    insert into public.orders (id, user_id, email, subtotal_cents, total_cents) values
      ('${aliceOrder}', '${alice}', 'alice@test.fr', 899, 899),
      ('${beaOrder}', '${bea}', 'bea@test.fr', 1199, 1199);
    insert into public.order_items (order_id, product_name, unit_price_cents, quantity, line_total_cents) values
      ('${aliceOrder}', 'Jersey Peach', 899, 1, 899),
      ('${beaOrder}', 'Liquid Noir', 1199, 1, 1199);
    insert into public.order_notes (order_id, body) values ('${aliceOrder}', 'note interne');

    insert into public.support_tickets (id, order_id, user_id, email, type, subject) values
      ('${aliceTicket}', '${aliceOrder}', '${alice}', 'alice@test.fr', 'return', 'Retour');
  `);
}, 60_000);

describe("règles générales", () => {
  it("active la RLS sur toutes les tables publiques", async () => {
    const missing = await rows(
      db,
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(missing).toEqual([]);
  });

  it("ne donne aux visiteurs aucun droit d'écriture", async () => {
    const tableGrants = await rows(
      db,
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public' and privilege_type <> 'SELECT'`,
    );
    const columnGrants = await rows(
      db,
      `select table_name, privilege_type from information_schema.column_privileges
       where grantee = 'anon' and table_schema = 'public' and privilege_type <> 'SELECT'`,
    );
    expect(tableGrants).toEqual([]);
    expect(columnGrants).toEqual([]);
  });

  it("réserve au serveur les tables de paiement et de numérotation", async () => {
    for (const table of ["checkouts", "checkout_reservations", "stripe_events", "document_counters", "email_suppressions"]) {
      await expect(
        actingAs(db, { userId: admin }, (tx) => rows(tx, `select * from public.${table}`)),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe("visiteur non connecté", () => {
  it("voit seulement les produits publiés", async () => {
    const products = await actingAs(db, "anon", (tx) => rows(tx, "select slug from public.products"));
    expect(products).toEqual([{ slug: "jersey" }]);
  });

  it("ne voit pas les variantes d'un brouillon", async () => {
    const variants = await actingAs(db, "anon", (tx) => rows(tx, "select id from public.product_variants"));
    expect(variants).toEqual([{ id: activeVariant }]);
  });

  it("n'a aucun accès aux données personnelles", async () => {
    for (const table of ["profiles", "addresses", "orders", "order_items", "carts", "favorites", "invoices", "support_tickets"]) {
      await expect(
        actingAs(db, "anon", (tx) => rows(tx, `select * from public.${table}`)),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("ne peut pas modifier le catalogue", async () => {
    await expect(
      actingAs(db, "anon", (tx) => rows(tx, "update public.products set name = 'pirate'")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("cliente connectée", () => {
  const asAlice = { userId: alice };

  it("ne voit que ses propres commandes", async () => {
    const orders = await actingAs(db, asAlice, (tx) => rows(tx, "select id from public.orders"));
    expect(orders).toEqual([{ id: aliceOrder }]);
  });

  it("ne voit que les lignes de ses propres commandes", async () => {
    const items = await actingAs(db, asAlice, (tx) => rows(tx, "select product_name from public.order_items"));
    expect(items).toEqual([{ product_name: "Jersey Peach" }]);
  });

  it("ne voit que son propre profil", async () => {
    const profiles = await actingAs(db, asAlice, (tx) => rows(tx, "select id from public.profiles"));
    expect(profiles).toEqual([{ id: alice }]);
  });

  it("ne voit pas le carnet d'adresses d'une autre cliente", async () => {
    const addresses = await actingAs(db, asAlice, (tx) => rows(tx, "select id from public.addresses"));
    expect(addresses).toEqual([]);
  });

  it("ne peut pas modifier l'adresse d'une autre cliente", async () => {
    const updated = await actingAs(db, asAlice, (tx) =>
      rows(tx, `update public.addresses set city = 'Paris' where id = '${beaAddress}' returning id`),
    );
    expect(updated).toEqual([]);
  });

  it("ne peut pas créer une adresse au nom d'une autre cliente", async () => {
    await expect(
      actingAs(db, asAlice, (tx) =>
        rows(
          tx,
          `insert into public.addresses (user_id, first_name, last_name, line1, postal_code, city)
           values ('${bea}', 'X', 'Y', '1 rue', '75000', 'Paris')`,
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("peut modifier son prénom", async () => {
    const updated = await actingAs(db, asAlice, (tx) =>
      rows(tx, `update public.profiles set first_name = 'Alice' where id = '${alice}' returning first_name`),
    );
    expect(updated).toEqual([{ first_name: "Alice" }]);
  });

  it("ne peut jamais se donner le rôle admin", async () => {
    await expect(
      actingAs(db, asAlice, (tx) => rows(tx, `update public.profiles set role = 'admin' where id = '${alice}'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it("ne peut pas changer le statut d'une commande", async () => {
    const updated = await actingAs(db, asAlice, (tx) =>
      rows(tx, `update public.orders set status = 'refunded' where id = '${aliceOrder}' returning id`),
    );
    expect(updated).toEqual([]);
  });

  it("ne peut pas créer une commande sans payer", async () => {
    await expect(
      actingAs(db, asAlice, (tx) =>
        rows(tx, `insert into public.orders (user_id, email, subtotal_cents, total_cents)
                  values ('${alice}', 'alice@test.fr', 0, 0)`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("ne peut pas modifier un prix ni un stock", async () => {
    const updated = await actingAs(db, asAlice, (tx) =>
      rows(tx, `update public.product_variants set price_cents = 1, stock = 999 returning id`),
    );
    expect(updated).toEqual([]);
  });

  it("ne voit pas les notes internes", async () => {
    const notes = await actingAs(db, asAlice, (tx) => rows(tx, "select id from public.order_notes"));
    expect(notes).toEqual([]);
  });

  it("ne voit pas les codes promo", async () => {
    const codes = await actingAs(db, asAlice, (tx) => rows(tx, "select id from public.promo_codes"));
    expect(codes).toEqual([]);
  });

  it("gère ses favoris, mais pas ceux des autres", async () => {
    const added = await actingAs(db, asAlice, (tx) =>
      rows(tx, `insert into public.favorites (user_id, product_id) values ('${alice}', '${activeProduct}') returning product_id`),
    );
    expect(added).toEqual([{ product_id: activeProduct }]);
    await expect(
      actingAs(db, asAlice, (tx) =>
        rows(tx, `insert into public.favorites (user_id, product_id) values ('${bea}', '${activeProduct}')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("SAV", () => {
  const asAlice = { userId: alice };

  const openTicket = (orderId: string, email: string) =>
    `insert into public.support_tickets (order_id, user_id, email, type, subject)
     values ('${orderId}', '${alice}', '${email}', 'complaint', 'Sujet') returning id`;

  // Depuis la phase 6, les demandes passent par le serveur (délai de retour, photos, clientes sans compte).
  it("ne laisse pas une cliente créer une demande directement, même sur sa commande", async () => {
    await expect(actingAs(db, asAlice, (tx) => rows(tx, openTicket(aliceOrder, "alice@test.fr")))).rejects.toThrow(/permission denied/);
    await expect(actingAs(db, asAlice, (tx) => rows(tx, openTicket(beaOrder, "alice@test.fr")))).rejects.toThrow(/permission denied/);
  });

  it("empêche une cliente de répondre au nom de l'admin", async () => {
    await expect(
      actingAs(db, asAlice, (tx) =>
        rows(tx, `insert into public.support_messages (ticket_id, author_id, author_role, body)
                  values ('${aliceTicket}', '${alice}', 'admin', 'faux')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("empêche une autre cliente d'écrire dans la demande", async () => {
    await expect(
      actingAs(db, { userId: bea }, (tx) =>
        rows(tx, `insert into public.support_messages (ticket_id, author_id, author_role, body)
                  values ('${aliceTicket}', '${bea}', 'customer', 'intrusion')`),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("permet à l'admin de répondre", async () => {
    const reply = await actingAs(db, { userId: admin }, (tx) =>
      rows(tx, `insert into public.support_messages (ticket_id, author_id, author_role, body)
                values ('${aliceTicket}', '${admin}', 'admin', 'Bonjour') returning id`),
    );
    expect(reply).toHaveLength(1);
  });
});

describe("administratrice", () => {
  const asAdmin = { userId: admin };

  it("voit toutes les commandes et les brouillons", async () => {
    await actingAs(db, asAdmin, async (tx) => {
      expect(await rows(tx, "select id from public.orders")).toHaveLength(2);
      expect(await rows(tx, "select id from public.products")).toHaveLength(2);
    });
  });

  it("modifie un statut, et l'historique le retient", async () => {
    const history = await actingAs(db, asAdmin, async (tx) => {
      await rows(tx, `update public.orders set status = 'shipped', tracking_number = 'XY' where id = '${aliceOrder}'`);
      return rows(
        tx,
        `select from_status, to_status from public.order_status_history
         where order_id = '${aliceOrder}' order by changed_at, from_status nulls first`,
      );
    });
    expect(history).toEqual([
      { from_status: null, to_status: "paid" },
      { from_status: "paid", to_status: "shipped" },
    ]);
  });

  it("ne peut pas modifier le montant d'une commande", async () => {
    await expect(
      actingAs(db, asAdmin, (tx) => rows(tx, `update public.orders set total_cents = 1 where id = '${aliceOrder}'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it("ne peut pas supprimer une commande", async () => {
    await expect(
      actingAs(db, asAdmin, (tx) => rows(tx, `delete from public.orders where id = '${aliceOrder}'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it("ne peut pas toucher aux quantités réservées", async () => {
    await expect(
      actingAs(db, asAdmin, (tx) => rows(tx, `update public.product_variants set reserved = 0`)),
    ).rejects.toThrow(/permission denied/);
  });

  it("voit chaque ajustement de stock dans l'historique, signé", async () => {
    const movements = await actingAs(db, asAdmin, async (tx) => {
      await rows(tx, `update public.product_variants set stock = 3 where id = '${activeVariant}'`);
      return rows(
        tx,
        `select delta, stock_after, reason, created_by from public.stock_movements
         where variant_id = '${activeVariant}' and reason = 'manual'`,
      );
    });
    expect(movements).toEqual([{ delta: -2, stock_after: 3, reason: "manual", created_by: admin }]);
  });

  it("seule l'admin dépose des photos", async () => {
    const upload = `insert into storage.objects (bucket_id, name) values ('product-images', 'a.webp') returning name`;
    await expect(actingAs(db, { userId: alice }, (tx) => rows(tx, upload))).rejects.toThrow(/row-level security/);
    expect(await actingAs(db, asAdmin, (tx) => rows(tx, upload))).toEqual([{ name: "a.webp" }]);
  });
});

describe("commandes en invitée et comptes", () => {
  it("rattache les commandes seulement après confirmation de l'email", async () => {
    const orderId = "30000000-0000-4000-8000-0000000000c1";
    const userId = "00000000-0000-4000-8000-0000000000c1";
    await db.exec(`insert into public.orders (id, email, subtotal_cents, total_cents)
                   values ('${orderId}', 'invitee@test.fr', 899, 899)`);

    const owner = async () => (await rows<{ user_id: string | null }>(db, `select user_id from public.orders where id = '${orderId}'`))[0].user_id;

    await db.exec(`insert into auth.users (id, email) values ('${userId}', 'Invitee@Test.fr')`);
    expect(await owner()).toBeNull();

    await db.exec(`update auth.users set email_confirmed_at = now() where id = '${userId}'`);
    expect(await owner()).toBe(userId);
  });

  it("conserve la commande quand le compte est supprimé", async () => {
    const orderId = "30000000-0000-4000-8000-0000000000d1";
    const userId = "00000000-0000-4000-8000-0000000000d1";
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values ('${userId}', 'partie@test.fr', now());
      insert into public.orders (id, user_id, email, subtotal_cents, total_cents)
        values ('${orderId}', '${userId}', 'partie@test.fr', 899, 899);
      insert into public.addresses (user_id, first_name, last_name, line1, postal_code, city)
        values ('${userId}', 'P', 'Q', '1 rue', '83000', 'Toulon');
      delete from auth.users where id = '${userId}';
    `);
    expect(await rows(db, `select user_id from public.orders where id = '${orderId}'`)).toEqual([{ user_id: null }]);
    expect(await rows(db, `select id from public.profiles where id = '${userId}'`)).toEqual([]);
    expect(await rows(db, `select id from public.addresses where user_id = '${userId}'`)).toEqual([]);
  });
});

describe("garde-fous du stock", () => {
  it("refuse un stock négatif", async () => {
    await expect(
      actingAs(db, "service_role", (tx) => rows(tx, `update public.product_variants set stock = -1 where id = '${activeVariant}'`)),
    ).rejects.toThrow(/check constraint/);
  });

  it("refuse de réserver plus que le stock", async () => {
    await expect(
      actingAs(db, "service_role", (tx) => rows(tx, `update public.product_variants set reserved = 6 where id = '${activeVariant}'`)),
    ).rejects.toThrow(/check constraint/);
  });

  it("calcule la quantité disponible", async () => {
    const result = await actingAs(db, "service_role", (tx) =>
      rows(tx, `update public.product_variants set reserved = 2 where id = '${activeVariant}' returning available`),
    );
    expect(result).toEqual([{ available: 3 }]);
  });
});

describe("factures", () => {
  const invoice = "60000000-0000-4000-8000-000000000001";

  beforeAll(async () => {
    await db.exec(`insert into public.invoices (id, order_id, number, seller, buyer, lines, totals)
                   values ('${invoice}', '${aliceOrder}', 1, '{}', '{}', '[]', '{}')`);
  });

  it("interdit de supprimer une facture, même au serveur", async () => {
    await expect(
      actingAs(db, "service_role", (tx) => rows(tx, `delete from public.invoices where id = '${invoice}'`)),
    ).rejects.toThrow(/ne peut pas être supprimée/);
  });

  it("interdit de modifier une facture, même au serveur", async () => {
    await expect(
      actingAs(db, "service_role", (tx) => rows(tx, `update public.invoices set number = 99 where id = '${invoice}'`)),
    ).rejects.toThrow(/ne peut pas être modifiée/);
  });

  it("autorise à renseigner le PDF une seule fois", async () => {
    await actingAs(db, "service_role", async (tx) => {
      await rows(tx, `update public.invoices set pdf_path = 'f1.pdf' where id = '${invoice}'`);
      await expect(
        rows(tx, `update public.invoices set pdf_path = 'f2.pdf' where id = '${invoice}'`),
      ).rejects.toThrow(/ne peut pas être remplacé/);
    });
  });

  it("ne montre une facture qu'à sa propriétaire", async () => {
    expect(await actingAs(db, { userId: alice }, (tx) => rows(tx, "select id from public.invoices"))).toHaveLength(1);
    expect(await actingAs(db, { userId: bea }, (tx) => rows(tx, "select id from public.invoices"))).toEqual([]);
  });

  it("refuse deux factures avec le même numéro", async () => {
    await expect(
      actingAs(db, "service_role", (tx) =>
        rows(tx, `insert into public.invoices (order_id, number, seller, buyer, lines, totals)
                  values ('${beaOrder}', 1, '{}', '{}', '[]', '{}')`),
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

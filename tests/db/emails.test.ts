import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { actingAs, createTestDb, rows } from "./harness";

const admin = "00000000-0000-4000-8000-0000000000ad";
const alice = "00000000-0000-4000-8000-0000000000a1";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${admin}', 'admin@test.fr', now()), ('${alice}', 'alice@test.fr', now());
    update public.profiles set role = 'admin' where id = '${admin}';
    insert into public.email_log (kind, dedupe_key, to_email, subject, html) values ('order_confirmation', 'commande-confirmee:1', 'alice@test.fr', 'Merci', '<p>x</p>');
  `);
}, 60_000);

describe("journal des e-mails", () => {
  it("n'est lisible que par l'admin", async () => {
    expect(await actingAs(db, { userId: admin }, (tx) => rows(tx, "select subject from public.email_log"))).toEqual([{ subject: "Merci" }]);
    expect(await actingAs(db, { userId: alice }, (tx) => rows(tx, "select subject from public.email_log"))).toEqual([]);
    await expect(actingAs(db, "anon", (tx) => rows(tx, "select subject from public.email_log"))).rejects.toThrow(/permission denied/);
  });

  it("ne peut être modifié que par le serveur", async () => {
    await expect(
      actingAs(db, { userId: admin }, (tx) => rows(tx, "insert into public.email_log (kind, dedupe_key, to_email, subject, html) values ('x', 'y', 'a@b.fr', 's', 'h')")),
    ).rejects.toThrow(/permission denied/);
    await expect(actingAs(db, { userId: admin }, (tx) => rows(tx, "update public.email_log set status = 'sent'"))).rejects.toThrow(/permission denied/);
  });

  it("refuse un second e-mail avec la même clé", async () => {
    await expect(
      actingAs(db, "service_role", (tx) =>
        rows(tx, "insert into public.email_log (kind, dedupe_key, to_email, subject, html) values ('order_confirmation', 'commande-confirmee:1', 'a@b.fr', 's', 'h')"),
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

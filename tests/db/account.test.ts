import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { actingAs, createTestDb, rows } from "./harness";

const alice = "00000000-0000-4000-8000-0000000000a1";
const pending = "00000000-0000-4000-8000-0000000000a2";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${alice}', 'alice@test.fr', now());
    insert into auth.users (id, email) values ('${pending}', 'pas-confirme@test.fr');
  `);
});

const insertOrder = (email: string, userId: string | null = null) =>
  actingAs(db, "service_role", async (tx) =>
    (
      await rows<{ user_id: string | null }>(
        tx,
        "insert into public.orders (user_id, email, subtotal_cents, total_cents) values ($1, $2, 1000, 1000) returning user_id",
        [userId, email],
      )
    )[0].user_id,
  );

describe("commande passée sans être connectée", () => {
  it("rejoint le compte confirmé qui a la même adresse e-mail", async () => {
    expect(await insertOrder("alice@test.fr")).toBe(alice);
  });

  it("ne rejoint pas un compte dont l'e-mail n'est pas confirmé", async () => {
    expect(await insertOrder("pas-confirme@test.fr")).toBeNull();
  });

  it("reste sans compte si l'adresse est inconnue", async () => {
    expect(await insertOrder("inconnue@test.fr")).toBeNull();
  });

  it("garde le compte choisi par le serveur quand la cliente était connectée", async () => {
    expect(await insertOrder("autre@test.fr", alice)).toBe(alice);
  });
});

describe("carnet d'adresses", () => {
  it("n'accepte qu'une adresse par défaut par cliente", async () => {
    const insert = `insert into public.addresses (user_id, first_name, last_name, line1, postal_code, city, is_default)
                    values ($1, 'A', 'B', '1 rue', '83000', 'Toulon', true)`;
    await expect(
      actingAs(db, { userId: alice }, async (tx) => {
        await tx.query(insert, [alice]);
        await tx.query(insert, [alice]);
      }),
    ).rejects.toThrow(/addresses_one_default_idx/);
  });
});

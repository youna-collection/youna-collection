import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

/**
 * Reproduit le strict nécessaire de l'environnement Supabase (rôles, auth, storage)
 * dans un vrai moteur Postgres exécuté en mémoire. Les migrations du projet y tournent
 * sans modification : aucun compte ni service externe n'est nécessaire pour les tests.
 */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', ''
    )::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;
`;

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);

  const dir = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  return db;
}

export type Actor = "anon" | "service_role" | { userId: string };

/** Exécute `fn` avec les droits de `actor`, puis annule toutes ses écritures. */
export async function actingAs<T>(
  db: PGlite,
  actor: Actor,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  let result!: T;
  await db.transaction(async (tx) => {
    const role = typeof actor === "string" ? actor : "authenticated";
    const claims = typeof actor === "string" ? {} : { sub: actor.userId, role };
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await tx.exec(`set local role ${role}`);
    result = await fn(tx);
    await tx.rollback();
  });
  return result;
}

export async function rows<T = Record<string, unknown>>(
  tx: Transaction | PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await tx.query<T>(sql, params)).rows;
}

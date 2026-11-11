import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Accès complet à la base, sans les règles RLS. Uniquement côté serveur, et uniquement
 * après avoir vérifié soi-même ce que la personne a le droit de faire.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !key) {
    throw new Error("SUPABASE_SECRET_KEY doit être renseignée.");
  }
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

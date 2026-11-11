import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./env";

/** Client du navigateur, avec la session de la personne connectée (sert à envoyer les photos). */
export function createBrowserSupabase() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}

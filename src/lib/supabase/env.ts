export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Faux tant que les clés Supabase ne sont pas renseignées : le site reste affichable. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const isGoogleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

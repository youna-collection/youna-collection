import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { isSupabaseConfigured } from "./supabase/env";
import { createClient } from "./supabase/server";

export type Profile = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: "customer" | "admin";
};

export const getCurrentUser = cache(async () => {
  if (!isSupabaseConfigured) {
    return null;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, phone, role")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  return data;
});

export async function requireProfile(next: string): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect(`/connexion?next=${encodeURIComponent(next)}`);
  }
  return profile;
}

/** À appeler sur chaque page et action admin. Un compte non admin reçoit une page 404. */
export async function requireAdmin(next = "/admin"): Promise<Profile> {
  const profile = await requireProfile(next);
  if (profile.role !== "admin") {
    notFound();
  }
  return profile;
}

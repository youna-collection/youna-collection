import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { safePath } from "@/lib/safe-path";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "magiclink", "recovery", "invite", "email", "email_change"];

function isOtpType(value: string | null): value is EmailOtpType {
  return OTP_TYPES.includes(value as EmailOtpType);
}

/**
 * Page de retour d'un lien. Les modèles d'e-mail Supabase (supabase/templates) passent l'adresse
 * de retour demandée dans « redirect_to » : on n'en garde que le chemin interne (« next »).
 */
function nextPath(searchParams: URLSearchParams): string {
  const direct = searchParams.get("next");
  if (direct) return safePath(direct);
  try {
    return safePath(new URL(searchParams.get("redirect_to") ?? "").searchParams.get("next"));
  } catch {
    return safePath(null);
  }
}

/** Point d'arrivée des liens reçus par email et de la connexion Google. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = nextPath(searchParams);

  if (isSupabaseConfigured) {
    const supabase = await createClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, request.url));
    } else if (tokenHash && isOtpType(type)) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/connexion?erreur=lien", request.url));
}

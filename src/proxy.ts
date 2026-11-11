import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

/** Renouvelle la session et renvoie vers la connexion sur les pages privées. */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    const { pathname, search } = request.nextUrl;
    const loginUrl = new URL("/connexion", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// Limité aux pages privées : les pages publiques restent rapides et ne consomment rien ici.
export const config = {
  matcher: ["/compte/:path*", "/admin/:path*", "/nouveau-mot-de-passe"],
};

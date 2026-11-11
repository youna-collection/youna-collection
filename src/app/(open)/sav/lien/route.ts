import { NextResponse, type NextRequest } from "next/server";
import { LINK_VALIDITY_DAYS } from "@/lib/support-token";
import { orderFromToken, SUPPORT_COOKIE } from "@/lib/support";

/** Lien reçu par e-mail : on garde l'accès dans un cookie, puis on enlève le jeton de l'adresse. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const ticket = request.nextUrl.searchParams.get("demande") ?? "";
  const order = token.length < 200 ? await orderFromToken(token) : null;
  if (!order) return NextResponse.redirect(new URL("/sav?lien=expire", request.url));

  const target = /^\d{1,9}$/.test(ticket) ? `/sav/suivi/${ticket}` : "/sav/suivi";
  const response = NextResponse.redirect(new URL(target, request.url));
  response.cookies.set(SUPPORT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/sav",
    maxAge: LINK_VALIDITY_DAYS * 24 * 60 * 60,
  });
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

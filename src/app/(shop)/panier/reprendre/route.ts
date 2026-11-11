import { type NextRequest, NextResponse } from "next/server";
import { adoptCart } from "@/lib/cart";
import { verifyResumeToken } from "@/lib/reminder-rules";

/** Lien « Reprendre mon panier » des e-mails de rappel. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const secret = process.env.SUPABASE_SECRET_KEY;
  const cartId = secret ? verifyResumeToken(secret, token) : null;
  if (!cartId) return NextResponse.redirect(new URL("/panier", request.url));

  const result = await adoptCart(cartId);
  if (result === "login") return NextResponse.redirect(new URL("/connexion?next=/panier", request.url));
  return NextResponse.redirect(new URL("/panier", request.url));
}

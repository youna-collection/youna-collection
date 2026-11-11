import { type NextRequest, NextResponse } from "next/server";
import { unsubscribeEmail } from "@/lib/cart-reminders";
import { verifyUnsubscribeToken } from "@/lib/reminder-rules";

/**
 * Désinscription « en un clic » proposée par Gmail, Outlook… à côté de l'expéditeur
 * (en-tête List-Unsubscribe). La messagerie envoie un POST, sans que la cliente ouvre le site.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  const email = secret ? verifyUnsubscribeToken(secret, request.nextUrl.searchParams.get("t") ?? "") : null;
  if (!email) return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  await unsubscribeEmail(email);
  return NextResponse.json({ ok: true });
}

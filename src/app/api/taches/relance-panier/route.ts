import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { runCartReminders } from "@/lib/cart-reminders";

/**
 * Appelée chaque heure par la tâche planifiée Netlify (netlify/functions/relance-panier.mts),
 * avec le mot de passe CRON_SECRET. Ne renvoie que des chiffres, aucune donnée personnelle.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 25;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    return NextResponse.json(await runCartReminders());
  } catch (error) {
    console.error("Relance panier", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Échec de la relance" }, { status: 500 });
  }
}

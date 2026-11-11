"use server";

import { z } from "zod";
import { getCart } from "@/lib/cart";
import { normalizePromoCode, type Promo, promoError } from "@/lib/promo";
import { createAdminClient } from "@/lib/supabase/admin";

export type PromoCheck = { ok: true; promo: Promo } | { ok: false; error: string };

/** Vérifie un code pour le panier en cours (le montant est recalculé au paiement). */
export async function checkPromoCode(code: string, email: string): Promise<PromoCheck> {
  const clean = normalizePromoCode(code);
  if (!/^[A-Z0-9_-]{2,40}$/.test(clean)) return { ok: false, error: "Ce code n'existe pas." };
  const cart = await getCart();
  if (!cart.lines.length) return { ok: false, error: "Votre panier est vide." };
  const validEmail = z.email().safeParse(email.trim().toLowerCase());
  const { data, error } = await createAdminClient().rpc("promo_quote", {
    p_code: clean,
    p_subtotal_cents: cart.subtotalCents,
    p_email: validEmail.success ? validEmail.data : null,
  });
  if (error || !data) return { ok: false, error: promoError(error?.message ?? "", error?.details) };
  return { ok: true, promo: data as Promo };
}

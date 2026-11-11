"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { evaluateCart, MAX_LINE_QUANTITY, type RawCartItem } from "@/lib/cart-rules";
import { fetchVariants, findOrCreateCart, loadCartItems, setCartCountCookie } from "@/lib/cart";
import { getShopStatus, MAINTENANCE_MESSAGE } from "@/lib/shop-status";
import { createAdminClient } from "@/lib/supabase/admin";

export type CartActionResult = { ok: true; count: number } | { ok: false; error: string };

const addSchema = z.object({
  variantId: z.uuid(),
  quantity: z.int().min(1).max(MAX_LINE_QUANTITY),
  veilIds: z.array(z.uuid()).max(12).default([]),
});

const sameVeils = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

async function afterChange(cartId: string, items: RawCartItem[]): Promise<number> {
  const count = items.reduce((total, item) => total + item.quantity, 0);
  await createAdminClient().from("carts").update({ last_activity_at: new Date().toISOString() }).eq("id", cartId);
  await setCartCountCookie(count);
  revalidatePath("/panier");
  return count;
}

/**
 * Ajoute un article (ou un bouquet et ses voiles). Le prix et le stock sont relus en base :
 * ce que le navigateur envoie n'est qu'une demande.
 */
export async function addToCart(input: unknown): Promise<CartActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  if ((await getShopStatus()).maintenance) return { ok: false, error: MAINTENANCE_MESSAGE };
  const { variantId, quantity, veilIds } = parsed.data;

  const cart = await findOrCreateCart();
  const items = await loadCartItems(cart.id);
  const variants = await fetchVariants([variantId, ...veilIds, ...items.flatMap((item) => [item.variantId, ...item.veilIds])]);
  const variant = variants.get(variantId);
  if (!variant) return { ok: false, error: "Cet article n'existe plus." };
  const isBouquet = variant.productKind === "bouquet";

  const existing = items.find(
    (item) => item.variantId === variantId && (isBouquet ? sameVeils(item.veilIds, veilIds) : true),
  );
  const nextQuantity = (existing?.quantity ?? 0) + quantity;
  if (nextQuantity > MAX_LINE_QUANTITY) {
    return { ok: false, error: `Maximum ${MAX_LINE_QUANTITY} exemplaires par article.` };
  }

  const draftId = existing?.id ?? "nouvelle-ligne";
  const draft: RawCartItem[] = existing
    ? items.map((item) => (item.id === existing.id ? { ...item, quantity: nextQuantity } : item))
    : [...items, { id: draftId, variantId, quantity, veilIds: isBouquet ? veilIds : [] }];
  const problem = evaluateCart(draft, variants).lines.find((line) => line.id === draftId)?.problem;
  if (problem) return { ok: false, error: problem };

  const admin = createAdminClient();
  if (existing) {
    const { error } = await admin.from("cart_items").update({ quantity: nextQuantity }).eq("id", existing.id);
    if (error) return { ok: false, error: "Le panier n'a pas pu être mis à jour." };
  } else {
    const { error } = await admin.from("cart_items").insert({
      cart_id: cart.id,
      variant_id: variantId,
      quantity,
      bouquet_veil_variant_ids: isBouquet ? veilIds : null,
    });
    if (error) return { ok: false, error: "Le panier n'a pas pu être mis à jour." };
  }
  return { ok: true, count: await afterChange(cart.id, await loadCartItems(cart.id)) };
}

const updateSchema = z.object({ lineId: z.uuid(), quantity: z.int().min(0).max(MAX_LINE_QUANTITY) });

/** Change la quantité d'une ligne ; 0 la retire. Seulement dans le panier de la personne. */
export async function updateCartItem(input: unknown): Promise<CartActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Demande invalide." };
  const { lineId, quantity } = parsed.data;

  const cart = await findOrCreateCart();
  const admin = createAdminClient();
  const query =
    quantity === 0
      ? admin.from("cart_items").delete().eq("id", lineId).eq("cart_id", cart.id)
      : admin.from("cart_items").update({ quantity }).eq("id", lineId).eq("cart_id", cart.id);
  const { error } = await query;
  if (error) return { ok: false, error: "Le panier n'a pas pu être mis à jour." };
  return { ok: true, count: await afterChange(cart.id, await loadCartItems(cart.id)) };
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "./auth";
import { getCurrentUser } from "@/lib/auth";
import { getCart } from "@/lib/cart";
import { buildSnapshot, type ShippingChoice } from "@/lib/cart-rules";
import { getShippingMethods } from "@/lib/catalog";
import { applyPromo, normalizePromoCode, type Promo, promoError } from "@/lib/promo";
import { getServicePoint, isSendcloudConfigured } from "@/lib/sendcloud";
import { quote } from "@/lib/shipping";
import { isLoginRequiredForCheckout } from "@/lib/shop-info";
import { getShopStatus, MAINTENANCE_MESSAGE } from "@/lib/shop-status";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/** Le stock est réservé un peu plus longtemps que la page de paiement Stripe ne reste ouverte. */
const STRIPE_MINUTES = 31;
const RESERVATION_MINUTES = 36;

const text = (max: number) => z.string().trim().max(max);
const required = (max: number, message: string) => text(max).min(1, message);

const schema = z.object({
  email: z.email("Adresse e-mail invalide.").trim().toLowerCase().max(254),
  firstName: required(80, "Prénom manquant."),
  lastName: required(80, "Nom manquant."),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 .()-]{6,20}$/, "Numéro de téléphone invalide."),
  country: z.string().regex(/^[A-Z]{2}$/, "Pays invalide."),
  method: required(40, "Choisissez un mode de livraison."),
  line1: text(120).optional(),
  line2: text(120).optional(),
  postalCode: text(12).optional(),
  city: text(80).optional(),
  relay: text(2000).optional(),
  reminderConsent: z.literal("on").optional(),
  promoCode: text(40).optional(),
});

const relaySchema = z.object({
  id: required(20, "Point relais invalide."),
  name: required(120, "Point relais invalide."),
  address1: text(120),
  address2: text(120).optional().default(""),
  postalCode: required(12, "Point relais invalide."),
  city: required(80, "Point relais invalide."),
  country: z.string().regex(/^[A-Z]{2}$/),
});

const fail = (message: string): ActionState => ({ status: "error", message });

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" && value !== "" ? value : undefined;
};

export async function startCheckout(_: ActionState, formData: FormData): Promise<ActionState> {
  if (!isStripeConfigured) return fail("Le paiement n'est pas encore configuré.");
  if ((await getShopStatus()).maintenance) return fail(MAINTENANCE_MESSAGE);
  if ((await isLoginRequiredForCheckout()) && !(await getCurrentUser())) {
    return fail("Connectez-vous ou créez votre compte pour commander : votre panier est gardé.");
  }

  const parsed = schema.safeParse(Object.fromEntries(Object.keys(schema.shape).map((key) => [key, field(formData, key)])));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Formulaire incomplet.");
  const input = parsed.data;

  // Tout est recalculé ici : prix, stock et frais de port viennent de la base.
  const cart = await getCart();
  if (!cart.cart || !cart.lines.length) return fail("Votre panier est vide.");
  if (!cart.canCheckout) return fail("Certains articles ne sont plus disponibles. Retournez au panier pour les corriger.");

  const method = (await getShippingMethods()).find((m) => m.code === input.method);
  const shippingCents = method ? quote(method, input.country, cart.weightGrams) : null;
  if (!method || shippingCents === null) return fail("Ce mode de livraison n'est pas disponible pour ce pays.");

  const contact = { first_name: input.firstName, last_name: input.lastName, phone: input.phone, country: input.country };
  let address: Record<string, string> = contact;
  let relayPoint: Record<string, string> | null = null;

  if (method.requiresAddress) {
    if (!input.line1 || !input.postalCode || !input.city) return fail("Adresse de livraison incomplète.");
    address = { ...contact, line1: input.line1, line2: input.line2 ?? "", postal_code: input.postalCode, city: input.city };
  }
  if (method.requiresRelayPoint) {
    let relay: z.infer<typeof relaySchema>;
    try {
      relay = relaySchema.parse(JSON.parse(input.relay ?? ""));
    } catch {
      return fail("Choisissez votre point relais sur la carte.");
    }
    // Le point est relu chez Sendcloud : on garde son adresse officielle, pas celle envoyée par le navigateur.
    if (!isSendcloudConfigured) return fail("Le choix du point relais n'est pas encore disponible. Choisissez un autre mode de livraison.");
    let point: Awaited<ReturnType<typeof getServicePoint>>;
    try {
      point = await getServicePoint(relay.id);
    } catch {
      return fail("Le point relais n'a pas pu être vérifié. Réessayez dans un instant.");
    }
    if (!point || point.carrier !== "mondial_relay") return fail("Ce point relais n'est plus disponible. Choisissez-en un autre.");
    if (point.country !== input.country) return fail("Le point relais doit être dans le pays choisi.");
    relayPoint = { ...point };
  }

  const shipping: ShippingChoice = {
    methodCode: method.code,
    carrier: method.carrier,
    name: method.name,
    priceCents: shippingCents,
    address,
    relayPoint,
  };
  const admin = createAdminClient();

  // Code promo : revérifié ici (dates, limite d'utilisations, montant minimum, une fois par cliente).
  let promo: Promo | null = null;
  const promoCode = input.promoCode ? normalizePromoCode(input.promoCode) : "";
  if (promoCode) {
    const { data, error } = await admin.rpc("promo_quote", { p_code: promoCode, p_subtotal_cents: cart.subtotalCents, p_email: input.email });
    if (error || !data) return fail(`Code promo : ${promoError(error?.message ?? "", error?.details)} Retirez-le pour continuer.`);
    promo = data as Promo;
  }
  const priced = applyPromo(promo, cart.subtotalCents, shippingCents);

  const snapshot = buildSnapshot(
    cart,
    shipping,
    { email: input.email, firstName: input.firstName, lastName: input.lastName, phone: input.phone },
    promo ? { code: promo.code, discountCents: priced.discountCents, shippingCents: priced.shippingCents } : null,
  );

  const stripe = getStripe();
  const user = await getCurrentUser();
  const cartId = cart.cart.id;

  // Une ancienne page de paiement de ce panier ne doit plus pouvoir être payée.
  const { data: previous } = await admin
    .from("checkouts")
    .select("stripe_session_id")
    .eq("cart_id", cartId)
    .eq("status", "open")
    .not("stripe_session_id", "is", null);
  for (const row of previous ?? []) {
    await stripe.checkout.sessions.expire(row.stripe_session_id!).catch(() => undefined);
  }

  const now = Date.now();
  const { data: checkoutId, error: reserveError } = await admin.rpc("create_checkout", {
    p_cart_id: cartId,
    p_user_id: user?.id ?? null,
    p_email: input.email,
    p_snapshot: snapshot,
    p_items: cart.stockItems,
    p_expires_at: new Date(now + RESERVATION_MINUTES * 60_000).toISOString(),
  });
  if (reserveError || !checkoutId) {
    if (reserveError?.message.includes("stock_insuffisant")) {
      return fail("Un article vient d'être vendu entre-temps. Retournez au panier pour voir ce qui reste.");
    }
    return fail("La commande n'a pas pu être préparée. Réessayez dans un instant.");
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let sessionUrl: string | null;
  try {
    // La réduction calculée par le site devient un coupon Stripe à usage unique.
    const coupon = priced.discountCents
      ? await stripe.coupons.create(
          { amount_off: priced.discountCents, currency: "eur", duration: "once", max_redemptions: 1, name: `Code ${promo!.code}`.slice(0, 40) },
          { idempotencyKey: `coupon-${checkoutId}` },
        )
      : null;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        locale: "fr",
        currency: "eur",
        customer_email: input.email,
        client_reference_id: checkoutId,
        metadata: { checkout_id: checkoutId },
        payment_intent_data: { metadata: { checkout_id: checkoutId } },
        expires_at: Math.floor(now / 1000) + STRIPE_MINUTES * 60,
        line_items: snapshot.items.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: "eur",
            unit_amount: item.unit_price_cents,
            product_data: {
              name: [item.product_name, item.variant_label].filter(Boolean).join(" — "),
              ...(item.components.length ? { description: item.components.map((c) => c.label).join(", ") } : {}),
            },
          },
        })),
        ...(coupon ? { discounts: [{ coupon: coupon.id }] } : {}),
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              display_name: method.name,
              fixed_amount: { amount: priced.shippingCents, currency: "eur" },
            },
          },
        ],
        success_url: `${site}/commande/confirmee?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/commande`,
      },
      { idempotencyKey: `checkout-${checkoutId}` },
    );
    sessionUrl = session.url;
    await admin.from("checkouts").update({ stripe_session_id: session.id }).eq("id", checkoutId);
  } catch (error) {
    console.error("Stripe :", error instanceof Error ? error.message : error);
    await admin.rpc("release_checkout", { p_checkout_id: checkoutId });
    return fail("Le paiement n'a pas pu démarrer. Réessayez dans un instant.");
  }

  // Le rappel de panier ne part que si la case a été cochée cette fois-ci (jamais pré-cochée).
  // La cocher de nouveau après une désinscription vaut un nouveau consentement.
  await admin
    .from("carts")
    .update({
      email: input.email,
      reminder_consent: Boolean(input.reminderConsent),
      reminder_consent_at: input.reminderConsent ? new Date().toISOString() : null,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", cartId);
  if (input.reminderConsent) await admin.from("email_suppressions").delete().eq("email", input.email);

  if (!sessionUrl) return fail("Le paiement n'a pas pu démarrer. Réessayez dans un instant.");
  redirect(sessionUrl);
}

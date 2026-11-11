import type Stripe from "stripe";
import { fulfillSession, releaseSession } from "@/lib/orders";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe prévient ici quand un paiement aboutit ou expire. La signature prouve que
 * l'appel vient bien de Stripe ; un même événement n'est jamais traité deux fois.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Configuration manquante", { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("Signature invalide", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: seen } = await admin.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return Response.json({ received: true, duplicate: true });

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await fulfillSession(event.data.object);
      break;
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      await releaseSession(event.data.object);
      break;
  }

  // Noté seulement une fois traité : en cas d'erreur, Stripe renverra l'événement.
  await admin.from("stripe_events").upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true });
  return Response.json({ received: true });
}

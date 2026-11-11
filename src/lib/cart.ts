import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "./auth";
import { evaluateCart, type CartVariantInfo, type EvaluatedCart, type RawCartItem } from "./cart-rules";
import { getProducts } from "./catalog";
import { imagesForVariant } from "./product";
import { createAdminClient } from "./supabase/admin";

/** Jeton du panier d'une invitée : seule son empreinte est enregistrée en base. */
export const CART_COOKIE = "youna_panier";
/** Nombre d'articles, lisible par le navigateur pour l'icône du panier. */
export const CART_COUNT_COOKIE = "youna_panier_n";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 60;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

type CartRecord = { id: string; email: string | null; reminder_consent: boolean };

const VARIANT_SELECT = `
  id, sku, color_name, size, price_cents, weight_grams, available, track_stock, is_active, bouquet_veil_count,
  product:products ( id, slug, name, kind, status, publish_at, bouquet_eligible )
`;

type VariantRow = {
  id: string;
  sku: string | null;
  color_name: string | null;
  size: string | null;
  price_cents: number;
  weight_grams: number;
  available: number;
  track_stock: boolean;
  is_active: boolean;
  bouquet_veil_count: number | null;
  product: {
    id: string;
    slug: string;
    name: string;
    kind: "standard" | "bouquet";
    status: string;
    publish_at: string | null;
    bouquet_eligible: boolean;
  };
};

/** Lit l'état réel (prix, stock) des articles : jamais celui envoyé par le navigateur. */
export async function fetchVariants(ids: string[]): Promise<Map<string, CartVariantInfo>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await createAdminClient().from("product_variants").select(VARIANT_SELECT).in("id", unique);
  if (error) throw new Error(`Articles : ${error.message}`);
  return new Map(
    (data as unknown as VariantRow[]).map((row) => [
      row.id,
      {
        id: row.id,
        sku: row.sku,
        productId: row.product.id,
        productSlug: row.product.slug,
        productName: row.product.name,
        productKind: row.product.kind,
        // Un produit programmé ne peut pas être acheté avant sa date de mise en ligne.
        productActive: row.product.status === "active" && (!row.product.publish_at || new Date(row.product.publish_at) <= new Date()),
        productBouquetEligible: row.product.bouquet_eligible,
        colorName: row.color_name,
        size: row.size,
        priceCents: row.price_cents,
        weightGrams: row.weight_grams,
        available: row.available,
        trackStock: row.track_stock,
        isActive: row.is_active,
        bouquetVeilCount: row.bouquet_veil_count,
      },
    ]),
  );
}

/**
 * Retrouve le panier en cours. Une cliente qui se connecte récupère le panier
 * qu'elle a rempli en tant qu'invitée.
 */
async function findCart(): Promise<CartRecord | null> {
  const admin = createAdminClient();
  const user = await getCurrentUser();
  const token = (await cookies()).get(CART_COOKIE)?.value;

  const guest = token
    ? (
        await admin
          .from("carts")
          .select("id, email, reminder_consent")
          .eq("guest_token_hash", hashToken(token))
          .is("user_id", null)
          .eq("status", "active")
          .maybeSingle<CartRecord>()
      ).data
    : null;

  if (!user) return guest;

  const { data: own } = await admin
    .from("carts")
    .select("id, email, reminder_consent")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle<CartRecord>();

  if (!guest) return own;

  if (!own) {
    await admin.from("carts").update({ user_id: user.id, guest_token_hash: null }).eq("id", guest.id);
    return guest;
  }
  await admin.from("cart_items").update({ cart_id: own.id }).eq("cart_id", guest.id);
  await admin.from("carts").delete().eq("id", guest.id);
  return own;
}

/** Utilisable uniquement dans une action serveur (crée le cookie si besoin). */
export async function findOrCreateCart(): Promise<CartRecord> {
  const existing = await findCart();
  if (existing) return existing;

  const admin = createAdminClient();
  const user = await getCurrentUser();
  if (user) {
    const { data, error } = await admin
      .from("carts")
      .insert({ user_id: user.id })
      .select("id, email, reminder_consent")
      .single<CartRecord>();
    if (data) return data;
    // Deux onglets en même temps : l'autre a créé le panier.
    const again = await findCart();
    if (again) return again;
    throw new Error(`Panier : ${error?.message}`);
  }

  const token = randomBytes(32).toString("base64url");
  const { data, error } = await admin
    .from("carts")
    .insert({ guest_token_hash: hashToken(token) })
    .select("id, email, reminder_consent")
    .single<CartRecord>();
  if (error || !data) throw new Error(`Panier : ${error?.message}`);
  (await cookies()).set(CART_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return data;
}

export async function loadCartItems(cartId: string): Promise<RawCartItem[]> {
  const { data, error } = await createAdminClient()
    .from("cart_items")
    .select("id, variant_id, quantity, bouquet_veil_variant_ids")
    .eq("cart_id", cartId)
    .order("created_at");
  if (error) throw new Error(`Panier : ${error.message}`);
  return data.map((row) => ({
    id: row.id,
    variantId: row.variant_id,
    quantity: row.quantity,
    veilIds: row.bouquet_veil_variant_ids ?? [],
  }));
}

export type CartView = EvaluatedCart & {
  cart: CartRecord | null;
  images: Record<string, { url: string; alt: string } | undefined>;
};

/** Le panier complet, vérifié article par article. */
export async function getCart(): Promise<CartView> {
  const cart = await findCart();
  const items = cart ? await loadCartItems(cart.id) : [];
  const variants = await fetchVariants(items.flatMap((item) => [item.variantId, ...item.veilIds]));
  const evaluated = evaluateCart(items, variants);

  const products = await getProducts();
  const images: CartView["images"] = {};
  for (const line of evaluated.lines) {
    const product = products.find((p) => p.id === line.variant?.productId);
    const image = product ? imagesForVariant(product, line.variant!.id)[0] : undefined;
    images[line.id] = image ? { url: image.url, alt: image.alt } : undefined;
  }
  return { ...evaluated, cart, images };
}

export async function setCartCountCookie(count: number) {
  (await cookies()).set(CART_COUNT_COOKIE, String(count), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * Lien « Reprendre mon panier » reçu par e-mail. Le panier d'une invitée est rattaché à l'appareil
 * qui ouvre le lien (elle a pu commencer sur son téléphone et lire l'e-mail sur son ordinateur) ;
 * celui d'une cliente avec compte demande simplement de se connecter.
 */
export async function adoptCart(cartId: string): Promise<"ok" | "login" | "gone"> {
  const admin = createAdminClient();
  const { data: cart } = await admin
    .from("carts")
    .select("id, user_id, guest_token_hash")
    .eq("id", cartId)
    .eq("status", "active")
    .maybeSingle<{ id: string; user_id: string | null; guest_token_hash: string | null }>();
  if (!cart) return "gone";

  const user = await getCurrentUser();
  if (cart.user_id) return user?.id === cart.user_id ? "ok" : "login";

  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;
  if (token && cart.guest_token_hash === hashToken(token) && !user) return "ok";

  // Le panier que cet appareil avait déjà rejoint celui de l'e-mail.
  if (token && cart.guest_token_hash !== hashToken(token)) {
    const { data: current } = await admin
      .from("carts")
      .select("id")
      .eq("guest_token_hash", hashToken(token))
      .is("user_id", null)
      .eq("status", "active")
      .maybeSingle<{ id: string }>();
    if (current) {
      await admin.from("cart_items").update({ cart_id: cart.id }).eq("cart_id", current.id);
      await admin.from("carts").delete().eq("id", current.id);
    }
  }

  let finalId = cart.id;
  if (user) {
    // Connectée : le panier rejoint son compte, comme à la connexion.
    const { data: own } = await admin.from("carts").select("id").eq("user_id", user.id).eq("status", "active").maybeSingle<{ id: string }>();
    if (own) {
      await admin.from("cart_items").update({ cart_id: own.id }).eq("cart_id", cart.id);
      await admin.from("carts").delete().eq("id", cart.id);
      finalId = own.id;
    } else {
      await admin.from("carts").update({ user_id: user.id, guest_token_hash: null }).eq("id", cart.id);
    }
    store.delete(CART_COOKIE);
  } else {
    const fresh = randomBytes(32).toString("base64url");
    await admin.from("carts").update({ guest_token_hash: hashToken(fresh) }).eq("id", cart.id);
    store.set(CART_COOKIE, fresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }

  const items = await loadCartItems(finalId);
  await setCartCountCookie(items.reduce((total, item) => total + item.quantity, 0));
  return "ok";
}

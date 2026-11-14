import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CartLineControls } from "@/components/cart-line-controls";
import { SyncCartCount } from "@/components/cart-link";
import { getCart } from "@/lib/cart";
import { getShippingMethods } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { isLoginRequiredForCheckout } from "@/lib/shop-info";

export const metadata: Metadata = { title: "Panier" };

export default async function CartPage() {
  const [cart, methods, loginRequired, user] = await Promise.all([getCart(), getShippingMethods(), isLoginRequiredForCheckout(), getCurrentUser()]);
  const cheapest = Math.min(...methods.flatMap((method) => method.rates.filter((rate) => rate.priceCents > 0).map((rate) => rate.priceCents)));

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:py-12">
      <SyncCartCount count={cart.count} />
      <h1 className="mb-8 text-2xl font-light tracking-[0.15em] uppercase">Panier</h1>

      {!cart.lines.length ? (
        <div className="flex flex-col items-start gap-6">
          <p className="text-muted">Votre panier est vide.</p>
          <Link href="/" className="min-h-12 bg-ink px-6 py-4 text-sm tracking-widest text-ivory uppercase">
            Découvrir la collection
          </Link>
        </div>
      ) : (
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_18rem]">
          <ul className="flex flex-col divide-y divide-sand border-y border-sand">
            {cart.lines.map((line) => {
              const image = cart.images[line.id];
              return (
                <li key={line.id} className="flex gap-4 py-5">
                  <div className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden bg-photo md:w-24">
                    {image ? <Image src={image.url} alt={image.alt} fill sizes="96px" className="object-cover" /> : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex justify-between gap-4">
                      <div>
                        {line.variant ? (
                          <Link href={`/produits/${line.variant.productSlug}`} className="text-sm tracking-widest uppercase hover:underline">
                            {line.productName}
                          </Link>
                        ) : (
                          <p className="text-sm tracking-widest uppercase">{line.productName}</p>
                        )}
                        {line.label ? <p className="text-sm text-muted">{line.label}</p> : null}
                      </div>
                      <p className="text-sm whitespace-nowrap">{formatPrice(line.lineTotalCents)}</p>
                    </div>
                    {line.components.length ? (
                      <ul className="text-sm text-muted">
                        {Object.entries(
                          line.components.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.label]: (acc[c.label] ?? 0) + 1 }), {}),
                        ).map(([label, n]) => (
                          <li key={label}>
                            {n} × {label}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {line.problem ? <p className="text-sm text-danger">{line.problem}</p> : null}
                    <CartLineControls lineId={line.id} quantity={line.quantity} maxQuantity={line.maxQuantity} />
                  </div>
                </li>
              );
            })}
          </ul>

          <aside className="flex flex-col gap-4 md:sticky md:top-28 md:self-start">
            <div className="flex justify-between text-sm">
              <span>Sous-total</span>
              <span>{formatPrice(cart.subtotalCents)}</span>
            </div>
            <p className="text-sm text-muted">
              Livraison calculée à l&apos;étape suivante
              {Number.isFinite(cheapest) ? `, à partir de ${formatPrice(cheapest)}` : ""}. Click &amp; collect gratuit.
            </p>
            {loginRequired && !user ? <p className="text-sm text-muted">Vous vous connecterez (ou créerez votre compte) à l&apos;étape suivante.</p> : null}
            {cart.canCheckout ? (
              <Link href="/commande" className="flex min-h-12 items-center justify-center bg-ink px-6 text-sm tracking-widest text-ivory uppercase">
                Commander
              </Link>
            ) : (
              <p className="border border-danger p-3 text-sm text-danger">
                Corrigez les articles signalés pour pouvoir commander.
              </p>
            )}
            <Link href="/" className="text-center text-xs tracking-widest text-muted uppercase hover:underline">
              Continuer mes achats
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}

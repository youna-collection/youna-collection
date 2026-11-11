import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/checkout-form";
import { getMyAddresses } from "@/lib/account";
import { getCurrentProfile } from "@/lib/auth";
import { getCart } from "@/lib/cart";
import { getShippingMethods } from "@/lib/catalog";
import { shippingCountries } from "@/lib/shipping";

export const metadata: Metadata = { title: "Commande" };

export default async function CheckoutPage() {
  const cart = await getCart();
  if (!cart.lines.length || !cart.canCheckout) redirect("/panier");
  const [methods, profile] = await Promise.all([getShippingMethods(), getCurrentProfile()]);
  const addresses = profile ? await getMyAddresses() : [];
  const main = addresses.find((a) => a.is_default) ?? addresses[0];

  const lines = cart.lines.map((line) => {
    const counts = new Map<string, number>();
    for (const component of line.components) counts.set(component.label, (counts.get(component.label) ?? 0) + 1);
    return {
      id: line.id,
      name: line.productName,
      label: line.label,
      quantity: line.quantity,
      totalCents: line.lineTotalCents,
      details: [...counts].map(([label, n]) => `${n} × ${label}`),
    };
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:py-12">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Commande</h1>
        <Link href="/panier" className="text-xs tracking-widest text-muted uppercase hover:underline">
          Modifier le panier
        </Link>
      </div>
      <CheckoutForm
        methods={methods}
        countries={shippingCountries(methods)}
        weightGrams={cart.weightGrams}
        subtotalCents={cart.subtotalCents}
        lines={lines}
        defaults={{
          email: profile?.email ?? cart.cart?.email ?? "",
          firstName: profile?.first_name ?? main?.first_name ?? "",
          lastName: profile?.last_name ?? main?.last_name ?? "",
          phone: profile?.phone ?? main?.phone ?? "",
        }}
        savedAddresses={addresses}
      />
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { deleteAddress, setDefaultAddress } from "@/app/actions/account";
import { AddressForm } from "@/components/address-form";
import { getMyAddresses } from "@/lib/account";
import { requireProfile } from "@/lib/auth";
import { COUNTRY_NAMES } from "@/lib/shipping";

export const metadata: Metadata = { title: "Mes adresses" };
export const dynamic = "force-dynamic";

const smallButton = "min-h-10 text-xs tracking-widest uppercase underline-offset-4 hover:underline";

export default async function AddressesPage({ searchParams }: PageProps<"/compte/adresses">) {
  await requireProfile("/compte/adresses");
  const params = await searchParams;
  const addresses = await getMyAddresses();
  const editing = typeof params.modifier === "string" ? addresses.find((a) => a.id === params.modifier) : undefined;
  const creating = params.nouvelle === "1" || (!addresses.length && !editing);

  if (editing || creating) {
    return (
      <div className="flex max-w-xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          {addresses.length ? (
            <Link href="/compte/adresses" className="text-xs tracking-widest text-muted uppercase hover:underline">
              ← Mes adresses
            </Link>
          ) : null}
          <h1 className="text-2xl font-light tracking-[0.15em] uppercase">{editing ? "Modifier l'adresse" : "Nouvelle adresse"}</h1>
          {!addresses.length ? (
            <p className="text-sm text-muted">Enregistrez une adresse : elle sera proposée automatiquement à la commande.</p>
          ) : null}
        </div>
        <AddressForm key={editing?.id ?? "nouvelle"} address={editing} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-light tracking-[0.15em] uppercase">Mes adresses</h1>
        <Link href="/compte/adresses?nouvelle=1" className="text-xs tracking-widest uppercase underline underline-offset-4">
          Ajouter une adresse
        </Link>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {addresses.map((address) => (
          <li key={address.id} className={`flex flex-col gap-3 border p-4 text-sm ${address.is_default ? "border-ink" : "border-sand"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs tracking-widest uppercase">{address.label ?? "Adresse"}</p>
              {address.is_default ? <p className="text-xs text-muted">Par défaut</p> : null}
            </div>
            <p className="leading-relaxed">
              {address.first_name} {address.last_name}
              <br />
              {address.line1}
              {address.line2 ? (
                <>
                  <br />
                  {address.line2}
                </>
              ) : null}
              <br />
              {address.postal_code} {address.city}
              <br />
              {COUNTRY_NAMES[address.country] ?? address.country}
              {address.phone ? (
                <>
                  <br />
                  {address.phone}
                </>
              ) : null}
            </p>
            <div className="mt-auto flex flex-wrap gap-x-4">
              <Link href={`/compte/adresses?modifier=${address.id}`} className={smallButton}>
                Modifier
              </Link>
              {!address.is_default ? (
                <form action={setDefaultAddress}>
                  <input type="hidden" name="id" value={address.id} />
                  <button type="submit" className={smallButton}>
                    Par défaut
                  </button>
                </form>
              ) : null}
              <form action={deleteAddress}>
                <input type="hidden" name="id" value={address.id} />
                <button type="submit" className={`${smallButton} text-muted`}>
                  Supprimer
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

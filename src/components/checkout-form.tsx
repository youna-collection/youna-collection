"use client";

import { useActionState, useState, useTransition } from "react";
import type { ActionState } from "@/app/actions/auth";
import { startCheckout } from "@/app/actions/checkout";
import { checkPromoCode } from "@/app/actions/promo";
import { formatPrice } from "@/lib/format";
import { applyPromo, type Promo, promoLabel } from "@/lib/promo";
import { COUNTRY_NAMES, shippingOptions, type ShippingMethod } from "@/lib/shipping";
import { Field } from "./auth-ui";
import { RelayPicker, type RelayPoint } from "./relay-picker";

export type SummaryLine = { id: string; name: string; label: string | null; quantity: number; totalCents: number; details: string[] };

type Defaults = { email: string; firstName: string; lastName: string; phone: string };

export type SavedAddress = {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  postal_code: string;
  city: string;
  country: string;
  is_default: boolean;
};

const fromSaved = (a: SavedAddress) => ({ line1: a.line1, line2: a.line2 ?? "", postalCode: a.postal_code, city: a.city });

const INITIAL: ActionState = { status: "idle" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-4 text-sm tracking-[0.2em] uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

export function CheckoutForm({
  methods,
  countries,
  weightGrams,
  subtotalCents,
  lines,
  defaults,
  savedAddresses = [],
}: {
  methods: ShippingMethod[];
  countries: string[];
  weightGrams: number;
  subtotalCents: number;
  lines: SummaryLine[];
  defaults: Defaults;
  savedAddresses?: SavedAddress[];
}) {
  const preferred = savedAddresses.find((a) => a.is_default && countries.includes(a.country));
  const [state, formAction, pending] = useActionState(startCheckout, INITIAL);
  const [contact, setContact] = useState(defaults);
  const [country, setCountry] = useState(preferred?.country ?? "FR");
  const [methodCode, setMethodCode] = useState<string | null>(null);
  const [address, setAddress] = useState(preferred ? fromSaved(preferred) : { line1: "", line2: "", postalCode: "", city: "" });
  const [relay, setRelay] = useState<RelayPoint | null>(null);
  const [consent, setConsent] = useState(false);
  const [promo, setPromo] = useState<Promo | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [checkingPromo, startPromoCheck] = useTransition();

  const options = shippingOptions(methods, country, weightGrams);
  const current = options.find((option) => option.method.code === methodCode) ?? options[0] ?? null;
  const method = current?.method ?? null;
  const shippingCents = current?.priceCents ?? 0;
  const missingRelay = Boolean(method?.requiresRelayPoint && !relay);
  const priced = applyPromo(promo, subtotalCents, shippingCents);

  function applyCode() {
    if (!promoInput.trim()) return;
    setPromoMessage(null);
    startPromoCheck(async () => {
      const result = await checkPromoCode(promoInput, contact.email);
      if (result.ok) {
        setPromo(result.promo);
        setPromoInput("");
      } else {
        setPromoMessage(result.error);
      }
    });
  }

  const setC = (key: keyof Defaults) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setContact((value) => ({ ...value, [key]: event.target.value }));
  const setA = (key: keyof typeof address) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setAddress((value) => ({ ...value, [key]: event.target.value }));

  return (
    <form action={formAction} className="grid gap-10 md:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-10">
        <Section title="Vos coordonnées">
          <Field label="E-mail" name="email" type="email" autoComplete="email" required value={contact.email} onChange={setC("email")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" name="firstName" autoComplete="given-name" required value={contact.firstName} onChange={setC("firstName")} />
            <Field label="Nom" name="lastName" autoComplete="family-name" required value={contact.lastName} onChange={setC("lastName")} />
          </div>
          <Field
            label="Téléphone (pour le transporteur)"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            value={contact.phone}
            onChange={setC("phone")}
          />
        </Section>

        <Section title="Livraison">
          <label className="flex flex-col gap-1 text-sm">
            Pays
            <select
              name="country"
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setRelay(null);
              }}
              className="min-h-12 border border-sand bg-white px-3 text-base outline-none focus:border-ink"
            >
              {countries.map((code) => (
                <option key={code} value={code}>
                  {COUNTRY_NAMES[code] ?? code}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Mode de livraison">
            {options.map(({ method: option, priceCents }) => (
              <label
                key={option.code}
                className={`flex cursor-pointer items-start gap-3 border p-4 text-sm ${
                  option.code === method?.code ? "border-ink bg-white" : "border-sand"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value={option.code}
                  checked={option.code === method?.code}
                  onChange={() => setMethodCode(option.code)}
                  className="mt-1 accent-ink"
                />
                <span className="flex-1">
                  <span className="block">{option.name}</span>
                  {option.description ? <span className="block text-muted">{option.description}</span> : null}
                </span>
                <span>{priceCents ? formatPrice(priceCents) : "Gratuit"}</span>
              </label>
            ))}
            {!options.length ? <p className="text-sm text-danger">Aucune livraison n&apos;est possible vers ce pays.</p> : null}
          </div>

          {method?.requiresAddress ? (
            <div className="flex flex-col gap-4">
              {savedAddresses.length > 1 ? (
                <label className="flex flex-col gap-1 text-sm">
                  Mes adresses
                  <select
                    defaultValue={preferred?.id ?? ""}
                    onChange={(event) => {
                      const saved = savedAddresses.find((a) => a.id === event.target.value);
                      if (!saved) return;
                      setAddress(fromSaved(saved));
                      if (countries.includes(saved.country)) setCountry(saved.country);
                    }}
                    className="min-h-12 border border-sand bg-white px-3 text-base outline-none focus:border-ink"
                  >
                    <option value="">Choisir une adresse enregistrée</option>
                    {savedAddresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label ? `${a.label} — ` : ""}
                        {a.line1}, {a.city}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Field label="Adresse" name="line1" autoComplete="address-line1" required value={address.line1} onChange={setA("line1")} />
              <Field
                label="Complément (facultatif)"
                name="line2"
                autoComplete="address-line2"
                value={address.line2}
                onChange={setA("line2")}
              />
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                <Field
                  label="Code postal"
                  name="postalCode"
                  autoComplete="postal-code"
                  required
                  value={address.postalCode}
                  onChange={setA("postalCode")}
                />
                <Field label="Ville" name="city" autoComplete="address-level2" required value={address.city} onChange={setA("city")} />
              </div>
            </div>
          ) : null}

          {method?.requiresRelayPoint ? (
            <>
              <RelayPicker country={country} postalCode={address.postalCode} selected={relay} onSelect={setRelay} />
              <input type="hidden" name="relay" value={relay ? JSON.stringify(relay) : ""} />
            </>
          ) : null}
        </Section>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="reminderConsent"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1 size-4 accent-ink"
          />
          <span>M&apos;envoyer un rappel par e-mail si je ne termine pas ma commande (au plus deux messages).</span>
        </label>
      </div>

      <aside className="flex flex-col gap-4 md:sticky md:top-28 md:self-start">
        <h2 className="text-sm tracking-[0.2em] uppercase">Récapitulatif</h2>
        <ul className="flex flex-col gap-3 border-y border-sand py-4 text-sm">
          {lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-3">
              <span>
                {line.quantity} × {line.name}
                {line.label ? <span className="text-muted"> — {line.label}</span> : null}
                {line.details.map((detail) => (
                  <span key={detail} className="block text-xs text-muted">
                    {detail}
                  </span>
                ))}
              </span>
              <span className="whitespace-nowrap">{formatPrice(line.totalCents)}</span>
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt>Sous-total</dt>
            <dd>{formatPrice(subtotalCents)}</dd>
          </div>
          {priced.discountCents ? (
            <div className="flex justify-between">
              <dt>Réduction ({promo?.code})</dt>
              <dd>−{formatPrice(priced.discountCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt>Livraison</dt>
            <dd>
              {method ? (
                priced.shippingCents ? (
                  formatPrice(priced.shippingCents)
                ) : shippingCents ? (
                  <>
                    <s className="text-muted">{formatPrice(shippingCents)}</s> Offerte
                  </>
                ) : (
                  "Gratuit"
                )
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="flex justify-between border-t border-sand pt-2 text-base">
            <dt>Total</dt>
            <dd>{formatPrice(priced.totalCents)}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2 text-sm">
          {promo ? (
            <div className="flex items-center justify-between gap-2 border border-sand px-3 py-2">
              <span>
                Code <strong className="font-medium">{promo.code}</strong> · {promoLabel(promo)}
              </span>
              <button type="button" onClick={() => setPromo(null)} className="min-h-11 px-1 text-xs underline underline-offset-2">
                Retirer
              </button>
              <input type="hidden" name="promoCode" value={promo.code} />
            </div>
          ) : (
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="promo-code">
                Code promo
              </label>
              <input
                id="promo-code"
                value={promoInput}
                onChange={(event) => setPromoInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyCode();
                  }
                }}
                placeholder="Code promo"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={40}
                className="min-h-11 min-w-0 flex-1 border border-sand bg-white px-3 text-base uppercase outline-none placeholder:normal-case focus:border-ink"
              />
              <button
                type="button"
                onClick={applyCode}
                disabled={checkingPromo || !promoInput.trim()}
                className="min-h-11 border border-ink px-4 text-xs tracking-widest uppercase disabled:opacity-50"
              >
                {checkingPromo ? "…" : "Appliquer"}
              </button>
            </div>
          )}
          {promoMessage ? (
            <p role="alert" className="text-xs text-danger">
              {promoMessage}
            </p>
          ) : null}
        </div>

        {state.message ? (
          <p role="alert" className="text-sm text-danger">
            {state.message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || !method || missingRelay}
          className="min-h-12 bg-ink px-6 text-sm tracking-widest text-ivory uppercase disabled:opacity-50"
        >
          {pending ? "Patientez…" : "Commander et payer"}
        </button>
        {missingRelay ? <p className="text-xs text-muted">Choisissez d&apos;abord votre point relais.</p> : null}
        <p className="text-xs text-muted">
          En commandant, vous acceptez nos{" "}
          <a href="/cgv" target="_blank" className="underline underline-offset-2">
            conditions générales de vente
          </a>{" "}
          et notre{" "}
          <a href="/confidentialite" target="_blank" className="underline underline-offset-2">
            politique de confidentialité
          </a>
          .
        </p>
        <p className="text-xs text-muted">Paiement sécurisé par Stripe. Vos coordonnées bancaires ne passent jamais par notre site.</p>
      </aside>
    </form>
  );
}

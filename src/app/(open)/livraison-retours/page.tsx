import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, LegalPage, Section } from "@/components/legal-page";
import { getShippingMethods } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { getShopInfo } from "@/lib/shop-info";
import { COUNTRY_NAMES, type ShippingMethod } from "@/lib/shipping";
import { RETURN_WINDOW_DAYS } from "@/lib/support-rules";

export const metadata: Metadata = {
  title: "Livraison et retours",
  description: "Modes et tarifs de livraison, délais d'expédition, retours et remboursements.",
  alternates: { canonical: "/livraison-retours" },
};

const DELAYS: Record<ShippingMethod["carrier"], string> = {
  mondial_relay: "3 à 5 jours ouvrés après l'expédition",
  colissimo: "2 à 3 jours ouvrés après l'expédition en France",
  pickup: "nous vous contactons dès que votre commande est prête",
};

const price = (cents: number) => (cents === 0 ? "Gratuit" : formatPrice(cents));
const kg = (grams: number) => (grams >= 1000 ? `${(grams / 1000).toLocaleString("fr-FR")} kg` : `${grams} g`);

/** Décrit les tarifs d'un mode : par pays, avec les tranches de poids s'il y en a plusieurs. */
function describeRates(method: ShippingMethod): string[] {
  const byCountry = new Map<string, ShippingMethod["rates"]>();
  for (const rate of method.rates) byCountry.set(rate.country, [...(byCountry.get(rate.country) ?? []), rate]);
  const lines = new Map<string, string[]>();
  for (const [country, rates] of byCountry) {
    const sorted = [...rates].sort((a, b) => a.maxWeightGrams - b.maxWeightGrams);
    const text =
      sorted.length === 1
        ? price(sorted[0].priceCents)
        : sorted.map((r, i) => (i === sorted.length - 1 ? `${price(r.priceCents)} au-delà` : `${price(r.priceCents)} jusqu'à ${kg(r.maxWeightGrams)}`)).join(", ");
    lines.set(text, [...(lines.get(text) ?? []), COUNTRY_NAMES[country] ?? country]);
  }
  return [...lines].map(([text, countries]) => (countries.length === 1 && countries[0] === "France" ? text : `${countries.join(", ")} : ${text}`));
}

export default async function ShippingReturnsPage() {
  const [methods, info] = await Promise.all([getShippingMethods(), getShopInfo()]);

  return (
    <LegalPage
      title="Livraison et retours"
      current="/livraison-retours"
      intro={<p>Tout ce qu&apos;il faut savoir sur l&apos;envoi de votre commande, et comment nous renvoyer un article.</p>}
    >
      <Section title="Expédition sous 48 h">
        <p>
          Les commandes sont préparées avec soin et expédiées sous 48 heures ouvrées après la validation du paiement (hors week-ends et jours fériés).
          Vous recevez un e-mail avec le lien de suivi dès que votre colis part.
        </p>
      </Section>

      <Section title="Modes et tarifs de livraison">
        <p>Les frais de livraison dépendent du mode choisi, du pays et du poids de la commande. Ils sont toujours affichés avant le paiement.</p>
        <ul className="flex flex-col divide-y divide-sand border-y border-sand">
          {methods.map((method) => (
            <li key={method.code} className="flex flex-col gap-1 py-4">
              <p className="font-medium">{method.name}</p>
              {method.description ? <p className="text-muted">{method.description}</p> : null}
              {describeRates(method).map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p className="text-muted">Délai indicatif : {method.code === "international" ? "4 à 8 jours ouvrés après l'expédition" : DELAYS[method.carrier]}.</p>
            </li>
          ))}
        </ul>
        <p className="text-muted">
          Les délais des transporteurs sont donnés à titre indicatif. Si votre colis n&apos;est pas arrivé dans un délai raisonnable, écrivez-nous :
          nous lançons une enquête auprès du transporteur.
        </p>
      </Section>

      <Section title="Colis abîmé ou article manquant">
        <p>
          Vérifiez votre colis à la réception. S&apos;il est abîmé, vous pouvez le refuser ou noter vos réserves auprès du transporteur ou du point
          relais. Dans tous les cas, signalez-le-nous au plus vite avec quelques photos, depuis la page <Link href="/sav">Retours et SAV</Link>.
        </p>
      </Section>

      <Section title={`Retours : ${RETURN_WINDOW_DAYS} jours pour changer d'avis`}>
        <p>
          Vous disposez de {RETURN_WINDOW_DAYS} jours à compter de la réception de votre commande pour nous faire part de votre souhait de retour,
          sans avoir à vous justifier.
        </p>
        <Bullets
          items={[
            <>
              Faites votre demande depuis la page <Link href="/sav">Retours et SAV</Link> (ou depuis « Mon compte » si vous avez un compte), ou
              par e-mail à <a href={`mailto:${info.contactEmail}`}>{info.contactEmail}</a>.
            </>,
            `Renvoyez ensuite le ou les articles dans les ${RETURN_WINDOW_DAYS} jours suivant votre demande.`,
            "Les articles doivent être neufs : ni portés, ni lavés, ni parfumés, avec leurs étiquettes et dans leur emballage d'origine.",
            "Les frais de renvoi sont à votre charge, sauf si l'article est défectueux ou si nous nous sommes trompées dans votre commande.",
            "Nous vous conseillons un envoi suivi : il permet de prouver le renvoi en cas de perte.",
          ]}
        />
      </Section>

      <Section title="Remboursement">
        <p>
          Dès réception et vérification de votre retour, nous vous remboursons sur le moyen de paiement utilisé lors de la commande, au plus tard 14
          jours après votre demande. Le remboursement comprend le prix des articles et les frais de livraison initiaux (sur la base du mode de
          livraison standard le moins cher). Nous pouvons attendre d&apos;avoir reçu les articles pour rembourser.
        </p>
        <p>
          Un article renvoyé abîmé, porté ou incomplet peut voir son remboursement réduit, à hauteur de la perte de valeur constatée.
        </p>
      </Section>

      <Section title="Échange">
        <p>
          Vous préférez une autre couleur ou un autre modèle ? Choisissez « Échange » dans votre demande : nous vous proposons une solution selon les
          stocks disponibles.
        </p>
      </Section>

      <Section title="Commandes passées sur notre ancien site">
        <p>
          Pour une commande passée sur notre ancien site, écrivez-nous à <a href={`mailto:${info.contactEmail}`}>{info.contactEmail}</a> en
          indiquant votre numéro de commande.
        </p>
      </Section>

      <p className="text-muted">
        Ces informations complètent nos <Link href="/cgv">conditions générales de vente</Link>, qui détaillent aussi vos garanties légales.
      </p>
    </LegalPage>
  );
}

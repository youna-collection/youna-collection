import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, LegalPage, Section, ToFill } from "@/components/legal-page";
import { getShopInfo } from "@/lib/shop-info";

export const metadata: Metadata = {
  title: "Confidentialité et cookies",
  description: "Comment Youna Collection utilise et protège vos données personnelles.",
  alternates: { canonical: "/confidentialite" },
};

export default async function PrivacyPage() {
  const info = await getShopInfo();
  const mail = <a href={`mailto:${info.contactEmail}`}>{info.contactEmail}</a>;

  return (
    <LegalPage
      title="Confidentialité et cookies"
      current="/confidentialite"
      intro={<p>Nous collectons le moins de données possible, uniquement pour vous servir. Nous ne vendons ni ne louons jamais vos données.</p>}
    >
      <Section title="Qui est responsable de vos données ?">
        <p>
          {info.legalName ?? <ToFill>Nom ou raison sociale</ToFill>}, exerçant sous le nom « {info.tradeName} »
          {info.address.length ? `, ${info.address.join(", ")}` : null}. Contact : {mail}.
        </p>
      </Section>

      <Section title="Quelles données, et pourquoi ?">
        <Bullets
          items={[
            <>
              <span className="font-medium">Votre commande</span> : nom, e-mail, téléphone, adresse de livraison ou point relais, articles achetés.
              Pour préparer, livrer et facturer votre commande, et vous tenir informée de son suivi (exécution du contrat).
            </>,
            <>
              <span className="font-medium">Votre compte</span>, si vous en créez un : e-mail, mot de passe (chiffré, nous ne le voyons jamais),
              nom, adresses enregistrées, favoris. Pour vous permettre de suivre vos commandes et de commander plus vite.
            </>,
            <>
              <span className="font-medium">Vos demandes au service client</span> : messages et photos envoyés depuis la page Retours et SAV. Pour
              traiter votre retour, échange ou réclamation.
            </>,
            <>
              <span className="font-medium">Les rappels de panier</span> : uniquement si vous avez coché la case prévue, nous pouvons vous envoyer
              un rappel par e-mail lorsque vous laissez des articles dans votre panier (consentement). Chaque rappel contient un lien pour vous
              désinscrire en un clic.
            </>,
            <>
              <span className="font-medium">Le paiement</span> est traité directement par Stripe : nous ne recevons jamais vos coordonnées
              bancaires.
            </>,
          ]}
        />
        <p>
          Nous conservons aussi les pièces comptables (factures, commandes) pour respecter nos obligations légales, et quelques informations
          techniques pour sécuriser le site et prévenir la fraude (intérêt légitime).
        </p>
        <p>
          Si vous aviez commandé sur notre ancien site, l&apos;historique de vos commandes a été repris sur ce site pour assurer le suivi et le
          service après-vente. Votre ancien mot de passe n&apos;a pas été transféré, et nous ne vous envoyons aucune communication commerciale sans
          votre accord.
        </p>
      </Section>

      <Section title="Combien de temps ?">
        <Bullets
          items={[
            "Commandes et factures : 10 ans, comme l'exige la loi comptable.",
            "Compte client : jusqu'à ce que vous le supprimiez. Sans aucune activité pendant 3 ans, nous pouvons le supprimer après vous avoir prévenue.",
            "Demandes au service client : le temps de les traiter, puis avec la commande concernée.",
            "Rappels de panier : jusqu'à votre désinscription. Votre adresse est alors conservée dans une liste d'exclusion, uniquement pour ne plus vous écrire.",
          ]}
        />
      </Section>

      <Section title="Qui peut y accéder ?">
        <p>
          Seule la gérante de la boutique a accès à vos données. Elles sont aussi confiées, pour le strict nécessaire, à nos prestataires :
        </p>
        <Bullets
          items={[
            "Supabase (stockage des comptes et des commandes, serveurs à Paris) ;",
            "Netlify (hébergement du site) ;",
            "Stripe (paiement en ligne) ;",
            "Resend (envoi des e-mails liés à votre commande) ;",
            "Mondial Relay et La Poste / Colissimo (livraison de votre colis).",
          ]}
        />
        <p>
          Certains de ces prestataires sont situés aux États-Unis ; ces transferts sont encadrés par les garanties prévues par le RGPD (décision
          d&apos;adéquation ou clauses contractuelles types de la Commission européenne).
        </p>
      </Section>

      <Section title="Vos droits">
        <p>
          Vous pouvez à tout moment accéder à vos données, les corriger, les supprimer, en demander une copie, vous opposer à leur utilisation ou en
          demander la limitation. Depuis votre compte, vous pouvez déjà modifier vos informations et{" "}
          <Link href="/compte/supprimer">supprimer votre compte</Link> vous-même. Pour toute autre demande, écrivez-nous à {mail} : nous répondons
          sous un mois.
        </p>
        <p>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL (
          <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">
            www.cnil.fr
          </a>
          ).
        </p>
      </Section>

      <Section title="Cookies" id="cookies">
        <p>
          Ce site n&apos;utilise <span className="font-medium">aucun cookie publicitaire ni de mesure d&apos;audience</span>. Il dépose uniquement
          les cookies indispensables à son fonctionnement, qui ne nécessitent pas votre accord :
        </p>
        <Bullets
          items={[
            "votre panier, pour retrouver vos articles d'une visite à l'autre ;",
            "votre connexion à votre compte, pour rester connectée en toute sécurité ;",
            "le suivi d'une demande au service client sans compte ;",
            "la page de paiement Stripe, qui utilise ses propres cookies pour sécuriser la transaction et prévenir la fraude.",
          ]}
        />
        <p>Vous pouvez supprimer ces cookies depuis les réglages de votre navigateur ; votre panier et votre connexion seront alors perdus.</p>
      </Section>
    </LegalPage>
  );
}

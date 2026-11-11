import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, LegalPage, Section, ToFill } from "@/components/legal-page";
import { SellerIdentity } from "@/components/seller-identity";
import { getShopInfo } from "@/lib/shop-info";
import { RETURN_WINDOW_DAYS } from "@/lib/support-rules";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description: "Conditions générales de vente de la boutique en ligne Youna Collection.",
  alternates: { canonical: "/cgv" },
};

export default async function TermsPage() {
  const info = await getShopInfo();
  const mail = <a href={`mailto:${info.contactEmail}`}>{info.contactEmail}</a>;

  return (
    <LegalPage
      title="Conditions générales de vente"
      current="/cgv"
      intro={
        <p>
          Les présentes conditions s&apos;appliquent à toute commande passée sur ce site par une personne agissant en tant que consommatrice ou
          consommateur. En validant votre commande, vous déclarez les avoir lues et acceptées.
        </p>
      }
    >
      <Section title="1. Qui sommes-nous ?">
        <SellerIdentity info={info} />
      </Section>

      <Section title="2. Les articles">
        <p>
          Nous vendons des voiles, abayas, cagoules et bouquets de voiles. Chaque fiche décrit les caractéristiques essentielles de l&apos;article.
          Les photos sont aussi fidèles que possible ; selon votre écran, une couleur peut légèrement différer de la réalité.
        </p>
        <p>Les articles sont proposés dans la limite des stocks disponibles. Le stock affiché est mis à jour en temps réel.</p>
      </Section>

      <Section title="3. Prix">
        <p>
          Les prix sont indiqués en euros, toutes taxes comprises{info.vatMention ? ` (${info.vatMention})` : ""}. Les frais de livraison
          s&apos;ajoutent au prix des articles ; ils sont affichés avant la validation de la commande et détaillés sur la page{" "}
          <Link href="/livraison-retours">Livraison et retours</Link>.
        </p>
        <p>Le prix facturé est celui affiché au moment de la commande. Les codes de réduction s&apos;appliquent selon leurs conditions propres.</p>
      </Section>

      <Section title="4. Commande">
        <Bullets
          items={[
            "Vous choisissez vos articles et les ajoutez au panier.",
            "Vous indiquez vos coordonnées et choisissez un mode de livraison ; le total à payer s'affiche.",
            "Vous êtes redirigée vers la page de paiement sécurisée pour régler votre commande.",
            "Une fois le paiement accepté, la commande est définitive et vous recevez un e-mail de confirmation récapitulant votre achat.",
          ]}
        />
        <p>
          Vous pouvez commander avec ou sans compte. Nous pouvons refuser ou annuler une commande en cas de litige existant avec la cliente,
          d&apos;anomalie manifeste (par exemple une erreur de prix évidente) ou de suspicion de fraude ; vous en êtes alors informée et intégralement
          remboursée.
        </p>
      </Section>

      <Section title="5. Paiement">
        <p>
          Le paiement s&apos;effectue en ligne au moment de la commande, par carte bancaire ou par les autres moyens proposés sur la page de
          paiement, sécurisée par notre prestataire Stripe. Vos coordonnées bancaires sont saisies directement chez Stripe : nous n&apos;y avons
          jamais accès et ne les conservons pas. Votre compte est débité à la validation de la commande.
        </p>
        <p>Une facture est disponible pour chaque commande, depuis votre compte ou sur simple demande par e-mail.</p>
      </Section>

      <Section title="6. Livraison">
        <p>
          Nous livrons en France métropolitaine et dans les pays indiqués lors de la commande, en point relais, à domicile ou en retrait. Les
          commandes sont expédiées sous 48 heures ouvrées après le paiement ; les délais de livraison des transporteurs sont indiqués sur la page{" "}
          <Link href="/livraison-retours">Livraison et retours</Link>. Sauf accord différent, la commande est livrée au plus tard 30 jours après
          sa validation.
        </p>
        <p>
          Les articles voyagent à nos risques : vous en devenez responsable au moment où vous (ou la personne que vous avez désignée) en prenez
          possession. En cas de retard important, de colis perdu ou abîmé, contactez-nous : nous trouvons une solution (renvoi ou remboursement).
        </p>
      </Section>

      <Section title={`7. Droit de rétractation (${RETURN_WINDOW_DAYS} jours)`} id="retractation">
        <p>
          Vous disposez de {RETURN_WINDOW_DAYS} jours à compter de la réception de votre commande (ou du dernier article, en cas de livraison en
          plusieurs fois) pour changer d&apos;avis, sans avoir à vous justifier ni à payer de pénalité.
        </p>
        <p>
          Pour l&apos;exercer, informez-nous de votre décision avant la fin de ce délai : depuis la page <Link href="/sav">Retours et SAV</Link>,
          par e-mail à {mail}, ou à l&apos;aide du formulaire ci-dessous. Renvoyez ensuite les articles au plus tard {RETURN_WINDOW_DAYS} jours
          après nous avoir informées, à l&apos;adresse que nous vous indiquons. Les frais de renvoi sont à votre charge.
        </p>
        <p>
          Nous vous remboursons la totalité des sommes versées, frais de livraison initiaux compris (sur la base du mode de livraison standard le
          moins cher), au plus tard {RETURN_WINDOW_DAYS} jours après avoir été informées de votre décision, avec le même moyen de paiement que
          celui de la commande. Nous pouvons différer le remboursement jusqu&apos;à la réception des articles ou jusqu&apos;à ce que vous ayez
          fourni une preuve de leur renvoi.
        </p>
        <p>
          Les articles doivent être renvoyés complets et dans leur état d&apos;origine. Votre responsabilité peut être engagée en cas de
          dépréciation résultant d&apos;une manipulation autre que celle nécessaire pour vérifier leur nature, leurs caractéristiques et leur bon
          fonctionnement (par exemple un article porté, lavé ou parfumé).
        </p>
        <div className="flex flex-col gap-2 border border-sand bg-paper p-4">
          <p className="font-medium">Formulaire de rétractation</p>
          <p className="text-muted">(à compléter et nous renvoyer uniquement si vous souhaitez vous rétracter, par e-mail à {mail})</p>
          <p>
            À l&apos;attention de {info.legalName ?? info.tradeName}, {info.address.length ? info.address.join(", ") : <ToFill>Adresse</ToFill>},{" "}
            {info.contactEmail} :
          </p>
          <p>
            Je vous notifie par la présente ma rétractation du contrat portant sur la vente du bien ci-dessous :<br />
            — Commandé le / reçu le :<br />
            — Numéro de commande :<br />
            — Article(s) concerné(s) :<br />
            — Nom de la cliente :<br />
            — Adresse de la cliente :<br />
            — Signature (uniquement en cas d&apos;envoi papier) :<br />
            — Date :
          </p>
        </div>
      </Section>

      <Section title="8. Garanties légales">
        <p>
          Indépendamment du droit de rétractation, tous nos articles bénéficient des garanties prévues par la loi, sans frais pour vous.
        </p>
        <p>
          <span className="font-medium">Garantie légale de conformité</span> (articles L217-3 et suivants du Code de la consommation) : vous
          disposez de 2 ans à compter de la livraison pour la mettre en œuvre. Vous pouvez obtenir la réparation ou le remplacement de l&apos;article
          non conforme, ou, à défaut, une réduction du prix ou le remboursement contre la restitution de l&apos;article. Pendant ces 2 ans, vous
          n&apos;avez à prouver que le défaut de conformité, pas qu&apos;il existait au moment de la livraison.
        </p>
        <p>
          <span className="font-medium">Garantie des vices cachés</span> (articles 1641 et suivants du Code civil) : vous disposez de 2 ans à
          compter de la découverte du défaut pour demander, à votre choix, la réduction du prix ou l&apos;annulation de la vente.
        </p>
        <p>
          Pour faire jouer une garantie, faites une réclamation depuis la page <Link href="/sav">Retours et SAV</Link> ou écrivez-nous à {mail},
          avec si possible une photo du problème.
        </p>
      </Section>

      <Section title="9. Service client">
        <p>
          Pour toute question ou réclamation : {mail}, ou la page <Link href="/sav">Retours et SAV</Link>. Nous vous répondons dans les meilleurs
          délais.
        </p>
      </Section>

      <Section title="10. Données personnelles">
        <p>
          Les informations demandées lors de la commande servent à la traiter et à vous livrer. Pour en savoir plus et exercer vos droits, consultez
          notre <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </Section>

      <Section title="11. Médiation et litiges">
        <p>
          En cas de difficulté, contactez d&apos;abord notre service client : nous ferons tout pour trouver une solution amiable. Si aucune solution
          n&apos;est trouvée, vous pouvez recourir gratuitement au médiateur de la consommation dont nous relevons
          {info.mediator ? (
            <>
              {" "}
              : {info.mediator.name}
              {info.mediator.url ? (
                <>
                  {" "}
                  (
                  <a href={info.mediator.url} target="_blank" rel="noopener noreferrer">
                    {info.mediator.url.replace(/^https:\/\//, "")}
                  </a>
                  )
                </>
              ) : null}
            </>
          ) : (
            <>
              {" "}
              : <ToFill>Médiateur de la consommation</ToFill>
            </>
          )}
          , dans un délai d&apos;un an à compter de votre réclamation écrite auprès de nous.
        </p>
        <p>
          Les présentes conditions sont soumises au droit français. À défaut d&apos;accord amiable, le litige peut être porté devant le tribunal
          compétent selon les règles de droit commun.
        </p>
      </Section>
    </LegalPage>
  );
}

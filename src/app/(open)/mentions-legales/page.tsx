import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section, ToFill } from "@/components/legal-page";
import { SellerIdentity } from "@/components/seller-identity";
import { getShopInfo } from "@/lib/shop-info";

export const metadata: Metadata = { title: "Mentions légales", alternates: { canonical: "/mentions-legales" } };

export default async function LegalNoticePage() {
  const info = await getShopInfo();
  return (
    <LegalPage title="Mentions légales" current="/mentions-legales">
      <Section title="Éditrice du site">
        <SellerIdentity info={info} />
        <p>Directrice de la publication : {info.legalName ?? <ToFill>Nom</ToFill>}</p>
      </Section>

      <Section title="Hébergement">
        <p>
          Site hébergé par Netlify, Inc., 101 2nd Street, San Francisco, CA 94105, États-Unis — support@netlify.com —{" "}
          <a href="https://www.netlify.com" target="_blank" rel="noopener noreferrer">
            www.netlify.com
          </a>
          .
        </p>
        <p>
          Données des comptes et des commandes hébergées par Supabase, Inc., sur des serveurs situés à Paris (France) —{" "}
          <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">
            supabase.com
          </a>
          .
        </p>
      </Section>

      <Section title="Propriété intellectuelle">
        <p>
          Le nom {info.tradeName}, le logo, les photos, les textes et l&apos;ensemble des éléments de ce site sont la propriété de {info.tradeName} ou
          utilisés avec autorisation. Toute reproduction, même partielle, sans accord écrit préalable est interdite.
        </p>
      </Section>

      <Section title="Données personnelles et cookies">
        <p>
          La façon dont nous utilisons vos données et les cookies du site est expliquée dans notre{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Pour toute question : <a href={`mailto:${info.contactEmail}`}>{info.contactEmail}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}

import type { ShopInfo } from "@/lib/shop-info";
import { ToFill } from "./legal-page";

/** Identité du vendeur, telle qu'elle doit figurer dans les mentions légales et les CGV. */
export function SellerIdentity({ info }: { info: ShopInfo }) {
  return (
    <p>
      {info.legalName ?? <ToFill>Nom ou raison sociale</ToFill>}
      {info.legalForm ? `, ${info.legalForm}` : null}, exerçant sous le nom commercial « {info.tradeName} »
      <br />
      Adresse : {info.address.length >= 3 ? info.address.join(", ") : <ToFill>Adresse</ToFill>}
      <br />
      SIRET : {info.siret ?? <ToFill>SIRET</ToFill>}
      {info.vatNumber ? (
        <>
          <br />
          N° de TVA intracommunautaire : {info.vatNumber}
        </>
      ) : null}
      <br />
      E-mail : <a href={`mailto:${info.contactEmail}`}>{info.contactEmail}</a>
      {info.phone ? (
        <>
          <br />
          Téléphone : {info.phone}
        </>
      ) : null}
    </p>
  );
}

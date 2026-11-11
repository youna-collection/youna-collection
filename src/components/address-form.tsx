import { saveAddress } from "@/app/actions/account";
import type { Address } from "@/lib/account";
import { COUNTRY_NAMES } from "@/lib/shipping";
import { ActionForm } from "./action-form";
import { Field } from "./auth-ui";

export function AddressForm({ address }: { address?: Address }) {
  return (
    <ActionForm action={saveAddress} submitLabel={address ? "Enregistrer" : "Ajouter l'adresse"}>
      <input type="hidden" name="id" value={address?.id ?? ""} />
      <Field label="Nom de l'adresse (facultatif, ex. Maison)" name="label" defaultValue={address?.label ?? ""} maxLength={40} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Prénom" name="first_name" autoComplete="given-name" required defaultValue={address?.first_name} />
        <Field label="Nom" name="last_name" autoComplete="family-name" required defaultValue={address?.last_name} />
      </div>
      <Field label="Adresse" name="line1" autoComplete="address-line1" required defaultValue={address?.line1} />
      <Field label="Complément (facultatif)" name="line2" autoComplete="address-line2" defaultValue={address?.line2 ?? ""} />
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field label="Code postal" name="postal_code" autoComplete="postal-code" required defaultValue={address?.postal_code} />
        <Field label="Ville" name="city" autoComplete="address-level2" required defaultValue={address?.city} />
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Pays
        <select
          name="country"
          defaultValue={address?.country ?? "FR"}
          className="min-h-12 border border-sand bg-white px-3 text-base outline-none focus:border-ink"
        >
          {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <Field label="Téléphone (facultatif)" name="phone" type="tel" autoComplete="tel" defaultValue={address?.phone ?? ""} />
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="is_default" defaultChecked={address?.is_default} className="size-4 accent-ink" />
        Utiliser par défaut pour mes commandes
      </label>
    </ActionForm>
  );
}

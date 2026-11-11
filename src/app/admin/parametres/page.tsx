import type { Metadata } from "next";
import Link from "next/link";
import { saveShopSettings, saveSocialAndMediator } from "@/app/actions/admin-settings";
import { ActionForm } from "@/components/action-form";
import { EmailSetupNotice } from "@/components/admin/email-list";
import { MaintenanceSwitch } from "@/components/admin/maintenance-switch";
import { ReminderSettings } from "@/components/admin/reminder-settings";
import { emailSetup } from "@/lib/admin/emails";
import { getShopSettings, sellerComplete, type ShopSettings } from "@/lib/admin/orders";
import { DEFAULT_CONTACT_EMAIL } from "@/lib/shop-info";

export const metadata: Metadata = { title: "Paramètres" };
export const dynamic = "force-dynamic";

const field = "min-h-11 w-full border border-sand bg-white px-3 text-base outline-none focus:border-ink";

function Field({
  name,
  label,
  settings,
  hint,
  required,
  ...props
}: { name: Exclude<keyof ShopSettings, "maintenance_enabled" | "cart_reminders_enabled" | "cart_reminder_second">; label: string; settings: ShopSettings | null; hint?: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-muted">
        {label}
        {required ? " *" : ""}
      </span>
      <input name={name} defaultValue={(settings?.[name] as string | null) ?? ""} className={field} {...props} />
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export default async function SettingsPage() {
  const settings = await getShopSettings();
  const complete = sellerComplete(settings);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl">Paramètres</h1>

      <section id="gel" className="flex scroll-mt-24 flex-col gap-4 border border-sand bg-ivory p-4">
        <h2 className="text-lg">Gel de la boutique</h2>
        <MaintenanceSwitch
          enabled={settings?.maintenance_enabled ?? false}
          title={settings?.maintenance_title ?? null}
          message={settings?.maintenance_message ?? null}
        />
      </section>

      <section id="emails" className="flex scroll-mt-24 flex-col gap-3 border border-sand bg-ivory p-4">
        <h2 className="text-lg">E-mails</h2>
        <EmailSetupNotice setup={emailSetup()} />
        <p className="text-sm text-muted">
          Envoyés automatiquement : confirmation de commande, expédition avec suivi, remboursement. Vous recevez une alerte pour chaque nouvelle commande et
          chaque rupture de stock.
        </p>
        <Link href="/admin/emails" className="text-sm underline underline-offset-4">
          Voir les e-mails envoyés →
        </Link>
      </section>

      <section id="relances" className="flex scroll-mt-24 flex-col gap-3 border border-sand bg-ivory p-4">
        <h2 className="text-lg">Rappels de panier</h2>
        <p className="text-sm text-muted">
          Uniquement pour les clientes qui ont coché « M&apos;envoyer un rappel » en commandant. Le rappel part 24 h après qu&apos;elles ont quitté leur
          panier, sans code promo ; il est annulé si elles commandent entre-temps. Chaque e-mail contient un lien pour se désinscrire.
        </p>
        <ReminderSettings enabled={settings?.cart_reminders_enabled ?? true} second={settings?.cart_reminder_second ?? true} />
      </section>

      <section id="reseaux" className="flex scroll-mt-24 flex-col gap-4 border border-sand bg-ivory p-4">
        <h2 className="text-lg">Réseaux sociaux</h2>
        <p className="text-sm text-muted">
          Collez le lien de votre page, ou simplement votre pseudo. Chaque réseau rempli affiche son icône en bas de toutes les pages ; laissez vide
          pour la masquer.
        </p>
        <ActionForm action={saveSocialAndMediator} submitLabel="Enregistrer">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="instagram_url" label="Instagram" settings={settings} placeholder="@younacollection" />
            <Field name="tiktok_url" label="TikTok" settings={settings} placeholder="@younacollection" />
            <Field name="snapchat_url" label="Snapchat" settings={settings} placeholder="younacollection" />
          </div>
          <div className="flex flex-col gap-1 border-t border-sand pt-4">
            <h3 className="text-base">Médiateur de la consommation</h3>
            <p className="text-sm text-muted">
              Obligatoire pour vendre en ligne aux particuliers : l&apos;organisme vers lequel une cliente peut se tourner en cas de litige non résolu.
              Une fois inscrite auprès d&apos;un médiateur, indiquez son nom et son site ; ils apparaissent dans les CGV.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="mediator_name" label="Nom du médiateur" settings={settings} />
            <Field name="mediator_url" label="Site du médiateur" settings={settings} placeholder="https://" inputMode="url" />
          </div>
        </ActionForm>
      </section>

      <div className="flex flex-col gap-1">
        <h2 className="text-lg">Factures et pages légales</h2>
        <p className="text-sm text-muted">
          Vos informations de vendeur, imprimées sur chaque facture et chaque avoir, et affichées dans les mentions légales et les CGV du site (c&apos;est
          obligatoire). Une facture déjà émise garde les informations du jour où elle a été créée.
        </p>
      </div>

      <p className={`border p-3 text-sm ${complete ? "border-success text-success" : "border-ink"}`}>
        {complete
          ? "Les factures sont activées."
          : "Les factures ne sont pas encore activées : remplissez au moins les champs marqués d'une étoile."}
      </p>

      <section className="flex flex-col gap-4 border border-sand bg-ivory p-4">
        <h2 className="text-lg">Informations du vendeur</h2>
        <ActionForm action={saveShopSettings} submitLabel="Enregistrer">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="legal_name" label="Nom ou raison sociale" settings={settings} required hint="Par exemple votre nom et prénom pour une micro-entreprise." />
            <Field name="trade_name" label="Nom commercial" settings={settings} placeholder="Youna Collection" />
            <Field name="legal_form" label="Forme juridique" settings={settings} placeholder="Entrepreneur individuel (EI)" />
            <Field name="siret" label="SIRET" settings={settings} required inputMode="numeric" hint="14 chiffres." />
            <Field name="address_line1" label="Adresse" settings={settings} required />
            <Field name="address_line2" label="Complément d'adresse" settings={settings} />
            <Field name="postal_code" label="Code postal" settings={settings} required inputMode="numeric" />
            <Field name="city" label="Ville" settings={settings} required />
            <Field name="country" label="Pays" settings={settings} />
            <Field name="email" label="E-mail affiché" settings={settings} type="email" placeholder={DEFAULT_CONTACT_EMAIL} hint={`Vide : ${DEFAULT_CONTACT_EMAIL} est affiché sur le site.`} />
            <Field name="phone" label="Téléphone affiché" settings={settings} type="tel" />
            <Field name="vat_number" label="N° de TVA intracommunautaire" settings={settings} hint="Seulement si vous en avez un." />
          </div>
          <Field
            name="vat_mention"
            label="Mention TVA"
            settings={settings}
            hint="En franchise de TVA (micro-entreprise) : « TVA non applicable, art. 293 B du CGI »."
          />
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">Texte en bas des factures (facultatif)</span>
            <textarea name="invoice_footer" defaultValue={settings?.invoice_footer ?? ""} rows={2} maxLength={500} className={`${field} py-2`} />
          </label>
        </ActionForm>
      </section>

      <a href="/admin/parametres/apercu" target="_blank" className="text-sm underline underline-offset-4">
        Voir un aperçu de facture avec ces informations (PDF) ↗
      </a>
    </div>
  );
}

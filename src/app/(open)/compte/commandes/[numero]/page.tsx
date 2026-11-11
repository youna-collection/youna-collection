import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge, StatusSteps } from "@/components/order-status";
import { getMyOrder } from "@/lib/account";
import { requireProfile } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { CARRIER_LABELS, documentNumber, formatDate, deliveryPostalCode, trackingLink } from "@/lib/order-display";
import { COUNTRY_NAMES } from "@/lib/shipping";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/compte/commandes/[numero]">): Promise<Metadata> {
  return { title: `Commande n° ${(await params).numero}` };
}

/** Regroupe « Noir, Noir, Ivory » en « 2 × Noir, 1 × Ivory ». */
function groupLabels(labels: string[]): string[] {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts].map(([label, n]) => `${n} × ${label}`);
}

export default async function OrderPage({
  params,
}: PageProps<"/compte/commandes/[numero]">) {
  const { numero } = await params;
  await requireProfile(`/compte/commandes/${numero}`);
  if (!/^\d{1,9}$/.test(numero)) notFound();

  const order = await getMyOrder(Number(numero));
  if (!order) notFound();

  const address = order.shipping_address;
  const relay = order.relay_point;
  const link = trackingLink(
    order.carrier,
    order.tracking_number,
    order.tracking_url,
    deliveryPostalCode(relay, address),
  );
  const inPerson = order.source === "in_person";
  // Commande passée sur l'ancien site Shopify : pas de facture ni de SAV ici.
  const legacy = order.source === "shopify_import";
  const invoice = order.invoices.find((i) => i.kind === "invoice");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/compte/commandes"
          className="text-xs tracking-widest text-muted uppercase hover:underline"
        >
          ← Mes commandes
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-light tracking-[0.15em] uppercase">
            Commande n° {order.order_number}
          </h1>
          <StatusBadge status={order.status} />
        </div>
        <p className="text-sm text-muted">
          {inPerson ? "Achat en boutique" : "Passée"} le{" "}
          {formatDate(order.created_at)}
        </p>
      </div>

      {inPerson ? null : <StatusSteps status={order.status} />}

      {legacy ? (
        <p className="text-sm text-muted">
          Commande passée sur notre ancien site. Sa facture vous a été envoyée par e-mail à l&apos;époque. Pour toute question, écrivez-nous.
        </p>
      ) : order.status !== "cancelled" ? (
        <div className="flex flex-wrap gap-2 text-sm">
          {invoice ? (
            <a href={`/factures/${invoice.id}`} target="_blank" className="flex min-h-11 items-center border border-ink px-4">
              Télécharger la facture
            </a>
          ) : (
            <form action={`/factures/commande/${order.order_number}`} method="post" target="_blank">
              <button type="submit" className="min-h-11 border border-ink px-4">
                Télécharger la facture
              </button>
            </form>
          )}
          {order.invoices
            .filter((i) => i.kind === "credit_note")
            .map((credit) => (
              <a key={credit.id} href={`/factures/${credit.id}`} target="_blank" className="flex min-h-11 items-center border border-sand px-4">
                Avoir {documentNumber("credit_note", credit.number)}
              </a>
            ))}
          {inPerson ? null : (
            <Link href={`/compte/sav/nouvelle?commande=${order.order_number}`} className="flex min-h-11 items-center border border-sand px-4">
              Retour, échange ou souci
            </Link>
          )}
        </div>
      ) : null}

      {order.tracking_number ? (
        <div className="flex flex-col gap-1 border border-sand p-4 text-sm">
          <p className="text-xs tracking-widest text-muted uppercase">
            Suivi du colis
          </p>
          <p>
            {order.carrier
              ? `${CARRIER_LABELS[order.carrier] ?? order.carrier} · `
              : ""}
            n° {order.tracking_number}
          </p>
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Suivre mon colis
            </a>
          ) : null}
        </div>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm tracking-[0.2em] uppercase">Articles</h2>
        <ul className="flex flex-col divide-y divide-sand border-y border-sand">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex justify-between gap-4 py-4 text-sm"
            >
              <div>
                <p>
                  {item.quantity} × {item.product_name}
                  {item.variant_label ? (
                    <span className="text-muted"> — {item.variant_label}</span>
                  ) : null}
                </p>
                {groupLabels(item.components.map((c) => c.label)).map(
                  (label) => (
                    <p key={label} className="text-xs text-muted">
                      {label}
                    </p>
                  ),
                )}
              </div>
              <p className="whitespace-nowrap">
                {formatPrice(item.line_total_cents)}
              </p>
            </li>
          ))}
        </ul>
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt>Sous-total</dt>
            <dd>{formatPrice(order.subtotal_cents)}</dd>
          </div>
          {order.discount_cents ? (
            <div className="flex justify-between">
              <dt>Réduction</dt>
              <dd>−{formatPrice(order.discount_cents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt>Livraison</dt>
            <dd>
              {inPerson
                ? "—"
                : order.shipping_cents
                  ? formatPrice(order.shipping_cents)
                  : "Gratuit"}
            </dd>
          </div>
          <div className="flex justify-between border-t border-sand pt-2 text-base">
            <dt>Total</dt>
            <dd>{formatPrice(order.total_cents)}</dd>
          </div>
          {order.refunded_cents ? (
            <div className="flex justify-between text-muted">
              <dt>Remboursé</dt>
              <dd>{formatPrice(order.refunded_cents)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {inPerson ? null : (
        <section className="flex flex-col gap-2 text-sm">
          <h2 className="text-sm tracking-[0.2em] uppercase">Livraison</h2>
          <p>
            {order.carrier
              ? (CARRIER_LABELS[order.carrier] ?? order.carrier)
              : "—"}
          </p>
          {relay ? (
            <p className="text-muted">
              Point relais : {relay.name}
              <br />
              {[relay.address1, relay.address2]
                .filter(Boolean)
                .join(", ")}, {relay.postal_code} {relay.city}
            </p>
          ) : null}
          {address?.line1 ? (
            <p className="text-muted">
              {address.first_name} {address.last_name}
              <br />
              {[address.line1, address.line2].filter(Boolean).join(", ")}
              <br />
              {address.postal_code} {address.city},{" "}
              {COUNTRY_NAMES[address.country] ?? address.country}
            </p>
          ) : null}
          {order.carrier === "pickup" ? (
            <p className="text-muted">
              Nous vous contactons pour convenir du retrait.
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}

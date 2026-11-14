import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailList } from "@/components/admin/email-list";
import { LabelPanel } from "@/components/admin/label-panel";
import { NoteForm, RefundPanel, StatusPanel, type RefundableItem } from "@/components/admin/order-panels";
import { listEmails } from "@/lib/admin/emails";
import { listOrderTickets } from "@/lib/admin/support";
import { TICKET_TYPE_LABELS } from "@/lib/support-rules";
import { TicketStatusBadge } from "@/components/support/ticket-view";
import { StatusBadge } from "@/components/order-status";
import { customerName, getAdminOrder, getShopSettings, sellerComplete, SOURCE_LABELS } from "@/lib/admin/orders";
import { PAYMENT_LABELS } from "@/lib/admin/stock";
import { formatPrice } from "@/lib/format";
import { CARRIER_LABELS, documentNumber, ORDER_STATUS_LABELS, deliveryPostalCode, trackingLink } from "@/lib/order-display";
import { isSendcloudConfigured } from "@/lib/sendcloud";
import { COUNTRY_NAMES } from "@/lib/shipping";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/admin/commandes/[numero]">): Promise<Metadata> {
  const { numero } = await params;
  return { title: `Commande ${numero}` };
}

const dateTime = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const fmt = (value: string) => dateTime.format(new Date(value));

function groupLabels(labels: string[]) {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].map(([label, n]) => (n > 1 ? `${n} × ${label}` : label));
}

export default async function AdminOrderPage({ params }: PageProps<"/admin/commandes/[numero]">) {
  const { numero } = await params;
  if (!/^\d{1,9}$/.test(numero)) notFound();
  const [order, settings] = await Promise.all([getAdminOrder(Number(numero)), getShopSettings()]);
  if (!order) notFound();
  const [{ emails }, tickets] = await Promise.all([listEmails({ orderId: order.id }), listOrderTickets(order.id)]);

  const address = order.shipping_address;
  const name = customerName(address);
  const relay = order.relay_point;
  const link = trackingLink(order.carrier, order.tracking_number, order.tracking_url, deliveryPostalCode(relay, address));
  const isWeb = order.source === "web";
  // Commande reprise de Shopify : affichée comme une commande en ligne, mais figée (facture déjà faite par Shopify).
  const isShopify = order.source === "shopify_import";
  const shipped = isWeb || isShopify;
  const stripeMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "" : "test/";
  const invoice = order.invoices.find((i) => i.kind === "invoice");
  const remaining = order.total_cents - order.refunded_cents;

  const returned = new Map<string, number>();
  for (const r of order.refunds) for (const e of r.restocked) returned.set(e.order_item_id, (returned.get(e.order_item_id) ?? 0) + e.quantity);
  const refundable: RefundableItem[] = order.items.map((item) => ({
    id: item.id,
    label: `${item.product_name}${item.variant_label ? ` — ${item.variant_label}` : ""}`,
    quantity: item.quantity,
    returnable: item.variant_id ? item.quantity - (returned.get(item.id) ?? 0) : 0,
    unitPriceCents: item.unit_price_cents,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/commandes" className="text-sm text-muted hover:text-ink">
          ← Commandes
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl">Commande n° {order.order_number}</h1>
          <StatusBadge status={order.status} />
        </div>
        <p className="text-sm text-muted">
          {SOURCE_LABELS[order.source]} · {fmt(order.created_at)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {isWeb ? (
          <a href={`/admin/commandes/bons?n=${order.order_number}`} target="_blank" className="flex min-h-11 items-center border border-ink px-4 text-sm">
            Bon de préparation (PDF)
          </a>
        ) : null}
        {invoice ? (
          <a href={`/factures/${invoice.id}`} target="_blank" className="flex min-h-11 items-center border border-ink px-4 text-sm">
            Facture {documentNumber("invoice", invoice.number)} (PDF)
          </a>
        ) : isShopify ? (
          <p className="flex min-h-11 items-center text-sm text-muted">Commande de l&apos;ancien site : facture émise par Shopify</p>
        ) : order.status !== "cancelled" && order.paid_at ? (
          sellerComplete(settings) ? (
            <form action={`/factures/commande/${order.order_number}`} method="post" target="_blank">
              <button type="submit" className="min-h-11 border border-ink px-4 text-sm">
                Créer la facture (PDF)
              </button>
            </form>
          ) : (
            <Link href="/admin/parametres" className="flex min-h-11 items-center px-2 text-sm text-muted underline underline-offset-4">
              Factures : complétez d&apos;abord vos informations de vendeur
            </Link>
          )
        ) : null}
        {order.invoices
          .filter((i) => i.kind === "credit_note")
          .map((credit) => (
            <a key={credit.id} href={`/factures/${credit.id}`} target="_blank" className="flex min-h-11 items-center border border-sand px-4 text-sm">
              Avoir {documentNumber("credit_note", credit.number)} (PDF)
            </a>
          ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {isWeb && isSendcloudConfigured && (order.carrier === "mondial_relay" || order.carrier === "colissimo") ? (
            <LabelPanel
              orderId={order.id}
              orderNumber={order.order_number}
              carrierLabel={CARRIER_LABELS[order.carrier] ?? order.carrier}
              hasLabel={Boolean(order.sendcloud_parcel_id)}
              canChange={order.status === "paid" || order.status === "preparing"}
            />
          ) : null}

          {isWeb || (isShopify && order.status !== "delivered") ? (
            <StatusPanel
              key={`${order.status}-${order.tracking_number ?? ""}`}
              orderId={order.id}
              status={order.status}
              carrierLabel={order.carrier ? (CARRIER_LABELS[order.carrier] ?? null) : null}
              trackingNumber={order.tracking_number}
              trackingUrl={order.tracking_url}
              needsTracking={order.carrier !== "pickup"}
              canNotify={isWeb}
            />
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="text-lg">Articles</h2>
            <ul className="flex flex-col divide-y divide-sand border-y border-sand bg-ivory">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 p-3 text-sm">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span>
                      <span className="font-medium">{item.quantity} ×</span> {item.product_name}
                      {item.variant_label ? <span className="text-muted"> — {item.variant_label}</span> : null}
                    </span>
                    {item.sku ? <span className="text-xs text-muted">Réf. {item.sku}</span> : null}
                    {groupLabels(item.components.map((c) => c.label)).map((label) => (
                      <span key={label} className="text-xs text-muted">
                        {label}
                      </span>
                    ))}
                    {returned.get(item.id) ? <span className="text-xs text-muted">{returned.get(item.id)} remis en stock</span> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span>{formatPrice(item.line_total_cents)}</span>
                    {item.quantity > 1 ? <span className="text-xs text-muted">{formatPrice(item.unit_price_cents)} l&apos;unité</span> : null}
                  </div>
                </li>
              ))}
            </ul>
            <dl className="ml-auto flex w-full max-w-xs flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt>Sous-total</dt>
                <dd>{formatPrice(order.subtotal_cents)}</dd>
              </div>
              {order.discount_cents ? (
                <div className="flex justify-between">
                  <dt>Réduction{order.promo_code ? ` (${order.promo_code})` : ""}</dt>
                  <dd>−{formatPrice(order.discount_cents)}</dd>
                </div>
              ) : null}
              {shipped ? (
                <div className="flex justify-between">
                  <dt>Livraison</dt>
                  <dd>{order.shipping_cents ? formatPrice(order.shipping_cents) : "Offerte"}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-sand pt-1.5 text-base">
                <dt>Total</dt>
                <dd>{formatPrice(order.total_cents)}</dd>
              </div>
              {order.refunded_cents ? (
                <div className="flex justify-between text-danger">
                  <dt>Remboursé</dt>
                  <dd>−{formatPrice(order.refunded_cents)}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {isShopify ? null : (
            <RefundPanel
              orderId={order.id}
              remainingCents={remaining}
              canUseStripe={Boolean(order.stripe_payment_intent_id)}
              items={refundable}
              sellerComplete={sellerComplete(settings)}
            />
          )}

          {order.refunds.length ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg">Remboursements</h2>
              <ul className="flex flex-col divide-y divide-sand border-y border-sand bg-ivory text-sm">
                {order.refunds.map((r) => (
                  <li key={r.id} className="flex flex-col gap-0.5 p-3">
                    <span>
                      {formatPrice(r.amount_cents)} · {r.method === "stripe" ? "par Stripe" : "en main propre"} · {fmt(r.created_at)}
                    </span>
                    {r.reason ? <span className="text-muted">{r.reason}</span> : null}
                    {r.restocked.length ? (
                      <span className="text-xs text-muted">
                        Remis en stock : {r.restocked.reduce((n, e) => n + e.quantity, 0)} article{r.restocked.reduce((n, e) => n + e.quantity, 0) > 1 ? "s" : ""}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <h2 className="text-lg">Notes internes</h2>
            {order.notes.length ? (
              <ul className="flex flex-col gap-2">
                {order.notes.map((note) => (
                  <li key={note.id} className="border-l-2 border-sand bg-ivory p-3 text-sm">
                    <p className="whitespace-pre-line">{note.body}</p>
                    <p className="mt-1 text-xs text-muted">{fmt(note.created_at)}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            <NoteForm orderId={order.id} />
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 text-sm">
          <section className="flex flex-col gap-1 border border-sand bg-ivory p-4">
            <h2 className="mb-1 text-base">Cliente</h2>
            <p>{name ?? "Non renseignée"}</p>
            {order.email ? (
              <a href={`mailto:${order.email}`} className="break-all underline underline-offset-2">
                {order.email}
              </a>
            ) : null}
            {address?.phone ? (
              <a href={`tel:${address.phone.replace(/[^\d+]/g, "")}`} className="underline underline-offset-2">
                {address.phone}
              </a>
            ) : null}
            <p className="text-xs text-muted">{order.user_id ? "A un compte cliente" : "Sans compte (invitée)"}</p>
          </section>

          {shipped ? (
            <section className="flex flex-col gap-1 border border-sand bg-ivory p-4">
              <h2 className="mb-1 text-base">Livraison</h2>
              <p>{order.carrier ? (CARRIER_LABELS[order.carrier] ?? order.carrier) : "—"}</p>
              {relay ? (
                <p className="text-muted">
                  Point relais {relay.carrier_id || relay.id ? `n° ${relay.carrier_id || relay.id}` : ""} : {relay.name}
                  <br />
                  {[relay.address1, relay.address2].filter(Boolean).join(", ")}
                  <br />
                  {relay.postal_code} {relay.city}
                </p>
              ) : null}
              {address?.line1 ? (
                <p className="text-muted">
                  {name}
                  <br />
                  {[address.line1, address.line2].filter(Boolean).join(", ")}
                  <br />
                  {address.postal_code} {address.city}, {COUNTRY_NAMES[address.country] ?? address.country}
                </p>
              ) : null}
              {order.tracking_number ? (
                <p>
                  Suivi : {order.tracking_number}
                  {link ? (
                    <>
                      {" · "}
                      <a href={link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        suivre
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="flex flex-col gap-1 border border-sand bg-ivory p-4">
            <h2 className="mb-1 text-base">Paiement</h2>
            {order.stripe_payment_intent_id ? (
              <>
                <p>Carte bancaire (Stripe){order.paid_at ? ` · ${fmt(order.paid_at)}` : ""}</p>
                <a
                  href={`https://dashboard.stripe.com/${stripeMode}payments/${order.stripe_payment_intent_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  Voir le paiement dans Stripe ↗
                </a>
              </>
            ) : (
              <p>{order.payment_method ? PAYMENT_LABELS[order.payment_method] : "—"}</p>
            )}
          </section>

          {tickets.length ? (
            <section className="flex flex-col gap-2 border border-sand bg-ivory p-4">
              <h2 className="mb-1 text-base">SAV</h2>
              <ul className="flex flex-col gap-2">
                {tickets.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/admin/sav/${t.number}`} className="underline underline-offset-4">
                      n° {t.number} · {TICKET_TYPE_LABELS[t.type]}
                    </Link>
                    <TicketStatusBadge status={t.status} admin />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {isWeb ? (
            <section className="flex flex-col gap-2 border border-sand bg-ivory p-4">
              <h2 className="mb-1 text-base">E-mails</h2>
              <EmailList emails={emails} showOrder={false} />
            </section>
          ) : null}

          <section className="flex flex-col gap-1 border border-sand bg-ivory p-4">
            <h2 className="mb-1 text-base">Historique</h2>
            <ol className="flex flex-col gap-1.5">
              {order.history.map((h) => (
                <li key={h.id} className="flex flex-col">
                  <span>{ORDER_STATUS_LABELS[h.to_status]}</span>
                  <span className="text-xs text-muted">{fmt(h.changed_at)}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

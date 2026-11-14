import "server-only";
import { chooseShippingOption, relayFromApi, type ApiServicePoint, type Delivery, type ShippingOption, type StoredRelayPoint } from "./sendcloud-rules";

/**
 * Accès à l'API Sendcloud (v3) : points relais, étiquettes, suivi.
 * Clés dans .env.local : NEXT_PUBLIC_SENDCLOUD_PUBLIC_KEY (carte des points relais) et SENDCLOUD_SECRET_KEY (serveur seulement).
 */

const API = "https://panel.sendcloud.sc/api/v3";

export const isSendcloudConfigured = Boolean(process.env.NEXT_PUBLIC_SENDCLOUD_PUBLIC_KEY && process.env.SENDCLOUD_SECRET_KEY);

export class SendcloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function authHeader() {
  const credentials = `${process.env.NEXT_PUBLIC_SENDCLOUD_PUBLIC_KEY ?? ""}:${process.env.SENDCLOUD_SECRET_KEY ?? ""}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

/** Message d'erreur lisible tiré de la réponse Sendcloud. */
function errorText(body: unknown): string {
  const errors = (body as { errors?: { detail?: string; message?: string; title?: string; source?: { pointer?: string } }[] })?.errors;
  if (Array.isArray(errors) && errors.length) {
    return errors
      .map((e) => [e.source?.pointer?.replace(/^\/data\//, ""), e.detail ?? e.message ?? e.title].filter(Boolean).join(" : "))
      .join(" · ")
      .slice(0, 300);
  }
  const message = (body as { message?: string; error?: { message?: string } })?.message ?? (body as { error?: { message?: string } })?.error?.message;
  return message ? String(message).slice(0, 300) : "réponse inattendue";
}

async function call<T>(path: string, init: RequestInit & { accept?: string } = {}): Promise<{ status: number; body: T }> {
  if (!isSendcloudConfigured) throw new SendcloudError("Sendcloud n'est pas configuré.", 0);
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: authHeader(),
      accept: init.accept ?? "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const body = (response.headers.get("content-type") ?? "").includes("json") ? await response.json().catch(() => null) : null;
  if (!response.ok && response.status !== 202) throw new SendcloudError(errorText(body), response.status);
  return { status: response.status, body: body as T };
}

/** Point relais vérifié auprès de Sendcloud (null s'il n'existe pas ou plus). */
export async function getServicePoint(id: string): Promise<StoredRelayPoint | null> {
  if (!/^\d{1,12}$/.test(id)) return null;
  try {
    const { body } = await call<{ data: ApiServicePoint }>(`/service-points/${id}`);
    if (!body?.data || body.data.is_expired) return null;
    return relayFromApi(body.data);
  } catch (error) {
    if (error instanceof SendcloudError && error.status === 404) return null;
    throw error;
  }
}

/** Adresse d'expédition enregistrée dans Sendcloud (la première active). */
async function senderAddressId(): Promise<number> {
  const { body } = await call<{ data: { id: number; is_active?: boolean }[] }>("/addresses/sender-addresses?page_size=20");
  const address = body.data?.find((a) => a.is_active !== false) ?? body.data?.[0];
  if (!address) throw new SendcloudError("Ajoutez votre adresse d'expédition dans Sendcloud (Réglages → Adresses).", 0);
  return address.id;
}

/** L'option d'envoi Sendcloud la moins chère pour ce colis. */
export async function findShippingOption(input: {
  delivery: Delivery;
  to: Record<string, string>;
  servicePointId: string | null;
  weightKg: string;
}): Promise<ShippingOption | null> {
  const { body } = await call<{ data: ShippingOption[] }>("/shipping-options", {
    method: "POST",
    body: JSON.stringify({
      carrier_code: input.delivery.carrier,
      from_address: { country_code: "FR" },
      to_address: { country_code: input.to.country_code, postal_code: input.to.postal_code },
      ...(input.servicePointId ? { to_service_point: { id: Number(input.servicePointId) } } : {}),
      parcels: [{ weight: { value: input.weightKg, unit: "kg" } }],
      calculate_quotes: true,
    }),
  });
  return chooseShippingOption(body.data ?? [], input.delivery);
}

export type CreatedShipment = { shipmentId: string; parcelId: string; trackingNumber: string | null; trackingUrl: string | null };

type AnnounceResponse = {
  data?: {
    id: string | number;
    parcels?: { id: string | number; tracking_number?: string | null; tracking_url?: string | null; status?: { code?: string; message?: string } | null; errors?: unknown }[];
  };
};

/** Crée et annonce l'envoi : l'étiquette est alors facturée sur le compte Sendcloud. */
export async function createShipment(input: {
  orderNumber: number;
  optionCode: string;
  to: Record<string, string>;
  servicePointId: string | null;
  weightKg: string;
  totalCents: number;
}): Promise<CreatedShipment> {
  const { body } = await call<AnnounceResponse>("/shipments/announce", {
    method: "POST",
    body: JSON.stringify({
      from_address: { sender_address_id: await senderAddressId() },
      to_address: input.to,
      ...(input.servicePointId ? { to_service_point: { id: Number(input.servicePointId) } } : {}),
      ship_with: { type: "shipping_option_code", properties: { shipping_option_code: input.optionCode } },
      order_number: String(input.orderNumber),
      // Unique pour Sendcloud : une nouvelle étiquette après annulation reste possible.
      external_reference_id: `youna-${input.orderNumber}-${Date.now()}`,
      total_order_price: { value: (input.totalCents / 100).toFixed(2), currency: "EUR" },
      parcels: [{ weight: { value: input.weightKg, unit: "kg" } }],
    }),
  });
  const parcel = body.data?.parcels?.[0];
  if (!body.data?.id || !parcel?.id) throw new SendcloudError(errorText(body), 0);
  return {
    shipmentId: String(body.data.id),
    parcelId: String(parcel.id),
    trackingNumber: parcel.tracking_number || null,
    trackingUrl: parcel.tracking_url && /^https:\/\//.test(parcel.tracking_url) ? parcel.tracking_url : null,
  };
}

/** Étiquette en PDF (format A6, à imprimer sur une feuille ou une imprimante d'étiquettes). */
export async function getLabelPdf(parcelId: string): Promise<ArrayBuffer> {
  if (!/^\d{1,15}$/.test(parcelId)) throw new SendcloudError("Étiquette introuvable.", 404);
  const response = await fetch(`${API}/parcels/${parcelId}/documents/label?paper_size=A6`, {
    headers: { authorization: authHeader(), accept: "application/pdf" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new SendcloudError(errorText(await response.json().catch(() => null)), response.status);
  return response.arrayBuffer();
}

/** Annule l'envoi. Possible tant que le colis n'est pas déposé, selon les délais du transporteur. */
export async function cancelShipment(shipmentId: string): Promise<"cancelled" | "queued"> {
  const { status } = await call<unknown>(`/shipments/${encodeURIComponent(shipmentId)}/cancel`, { method: "POST" });
  return status === 202 ? "queued" : "cancelled";
}

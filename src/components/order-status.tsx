import { ORDER_STATUS_LABELS, ORDER_STEPS, type OrderStatus } from "@/lib/order-display";

/** `cashDue` : commande en espèces pas encore payée (« Commandée » au lieu de « Payée », et un rappel). */
export function StatusBadge({ status, cashDue = false }: { status: OrderStatus; cashDue?: boolean }) {
  const tone =
    status === "cancelled" || status === "refunded"
      ? "border-sand text-muted"
      : status === "delivered"
        ? "border-success text-success"
        : "border-ink text-ink";
  const badge = <span className={`inline-block border px-2 py-0.5 text-xs tracking-widest uppercase ${tone}`}>{cashDue && status === "paid" ? "Commandée" : ORDER_STATUS_LABELS[status]}</span>;
  if (!cashDue) return badge;
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      {badge}
      <span className="inline-block border border-warning px-2 py-0.5 text-xs tracking-widest text-warning uppercase">Espèces au retrait</span>
    </span>
  );
}

/** Frise Payée → En préparation → Expédiée → Livrée. */
export function StatusSteps({ status, cashDue = false }: { status: OrderStatus; cashDue?: boolean }) {
  const current = ORDER_STEPS.indexOf(status);
  if (current < 0) return null;
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Avancement de la commande">
      {ORDER_STEPS.map((step, index) => {
        const done = index <= current;
        return (
          <li key={step} className="flex flex-col gap-2" aria-current={index === current ? "step" : undefined}>
            <span className={`h-1 ${done ? "bg-ink" : "bg-sand"}`} />
            <span className={`text-[11px] leading-tight sm:text-xs ${done ? "text-ink" : "text-muted"}`}>{cashDue && step === "paid" ? "Commandée" : ORDER_STATUS_LABELS[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}

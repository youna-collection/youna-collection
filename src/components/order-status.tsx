import { ORDER_STATUS_LABELS, ORDER_STEPS, type OrderStatus } from "@/lib/order-display";

export function StatusBadge({ status }: { status: OrderStatus }) {
  const tone =
    status === "cancelled" || status === "refunded"
      ? "border-sand text-muted"
      : status === "delivered"
        ? "border-success text-success"
        : "border-ink text-ink";
  return <span className={`inline-block border px-2 py-0.5 text-xs tracking-widest uppercase ${tone}`}>{ORDER_STATUS_LABELS[status]}</span>;
}

/** Frise Payée → En préparation → Expédiée → Livrée. */
export function StatusSteps({ status }: { status: OrderStatus }) {
  const current = ORDER_STEPS.indexOf(status);
  if (current < 0) return null;
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Avancement de la commande">
      {ORDER_STEPS.map((step, index) => {
        const done = index <= current;
        return (
          <li key={step} className="flex flex-col gap-2" aria-current={index === current ? "step" : undefined}>
            <span className={`h-1 ${done ? "bg-ink" : "bg-sand"}`} />
            <span className={`text-[11px] leading-tight sm:text-xs ${done ? "text-ink" : "text-muted"}`}>{ORDER_STATUS_LABELS[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}

import Link from "next/link";
import type { OrderSummary } from "@/lib/account";
import { formatPrice } from "@/lib/format";
import { formatDate } from "@/lib/order-display";
import { StatusBadge } from "./order-status";

export function OrderList({ orders }: { orders: OrderSummary[] }) {
  return (
    <ul className="flex flex-col divide-y divide-sand border-y border-sand">
      {orders.map((order) => (
        <li key={order.id}>
          <Link href={`/compte/commandes/${order.order_number}`} className="flex items-center justify-between gap-4 py-4 hover:bg-paper">
            <span className="flex flex-col gap-1">
              <span className="text-sm">Commande n° {order.order_number}</span>
              <span className="text-xs text-muted">
                {formatDate(order.created_at)} · {order.item_count} article{order.item_count > 1 ? "s" : ""}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <StatusBadge status={order.status} />
              <span className="text-sm">{formatPrice(order.total_cents)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

import { formatPrice } from "@/lib/format";

export function Price({
  cents,
  compareAtCents,
  from = false,
  large = false,
}: {
  cents: number;
  compareAtCents?: number | null;
  from?: boolean;
  large?: boolean;
}) {
  const onSale = compareAtCents != null && compareAtCents > cents;
  return (
    <p className={`flex flex-wrap items-baseline gap-x-2 ${large ? "text-xl" : "text-sm"}`}>
      {from ? <span className="text-muted">À partir de</span> : null}
      <span className={onSale ? "text-danger" : undefined}>{formatPrice(cents)}</span>
      {onSale ? (
        <>
          <s className="text-muted" aria-label={`Prix initial ${formatPrice(compareAtCents)}`}>
            {formatPrice(compareAtCents)}
          </s>
          {large ? (
            <span className="bg-ink px-2 py-0.5 text-xs tracking-widest text-ivory">
              -{Math.round((1 - cents / compareAtCents) * 100)} %
            </span>
          ) : null}
        </>
      ) : null}
    </p>
  );
}

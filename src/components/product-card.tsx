import Image from "next/image";
import Link from "next/link";
import { defaultVariant, imagesForVariant, priceRange, type Product } from "@/lib/product";
import { Price } from "./price";

const MAX_SWATCHES = 6;

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const variant = defaultVariant(product);
  const image = imagesForVariant(product, variant?.id ?? null)[0];
  const range = priceRange(product.variants);
  const swatches = product.variants.filter((v) => v.colorHex);
  const allSoldOut = product.variants.every((v) => v.trackStock && v.available <= 0);

  return (
    <Link href={`/produits/${product.slug}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden bg-photo">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : null}
        {allSoldOut ? (
          <span className="absolute top-2 left-2 bg-ivory px-2 py-1 text-[0.65rem] tracking-widest uppercase">Épuisé</span>
        ) : null}
      </div>

      <h3 className="mt-3 text-xs tracking-[0.18em] uppercase">{product.name}</h3>
      {range ? (
        <div className="mt-1">
          <Price
            cents={range.min}
            compareAtCents={range.min === range.max ? variant?.compareAtPriceCents : null}
            from={range.min !== range.max}
          />
        </div>
      ) : null}

      {swatches.length > 1 ? (
        <div className="mt-2 flex items-center gap-1.5" aria-label={`${swatches.length} couleurs`}>
          {swatches.slice(0, MAX_SWATCHES).map((v) => (
            <span
              key={v.id}
              title={v.colorName ?? undefined}
              className="size-3 rounded-full border border-black/10"
              style={{ backgroundColor: v.colorHex ?? undefined }}
            />
          ))}
          {swatches.length > MAX_SWATCHES ? (
            <span className="text-xs text-muted">+{swatches.length - MAX_SWATCHES}</span>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} priority={index < 2} />
        </li>
      ))}
    </ul>
  );
}

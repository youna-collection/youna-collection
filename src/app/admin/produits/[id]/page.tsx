import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoManager } from "@/components/admin/photo-manager";
import { ProductEditor } from "@/components/admin/product-editor";
import { getAdminProduct, listAdminCategories, listColors } from "@/lib/admin/products";

export const dynamic = "force-dynamic";

const isUuid = (value: string) => /^[0-9a-f-]{36}$/.test(value);

export async function generateMetadata({ params }: PageProps<"/admin/produits/[id]">): Promise<Metadata> {
  const { id } = await params;
  const product = isUuid(id) ? await getAdminProduct(id) : null;
  return { title: product?.name ?? "Produit" };
}

export default async function AdminProductPage({ params }: PageProps<"/admin/produits/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [product, categories, colors] = await Promise.all([getAdminProduct(id), listAdminCategories(), listColors()]);
  if (!product) notFound();

  const variantOptions = product.variants.map((v) => ({
    id: v.id,
    label: [v.color_name, v.size].filter(Boolean).join(" · ") || "Variante",
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/produits" className="text-sm text-muted hover:text-ink">
          ← Produits
        </Link>
        <h1 className="text-xl">{product.name}</h1>
      </div>
      <PhotoManager productId={product.id} productName={product.name} images={product.images} variants={variantOptions} />
      <ProductEditor
        product={product}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        colors={colors.map((c) => ({ name: c.name, hex: c.hex }))}
        shopUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""}
      />
    </div>
  );
}

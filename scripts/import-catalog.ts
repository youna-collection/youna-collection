/**
 * Import du catalogue Shopify.
 *
 *   Préparer (photos téléchargées et optimisées, rien n'est envoyé) :
 *     node scripts/import-catalog.ts "chemin/vers/products_export.csv"
 *
 *   Envoyer dans Supabase (demande SUPABASE_SECRET_KEY dans .env.local) :
 *     node --env-file=.env.local scripts/import-catalog.ts "chemin/vers/products_export.csv" --upload
 *
 * Relancer l'import met à jour les produits existants (repérés par leur SKU) sans doublon.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import sharp from "sharp";
import { buildCatalog, slugify, type CatalogImage, type ShopifyRow } from "./catalog/build-catalog.ts";

const CACHE = join(process.cwd(), ".cache", "catalog");
const BUCKET = "product-images";

type PreparedImage = { storagePath: string; file: string; alt: string };

async function download(url: string): Promise<Buffer> {
  const target = join(CACHE, "originals", `${createHash("sha1").update(url).digest("hex")}.img`);
  if (existsSync(target)) return readFileSync(target);

  // La boutique Shopify convertit elle-même les photos HEIC d'iPhone en JPEG.
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${separator}width=1800`);
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.startsWith("image/")) {
    throw new Error(`Photo inaccessible (${response.status} ${type}) : ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buffer);
  return buffer;
}

async function prepareImage(image: CatalogImage, folder: string, name: string): Promise<PreparedImage> {
  const webp = await sharp(await download(image.sourceUrl))
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  // L'empreinte dans le nom garantit qu'une photo modifiée ne reste jamais en cache.
  const hash = createHash("sha1").update(webp).digest("hex").slice(0, 8);
  const storagePath = `${folder}/${name}-${hash}.webp`;
  const file = join(CACHE, "webp", storagePath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, webp);
  return { storagePath, file, alt: image.alt };
}

/** Couleur moyenne d'une petite zone de tissu : sert de pastille sur la fiche produit. */
async function sampleColor(file: string, point: { x: number; y: number }): Promise<string> {
  const image = sharp(file);
  const { width = 0, height = 0 } = await image.metadata();
  const size = Math.max(4, Math.round(width * 0.04));
  const left = Math.min(width - size, Math.max(0, Math.round(width * point.x - size / 2)));
  const top = Math.min(height - size, Math.max(0, Math.round(height * point.y - size / 2)));
  // stats() de sharp ignore le recadrage : on lit donc les pixels nous-mêmes.
  const { data, info } = await sharp(file)
    .removeAlpha()
    .extract({ left, top, width: size, height: size })
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Médiane par canal : un pli ou un reflet isolé ne fausse pas la couleur.
  const median = (channel: number) => {
    const values: number[] = [];
    for (let i = channel; i < data.length; i += info.channels) values.push(data[i]);
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  return `#${[0, 1, 2].map((channel) => median(channel).toString(16).padStart(2, "0")).join("")}`;
}

async function main() {
  const [csvPath, ...flags] = process.argv.slice(2);
  if (!csvPath) {
    throw new Error("Indiquez le chemin de l'export Shopify (products_export.csv).");
  }
  const upload = flags.includes("--upload");

  const rows: ShopifyRow[] = parse(readFileSync(csvPath, "utf8"), { columns: true, bom: true, skip_empty_lines: true });
  const catalog = buildCatalog(rows);

  const prepared = [];
  for (const product of catalog.products) {
    const productImages = await Promise.all(
      product.images.map((image, i) => prepareImage(image, product.slug, `fiche-${i + 1}`)),
    );
    const variants = [];
    for (const variant of product.variants) {
      const key = variant.colorSlug ?? (variant.size ? slugify(variant.size) : "modele");
      const images = await Promise.all(variant.images.map((image, i) => prepareImage(image, product.slug, `${key}-${i + 1}`)));
      const colorHex =
        variant.colorHexOverride ??
        (variant.colorName && product.swatchPoint && images[0] ? await sampleColor(images[0].file, product.swatchPoint) : null);
      variants.push({ ...variant, colorHex, images });
    }
    prepared.push({ ...product, images: productImages, variants });
    console.log(`Prêt : ${product.name} (${variants.length} variante(s))`);
  }

  writeFileSync(join(CACHE, "catalog.json"), JSON.stringify(prepared, null, 2));
  const redirectsFile = join(process.cwd(), "supabase", "seed", "shopify-redirects.json");
  mkdirSync(dirname(redirectsFile), { recursive: true });
  writeFileSync(redirectsFile, `${JSON.stringify(catalog.redirects, null, 2)}\n`);

  if (!upload) {
    console.log(`\nPréparation terminée. Photos optimisées dans ${join(CACHE, "webp")}.`);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY doivent être renseignées dans .env.local.");
  }
  const supabase = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

  const allImages = prepared.flatMap((product) => [...product.images, ...product.variants.flatMap((variant) => variant.images)]);
  for (const image of allImages) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(image.storagePath, readFileSync(image.file), { contentType: "image/webp", cacheControl: "31536000", upsert: true });
    if (error) throw new Error(`Envoi de ${image.storagePath} : ${error.message}`);
  }
  console.log(`${allImages.length} photos envoyées.`);

  const { data: categories, error: categoryError } = await supabase
    .from("categories")
    .upsert(catalog.categories.map(({ slug, name, position }) => ({ slug, name, position })), { onConflict: "slug" })
    .select("id, slug");
  if (categoryError) throw categoryError;
  const categoryId = new Map(categories.map((category) => [category.slug, category.id]));

  for (const product of prepared) {
    const { data: saved, error: productError } = await supabase
      .from("products")
      .upsert(
        {
          slug: product.slug,
          name: product.name,
          description: product.description,
          category_id: categoryId.get(product.categorySlug),
          kind: product.kind,
          status: product.status,
          bouquet_eligible: product.bouquetEligible,
          position: product.position,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    if (productError) throw productError;

    const { data: variants, error: variantError } = await supabase
      .from("product_variants")
      .upsert(
        product.variants.map((variant) => ({
          product_id: saved.id,
          sku: variant.sku,
          color_name: variant.colorName,
          color_hex: variant.colorHex,
          size: variant.size,
          price_cents: variant.priceCents,
          compare_at_price_cents: variant.compareAtPriceCents,
          weight_grams: variant.weightGrams,
          stock: variant.stock,
          bouquet_veil_count: variant.bouquetVeilCount,
          is_active: variant.isActive,
          position: variant.position,
        })),
        { onConflict: "sku" },
      )
      .select("id, sku");
    if (variantError) throw variantError;
    const variantId = new Map(variants.map((variant) => [variant.sku, variant.id]));

    const { error: deleteError } = await supabase.from("product_images").delete().eq("product_id", saved.id);
    if (deleteError) throw deleteError;

    const imageRows = [
      ...product.images.map((image, i) => ({ product_id: saved.id, variant_id: null, storage_path: image.storagePath, alt: image.alt, position: i })),
      ...product.variants.flatMap((variant) =>
        variant.images.map((image, i) => ({
          product_id: saved.id,
          variant_id: variantId.get(variant.sku),
          storage_path: image.storagePath,
          alt: image.alt,
          position: variant.position * 10 + i,
        })),
      ),
    ];
    if (imageRows.length) {
      const { error: imageError } = await supabase.from("product_images").insert(imageRows);
      if (imageError) throw imageError;
    }
    console.log(`Importé : ${product.name}`);
  }

  console.log("\nImport terminé.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

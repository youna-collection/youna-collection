/**
 * Import des anciennes clientes et commandes Shopify (demande la migration 20261119100000_shopify_import.sql).
 *
 *   Vérifier sans rien écrire :
 *     node --env-file=.env.local scripts/import-shopify.ts "dossier/des/exports"
 *
 *   Importer :
 *     node --env-file=.env.local scripts/import-shopify.ts "dossier/des/exports" --apply
 *
 *   Tout retirer (commandes « Shopify » et fiches d'anciennes clientes) :
 *     node --env-file=.env.local scripts/import-shopify.ts --undo
 *
 * Le dossier contient customers_export.csv et orders_export_1.csv (exports Shopify).
 * Relancer l'import n'ajoute que les commandes nouvelles : utile juste avant la mise en ligne.
 * Rien n'est envoyé aux clientes (ni e-mail, ni compte créé) et le stock n'est pas modifié.
 * Les fichiers contiennent des données personnelles : ne jamais les mettre dans le code.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { buildCustomers, buildOrders, type CatalogVariant, type CsvRow } from "./shopify/build-orders.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const undo = args.includes("--undo");
const folder = args.find((a) => !a.startsWith("--"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY manquent (lancer avec --env-file=.env.local).");
const supabase = createClient(url, key, { auth: { persistSession: false } });

function readCsv(file: string): CsvRow[] {
  return parse(readFileSync(join(folder!, file)), { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }) as CsvRow[];
}

async function check<T>(label: string, promise: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(`${label} : ${error.message}`);
  return data;
}

async function removeAll() {
  const orders = await check("commandes", supabase.from("orders").delete().eq("source", "shopify_import").select("id"));
  const customers = await check("clientes", supabase.from("legacy_customers").delete().neq("email", "").select("email"));
  console.log(`Retiré : ${orders?.length ?? 0} commandes Shopify, ${customers?.length ?? 0} fiches d'anciennes clientes.`);
}

async function main() {
  if (undo) return removeAll();
  if (!folder) throw new Error("Indiquez le dossier qui contient les exports Shopify.");

  const variantRows = await check(
    "catalogue",
    supabase.from("product_variants").select("id, sku, color_name, size, product:products!inner ( name )"),
  );
  const variants: CatalogVariant[] = (variantRows as unknown as { id: string; sku: string | null; color_name: string | null; size: string | null; product: { name: string } }[]).map(
    (v) => ({ id: v.id, sku: v.sku, productName: v.product.name, colorName: v.color_name, size: v.size }),
  );

  const customers = buildCustomers(readCsv("customers_export.csv"));
  const orders = buildOrders(readCsv("orders_export_1.csv"), customers, variants);

  // Pas de données personnelles à l'écran : seulement des totaux et des numéros de commande.
  const tooHigh = orders.filter((o) => o.order_number >= 2001);
  if (tooHigh.length) throw new Error(`Numéros déjà pris par le nouveau site : ${tooHigh.map((o) => o.order_number).join(", ")}`);
  const noEmail = orders.filter((o) => !o.email);
  if (noEmail.length) throw new Error(`Commandes sans e-mail : ${noEmail.map((o) => o.legacy_name).join(", ")}`);

  const existing = new Set(
    ((await check("commandes existantes", supabase.from("orders").select("legacy_shopify_id").eq("source", "shopify_import"))) ?? []).map(
      (o: { legacy_shopify_id: string | null }) => o.legacy_shopify_id,
    ),
  );
  const fresh = orders.filter((o) => !existing.has(o.legacy_shopify_id));
  const accounts = new Set(
    ((await check("comptes", supabase.from("profiles").select("email"))) ?? []).map((p: { email: string }) => p.email.toLowerCase()),
  );
  const freshCustomers = customers.filter((c) => !accounts.has(c.email));

  const items = orders.flatMap((o) => o.items);
  const unmatched = [...new Set(items.filter((i) => !i.variant_id).map((i) => i.product_name))];
  const valid = orders.filter((o) => o.status !== "cancelled");
  console.log(`Clientes : ${customers.length} (dont ${customers.length - freshCustomers.length} ont déjà un compte sur le nouveau site)`);
  console.log(`Commandes : ${orders.length} (n° ${orders[0]?.order_number} à ${orders.at(-1)?.order_number}), dont ${fresh.length} pas encore importées`);
  console.log(`  statuts : ${JSON.stringify(Object.fromEntries(["delivered", "cancelled", "paid"].map((s) => [s, orders.filter((o) => o.status === s).length])))}`);
  console.log(`  chiffre d'affaires net (hors annulées) : ${(valid.reduce((n, o) => n + o.total_cents - o.refunded_cents, 0) / 100).toFixed(2)} €`);
  console.log(`  articles : ${items.length} lignes, ${items.length - items.filter((i) => !i.variant_id).length} reliées au catalogue`);
  if (unmatched.length) console.log(`  non reliés (gardent leur nom Shopify) : ${unmatched.join(" · ")}`);
  for (const o of orders) for (const w of o.warnings) console.log(`  n° ${o.order_number} : ${w}`);

  if (!apply) {
    console.log("\nVérification seulement : rien n'a été écrit. Ajoutez --apply pour importer.");
    return;
  }

  for (let i = 0; i < freshCustomers.length; i += 100) {
    await check("anciennes clientes", supabase.from("legacy_customers").upsert(freshCustomers.slice(i, i + 100), { onConflict: "email" }));
  }

  let done = 0;
  for (const entry of fresh) {
    // Les articles vont dans leur propre table ; les remarques ont déjà été affichées.
    const order: Partial<typeof entry> = { ...entry };
    delete order.items;
    delete order.warnings;
    const lines = entry.items;
    const row = await check("commande", supabase.from("orders").insert(order).select("id").single());
    const orderId = (row as { id: string }).id;
    try {
      await check("articles", supabase.from("order_items").insert(lines.map((l) => ({ ...l, order_id: orderId }))));
      // L'historique doit garder la vraie date, pas celle de l'import.
      await check(
        "historique",
        supabase
          .from("order_status_history")
          .update({ changed_at: entry.cancelled_at ?? entry.delivered_at ?? entry.created_at })
          .eq("order_id", orderId),
      );
    } catch (error) {
      await supabase.from("orders").delete().eq("id", orderId);
      throw error;
    }
    done += 1;
  }
  console.log(`\nImporté : ${freshCustomers.length} fiches d'anciennes clientes, ${done} commandes.`);
}

main().catch((error: Error) => {
  console.error("ERREUR :", error.message);
  process.exitCode = 1;
});

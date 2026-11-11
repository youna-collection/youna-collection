import "server-only";
import { createClient } from "../supabase/server";

export type AdminCustomer = {
  email: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  has_account: boolean;
  orders_count: number;
  spent_cents: number;
  first_order_at: string | null;
  last_order_at: string | null;
  account_created_at: string | null;
};

/** Comptes clientes et acheteuses sans compte, regroupées par e-mail (commandes annulées exclues). */
export async function listCustomers(): Promise<AdminCustomer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_customers");
  if (error) throw new Error(`Clientes : ${error.message}`);
  return ((data ?? []) as AdminCustomer[]).map((c) => ({ ...c, spent_cents: Number(c.spent_cents) }));
}

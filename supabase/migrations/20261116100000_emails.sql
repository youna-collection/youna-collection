-- Phase 6, étape 1 : journal des e-mails envoyés (confirmation, expédition, alertes…).
-- Chaque e-mail a une clé unique (ex. « commande-payee:<id> ») : il ne part jamais deux fois,
-- même si le webhook Stripe et la page de confirmation le déclenchent en même temps.

create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  dedupe_key text not null unique check (char_length(dedupe_key) <= 200),
  to_email text not null,
  -- En mode essai, l'adresse qui a réellement reçu l'e-mail (la boutique, jamais la cliente).
  delivered_to text,
  subject text not null,
  html text not null,
  order_id uuid references public.orders (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'not_configured')),
  provider_id text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_log_order_id_idx on public.email_log (order_id);
create index email_log_created_at_idx on public.email_log (created_at desc);

alter table public.email_log enable row level security;
grant select on public.email_log to authenticated;
grant all on public.email_log to service_role;
create policy email_log_select_admin on public.email_log for select to authenticated
  using ((select public.is_admin()));

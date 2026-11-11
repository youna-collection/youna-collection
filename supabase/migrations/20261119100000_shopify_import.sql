-- Import Shopify : les anciennes clientes (avec ou sans commande).
-- Elles n'ont pas de compte ici : elles le recréent elles-mêmes avec la même adresse e-mail.
-- À ce moment-là, leur fiche sert à pré-remplir le profil et l'adresse, puis elle est effacée
-- (les données vivent alors dans le compte, que la cliente peut supprimer elle-même).
-- L'accord marketing donné sur Shopify n'est volontairement pas repris.

create table public.legacy_customers (
  email text primary key check (email = lower(email)),
  shopify_id text unique,
  first_name text,
  last_name text,
  phone text,
  -- Même forme que les adresses des commandes : first_name, last_name, line1, line2, postal_code, city, country, phone.
  address jsonb,
  shopify_created_at timestamptz,
  imported_at timestamptz not null default now()
);

alter table public.legacy_customers enable row level security;
-- Aucune règle : seules les fonctions du serveur (clé secrète) et admin_customers y accèdent.
grant all on public.legacy_customers to service_role;

-- Liste des clientes de l'admin : comptes, acheteuses sans compte et anciennes clientes Shopify.
create or replace function public.admin_customers()
returns table (
  email text,
  user_id uuid,
  first_name text,
  last_name text,
  phone text,
  has_account boolean,
  orders_count integer,
  spent_cents bigint,
  first_order_at timestamptz,
  last_order_at timestamptz,
  account_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'reserve_admin' using errcode = '42501';
  end if;
  return query
  with o as (
    select lower(x.email) as email, x.total_cents - x.refunded_cents as net, x.created_at, x.shipping_address
    from public.orders x
    where x.email is not null and x.status <> 'cancelled'
  ),
  agg as (
    select o.email,
           count(*)::integer as orders_count,
           sum(o.net)::bigint as spent,
           min(o.created_at) as first_at,
           max(o.created_at) as last_at,
           (array_agg(o.shipping_address order by o.created_at desc))[1] as addr
    from o group by o.email
  ),
  p as (select * from public.profiles where role = 'customer'),
  l as (select * from public.legacy_customers),
  e as (
    select agg.email from agg
    union select lower(p.email) from p
    union select l.email from l
  )
  select e.email,
         p.id,
         coalesce(nullif(p.first_name, ''), nullif(l.first_name, ''), agg.addr ->> 'first_name', agg.addr ->> 'name'),
         coalesce(nullif(p.last_name, ''), nullif(l.last_name, ''), agg.addr ->> 'last_name'),
         coalesce(nullif(p.phone, ''), nullif(l.phone, ''), agg.addr ->> 'phone'),
         p.id is not null,
         coalesce(agg.orders_count, 0),
         coalesce(agg.spent, 0),
         agg.first_at,
         agg.last_at,
         coalesce(p.created_at, l.shopify_created_at)
  from e
  left join agg on agg.email = e.email
  left join p on lower(p.email) = e.email
  left join l on l.email = e.email;
end;
$$;

revoke execute on function public.admin_customers() from public, anon;
grant execute on function public.admin_customers() to authenticated;

-- Quand une ancienne cliente recrée son compte et confirme son adresse e-mail :
-- son nom, son téléphone et son adresse sont repris, puis sa fiche Shopify est effacée.
-- Le nom du déclencheur le fait passer après on_auth_user_change (ordre alphabétique),
-- qui crée le profil.
create function public.claim_legacy_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.legacy_customers;
  a jsonb;
begin
  select * into l from public.legacy_customers where email = lower(new.email);
  if not found then
    return new;
  end if;

  update public.profiles
    set first_name = coalesce(nullif(first_name, ''), l.first_name),
        last_name = coalesce(nullif(last_name, ''), l.last_name),
        phone = coalesce(nullif(phone, ''), l.phone)
    where id = new.id;

  a := l.address;
  if a is not null
     and coalesce(a ->> 'line1', '') <> '' and coalesce(a ->> 'postal_code', '') <> '' and coalesce(a ->> 'city', '') <> ''
     and coalesce(nullif(a ->> 'first_name', ''), l.first_name) is not null
     and coalesce(nullif(a ->> 'last_name', ''), l.last_name) is not null
     and not exists (select 1 from public.addresses where user_id = new.id) then
    insert into public.addresses (user_id, first_name, last_name, line1, line2, postal_code, city, country, phone, is_default)
    values (
      new.id,
      coalesce(nullif(a ->> 'first_name', ''), l.first_name),
      coalesce(nullif(a ->> 'last_name', ''), l.last_name),
      a ->> 'line1',
      nullif(a ->> 'line2', ''),
      a ->> 'postal_code',
      a ->> 'city',
      coalesce(nullif(a ->> 'country', ''), 'FR'),
      coalesce(nullif(a ->> 'phone', ''), l.phone),
      true
    );
  end if;

  delete from public.legacy_customers where email = l.email;
  return new;
end;
$$;

revoke execute on function public.claim_legacy_customer() from public, anon, authenticated;

create trigger on_auth_user_change_legacy
  after insert or update of email, email_confirmed_at on auth.users
  for each row
  when (new.email is not null and new.email_confirmed_at is not null)
  execute function public.claim_legacy_customer();

-- Les commandes Shopify ont déjà leur facture (émise par Shopify) : aucune facture
-- ni aucun avoir ne peut être créé ici pour elles, même par erreur.
create function public.refuse_invoice_for_import()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.orders where id = new.order_id and source = 'shopify_import') then
    raise exception 'commande_shopify' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger refuse_invoice_for_import
  before insert on public.invoices
  for each row execute function public.refuse_invoice_for_import();

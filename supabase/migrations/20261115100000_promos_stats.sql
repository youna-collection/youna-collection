-- Phase 5, étape 4 : codes promo, clientes, statistiques, gel du site.

-- ---------------------------------------------------------------------------
-- Codes promo
-- ---------------------------------------------------------------------------
alter table public.promo_codes
  add column once_per_customer boolean not null default false,
  add column note text check (char_length(note) <= 200);

grant all on public.promo_codes to service_role;

/**
 * Vérifie un code pour un panier : renvoie { code, type, value } ou une erreur lisible
 * (promo_inconnu, promo_pas_encore, promo_expire, promo_epuise, promo_minimum, promo_deja_utilise).
 * Appelée uniquement par le serveur.
 */
create function public.promo_quote(p_code text, p_subtotal_cents integer, p_email text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.promo_codes;
begin
  select * into p from public.promo_codes where code = upper(trim(p_code));
  if not found or not p.is_active then
    raise exception 'promo_inconnu' using errcode = 'P0001';
  end if;
  if p.starts_at is not null and p.starts_at > now() then
    raise exception 'promo_pas_encore' using errcode = 'P0001';
  end if;
  if p.ends_at is not null and p.ends_at <= now() then
    raise exception 'promo_expire' using errcode = 'P0001';
  end if;
  if p.max_uses is not null and p.used_count >= p.max_uses then
    raise exception 'promo_epuise' using errcode = 'P0001';
  end if;
  if p_subtotal_cents < p.min_subtotal_cents then
    raise exception 'promo_minimum' using errcode = 'P0001', detail = p.min_subtotal_cents::text;
  end if;
  if p.once_per_customer and p_email is not null and exists (
    select 1 from public.orders o
    where o.email = lower(trim(p_email)) and o.promo_code = p.code and o.status <> 'cancelled'
  ) then
    raise exception 'promo_deja_utilise' using errcode = 'P0001';
  end if;
  return jsonb_build_object('code', p.code, 'type', p.type, 'value', p.value);
end;
$$;

revoke execute on function public.promo_quote(text, integer, text) from public, anon, authenticated;
grant execute on function public.promo_quote(text, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- Gel du site : la boutique affiche une page d'attente, l'admin continue de tout voir.
-- ---------------------------------------------------------------------------
alter table public.shop_settings
  add column maintenance_enabled boolean not null default false,
  add column maintenance_title text check (char_length(maintenance_title) <= 120),
  add column maintenance_message text check (char_length(maintenance_message) <= 1000);

grant update (maintenance_enabled, maintenance_title, maintenance_message) on public.shop_settings to authenticated;

-- Lecture publique de l'état de la boutique (et de rien d'autre).
create function public.shop_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'maintenance', coalesce(s.maintenance_enabled, false),
    'title', s.maintenance_title,
    'message', s.maintenance_message
  )
  from public.shop_settings s where s.id = 1;
$$;

revoke execute on function public.shop_status() from public;
grant execute on function public.shop_status() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Clientes : comptes + acheteuses sans compte, regroupées par e-mail.
-- ---------------------------------------------------------------------------
create function public.admin_customers()
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
  p as (select * from public.profiles where role = 'customer')
  select coalesce(p.email, agg.email),
         p.id,
         coalesce(nullif(p.first_name, ''), agg.addr ->> 'first_name', agg.addr ->> 'name'),
         coalesce(nullif(p.last_name, ''), agg.addr ->> 'last_name'),
         coalesce(nullif(p.phone, ''), agg.addr ->> 'phone'),
         p.id is not null,
         coalesce(agg.orders_count, 0),
         coalesce(agg.spent, 0),
         agg.first_at,
         agg.last_at,
         p.created_at
  from agg full join p on lower(p.email) = agg.email;
end;
$$;

revoke execute on function public.admin_customers() from public, anon;
grant execute on function public.admin_customers() to authenticated;

-- ---------------------------------------------------------------------------
-- Statistiques de ventes sur une période (heure de Paris).
-- Chiffre d'affaires net = total payé − remboursé ; les commandes annulées comptent pour zéro.
-- ---------------------------------------------------------------------------
create function public.admin_stats(p_from timestamptz, p_to timestamptz, p_bucket text default 'day')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'reserve_admin' using errcode = '42501';
  end if;
  if p_bucket not in ('day', 'week', 'month') then
    raise exception 'periode_invalide' using errcode = '22023';
  end if;

  with o as (
    select x.*, coalesce(x.paid_at, x.created_at) as sold_at
    from public.orders x
    where coalesce(x.paid_at, x.created_at) >= p_from and coalesce(x.paid_at, x.created_at) < p_to
  ),
  valid as (select * from o where status <> 'cancelled'),
  items as (
    select i.product_name, i.variant_label, i.quantity, i.line_total_cents
    from public.order_items i join valid v on v.id = i.order_id
  ),
  buckets as (
    select generate_series(
      date_trunc(p_bucket, p_from at time zone 'Europe/Paris'),
      date_trunc(p_bucket, (p_to - interval '1 second') at time zone 'Europe/Paris'),
      ('1 ' || p_bucket)::interval
    ) as b
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'orders', count(*),
        'gross_cents', coalesce(sum(total_cents), 0),
        'refunded_cents', coalesce(sum(refunded_cents), 0),
        'net_cents', coalesce(sum(total_cents - refunded_cents), 0),
        'shipping_cents', coalesce(sum(shipping_cents), 0),
        'discount_cents', coalesce(sum(discount_cents), 0),
        'items', (select coalesce(sum(quantity), 0) from items),
        'cancelled', (select count(*) from o where status = 'cancelled')
      ) from valid
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('date', to_char(b.b, 'YYYY-MM-DD'), 'orders', coalesce(s.orders, 0), 'net_cents', coalesce(s.net, 0)) order by b.b), '[]'::jsonb)
      from buckets b
      left join (
        select date_trunc(p_bucket, sold_at at time zone 'Europe/Paris') as b, count(*) as orders, sum(total_cents - refunded_cents) as net
        from valid group by 1
      ) s on s.b = b.b
    ),
    'by_source', (
      select coalesce(jsonb_agg(jsonb_build_object('source', source, 'orders', n, 'net_cents', net) order by net desc), '[]'::jsonb)
      from (select source, count(*) as n, sum(total_cents - refunded_cents) as net from valid group by source) t
    ),
    'by_carrier', (
      select coalesce(jsonb_agg(jsonb_build_object('carrier', carrier, 'orders', n) order by n desc), '[]'::jsonb)
      from (select carrier, count(*) as n from valid where source = 'web' group by carrier) t
    ),
    'top_products', (
      select coalesce(jsonb_agg(jsonb_build_object('name', product_name, 'quantity', q, 'revenue_cents', r) order by q desc, r desc), '[]'::jsonb)
      from (select product_name, sum(quantity) as q, sum(line_total_cents) as r from items group by product_name order by q desc, r desc limit 10) t
    ),
    'top_variants', (
      select coalesce(jsonb_agg(jsonb_build_object('name', product_name, 'variant', variant_label, 'quantity', q) order by q desc), '[]'::jsonb)
      from (select product_name, variant_label, sum(quantity) as q from items group by 1, 2 order by q desc limit 10) t
    ),
    'promos', (
      select coalesce(jsonb_agg(jsonb_build_object('code', promo_code, 'orders', n, 'discount_cents', d) order by n desc), '[]'::jsonb)
      from (select promo_code, count(*) as n, sum(discount_cents) as d from valid where promo_code is not null group by promo_code) t
    ),
    'new_accounts', (
      select count(*) from public.profiles where role = 'customer' and created_at >= p_from and created_at < p_to
    ),
    'returning_customers', (
      select count(distinct v.email) from valid v
      where v.email is not null and exists (
        select 1 from public.orders e where e.email = v.email and e.status <> 'cancelled' and coalesce(e.paid_at, e.created_at) < p_from
      )
    ),
    'customers', (select count(distinct email) from valid where email is not null)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.admin_stats(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_stats(timestamptz, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Paiement : le code promo est recopié dans la commande et compté comme utilisé.
-- ---------------------------------------------------------------------------
create or replace function public.fulfill_checkout(
  p_checkout_id uuid,
  p_stripe_session_id text,
  p_payment_intent_id text,
  p_amount_total integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.checkouts;
  s jsonb;
  v_order_id uuid;
  v_item_id uuid;
  v_item jsonb;
  v_component jsonb;
  r record;
  v_take integer;
  v_problems text[] := '{}';
begin
  select * into c from public.checkouts where id = p_checkout_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'paiement_introuvable';
  end if;
  if c.stripe_session_id is not null and c.stripe_session_id <> p_stripe_session_id then
    raise exception using errcode = 'P0001', message = 'session_differente';
  end if;

  if c.status = 'completed' then
    select id into v_order_id from public.orders where stripe_session_id = p_stripe_session_id;
    return v_order_id;
  end if;

  s := c.snapshot;

  insert into public.orders (
    user_id, email, status, source, subtotal_cents, discount_cents, shipping_cents, total_cents,
    shipping_method_code, carrier, shipping_address, relay_point, stripe_session_id, stripe_payment_intent_id, paid_at,
    promo_code
  ) values (
    c.user_id,
    c.email,
    'paid',
    'web',
    (s #>> '{totals,subtotal_cents}')::integer,
    coalesce((s #>> '{totals,discount_cents}')::integer, 0),
    (s #>> '{totals,shipping_cents}')::integer,
    (s #>> '{totals,total_cents}')::integer,
    s #>> '{shipping,method_code}',
    (s #>> '{shipping,carrier}')::public.shipping_carrier,
    s #> '{shipping,address}',
    s #> '{shipping,relay_point}',
    p_stripe_session_id,
    p_payment_intent_id,
    now(),
    nullif(s #>> '{totals,promo_code}', '')
  )
  returning id into v_order_id;

  -- Code promo : une utilisation de plus (même si la limite vient d'être atteinte entre-temps : la cliente a payé).
  if nullif(s #>> '{totals,promo_code}', '') is not null then
    update public.promo_codes set used_count = used_count + 1, updated_at = now() where code = s #>> '{totals,promo_code}';
  end if;

  for v_item in select * from jsonb_array_elements(s -> 'items')
  loop
    insert into public.order_items (order_id, variant_id, product_name, variant_label, sku, unit_price_cents, quantity, line_total_cents)
    values (
      v_order_id,
      (v_item ->> 'variant_id')::uuid,
      v_item ->> 'product_name',
      v_item ->> 'variant_label',
      v_item ->> 'sku',
      (v_item ->> 'unit_price_cents')::integer,
      (v_item ->> 'quantity')::integer,
      (v_item ->> 'line_total_cents')::integer
    )
    returning id into v_item_id;

    for v_component in select * from jsonb_array_elements(coalesce(v_item -> 'components', '[]'::jsonb))
    loop
      insert into public.order_item_components (order_item_id, variant_id, label)
      values (v_item_id, (v_component ->> 'variant_id')::uuid, v_component ->> 'label');
    end loop;
  end loop;

  -- L'historique du stock indique que ces mouvements viennent de cette commande.
  perform set_config('app.stock_reason', 'order', true);
  perform set_config('app.stock_order_id', v_order_id::text, true);

  if c.status = 'open' then
    update public.product_variants v
      set stock = v.stock - r2.quantity, reserved = v.reserved - r2.quantity
      from public.checkout_reservations r2
      where r2.checkout_id = c.id and r2.variant_id = v.id;
    delete from public.checkout_reservations where checkout_id = c.id;
  else
    -- Paiement confirmé après la fin de la réservation : on retire ce qui est encore disponible.
    for r in
      select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantity')::integer)::integer as quantity
      from jsonb_array_elements(s -> 'stock_items') as e
      group by 1
      order by 1
    loop
      v_take := null;
      select least(r.quantity, greatest(stock - reserved, 0)) into v_take
        from public.product_variants where id = r.variant_id and track_stock for update;
      if v_take is null then
        continue;
      end if;
      if v_take > 0 then
        update public.product_variants set stock = stock - v_take where id = r.variant_id;
      end if;
      if v_take < r.quantity then
        v_problems := v_problems || format('Stock insuffisant pour l''article %s : %s manquant(s).', r.variant_id, r.quantity - v_take);
      end if;
    end loop;
  end if;

  if p_amount_total is distinct from (s #>> '{totals,total_cents}')::integer then
    v_problems := v_problems || format('Montant payé (%s centimes) différent du total calculé.', p_amount_total);
  end if;
  if array_length(v_problems, 1) > 0 then
    insert into public.order_notes (order_id, body)
    values (v_order_id, 'À vérifier : ' || array_to_string(v_problems, ' '));
  end if;

  update public.checkouts
    set status = 'completed', stripe_session_id = coalesce(stripe_session_id, p_stripe_session_id)
    where id = c.id;
  if c.cart_id is not null then
    update public.carts set status = 'converted' where id = c.cart_id;
  end if;

  return v_order_id;
end;
$$;

-- (droits inchangés : réservée au serveur)

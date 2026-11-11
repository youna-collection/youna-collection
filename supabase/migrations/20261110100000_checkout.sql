-- Phase 3 : livraison, réservation du stock pendant le paiement, création des commandes.
-- Toute opération sur le stock passe par ces fonctions : chacune s'exécute en un seul bloc,
-- entièrement ou pas du tout, ce qui empêche de vendre deux fois le même article.

-- ---------------------------------------------------------------------------
-- Modes et tarifs de livraison (repris de Shopify, modifiables dans l'admin en phase 5)
-- ---------------------------------------------------------------------------
insert into public.shipping_methods (code, name, description, carrier, requires_relay_point, requires_address, position) values
  ('mondial_relay', 'Point relais Mondial Relay', 'Vous choisissez votre point relais sur la carte.', 'mondial_relay', true, false, 1),
  ('colissimo', 'Colissimo à domicile', 'Livraison à votre adresse.', 'colissimo', false, true, 2),
  ('international', 'Livraison internationale', 'Colissimo International, vers l''Europe.', 'colissimo', false, true, 3),
  ('retrait_avenue83', 'Retrait à Avenue 83', 'Gratuit. Nous vous contactons pour convenir du retrait.', 'pickup', false, false, 4)
on conflict (code) do nothing;

insert into public.shipping_rates (method_id, country, max_weight_grams, price_cents)
select m.id, r.country, r.max_weight_grams, r.price_cents
from (values
  ('mondial_relay', 'FR', 500, 430),
  ('mondial_relay', 'FR', 30000, 540),
  ('colissimo', 'FR', 30000, 1026),
  ('retrait_avenue83', 'FR', 30000, 0),
  ('international', 'BE', 30000, 1500),
  ('international', 'LU', 30000, 1500),
  ('international', 'DE', 30000, 1500),
  ('international', 'NL', 30000, 1500),
  ('international', 'IT', 30000, 1500),
  ('international', 'ES', 30000, 1500),
  ('international', 'PT', 30000, 1500),
  ('international', 'AT', 30000, 1500),
  ('international', 'IE', 30000, 1500)
) as r (code, country, max_weight_grams, price_cents)
join public.shipping_methods m on m.code = r.code
on conflict (method_id, country, max_weight_grams) do nothing;

-- ---------------------------------------------------------------------------
-- Libérer le stock bloqué par un paiement abandonné
-- ---------------------------------------------------------------------------
create function public.release_checkout(p_checkout_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.checkout_status;
begin
  select status into v_status from public.checkouts where id = p_checkout_id for update;
  if v_status is distinct from 'open' then
    return false;
  end if;

  update public.product_variants v
    set reserved = v.reserved - r.quantity
    from public.checkout_reservations r
    where r.checkout_id = p_checkout_id and r.variant_id = v.id;
  delete from public.checkout_reservations where checkout_id = p_checkout_id;
  update public.checkouts set status = 'expired' where id = p_checkout_id;
  return true;
end;
$$;

create function public.release_expired_checkouts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.checkouts
    where status = 'open' and expires_at < now()
    for update skip locked
  loop
    if public.release_checkout(v_id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ouvrir un paiement : fige le panier et réserve le stock
-- p_items : [{ "variant_id": "...", "quantity": 2 }, ...] (voiles des bouquets inclus)
-- ---------------------------------------------------------------------------
create function public.create_checkout(
  p_cart_id uuid,
  p_user_id uuid,
  p_email text,
  p_snapshot jsonb,
  p_items jsonb,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout_id uuid;
  v_previous uuid;
  r record;
begin
  perform public.release_expired_checkouts();

  -- Un seul paiement en cours par panier : relancer le paiement libère le précédent.
  if p_cart_id is not null then
    for v_previous in
      select id from public.checkouts where cart_id = p_cart_id and status = 'open'
    loop
      perform public.release_checkout(v_previous);
    end loop;
  end if;

  insert into public.checkouts (user_id, cart_id, email, snapshot, expires_at)
  values (p_user_id, p_cart_id, lower(p_email), p_snapshot, p_expires_at)
  returning id into v_checkout_id;

  -- Tri par identifiant : deux paiements simultanés verrouillent les articles dans le même ordre.
  for r in
    select (e ->> 'variant_id')::uuid as variant_id, sum((e ->> 'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as e
    group by 1
    order by 1
  loop
    if r.quantity <= 0 then
      raise exception using errcode = 'P0001', message = 'quantite_invalide', detail = r.variant_id::text;
    end if;

    update public.product_variants v
      set reserved = v.reserved + r.quantity
      where v.id = r.variant_id
        and v.is_active
        and v.track_stock
        and v.stock - v.reserved >= r.quantity
        and exists (select 1 from public.products p where p.id = v.product_id and p.status = 'active');

    if found then
      insert into public.checkout_reservations (checkout_id, variant_id, quantity)
      values (v_checkout_id, r.variant_id, r.quantity);
    elsif not exists (
      -- Article sans suivi de stock : rien à réserver, mais il doit être en vente.
      select 1 from public.product_variants v
      join public.products p on p.id = v.product_id
      where v.id = r.variant_id and v.is_active and not v.track_stock and p.status = 'active'
    ) then
      raise exception using errcode = 'P0001', message = 'stock_insuffisant', detail = r.variant_id::text;
    end if;
  end loop;

  return v_checkout_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Paiement confirmé : crée la commande et retire le stock. Peut être appelée plusieurs fois
-- (confirmation Stripe + page de retour) : la commande n'est créée qu'une fois.
-- ---------------------------------------------------------------------------
create function public.fulfill_checkout(
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
    shipping_method_code, carrier, shipping_address, relay_point, stripe_session_id, stripe_payment_intent_id, paid_at
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
    now()
  )
  returning id into v_order_id;

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

-- Réservées au serveur : jamais appelables depuis le navigateur.
revoke execute on function public.release_checkout(uuid) from public, anon, authenticated;
revoke execute on function public.release_expired_checkouts() from public, anon, authenticated;
revoke execute on function public.create_checkout(uuid, uuid, text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public.fulfill_checkout(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.release_checkout(uuid) to service_role;
grant execute on function public.release_expired_checkouts() to service_role;
grant execute on function public.create_checkout(uuid, uuid, text, jsonb, jsonb, timestamptz) to service_role;
grant execute on function public.fulfill_checkout(uuid, text, text, integer) to service_role;

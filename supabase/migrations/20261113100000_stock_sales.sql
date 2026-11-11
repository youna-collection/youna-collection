-- Phase 5, étape 2 : stock et ventes en boutique (salon, Avenue 83...).

-- Une vente en boutique n'a pas forcément d'adresse e-mail ; une commande en ligne en a toujours une.
alter table public.orders alter column email drop not null;
alter table public.orders add constraint orders_email_required check (email is not null or source = 'in_person');

-- Moyen de paiement d'une vente en boutique (en ligne : toujours Stripe).
alter table public.orders add column payment_method text
  check (payment_method is null or payment_method in ('especes', 'carte', 'virement', 'autre'));

-- ---------------------------------------------------------------------------
-- Enregistre une vente faite en direct : crée la commande (statut « livrée »),
-- ses lignes (et les voiles des bouquets), puis retire le stock, en une seule opération.
-- p_items : [{ "variant_id": "...", "quantity": 1, "unit_price_cents": 1199, "components": ["id voile", ...] }]
-- ---------------------------------------------------------------------------
create function public.record_in_person_sale(
  p_items jsonb,
  p_payment_method text,
  p_email text default null,
  p_customer_name text default null,
  p_discount_cents integer default 0,
  p_sold_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_quantity integer;
  v_price integer;
  v_subtotal integer := 0;
  v_variant record;
  v_item_id uuid;
  v_component text;
  v_need record;
  v_found boolean;
begin
  if not public.is_admin() then
    raise exception 'reserve_admin' using errcode = '42501';
  end if;
  if p_payment_method is null or p_payment_method not in ('especes', 'carte', 'virement', 'autre') then
    raise exception 'paiement_invalide' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'vente_vide' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := (v_item ->> 'quantity')::integer;
    v_price := (v_item ->> 'unit_price_cents')::integer;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 100 or v_price is null or v_price < 0 then
      raise exception 'ligne_invalide' using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + v_quantity * v_price;
  end loop;

  if coalesce(p_discount_cents, 0) < 0 or coalesce(p_discount_cents, 0) > v_subtotal then
    raise exception 'remise_invalide' using errcode = '22023';
  end if;

  insert into public.orders (
    email, status, source, subtotal_cents, discount_cents, shipping_cents, total_cents,
    carrier, shipping_address, payment_method, paid_at, delivered_at, created_at
  ) values (
    lower(nullif(trim(p_email), '')), 'delivered', 'in_person', v_subtotal, coalesce(p_discount_cents, 0), 0,
    v_subtotal - coalesce(p_discount_cents, 0), null,
    case when nullif(trim(p_customer_name), '') is null then null else jsonb_build_object('name', trim(p_customer_name)) end,
    p_payment_method, p_sold_at, p_sold_at, p_sold_at
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select v.id, v.sku, v.color_name, v.size, v.bouquet_veil_count, p.name as product_name
      into v_variant
      from public.product_variants v
      join public.products p on p.id = v.product_id
      where v.id = (v_item ->> 'variant_id')::uuid;
    if not found then
      raise exception 'variante_introuvable' using errcode = 'P0002';
    end if;

    insert into public.order_items (order_id, variant_id, product_name, variant_label, sku, unit_price_cents, quantity, line_total_cents)
    values (
      v_order_id, v_variant.id, v_variant.product_name,
      case when v_variant.bouquet_veil_count is not null and v_variant.size is not null
           then v_variant.size || ' · ' || v_variant.bouquet_veil_count || ' voiles'
           else coalesce(v_variant.color_name, v_variant.size) end,
      v_variant.sku, (v_item ->> 'unit_price_cents')::integer, (v_item ->> 'quantity')::integer,
      (v_item ->> 'unit_price_cents')::integer * (v_item ->> 'quantity')::integer
    )
    returning id into v_item_id;

    for v_component in select value from jsonb_array_elements_text(coalesce(v_item -> 'components', '[]'::jsonb)) loop
      insert into public.order_item_components (order_item_id, variant_id, label)
      select v_item_id, v.id, concat_ws(' ', p.name, v.color_name)
      from public.product_variants v
      join public.products p on p.id = v.product_id
      where v.id = v_component::uuid;
      if not found then
        raise exception 'variante_introuvable' using errcode = 'P0002';
      end if;
    end loop;
  end loop;

  -- Retire le stock (articles + voiles des bouquets), dans un ordre fixe pour éviter les blocages.
  perform set_config('app.stock_reason', 'in_person_sale', true);
  perform set_config('app.stock_order_id', v_order_id::text, true);

  for v_need in
    select d.variant_id, sum(d.quantity)::integer as quantity
    from (
      select (e ->> 'variant_id')::uuid as variant_id, (e ->> 'quantity')::integer as quantity
      from jsonb_array_elements(p_items) e
      union all
      select c::uuid, (e ->> 'quantity')::integer
      from jsonb_array_elements(p_items) e, jsonb_array_elements_text(coalesce(e -> 'components', '[]'::jsonb)) c
    ) d
    group by d.variant_id
    order by d.variant_id
  loop
    update public.product_variants
      set stock = stock - v_need.quantity
      where id = v_need.variant_id and track_stock and stock - reserved >= v_need.quantity;
    if not found then
      select exists (select 1 from public.product_variants where id = v_need.variant_id and not track_stock) into v_found;
      if not v_found then
        raise exception 'stock_insuffisant' using errcode = 'P0001', detail = v_need.variant_id::text;
      end if;
    end if;
  end loop;

  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_order_id', '', true);
  return v_order_id;
end;
$$;

revoke execute on function public.record_in_person_sale(jsonb, text, text, text, integer, timestamptz) from public, anon;
grant execute on function public.record_in_person_sale(jsonb, text, text, text, integer, timestamptz) to authenticated;

-- Paiement en espèces, seulement pour le click & collect : la cliente paie en main propre au retrait.
-- La commande est enregistrée tout de suite (le stock lui est gardé), avec payment_method = 'especes'
-- et paid_at vide tant que l'argent n'est pas reçu. Le retrait (statut « Livrée ») vaut encaissement.

-- ---------------------------------------------------------------------------
-- Enregistrer la commande d'un paiement ouvert (stock déjà réservé par create_checkout)
-- ---------------------------------------------------------------------------
create function public.place_cash_order(p_checkout_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.checkouts;
  v_order_id uuid;
  v_ref text := 'especes:' || p_checkout_id::text;
begin
  select * into c from public.checkouts where id = p_checkout_id for update;
  if not found or c.status <> 'open' or c.stripe_session_id is not null then
    raise exception using errcode = 'P0001', message = 'paiement_introuvable';
  end if;
  -- Jamais d'espèces pour un colis : seulement quand la cliente vient chercher sa commande.
  if c.snapshot #>> '{shipping,carrier}' is distinct from 'pickup' then
    raise exception using errcode = 'P0001', message = 'especes_retrait_seulement';
  end if;

  -- Même création de commande qu'un paiement par carte (articles, stock, code promo, panier).
  v_order_id := public.fulfill_checkout(p_checkout_id, v_ref, null, (c.snapshot #>> '{totals,total_cents}')::integer);

  update public.orders
    set payment_method = 'especes', paid_at = null, stripe_session_id = null
    where id = v_order_id;
  update public.checkouts set stripe_session_id = null where id = p_checkout_id;
  return v_order_id;
end;
$$;

revoke execute on function public.place_cash_order(uuid) from public, anon, authenticated;
grant execute on function public.place_cash_order(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Retrait = encaissement : passer la commande à « Livrée » note le paiement reçu.
-- Revenir en arrière (erreur de clic) l'annule, tant qu'aucune facture n'a été faite.
-- ---------------------------------------------------------------------------
create function public.cash_paid_on_pickup()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'web' and new.payment_method = 'especes' then
    if new.status = 'delivered' and new.paid_at is null then
      new.paid_at := now();
    elsif old.status = 'delivered' and new.status in ('paid', 'preparing', 'shipped')
      and not exists (select 1 from public.invoices i where i.order_id = new.id) then
      new.paid_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger cash_paid_on_pickup
  before update of status on public.orders
  for each row execute function public.cash_paid_on_pickup();

-- ---------------------------------------------------------------------------
-- La cliente n'est pas venue : annule une commande en espèces pas encore payée
-- et remet tous ses articles en stock (voiles des bouquets compris).
-- ---------------------------------------------------------------------------
create function public.cancel_unpaid_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_need record;
begin
  if not public.is_admin() then
    raise exception 'reserve_admin' using errcode = '42501';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'commande_introuvable' using errcode = 'P0002';
  end if;
  if o.payment_method is distinct from 'especes' or o.paid_at is not null or o.status not in ('paid', 'preparing') or o.refunded_cents > 0 then
    raise exception 'commande_non_annulable' using errcode = 'P0001';
  end if;

  perform set_config('app.stock_reason', 'cancellation', true);
  perform set_config('app.stock_order_id', p_order_id::text, true);
  for v_need in
    select d.variant_id, sum(d.quantity)::integer as quantity
    from (
      select i.variant_id, i.quantity from public.order_items i where i.order_id = p_order_id
      union all
      select c.variant_id, i.quantity from public.order_item_components c
      join public.order_items i on i.id = c.order_item_id
      where i.order_id = p_order_id
    ) d
    where d.variant_id is not null
    group by d.variant_id
    order by d.variant_id
  loop
    update public.product_variants set stock = stock + v_need.quantity where id = v_need.variant_id and track_stock;
  end loop;
  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_order_id', '', true);

  -- Le code promo redevient utilisable (la commande n'a jamais été payée).
  if o.promo_code is not null then
    update public.promo_codes set used_count = greatest(used_count - 1, 0), updated_at = now() where code = o.promo_code;
  end if;

  update public.orders set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = p_order_id;
end;
$$;

revoke execute on function public.cancel_unpaid_order(uuid) from public, anon;
grant execute on function public.cancel_unpaid_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Facture : le mode de paiement d'une commande en ligne peut maintenant être « espèces ».
-- ---------------------------------------------------------------------------
create or replace function public.issue_invoice_for(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_id uuid;
  v_address jsonb;
  v_name text;
  v_lines jsonb;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'commande_introuvable' using errcode = 'P0002';
  end if;

  select id into v_id from public.invoices where order_id = p_order_id and kind = 'invoice';
  if found then
    return v_id;
  end if;

  if o.paid_at is null then
    raise exception 'commande_non_payee' using errcode = 'P0001';
  end if;

  v_address := coalesce(o.billing_address, o.shipping_address, '{}'::jsonb);
  v_name := coalesce(
    nullif(trim(concat_ws(' ', v_address ->> 'first_name', v_address ->> 'last_name')), ''),
    nullif(v_address ->> 'name', '')
  );

  select coalesce(jsonb_agg(jsonb_build_object(
           'label', i.product_name || coalesce(' — ' || i.variant_label, ''),
           'details', (select coalesce(jsonb_agg(c.label order by c.label), '[]'::jsonb) from public.order_item_components c where c.order_item_id = i.id),
           'quantity', i.quantity,
           'unit_price_cents', i.unit_price_cents,
           'total_cents', i.line_total_cents
         ) order by i.product_name, i.variant_label), '[]'::jsonb)
    into v_lines
    from public.order_items i
    where i.order_id = p_order_id;

  insert into public.invoices (order_id, kind, number, issued_at, seller, buyer, lines, totals)
  values (
    p_order_id, 'invoice', public.next_document_number(), now(), public.seller_snapshot(),
    jsonb_strip_nulls(jsonb_build_object(
      'name', v_name,
      'email', o.email,
      'address', case when v_address ? 'line1' then jsonb_build_array(
        v_address ->> 'line1', nullif(v_address ->> 'line2', ''),
        concat_ws(' ', v_address ->> 'postal_code', v_address ->> 'city'), v_address ->> 'country') end
    )),
    v_lines,
    jsonb_build_object(
      'order_number', o.order_number,
      'order_date', o.paid_at,
      'subtotal_cents', o.subtotal_cents,
      'discount_cents', o.discount_cents,
      'shipping_cents', o.shipping_cents,
      'total_cents', o.total_cents,
      'promo_code', o.promo_code,
      'payment', case when o.source = 'web' then coalesce(o.payment_method, 'carte') else o.payment_method end
    )
  )
  returning id into v_id;
  return v_id;
end;
$$;

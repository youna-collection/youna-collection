-- Phase 5, étape 3 : commandes, remboursements, factures et avoirs.

-- ---------------------------------------------------------------------------
-- Informations du vendeur (une seule ligne), recopiées dans chaque facture au moment où elle est émise.
-- ---------------------------------------------------------------------------
create table public.shop_settings (
  id smallint primary key default 1 check (id = 1),
  legal_name text check (char_length(legal_name) <= 120),
  trade_name text check (char_length(trade_name) <= 120),
  legal_form text check (char_length(legal_form) <= 120),
  siret text check (siret is null or siret ~ '^[0-9]{14}$'),
  vat_number text check (char_length(vat_number) <= 30),
  vat_mention text check (char_length(vat_mention) <= 200) default 'TVA non applicable, art. 293 B du CGI',
  address_line1 text check (char_length(address_line1) <= 120),
  address_line2 text check (char_length(address_line2) <= 120),
  postal_code text check (char_length(postal_code) <= 12),
  city text check (char_length(city) <= 80),
  country text check (char_length(country) <= 60) default 'France',
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 30),
  invoice_footer text check (char_length(invoice_footer) <= 500),
  updated_at timestamptz not null default now()
);
insert into public.shop_settings (id) values (1);

alter table public.shop_settings enable row level security;
grant select on public.shop_settings to authenticated;
grant update (legal_name, trade_name, legal_form, siret, vat_number, vat_mention, address_line1, address_line2,
              postal_code, city, country, email, phone, invoice_footer, updated_at)
  on public.shop_settings to authenticated;
create policy shop_settings_select_admin on public.shop_settings for select to authenticated
  using ((select public.is_admin()));
create policy shop_settings_update_admin on public.shop_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Remboursements : un par opération (total ou partiel), avec les articles remis en stock.
-- ---------------------------------------------------------------------------
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  method text not null check (method in ('stripe', 'manual')),
  stripe_refund_id text unique,
  reason text check (char_length(reason) <= 300),
  -- [{ "order_item_id": "...", "quantity": 1 }]
  restocked jsonb not null default '[]'::jsonb,
  credit_note_id uuid references public.invoices (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint refunds_stripe_id check ((method = 'stripe') = (stripe_refund_id is not null))
);
create index refunds_order_idx on public.refunds (order_id);

alter table public.refunds enable row level security;
grant select on public.refunds to authenticated;
create policy refunds_select_admin on public.refunds for select to authenticated
  using ((select public.is_admin()));

create index if not exists invoices_order_idx on public.invoices (order_id);

-- ---------------------------------------------------------------------------
-- Factures : numérotation continue, contenu figé au moment de l'émission.
-- ---------------------------------------------------------------------------
create function public.next_document_number()
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.document_counters (name, last_value) values ('invoice', 1)
  on conflict (name) do update set last_value = public.document_counters.last_value + 1
  returning last_value;
$$;

create function public.seller_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.shop_settings;
begin
  select * into s from public.shop_settings where id = 1;
  if s.legal_name is null or s.siret is null or s.address_line1 is null or s.postal_code is null or s.city is null then
    raise exception 'vendeur_incomplet' using errcode = 'P0001';
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'legal_name', s.legal_name,
    'trade_name', nullif(s.trade_name, ''),
    'legal_form', nullif(s.legal_form, ''),
    'siret', s.siret,
    'vat_number', nullif(s.vat_number, ''),
    'vat_mention', nullif(s.vat_mention, ''),
    'address', jsonb_build_array(s.address_line1, nullif(s.address_line2, ''), s.postal_code || ' ' || s.city, nullif(s.country, '')),
    'email', nullif(s.email, ''),
    'phone', nullif(s.phone, ''),
    'footer', nullif(s.invoice_footer, '')
  ));
end;
$$;

-- Émet la facture d'une commande (ou renvoie celle qui existe déjà). Sans vérification d'accès : usage interne.
create function public.issue_invoice_for(p_order_id uuid)
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
      'payment', case when o.source = 'web' then 'carte' else o.payment_method end
    )
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Facture demandée par l'admin, ou par la cliente pour sa propre commande.
create function public.issue_invoice(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_id uuid;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or not (public.is_admin() or (auth.uid() is not null and o.user_id = auth.uid())) then
    raise exception 'commande_introuvable' using errcode = 'P0002';
  end if;
  select id into v_id from public.invoices where order_id = p_order_id and kind = 'invoice';
  if found then
    return v_id;
  end if;
  -- Une commande annulée avant toute facture n'en a pas besoin.
  if o.status = 'cancelled' then
    raise exception 'commande_annulee' using errcode = 'P0001';
  end if;
  return public.issue_invoice_for(p_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Enregistre un remboursement (déjà fait chez Stripe, ou rendu en main propre),
-- remet en stock les articles choisis et émet un avoir si les infos vendeur sont remplies.
-- ---------------------------------------------------------------------------
create function public.record_refund(
  p_order_id uuid,
  p_amount_cents integer,
  p_items jsonb default '[]'::jsonb,
  p_reason text default null,
  p_stripe_refund_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_refund_id uuid;
  v_invoice_id uuid;
  v_credit_id uuid;
  v_item jsonb;
  v_line record;
  v_returned integer;
  v_need record;
  v_seller jsonb;
  v_new_refunded integer;
begin
  if not public.is_admin() then
    raise exception 'reserve_admin' using errcode = '42501';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'commande_introuvable' using errcode = 'P0002';
  end if;

  -- Même remboursement Stripe enregistré deux fois (double clic, nouvel essai) : rien de plus.
  if p_stripe_refund_id is not null then
    select id into v_refund_id from public.refunds where stripe_refund_id = p_stripe_refund_id;
    if found then
      return v_refund_id;
    end if;
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > o.total_cents - o.refunded_cents then
    raise exception 'montant_invalide' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'ligne_invalide' using errcode = '22023';
  end if;

  -- Vérifie les quantités à remettre en stock : jamais plus que ce qui a été vendu et pas encore rendu.
  for v_item in select value from jsonb_array_elements(p_items) loop
    select i.id, i.quantity into v_line from public.order_items i
      where i.id = (v_item ->> 'order_item_id')::uuid and i.order_id = p_order_id;
    if not found or (v_item ->> 'quantity')::integer is null or (v_item ->> 'quantity')::integer <= 0 then
      raise exception 'ligne_invalide' using errcode = '22023';
    end if;
    select coalesce(sum((e ->> 'quantity')::integer), 0) into v_returned
      from public.refunds r, jsonb_array_elements(r.restocked) e
      where r.order_id = p_order_id and (e ->> 'order_item_id')::uuid = v_line.id;
    v_returned := v_returned + coalesce((
      select sum((e ->> 'quantity')::integer) from jsonb_array_elements(p_items) e
      where (e ->> 'order_item_id')::uuid = v_line.id), 0);
    if v_returned > v_line.quantity then
      raise exception 'quantite_trop_grande' using errcode = '22023';
    end if;
  end loop;

  insert into public.refunds (order_id, amount_cents, method, stripe_refund_id, reason, restocked, created_by)
  values (
    p_order_id, p_amount_cents, case when p_stripe_refund_id is null then 'manual' else 'stripe' end,
    p_stripe_refund_id, nullif(trim(p_reason), ''), p_items, auth.uid()
  )
  returning id into v_refund_id;

  -- Remise en stock (articles + voiles des bouquets), dans un ordre fixe.
  perform set_config('app.stock_reason', case when o.shipped_at is null and o.status in ('paid', 'preparing') then 'cancellation' else 'return' end, true);
  perform set_config('app.stock_order_id', p_order_id::text, true);
  for v_need in
    select d.variant_id, sum(d.quantity)::integer as quantity
    from (
      select i.variant_id, (e ->> 'quantity')::integer as quantity
      from jsonb_array_elements(p_items) e
      join public.order_items i on i.id = (e ->> 'order_item_id')::uuid
      union all
      select c.variant_id, (e ->> 'quantity')::integer
      from jsonb_array_elements(p_items) e
      join public.order_item_components c on c.order_item_id = (e ->> 'order_item_id')::uuid
    ) d
    where d.variant_id is not null
    group by d.variant_id
    order by d.variant_id
  loop
    update public.product_variants set stock = stock + v_need.quantity where id = v_need.variant_id and track_stock;
  end loop;
  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_order_id', '', true);

  v_new_refunded := o.refunded_cents + p_amount_cents;
  update public.orders
    set refunded_cents = v_new_refunded,
        status = case
          when v_new_refunded < o.total_cents then o.status
          when o.shipped_at is null and o.status in ('paid', 'preparing') then 'cancelled'::public.order_status
          else 'refunded'::public.order_status
        end,
        cancelled_at = case when v_new_refunded >= o.total_cents and o.shipped_at is null and o.status in ('paid', 'preparing') then now() else cancelled_at end,
        updated_at = now()
    where id = p_order_id;

  -- Avoir : seulement si les informations du vendeur sont remplies (sinon, remboursement sans document).
  begin
    v_seller := public.seller_snapshot();
  exception when others then
    v_seller := null;
  end;
  if v_seller is not null then
    select id into v_invoice_id from public.invoices where order_id = p_order_id and kind = 'invoice';
    if v_invoice_id is null then
      v_invoice_id := public.issue_invoice_for(p_order_id);
    end if;
    insert into public.invoices (order_id, kind, number, credit_of, issued_at, seller, buyer, lines, totals)
    select p_order_id, 'credit_note', public.next_document_number(), v_invoice_id, now(), v_seller, i.buyer,
      jsonb_build_array(jsonb_build_object(
        'label', 'Remboursement — commande n° ' || o.order_number || coalesce(' (' || nullif(trim(p_reason), '') || ')', ''),
        'details', '[]'::jsonb,
        'quantity', 1,
        'unit_price_cents', p_amount_cents,
        'total_cents', p_amount_cents
      )),
      jsonb_build_object(
        'order_number', o.order_number,
        'order_date', o.paid_at,
        'subtotal_cents', p_amount_cents,
        'discount_cents', 0,
        'shipping_cents', 0,
        'total_cents', p_amount_cents,
        'payment', case when p_stripe_refund_id is null then o.payment_method else 'carte' end
      )
    from public.invoices i where i.id = v_invoice_id
    returning id into v_credit_id;
    update public.refunds set credit_note_id = v_credit_id where id = v_refund_id;
  end if;

  return v_refund_id;
end;
$$;

revoke execute on function public.next_document_number() from public, anon, authenticated;
revoke execute on function public.seller_snapshot() from public, anon, authenticated;
revoke execute on function public.issue_invoice_for(uuid) from public, anon, authenticated;
revoke execute on function public.issue_invoice(uuid) from public, anon;
revoke execute on function public.record_refund(uuid, integer, jsonb, text, text) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.record_refund(uuid, integer, jsonb, text, text) to authenticated;

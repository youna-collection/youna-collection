-- Automatismes de la base de données.

-- Tient à jour la colonne updated_at.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'addresses', 'categories', 'products', 'product_variants',
    'shipping_methods', 'promo_codes', 'carts', 'cart_items', 'checkouts',
    'orders', 'support_tickets'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- Vrai si la personne connectée est administratrice.
-- SECURITY DEFINER : évite que les règles de "profiles" se rappellent elles-mêmes sans fin.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Crée le profil à l'inscription et rattache les commandes passées en invitée.
-- Le rattachement n'a lieu qu'une fois l'email CONFIRMÉ : sinon, n'importe qui pourrait
-- s'inscrire avec l'adresse d'une autre personne et voir ses commandes.
create function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, email, first_name, last_name)
    values (
      new.id,
      lower(coalesce(new.email, '')),
      nullif(coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'given_name'), ''),
      nullif(coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data ->> 'family_name'), '')
    )
    on conflict (id) do nothing;
  elsif new.email is distinct from old.email then
    update public.profiles set email = lower(coalesce(new.email, '')) where id = new.id;
  end if;

  if new.email is not null and new.email_confirmed_at is not null then
    update public.orders
      set user_id = new.id
      where user_id is null and email = lower(new.email);
    update public.support_tickets
      set user_id = new.id
      where user_id is null and email = lower(new.email);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_change
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.handle_auth_user_change();

-- Inscrit automatiquement chaque variation de stock dans l'historique.
create function public.log_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stock_delta integer;
  movement_reason text;
begin
  if tg_op = 'INSERT' then
    stock_delta := new.stock;
  else
    stock_delta := new.stock - old.stock;
  end if;

  if stock_delta = 0 then
    return new;
  end if;

  movement_reason := coalesce(
    nullif(current_setting('app.stock_reason', true), ''),
    case when tg_op = 'INSERT' then 'initial' else 'manual' end
  );

  insert into public.stock_movements (variant_id, delta, stock_after, reason, order_id, note, created_by)
  values (
    new.id,
    stock_delta,
    new.stock,
    movement_reason::public.stock_reason,
    nullif(current_setting('app.stock_order_id', true), '')::uuid,
    nullif(current_setting('app.stock_note', true), ''),
    (select auth.uid())
  );

  return new;
end;
$$;

create trigger log_stock_movement
  after insert or update of stock on public.product_variants
  for each row execute function public.log_stock_movement();

-- Garde la trace de chaque changement de statut d'une commande.
create function public.log_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status)
    values (new.id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger log_order_status
  after insert or update of status on public.orders
  for each row execute function public.log_order_status();

-- Une facture émise ne peut plus être ni modifiée ni supprimée.
-- Seul le chemin du PDF peut être renseigné après coup.
create function public.protect_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Une facture émise ne peut pas être supprimée';
  end if;

  if old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path then
    raise exception 'Le PDF d''une facture émise ne peut pas être remplacé';
  end if;

  if (to_jsonb(new) - 'pdf_path') is distinct from (to_jsonb(old) - 'pdf_path') then
    raise exception 'Une facture émise ne peut pas être modifiée';
  end if;

  return new;
end;
$$;

create trigger protect_invoice
  before update or delete on public.invoices
  for each row execute function public.protect_invoice();

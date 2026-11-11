-- Sécurité : qui a le droit de lire et d'écrire quoi.
-- Deux niveaux : les droits par table (GRANT) et les règles ligne par ligne (RLS).
-- Par défaut, tout est fermé ; chaque ouverture ci-dessous est volontaire.

-- ---------------------------------------------------------------------------
-- Tout fermer, puis activer la RLS sur toutes les tables
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on function public.is_admin() to anon, authenticated;

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profils : on lit le sien ; on ne peut jamais modifier son propre rôle
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone) on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Carnet d'adresses et favoris : strictement personnels
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.addresses to authenticated;

create policy addresses_select on public.addresses for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy addresses_insert_own on public.addresses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy addresses_update_own on public.addresses for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy addresses_delete_own on public.addresses for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.favorites to authenticated;

create policy favorites_select_own on public.favorites for select to authenticated
  using (user_id = (select auth.uid()));
create policy favorites_insert_own on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy favorites_delete_own on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Catalogue : public en lecture, seule l'admin écrit
-- ---------------------------------------------------------------------------
grant select on public.categories, public.products, public.product_variants, public.product_images
  to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.product_images
  to authenticated;
grant delete on public.product_variants to authenticated;
-- "reserved" n'est jamais modifiable à la main : seul le processus de paiement y touche.
grant insert (product_id, sku, color_name, color_hex, size, price_cents, compare_at_price_cents,
              weight_grams, stock, track_stock, low_stock_threshold, bouquet_veil_count, is_active, position)
  on public.product_variants to authenticated;
grant update (sku, color_name, color_hex, size, price_cents, compare_at_price_cents,
              weight_grams, stock, track_stock, low_stock_threshold, bouquet_veil_count, is_active, position)
  on public.product_variants to authenticated;

create policy categories_select on public.categories for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy categories_insert_admin on public.categories for insert to authenticated
  with check ((select public.is_admin()));
create policy categories_update_admin on public.categories for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy categories_delete_admin on public.categories for delete to authenticated
  using ((select public.is_admin()));

create policy products_select on public.products for select to anon, authenticated
  using (status = 'active' or (select public.is_admin()));
create policy products_insert_admin on public.products for insert to authenticated
  with check ((select public.is_admin()));
create policy products_update_admin on public.products for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy products_delete_admin on public.products for delete to authenticated
  using ((select public.is_admin()));

create policy product_variants_select on public.product_variants for select to anon, authenticated
  using (
    (select public.is_admin())
    or (is_active and exists (
      select 1 from public.products p where p.id = product_id and p.status = 'active'
    ))
  );
create policy product_variants_insert_admin on public.product_variants for insert to authenticated
  with check ((select public.is_admin()));
create policy product_variants_update_admin on public.product_variants for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy product_variants_delete_admin on public.product_variants for delete to authenticated
  using ((select public.is_admin()));

create policy product_images_select on public.product_images for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
  );
create policy product_images_insert_admin on public.product_images for insert to authenticated
  with check ((select public.is_admin()));
create policy product_images_update_admin on public.product_images for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy product_images_delete_admin on public.product_images for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Livraison : tarifs publics, modifiables par l'admin. Codes promo : admin seule.
-- ---------------------------------------------------------------------------
grant select on public.shipping_methods, public.shipping_rates to anon, authenticated;
grant insert, update, delete on public.shipping_methods, public.shipping_rates to authenticated;
grant select, insert, update, delete on public.promo_codes to authenticated;

create policy shipping_methods_select on public.shipping_methods for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy shipping_methods_insert_admin on public.shipping_methods for insert to authenticated
  with check ((select public.is_admin()));
create policy shipping_methods_update_admin on public.shipping_methods for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy shipping_methods_delete_admin on public.shipping_methods for delete to authenticated
  using ((select public.is_admin()));

create policy shipping_rates_select on public.shipping_rates for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.shipping_methods m where m.id = method_id and m.is_active)
  );
create policy shipping_rates_insert_admin on public.shipping_rates for insert to authenticated
  with check ((select public.is_admin()));
create policy shipping_rates_update_admin on public.shipping_rates for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy shipping_rates_delete_admin on public.shipping_rates for delete to authenticated
  using ((select public.is_admin()));

create policy promo_codes_select_admin on public.promo_codes for select to authenticated
  using ((select public.is_admin()));
create policy promo_codes_insert_admin on public.promo_codes for insert to authenticated
  with check ((select public.is_admin()));
create policy promo_codes_update_admin on public.promo_codes for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy promo_codes_delete_admin on public.promo_codes for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Paniers : lecture du sien. Toute écriture passe par le serveur, qui vérifie.
-- ---------------------------------------------------------------------------
grant select on public.carts, public.cart_items to authenticated;

create policy carts_select on public.carts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy cart_items_select on public.cart_items for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Commandes : lecture des siennes. Création uniquement par le serveur après paiement.
-- ---------------------------------------------------------------------------
grant select on public.orders, public.order_items, public.order_item_components,
  public.order_status_history to authenticated;
grant update (status, tracking_number, tracking_url, shipped_at, delivered_at, cancelled_at)
  on public.orders to authenticated;

create policy orders_select on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy orders_update_admin on public.orders for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy order_items_select on public.order_items for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );
create policy order_item_components_select on public.order_item_components for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.order_items i
      join public.orders o on o.id = i.order_id
      where i.id = order_item_id and o.user_id = (select auth.uid())
    )
  );
create policy order_status_history_select on public.order_status_history for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

grant select, insert on public.order_notes to authenticated;

create policy order_notes_select_admin on public.order_notes for select to authenticated
  using ((select public.is_admin()));
create policy order_notes_insert_admin on public.order_notes for insert to authenticated
  with check ((select public.is_admin()) and author_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Stock et factures
-- ---------------------------------------------------------------------------
grant select on public.stock_movements, public.invoices to authenticated;

create policy stock_movements_select_admin on public.stock_movements for select to authenticated
  using ((select public.is_admin()));
create policy invoices_select on public.invoices for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- SAV : uniquement sur ses propres commandes
-- ---------------------------------------------------------------------------
grant select on public.support_tickets, public.support_messages to authenticated;
grant insert (order_id, user_id, email, type, subject) on public.support_tickets to authenticated;
grant update (status) on public.support_tickets to authenticated;
grant insert (ticket_id, author_id, author_role, body) on public.support_messages to authenticated;

create policy support_tickets_select on public.support_tickets for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
-- L'email doit être celui de la commande : les réponses du SAV ne peuvent partir ailleurs.
create policy support_tickets_insert_own on public.support_tickets for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = (select auth.uid()) and o.email = support_tickets.email
    )
  );
create policy support_tickets_update_admin on public.support_tickets for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy support_messages_select on public.support_messages for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.user_id = (select auth.uid())
    )
  );
create policy support_messages_insert on public.support_messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (author_role = 'admin' and (select public.is_admin()))
      or (
        author_role = 'customer'
        and exists (
          select 1 from public.support_tickets t
          where t.id = ticket_id and t.user_id = (select auth.uid())
        )
      )
    )
  );

-- Sans droit ni règle pour le public, donc réservées au serveur :
-- checkouts, checkout_reservations, stripe_events, document_counters, email_suppressions.

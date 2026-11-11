-- Phase 5, étape 1 : gestion des produits depuis l'admin.

-- ---------------------------------------------------------------------------
-- Publication programmée : un produit actif avec une date future reste caché
-- jusqu'à cette date, puis apparaît tout seul.
-- ---------------------------------------------------------------------------
alter table public.products add column publish_at timestamptz;

create function public.product_is_public(p_status public.product_status, p_publish_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'active' and (p_publish_at is null or p_publish_at <= now());
$$;

drop policy products_select on public.products;
create policy products_select on public.products for select to anon, authenticated
  using (public.product_is_public(status, publish_at) or (select public.is_admin()));

drop policy product_variants_select on public.product_variants;
create policy product_variants_select on public.product_variants for select to anon, authenticated
  using (
    (select public.is_admin())
    or (is_active and exists (
      select 1 from public.products p where p.id = product_id and public.product_is_public(p.status, p.publish_at)
    ))
  );

drop policy product_images_select on public.product_images;
create policy product_images_select on public.product_images for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.products p where p.id = product_id and public.product_is_public(p.status, p.publish_at))
  );

-- ---------------------------------------------------------------------------
-- Duplication d'un produit : fiche, variantes et photos, en une seule opération.
-- La copie est un brouillon, sans stock ni référence (SKU), à compléter avant publication.
-- Exécutée avec les droits de l'admin connectée : les règles RLS s'appliquent.
-- ---------------------------------------------------------------------------
create function public.duplicate_product(p_product_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.products;
  v_new_id uuid;
  v_slug text;
  v_suffix integer := 1;
  v_variant record;
  v_new_variant uuid;
  v_old_ids uuid[] := '{}';
  v_new_ids uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'reserve_admin' using errcode = '42501';
  end if;

  select * into v_source from public.products where id = p_product_id;
  if not found then
    raise exception 'produit_introuvable' using errcode = 'P0002';
  end if;

  v_slug := v_source.slug || '-copie';
  while exists (select 1 from public.products where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_source.slug || '-copie-' || v_suffix;
  end loop;

  insert into public.products (slug, name, description, category_id, kind, status, bouquet_eligible, position, seo_title, seo_description)
  values (v_slug, v_source.name || ' (copie)', v_source.description, v_source.category_id, v_source.kind, 'draft',
          v_source.bouquet_eligible, v_source.position + 1, v_source.seo_title, v_source.seo_description)
  returning id into v_new_id;

  for v_variant in select * from public.product_variants where product_id = p_product_id order by position loop
    insert into public.product_variants (product_id, color_name, color_hex, size, price_cents, compare_at_price_cents,
                                         weight_grams, stock, track_stock, low_stock_threshold, bouquet_veil_count, is_active, position)
    values (v_new_id, v_variant.color_name, v_variant.color_hex, v_variant.size, v_variant.price_cents,
            v_variant.compare_at_price_cents, v_variant.weight_grams, 0, v_variant.track_stock,
            v_variant.low_stock_threshold, v_variant.bouquet_veil_count, v_variant.is_active, v_variant.position)
    returning id into v_new_variant;
    v_old_ids := v_old_ids || v_variant.id;
    v_new_ids := v_new_ids || v_new_variant;
  end loop;

  -- Les photos sont partagées (même fichier) : supprimer une photo de la copie ne touche pas l'original.
  insert into public.product_images (product_id, variant_id, storage_path, alt, position)
  select v_new_id, m.new_id, i.storage_path, i.alt, i.position
  from public.product_images i
  left join unnest(v_old_ids, v_new_ids) as m (old_id, new_id) on m.old_id = i.variant_id
  where i.product_id = p_product_id;

  return v_new_id;
end;
$$;

revoke execute on function public.duplicate_product(uuid) from public, anon;
grant execute on function public.duplicate_product(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Ajustement du stock par l'admin : on ajoute ou retire une quantité (jamais on
-- n'écrase la valeur), pour ne pas effacer une vente passée entre-temps.
-- Chaque ajustement est inscrit dans l'historique avec son motif.
-- ---------------------------------------------------------------------------
create function public.adjust_stock(p_variant_id uuid, p_delta integer, p_reason text default 'manual', p_note text default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stock integer;
begin
  if not public.is_admin() then
    raise exception 'reserve_admin' using errcode = '42501';
  end if;
  if p_reason not in ('manual', 'in_person_sale', 'return', 'cancellation') then
    raise exception 'motif_invalide' using errcode = '22023';
  end if;

  perform set_config('app.stock_reason', p_reason, true);
  perform set_config('app.stock_note', coalesce(p_note, ''), true);

  update public.product_variants set stock = stock + p_delta where id = p_variant_id returning stock into v_stock;
  if not found then
    raise exception 'variante_introuvable' using errcode = 'P0002';
  end if;

  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_note', '', true);
  return v_stock;
exception
  when check_violation then
    raise exception 'stock_negatif' using errcode = 'P0001';
end;
$$;

revoke execute on function public.adjust_stock(uuid, integer, text, text) from public, anon;
grant execute on function public.adjust_stock(uuid, integer, text, text) to authenticated;

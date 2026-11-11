-- Catalogue plus libre :
--   1. un produit peut être rangé dans plusieurs catégories ;
--   2. une liste de couleurs commune, à choisir sur chaque produit.

-- ---------------------------------------------------------------------------
-- 1. Plusieurs catégories par produit.
-- products.category_id reste la catégorie principale (fil d'Ariane, vignette de l'accueil) ;
-- product_categories contient TOUTES les catégories du produit, principale comprise.
-- ---------------------------------------------------------------------------
create table public.product_categories (
  product_id uuid not null references public.products (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (product_id, category_id)
);
create index product_categories_category_id_idx on public.product_categories (category_id);

alter table public.product_categories enable row level security;
grant select on public.product_categories to anon, authenticated;
grant insert, delete on public.product_categories to authenticated;
grant all on public.product_categories to service_role;

create policy product_categories_select on public.product_categories for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
  );
create policy product_categories_insert_admin on public.product_categories for insert to authenticated
  with check ((select public.is_admin()));
create policy product_categories_delete_admin on public.product_categories for delete to authenticated
  using ((select public.is_admin()));

insert into public.product_categories (product_id, category_id)
select id, category_id from public.products where category_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Liste de couleurs commune (réservée à l'admin : la boutique lit les couleurs des variantes).
-- Choisir une couleur sur un produit recopie son nom et sa pastille dans la variante.
-- ---------------------------------------------------------------------------
create table public.colors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  hex text check (hex is null or hex ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index colors_name_idx on public.colors (lower(name));

alter table public.colors enable row level security;
grant select, insert, update, delete on public.colors to authenticated;
grant all on public.colors to service_role;

create policy colors_select_admin on public.colors for select to authenticated
  using ((select public.is_admin()));
create policy colors_insert_admin on public.colors for insert to authenticated
  with check ((select public.is_admin()));
create policy colors_update_admin on public.colors for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy colors_delete_admin on public.colors for delete to authenticated
  using ((select public.is_admin()));

-- Départ : les couleurs déjà utilisées (la pastille la plus fréquente pour chaque nom).
insert into public.colors (name, hex, position)
select name, hex, (row_number() over (order by lower(name)))::integer
from (
  select distinct on (lower(trim(color_name))) trim(color_name) as name, color_hex as hex
  from (
    select color_name, color_hex, count(*) over (partition by lower(trim(color_name)), color_hex) as uses
    from public.product_variants
    where color_name is not null and trim(color_name) <> ''
  ) v
  order by lower(trim(color_name)), (color_hex is null), uses desc, color_hex
) c
on conflict do nothing;

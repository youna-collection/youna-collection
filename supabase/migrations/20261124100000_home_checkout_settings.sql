-- Paramètres : photo de la page d'accueil et connexion obligatoire pour commander.
-- La photo est rangée dans le stockage public « product-images », dossier home/.

alter table public.shop_settings
  add column home_hero_path text check (home_hero_path is null or home_hero_path ~ '^home/[a-f0-9]{16}\.(webp|jpg)$'),
  add column checkout_login_required boolean not null default false;

grant update (home_hero_path, checkout_login_required) on public.shop_settings to authenticated;

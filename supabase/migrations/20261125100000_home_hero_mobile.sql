-- Accueil : une photo pour téléphone en plus de celle pour ordinateur (home_hero_path),
-- et une case pour les afficher ou non (on peut préparer les photos avant de les montrer).

alter table public.shop_settings
  add column home_hero_mobile_path text check (home_hero_mobile_path is null or home_hero_mobile_path ~ '^home/[a-f0-9]{16}\.(webp|jpg)$'),
  add column home_hero_visible boolean not null default true;

grant update (home_hero_mobile_path, home_hero_visible) on public.shop_settings to authenticated;

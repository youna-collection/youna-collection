-- Phase 7 : réseaux sociaux (icônes en bas de page) et médiateur de la consommation (CGV).
-- Remplis par l'admin dans Paramètres ; lus par le site côté serveur.

alter table public.shop_settings
  add column instagram_url text check (instagram_url is null or (char_length(instagram_url) <= 300 and instagram_url ~ '^https://')),
  add column tiktok_url text check (tiktok_url is null or (char_length(tiktok_url) <= 300 and tiktok_url ~ '^https://')),
  add column snapchat_url text check (snapchat_url is null or (char_length(snapchat_url) <= 300 and snapchat_url ~ '^https://')),
  add column mediator_name text check (char_length(mediator_name) <= 200),
  add column mediator_url text check (mediator_url is null or (char_length(mediator_url) <= 300 and mediator_url ~ '^https://'));

grant update (instagram_url, tiktok_url, snapchat_url, mediator_name, mediator_url) on public.shop_settings to authenticated;

-- Le serveur (clé secrète) doit pouvoir lire et corriger les nouvelles tables, comme les autres.
grant all on public.shop_settings, public.refunds to service_role;

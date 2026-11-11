-- Phase 6, étape 3 : relance des paniers abandonnés.
-- Les colonnes du panier (reminder_consent, reminder_count, last_reminder_at, last_activity_at)
-- et la table des désinscriptions (email_suppressions) existent depuis la phase 1.
-- Ici : deux réglages modifiables par l'admin (relance activée, deuxième relance à 3 jours).

alter table public.shop_settings
  add column cart_reminders_enabled boolean not null default true,
  add column cart_reminder_second boolean not null default true;

grant update (cart_reminders_enabled, cart_reminder_second) on public.shop_settings to authenticated;

grant all on public.email_suppressions to service_role;

-- Page d'attente : heure de réouverture annoncée, affichée en compte à rebours.
alter table public.shop_settings
  add column maintenance_reopen_at timestamptz;

grant update (maintenance_reopen_at) on public.shop_settings to authenticated;

create or replace function public.shop_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'maintenance', coalesce(s.maintenance_enabled, false),
    'title', s.maintenance_title,
    'message', s.maintenance_message,
    'reopen_at', s.maintenance_reopen_at
  )
  from public.shop_settings s where s.id = 1;
$$;

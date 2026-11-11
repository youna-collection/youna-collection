-- Phase 4 : espace client.
-- Une commande passée sans être connectée, avec l'adresse e-mail d'un compte existant
-- (et confirmé), apparaît directement dans ce compte. Les comptes créés plus tard
-- récupèrent déjà leurs commandes (fonction handle_auth_user_change, phase 1).

create function public.link_order_to_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null and new.email is not null then
    select u.id into new.user_id
    from auth.users u
    where lower(u.email) = new.email and u.email_confirmed_at is not null
    limit 1;
  end if;
  return new;
end;
$$;

revoke execute on function public.link_order_to_account() from public, anon, authenticated;

create trigger link_order_to_account
  before insert on public.orders
  for each row execute function public.link_order_to_account();


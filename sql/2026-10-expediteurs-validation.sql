-- Prioris v2 : « Pour info » seulement après validation d'Alex.
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
--
-- Décidé avec Alex le 19/10/2026, après qu'une adresse à garder (Croque Montagne) est
-- apparue dans la liste automatique : rien n'est plus classé « Pour info » sans son accord.
--
-- SANS SUPPRESSION DE DONNÉES :
--   - prioris_archived_senders (utilisée par la synchronisation) ne renvoie plus que les
--     expéditeurs qu'Alex a validés « toujours pour info » ;
--   - nouvelle fonction prioris_sender_suggestions, lue par l'application (compte d'Alex
--     connecté) : les expéditeurs archivés au moins 3 fois, jamais transformés en tâche et
--     pas encore décidés, à proposer à Alex ;
--   - marketing@croque-montagne.fr est enregistré « toujours à traiter », à sa demande.

create or replace function public.prioris_archived_senders(p_token text)
returns text[]
language plpgsql security definer set search_path = public, prioris_private
as $$
begin
  if not exists (select 1 from prioris_private.sync_token where token = p_token) then
    raise exception 'Jeton de synchronisation invalide';
  end if;
  return coalesce((select array_agg(sender order by sender) from public.sender_rules where rule = 'info'), '{}');
end $$;

revoke all on function public.prioris_archived_senders(text) from public;
grant execute on function public.prioris_archived_senders(text) to anon, authenticated;

-- Expéditeurs « toujours à traiter » : la synchronisation ne les classe jamais « Pour info »,
-- même quand le message ressemble à une newsletter.
create or replace function public.prioris_action_senders(p_token text)
returns text[]
language plpgsql security definer set search_path = public, prioris_private
as $$
begin
  if not exists (select 1 from prioris_private.sync_token where token = p_token) then
    raise exception 'Jeton de synchronisation invalide';
  end if;
  return coalesce((select array_agg(sender order by sender) from public.sender_rules where rule = 'action'), '{}');
end $$;

revoke all on function public.prioris_action_senders(text) from public;
grant execute on function public.prioris_action_senders(text) to anon, authenticated;

-- Exécutée avec les droits de l'utilisateur connecté : les règles d'accès des tables
-- (compte d'Alex uniquement) s'appliquent.
create or replace function public.prioris_sender_suggestions()
returns table (sender text, archived bigint, last_received date)
language sql stable security invoker set search_path = public
as $$
  select lower(trim(i.sender)), count(*) filter (where i.status = 'ignored'), max(i.received_on)
  from public.inbox_items i
  where trim(i.sender) <> ''
    and not exists (select 1 from public.sender_rules r where r.sender = lower(trim(i.sender)))
  group by lower(trim(i.sender))
  having count(*) filter (where i.status = 'ignored') >= 3
     and count(*) filter (where i.status = 'task') = 0
  order by 2 desc, 1
$$;

revoke all on function public.prioris_sender_suggestions() from public, anon;
grant execute on function public.prioris_sender_suggestions() to authenticated;

insert into public.sender_rules (sender, rule)
values ('marketing@croque-montagne.fr', 'action')
on conflict (sender) do update set rule = 'action', updated_at = now();

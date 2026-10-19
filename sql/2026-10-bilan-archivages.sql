-- Prioris v2 : bilan de la semaine et apprentissage des archivages.
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
--
-- ENTIÈREMENT ADDITIF : aucune donnée existante n'est modifiée ni supprimée.
--   - ajoute trois colonnes à la table tasks :
--       done_at     : date à laquelle une tâche a été cochée (pour « ce que tu as terminé ») ;
--       reviewed_on : date à laquelle tu as choisi « Garder » ou « Reporter » dans le bilan ;
--       abandoned   : tâche abandonnée depuis le bilan (elle est cochée, pas effacée) ;
--   - crée une fonction de synchronisation, protégée par le même jeton que les messages :
--     elle donne la liste des expéditeurs archivés au moins 3 fois et jamais transformés en
--     tâche, pour que leurs prochains messages arrivent directement en « Pour info ».
--     Elle ne renvoie que des noms d'expéditeurs, aucun contenu de message.

alter table public.tasks add column if not exists done_at timestamptz;
alter table public.tasks add column if not exists reviewed_on date;
alter table public.tasks add column if not exists abandoned boolean not null default false;

create or replace function public.prioris_archived_senders(p_token text)
returns text[]
language plpgsql security definer set search_path = public, prioris_private
as $$
begin
  if not exists (select 1 from prioris_private.sync_token where token = p_token) then
    raise exception 'Jeton de synchronisation invalide';
  end if;
  return coalesce((
    select array_agg(s order by s) from (
      select lower(trim(sender)) as s
      from public.inbox_items
      where trim(sender) <> ''
      group by lower(trim(sender))
      having count(*) filter (where status = 'ignored') >= 3
         and count(*) filter (where status = 'task') = 0
    ) q), '{}');
end $$;

revoke all on function public.prioris_archived_senders(text) from public;
grant execute on function public.prioris_archived_senders(text) to anon, authenticated;

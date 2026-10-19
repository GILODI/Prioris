-- Prioris v2 : « Pour info » automatique, mais seulement pour les adresses automatiques.
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
--
-- ADDITIF, sans suppression de données :
--   - crée la table sender_rules : les choix d'Alex par expéditeur (« toujours pour info »
--     ou « toujours à traiter »), lisible uniquement par son compte connecté ;
--   - remplace la fonction prioris_archived_senders (créée par 2026-10-bilan-archivages.sql)
--     par une version plus prudente, décidée avec Alex le 19/10/2026 :
--       * automatique seulement pour les adresses de robots ou de newsletters (noreply,
--         news@, marketing@, contact@, outils d'envoi…) archivées au moins 3 fois et jamais
--         transformées en tâche ; jamais pour une adresse @campfrance.fr ni une personne ;
--       * plus les expéditeurs qu'Alex a marqués « toujours pour info » ;
--       * moins ceux qu'il a marqués « toujours à traiter ».
--     La fonction ne renvoie toujours que des noms d'expéditeurs.

create table if not exists public.sender_rules (
  sender text primary key,              -- expéditeur en minuscules, tel qu'importé
  rule text not null check (rule in ('info', 'action', 'none')),
  updated_at timestamptz not null default now()
);

alter table public.sender_rules enable row level security;
drop policy if exists "Compte Prioris uniquement" on public.sender_rules;
create policy "Compte Prioris uniquement" on public.sender_rules
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'communication@campfrance.fr')
  with check ((auth.jwt() ->> 'email') = 'communication@campfrance.fr');

create or replace function public.prioris_archived_senders(p_token text)
returns text[]
language plpgsql security definer set search_path = public, prioris_private
as $$
begin
  if not exists (select 1 from prioris_private.sync_token where token = p_token) then
    raise exception 'Jeton de synchronisation invalide';
  end if;
  return coalesce((
    select array_agg(distinct s order by s) from (
      select lower(trim(sender)) as s
      from public.inbox_items
      where trim(sender) <> ''
      group by lower(trim(sender))
      having count(*) filter (where status = 'ignored') >= 3
         and count(*) filter (where status = 'task') = 0
         and lower(trim(sender)) !~ '@campfrance\.fr'
         and lower(trim(sender)) ~ '(no-?reply|ne-?pas-?repondre|newsletter|news@|info@|contact@|marketing@|postmaster|mailer|bounce|notification|brevo|mailchimp|sendinblue)'
      union
      select sender from public.sender_rules where rule = 'info'
    ) q
    where s not in (select sender from public.sender_rules where rule = 'action')
  ), '{}');
end $$;

revoke all on function public.prioris_archived_senders(text) from public;
grant execute on function public.prioris_archived_senders(text) to anon, authenticated;

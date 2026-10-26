-- Prioris v2 : adresse mail de la personne sur chaque demande, pour retrouver le mail
-- d'origine dans la messagerie (demandé par Alex le 26/10/2026).
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
--
-- ADDITIF, sans suppression de données :
--   - ajoute la colonne requests.contact_email ;
--   - la remplit pour les demandes déjà importées, à partir de l'expéditeur du message
--     d'origine quand il contient une adresse (environ 8 mails sur 10 ; les autres n'ont
--     qu'un nom dans le classeur Excel) ;
--   - met à jour la fonction d'import pour que les prochaines demandes l'aient d'office.

alter table public.requests add column if not exists contact_email text not null default '';

update public.requests r
set contact_email = lower(substring(i.sender from '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+'))
from public.inbox_items i
where r.contact_email = ''
  and (r.inbox_id = i.id or r.source_key = i.source_key)
  and i.sender ~ '@';

create or replace function public.prioris_import_requests(p_token text, p_items jsonb)
returns integer
language plpgsql security definer set search_path = public, prioris_private
as $$
declare inserted integer;
begin
  if not exists (select 1 from prioris_private.sync_token where token = p_token) then
    raise exception 'Jeton de synchronisation invalide';
  end if;
  insert into public.requests (kind, source, source_key, inbox_id, received_on, requester, organization,
    event_name, event_date, reply_by, ask, summary, draft_reply, status, contact_email)
  select x.kind, coalesce(x.source, 'mail'), x.source_key, i.id,
    x.received_on, coalesce(x.requester, ''), coalesce(x.organization, ''), coalesce(x.event_name, ''),
    x.event_date, x.reply_by, coalesce(x.ask, ''), coalesce(x.summary, ''), coalesce(x.draft_reply, ''),
    coalesce(x.status, 'new'),
    coalesce(nullif(lower(x.contact_email), ''),
             lower(substring(i.sender from '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+')), '')
  from jsonb_to_recordset(p_items) as x(kind text, source text, source_key text, received_on date,
    requester text, organization text, event_name text, event_date date, reply_by date, ask text,
    summary text, draft_reply text, status text, contact_email text)
  left join public.inbox_items i on i.source_key = x.source_key
  where x.source_key is not null
  on conflict (source_key) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end $$;

-- Mêmes droits qu'avant (voir 2026-10-avertissements-supabase.sql) : synchronisation seulement.
revoke all on function public.prioris_import_requests(text, jsonb) from public, authenticated;
grant execute on function public.prioris_import_requests(text, jsonb) to anon;

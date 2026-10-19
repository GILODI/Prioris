-- Prioris v2 : demandes de sponsoring, de lots et de visuels.
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
--
-- ENTIÈREMENT ADDITIF : aucune donnée existante n'est modifiée.
--   - crée la table requests (une ligne par demande), lisible uniquement par le compte
--     communication@campfrance.fr connecté, avec le temps réel ;
--   - crée deux fonctions de synchronisation protégées par le même jeton que les messages :
--     lister les demandes déjà importées (identifiants seulement) et en ajouter.
--     Le jeton ne permet ni de lire, ni de modifier, ni de supprimer une demande.

create table if not exists public.requests (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('sponsoring', 'lots', 'visuel')),
  source text not null default 'manuel' check (source in ('mail', 'whatsapp', 'manuel')),
  source_key text unique,                 -- message d'origine ; vide pour une demande saisie à la main
  inbox_id bigint references public.inbox_items(id) on delete set null,
  received_on date default current_date,
  requester text not null default '',     -- la personne
  organization text not null default '',  -- club, magasin, athlète, organisateur
  event_name text not null default '',
  event_date date,
  reply_by date,                          -- délai cité ou saisi ; sinon calculé par l'application
  ask text not null default '',           -- ce qui est demandé
  summary text not null default '',
  draft_reply text not null default '',
  status text not null default 'new' check (status in ('new', 'pending', 'yes', 'no', 'done')),
  promising boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter publication supabase_realtime add table public.requests;
exception when duplicate_object then null;
end $$;

alter table public.requests enable row level security;
drop policy if exists "Compte Prioris uniquement" on public.requests;
create policy "Compte Prioris uniquement" on public.requests
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'communication@campfrance.fr')
  with check ((auth.jwt() ->> 'email') = 'communication@campfrance.fr');

-- Fonctions appelées par la synchronisation (jeton obligatoire)
create or replace function public.prioris_request_keys(p_token text)
returns text[]
language plpgsql security definer set search_path = public, prioris_private
as $$
begin
  if not exists (select 1 from prioris_private.sync_token where token = p_token) then
    raise exception 'Jeton de synchronisation invalide';
  end if;
  return coalesce((select array_agg(source_key) from public.requests where source_key is not null), '{}');
end $$;

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
    event_name, event_date, reply_by, ask, summary, draft_reply, status)
  select x.kind, coalesce(x.source, 'mail'), x.source_key,
    (select i.id from public.inbox_items i where i.source_key = x.source_key),
    x.received_on, coalesce(x.requester, ''), coalesce(x.organization, ''), coalesce(x.event_name, ''),
    x.event_date, x.reply_by, coalesce(x.ask, ''), coalesce(x.summary, ''), coalesce(x.draft_reply, ''),
    coalesce(x.status, 'new')
  from jsonb_to_recordset(p_items) as x(kind text, source text, source_key text, received_on date,
    requester text, organization text, event_name text, event_date date, reply_by date, ask text,
    summary text, draft_reply text, status text)
  where x.source_key is not null
  on conflict (source_key) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end $$;

revoke all on function public.prioris_request_keys(text) from public;
revoke all on function public.prioris_import_requests(text, jsonb) from public;
grant execute on function public.prioris_request_keys(text) to anon, authenticated;
grant execute on function public.prioris_import_requests(text, jsonb) to anon, authenticated;

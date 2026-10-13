-- Prioris v2, étape 2a : messages (mails et WhatsApp) à trier.
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
--
-- ENTIÈREMENT ADDITIF : aucune donnée existante n'est modifiée, l'application actuelle
-- continue de fonctionner normalement.
--   - crée la table inbox_items (messages importés), lisible uniquement par le compte
--     communication@campfrance.fr connecté ;
--   - ajoute la colonne tasks.source (origine d'une tâche : mail, whatsapp ou vide) ;
--   - crée deux fonctions de synchronisation protégées par un jeton. Le jeton permet
--     uniquement de lister les messages déjà importés et d'en ajouter : il ne donne accès
--     ni aux tâches, ni aux idées, ni au contenu des messages.
--
-- La ligne qui enregistre la valeur du jeton n'est pas dans ce fichier (publié sur GitHub) :
-- elle est donnée à part.

-- Messages importés depuis les classeurs Excel
create table if not exists public.inbox_items (
  id bigint generated always as identity primary key,
  source text not null check (source in ('mail', 'whatsapp')),
  source_key text not null unique,
  received_on date,
  sender text not null default '',
  subject text not null default '',
  summary text not null default '',
  proposed_action text not null default '',
  proposed_priority int,
  proposed_due date,
  draft_reply text not null default '',
  urgent boolean not null default false,
  urgency_reason text not null default '',
  needs_action boolean not null default true,
  status text not null default 'new' check (status in ('new', 'task', 'ignored')),
  task_id bigint references public.tasks(id) on delete set null,
  created_at timestamptz not null default now()
);

do $$ begin
  alter publication supabase_realtime add table public.inbox_items;
exception when duplicate_object then null;
end $$;

alter table public.inbox_items enable row level security;
drop policy if exists "Compte Prioris uniquement" on public.inbox_items;
create policy "Compte Prioris uniquement" on public.inbox_items
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'communication@campfrance.fr')
  with check ((auth.jwt() ->> 'email') = 'communication@campfrance.fr');

-- Origine d'une tâche
alter table public.tasks add column if not exists source text;

-- Jeton de synchronisation, rangé hors de portée de l'API
create schema if not exists prioris_private;
revoke all on schema prioris_private from public, anon, authenticated;
create table if not exists prioris_private.sync_token (token text primary key);

-- Fonctions appelées par la synchronisation (jeton obligatoire)
create or replace function public.prioris_import_keys(p_token text)
returns text[]
language plpgsql security definer set search_path = public, prioris_private
as $$
begin
  if not exists (select 1 from prioris_private.sync_token where token = p_token) then
    raise exception 'Jeton de synchronisation invalide';
  end if;
  return coalesce((select array_agg(source_key) from public.inbox_items), '{}');
end $$;

create or replace function public.prioris_import(p_token text, p_items jsonb)
returns integer
language plpgsql security definer set search_path = public, prioris_private
as $$
declare inserted integer;
begin
  if not exists (select 1 from prioris_private.sync_token where token = p_token) then
    raise exception 'Jeton de synchronisation invalide';
  end if;
  insert into public.inbox_items (source, source_key, received_on, sender, subject, summary,
    proposed_action, proposed_priority, proposed_due, draft_reply, urgent, urgency_reason, needs_action)
  select x.source, x.source_key, x.received_on, coalesce(x.sender, ''), coalesce(x.subject, ''),
    coalesce(x.summary, ''), coalesce(x.proposed_action, ''), x.proposed_priority, x.proposed_due,
    coalesce(x.draft_reply, ''), coalesce(x.urgent, false), coalesce(x.urgency_reason, ''),
    coalesce(x.needs_action, true)
  from jsonb_to_recordset(p_items) as x(source text, source_key text, received_on date, sender text,
    subject text, summary text, proposed_action text, proposed_priority int, proposed_due date,
    draft_reply text, urgent boolean, urgency_reason text, needs_action boolean)
  on conflict (source_key) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end $$;

revoke all on function public.prioris_import_keys(text) from public;
revoke all on function public.prioris_import(text, jsonb) from public;
grant execute on function public.prioris_import_keys(text) to anon, authenticated;
grant execute on function public.prioris_import(text, jsonb) to anon, authenticated;

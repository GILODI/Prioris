-- Prioris v2, étape 2 : messages (mails et WhatsApp) à trier, et verrouillage des données.
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
-- À lancer APRÈS la mise en ligne de la v2 (connexion) : l'ancienne version sans connexion
-- ne pourra plus rien lire ensuite.

-- 1. Messages importés depuis les classeurs Excel
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
alter publication supabase_realtime add table public.inbox_items;

-- 2. Origine d'une tâche (mail, whatsapp, ou vide pour une saisie manuelle)
alter table public.tasks add column if not exists source text;

-- 3. Fin de l'accès anonyme : seul le compte Prioris lit et modifie les données.
--    (La synchronisation, lancée depuis ton ordinateur, utilise la clé secrète, qui passe outre.)
drop policy if exists "Accès complet anon" on public.tasks;
drop policy if exists "Accès complet anon" on public.ideas;
drop policy if exists "Compte Prioris uniquement" on public.tasks;
drop policy if exists "Compte Prioris uniquement" on public.ideas;

alter table public.inbox_items enable row level security;

create policy "Compte Prioris uniquement" on public.tasks
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'communication@campfrance.fr')
  with check ((auth.jwt() ->> 'email') = 'communication@campfrance.fr');

create policy "Compte Prioris uniquement" on public.ideas
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'communication@campfrance.fr')
  with check ((auth.jwt() ->> 'email') = 'communication@campfrance.fr');

create policy "Compte Prioris uniquement" on public.inbox_items
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'communication@campfrance.fr')
  with check ((auth.jwt() ->> 'email') = 'communication@campfrance.fr');

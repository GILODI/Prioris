-- Prioris v2, étape 1 : échéances, « en attente », focus du jour et boîte à idées.
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
-- Sans effet sur la version actuelle de l'application, qui ignore ces nouvelles colonnes.

alter table public.tasks add column if not exists due_date date;
alter table public.tasks add column if not exists waiting boolean not null default false;
alter table public.tasks add column if not exists waiting_since timestamptz;
alter table public.tasks add column if not exists focus_date date;

create table if not exists public.ideas (
  id bigint generated always as identity primary key,
  text text not null default '',
  created_at timestamptz not null default now()
);

alter publication supabase_realtime add table public.ideas;

-- Même règle d'accès que la table tasks pour l'instant ; la connexion sécurisée
-- (fin de l'accès anonyme) fait l'objet d'une étape séparée.
alter table public.ideas enable row level security;
create policy "Accès complet anon" on public.ideas for all using (true) with check (true);

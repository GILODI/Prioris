-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query

create table public.tasks (
  id bigint generated always as identity primary key,
  contact text default '',
  text text default '',
  priority int,
  done boolean not null default false,
  star boolean not null default false,
  created_at timestamptz not null default now()
);

-- Active le temps réel pour que les changements se propagent entre appareils
alter publication supabase_realtime add table public.tasks;

-- App personnelle sans authentification : la clé publishable (anon) a un accès complet.
-- Quiconque possède l'URL + la clé peut lire/écrire. Suffisant pour un usage perso,
-- mais à revoir (auth + policies restrictives) si la liste doit être partagée plus largement.
alter table public.tasks enable row level security;
create policy "Accès complet anon" on public.tasks for all using (true) with check (true);

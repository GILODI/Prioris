-- Prioris v2 : fin de l'accès anonyme. Seul le compte communication@campfrance.fr
-- peut lire et modifier les tâches et les idées.
-- À exécuter AU MOMENT de la mise en ligne de la v2 : l'ancienne version de l'application
-- (sans connexion) ne pourra plus rien lire après ce script.

drop policy if exists "Accès complet anon" on public.tasks;
drop policy if exists "Accès complet anon" on public.ideas;

create policy "Compte Prioris uniquement" on public.tasks
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'communication@campfrance.fr')
  with check ((auth.jwt() ->> 'email') = 'communication@campfrance.fr');

create policy "Compte Prioris uniquement" on public.ideas
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'communication@campfrance.fr')
  with check ((auth.jwt() ->> 'email') = 'communication@campfrance.fr');

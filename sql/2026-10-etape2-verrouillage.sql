-- Prioris v2, étape 2b : fin de l'accès anonyme aux tâches et aux idées.
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query,
-- UNIQUEMENT au moment de la mise en ligne de la v2 (après la fusion sur la branche principale).
--
-- MODIFIE LES ACCÈS, SANS SUPPRIMER DE DONNÉES : remplace l'accès anonyme complet
-- (« Accès complet anon ») par un accès réservé au compte communication@campfrance.fr
-- connecté. L'ancienne version de l'application, qui n'a pas de connexion, ne pourra plus
-- rien lire ensuite.

drop policy if exists "Accès complet anon" on public.tasks;
drop policy if exists "Accès complet anon" on public.ideas;
drop policy if exists "Compte Prioris uniquement" on public.tasks;
drop policy if exists "Compte Prioris uniquement" on public.ideas;

create policy "Compte Prioris uniquement" on public.tasks
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'communication@campfrance.fr')
  with check ((auth.jwt() ->> 'email') = 'communication@campfrance.fr');

create policy "Compte Prioris uniquement" on public.ideas
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'communication@campfrance.fr')
  with check ((auth.jwt() ->> 'email') = 'communication@campfrance.fr');

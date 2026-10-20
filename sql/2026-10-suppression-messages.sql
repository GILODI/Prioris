-- Prioris v2 : supprimer des messages sans intérêt (différent d'archiver).
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
--
-- ADDITIF, sans suppression de données : ne fait qu'autoriser une quatrième valeur de statut,
-- « deleted », pour la colonne inbox_items.status (jusqu'ici : new, task, ignored).
--   - Aucune ligne n'est modifiée ni effacée par ce script.
--   - Quand Alex supprime un message dans l'application, la ligne reste en base avec la clé,
--     la date et l'expéditeur, et son résumé, son objet, l'action proposée et le brouillon sont
--     vidés. Sans cette ligne, la prochaine synchronisation retrouverait le mail dans Excel et
--     le réimporterait. Les fonctions de synchronisation la voient toujours (rien à changer).
--   - Les messages « deleted » n'apparaissent ni à trier, ni dans l'historique, ni dans le bilan,
--     et ne comptent pas dans les suggestions d'expéditeurs « toujours pour info » (qui ne
--     comptent que les messages archivés).
--
-- Tant que ce script n'est pas exécuté, le bouton « Supprimer » échoue côté base (message d'erreur
-- dans l'application) ; l'archivage et le reste fonctionnent normalement.

alter table public.inbox_items drop constraint if exists inbox_items_status_check;
alter table public.inbox_items
  add constraint inbox_items_status_check check (status in ('new', 'task', 'ignored', 'deleted'));

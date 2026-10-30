-- Prioris v2 : appels téléphoniques dans « À trier » (demandé par Alex le 30/10/2026).
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
--
-- ADDITIF, sans suppression de données :
--   - ajoute la colonne inbox_items.phone (numéro de la personne qui a appelé) ;
--   - autorise une nouvelle origine « phone » pour les messages (en plus de mail et whatsapp)
--     et pour les demandes (en plus de mail, whatsapp et manuel). Les règles d'origine sont
--     remplacées par des règles plus larges : aucune ligne existante n'est touchée.
-- Les appels sont saisis par Alex dans l'application (bouton +, onglet « Appel ») : la
-- synchronisation ne les voit pas et ne les supprime jamais (ils ne sont pas dans Excel).

alter table public.inbox_items add column if not exists phone text not null default '';

alter table public.inbox_items drop constraint if exists inbox_items_source_check;
alter table public.inbox_items add constraint inbox_items_source_check
  check (source in ('mail', 'whatsapp', 'phone'));

alter table public.requests drop constraint if exists requests_source_check;
alter table public.requests add constraint requests_source_check
  check (source in ('mail', 'whatsapp', 'manuel', 'phone'));

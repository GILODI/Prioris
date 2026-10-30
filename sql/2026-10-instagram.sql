-- Prioris v2 : messages Instagram (camp_france) dans « À trier » (demandé par Alex le 30/10/2026).
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
--
-- ADDITIF, sans suppression de données :
--   - autorise une nouvelle origine « instagram » pour les messages (en plus de mail, whatsapp
--     et phone) et pour les demandes (en plus de mail, whatsapp, manuel et phone). Les règles
--     d'origine sont remplacées par des règles plus larges : aucune ligne existante n'est touchée.
-- Les messages Instagram sont lus directement dans la messagerie de camp_france par la
-- synchronisation (sync/SYNC.md, étape Instagram), sans classeur Excel.

alter table public.inbox_items drop constraint if exists inbox_items_source_check;
alter table public.inbox_items add constraint inbox_items_source_check
  check (source in ('mail', 'whatsapp', 'phone', 'instagram'));

alter table public.requests drop constraint if exists requests_source_check;
alter table public.requests add constraint requests_source_check
  check (source in ('mail', 'whatsapp', 'manuel', 'phone', 'instagram'));

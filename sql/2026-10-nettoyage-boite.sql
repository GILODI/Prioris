-- Prioris v2 : supprimer en une fois une liste de messages validée par Alex (nettoyage avec la
-- boîte Outlook, voir sync/NETTOYAGE.md).
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
-- À exécuter APRÈS 2026-10-suppression-messages.sql (qui autorise le statut « deleted »).
--
-- ADDITIF : crée une seule fonction, prioris_delete_keys. Aucune donnée n'est touchée tant que
-- la fonction n'est pas appelée avec une liste de clés.
--   - Protégée par le jeton de synchronisation, comme les autres fonctions prioris_* ; elle ne
--     donne accès à rien d'autre.
--   - Fait exactement ce que fait le bouton « Supprimer » de l'application : statut « deleted »,
--     résumé, objet, action proposée et brouillon vidés ; la ligne reste avec la clé, la date
--     et l'expéditeur pour que la synchronisation ne réimporte pas le mail.
--   - Ne touche que les messages « à trier » (new) ou archivés (ignored) : jamais un message
--     devenu une tâche. Refuse plus de 300 clés d'un coup.
--   - Renvoie le nombre de messages réellement supprimés.

create or replace function public.prioris_delete_keys(p_token text, p_keys text[])
returns integer
language plpgsql security definer set search_path = public, prioris_private
as $$
declare n integer;
begin
  if not exists (select 1 from prioris_private.sync_token where token = p_token) then
    raise exception 'Jeton de synchronisation invalide';
  end if;
  if coalesce(array_length(p_keys, 1), 0) > 300 then
    raise exception 'Trop de clés d''un coup (300 au maximum)';
  end if;
  update public.inbox_items
  set status = 'deleted', summary = '', subject = '', proposed_action = '', proposed_priority = null,
      proposed_due = null, draft_reply = '', urgent = false, urgency_reason = '', needs_action = false
  where source_key = any (p_keys) and status in ('new', 'ignored');
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.prioris_delete_keys(text, text[]) from public, authenticated;
grant execute on function public.prioris_delete_keys(text, text[]) to anon;

-- Prioris v2 : clés de messages stables (mails résumés dans Excel qui réapparaissaient).
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
--
-- ENTIÈREMENT ADDITIF : une seule fonction est créée. Aucune table, colonne ni donnée n'est
-- touchée ; les clés (source_key) des messages déjà importés restent exactement telles quelles,
-- donc rien n'est réimporté et les demandes (sponsoring, lots, visuels) gardent leur lien avec
-- leur message. L'application n'utilise pas cette fonction : seule la synchronisation l'appelle.
--
-- Pourquoi : la clé d'un mail était calculée à partir du contenu de la colonne C du classeur.
-- Quand la compétence « synthese » remplace le mail brut par un résumé, la clé changeait et le
-- mail était pris pour un nouveau. La synchronisation compare désormais le classeur à cette
-- liste (date + expéditeur) pour retrouver la clé d'origine.
--
-- La fonction renvoie uniquement : identifiant, clé, source, date de réception et expéditeur
-- de chaque message. Jamais le résumé, l'objet ni le brouillon de réponse. Protégée par le
-- jeton de synchronisation, comme les autres fonctions prioris_*.

create or replace function public.prioris_import_index(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, prioris_private
as $$
begin
  if not exists (select 1 from prioris_private.sync_token where token = p_token) then
    raise exception 'Jeton de synchronisation invalide';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'source_key', source_key, 'source', source,
      'received_on', received_on, 'sender', sender
    ) order by id)
    from public.inbox_items
  ), '[]'::jsonb);
end $$;

revoke all on function public.prioris_import_index(text) from public, authenticated;
grant execute on function public.prioris_import_index(text) to anon;

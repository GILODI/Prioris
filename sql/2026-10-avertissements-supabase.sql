-- Prioris v2 : réponse aux avertissements « Security Advisor » de Supabase (19/10/2026).
-- À exécuter une fois dans Supabase : Dashboard > SQL Editor > New query.
--
-- RETIRE DES ACCÈS INUTILES, SANS SUPPRIMER DE DONNÉES :
--   - les fonctions de synchronisation n'ont pas besoin d'être appelables par un utilisateur
--     connecté (l'application ne les utilise pas) : seul le rôle anon, utilisé par la
--     synchronisation avec le jeton, les garde ;
--   - rls_auto_enable (fonction de Supabase qui active la protection des nouvelles tables)
--     n'a pas à être appelable depuis l'API ; le déclencheur continue de fonctionner.
--
-- Avertissements qui RESTENT, et c'est voulu : « Public Can Execute SECURITY DEFINER Function »
-- sur les 6 fonctions prioris_* (protégées par le jeton de synchronisation, sans clé
-- service_role), et « Leaked Password Protection Disabled » (option des offres payantes).

revoke execute on function public.prioris_import_keys(text) from authenticated;
revoke execute on function public.prioris_import(text, jsonb) from authenticated;
revoke execute on function public.prioris_request_keys(text) from authenticated;
revoke execute on function public.prioris_import_requests(text, jsonb) from authenticated;
revoke execute on function public.prioris_archived_senders(text) from authenticated;
revoke execute on function public.prioris_action_senders(text) from authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

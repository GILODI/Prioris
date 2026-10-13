-- Prioris v2 : recale le marquage « urgent » des messages déjà importés sur la règle stricte
-- choisie par Alex (urgent = marqué « à traiter en urgence » dans le suivi Excel ; l'urgence
-- liée à l'échéance est désormais calculée par l'application).
--
-- MODIFIE UN MARQUAGE, SANS SUPPRIMER DE DONNÉES : ne touche que les colonnes urgent et
-- urgency_reason des messages encore à trier. À exécuter une seule fois.
-- Les 10 identifiants ci-dessous sont ceux des messages marqués « à traiter en urgence »
-- dans les classeurs au moment de la première synchronisation (13/10/2026).

update public.inbox_items
set urgent = (source_key = any (array[
      'mail-1DFE2420DA017B64CF91', 'mail-97512E6D8C459E709748', 'mail-53FFCA3E95FD771AD330',
      'mail-EFBD67A2417B73DB85A9', 'mail-507D2577BE07D2CB495A', 'mail-CF9090A5899A110E1256',
      'mail-4BE071CB2B3BFBB600D2', 'mail-F1B0D791BC45EE60C9BB', 'mail-5A0CDC5311BE3461A263',
      'wa-0A5C6721D3123F08C27E'])),
    urgency_reason = case when source_key = any (array[
      'mail-1DFE2420DA017B64CF91', 'mail-97512E6D8C459E709748', 'mail-53FFCA3E95FD771AD330',
      'mail-EFBD67A2417B73DB85A9', 'mail-507D2577BE07D2CB495A', 'mail-CF9090A5899A110E1256',
      'mail-4BE071CB2B3BFBB600D2', 'mail-F1B0D791BC45EE60C9BB', 'mail-5A0CDC5311BE3461A263',
      'wa-0A5C6721D3123F08C27E'])
      then 'marqué à traiter en urgence dans ton suivi' else '' end
where status = 'new';

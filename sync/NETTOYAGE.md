# Nettoyer Prioris avec la boîte Outlook

Procédure à la demande (« nettoie Prioris avec ma boîte »). Elle repère les messages de Prioris qui
n'existent plus dans la boîte de réception d'Alex (supprimés ou rangés ailleurs) et, **après son
accord**, les supprime de Prioris. À distinguer de la synchronisation (`SYNC.md`), qui importe.

Dossier du projet : `C:\Users\communication\Documents\Claude\Artifacts\todolist-camp`

## Règles absolues

- **Outlook en lecture seule.** Faire défiler la liste, rien d'autre : ne rien ouvrir, supprimer,
  déplacer, archiver, répondre ni marquer. Ne relever que date, expéditeur affiché et objet. Ne pas
  recopier le contenu des mails.
- **Jamais de suppression sans l'accord explicite d'Alex, groupe par groupe.** La suppression est
  irréversible (le contenu est vidé ; la ligne reste avec la clé, la date et l'expéditeur).
- Ne jamais afficher le fichier `.env`. Ne jamais modifier les classeurs Excel.
- Les fichiers de travail restent dans `sync\out` (ignoré par git) : ils contiennent des noms et
  des objets de mails, ne jamais les commiter.
- Si un script échoue ou si la lecture d'Outlook paraît incomplète, le dire et s'arrêter.

## Prérequis (à faire une fois)

Exécuter dans Supabase (SQL Editor), dans cet ordre :
1. `sql/2026-10-suppression-messages.sql` (autorise le statut « deleted ») ;
2. `sql/2026-10-nettoyage-boite.sql` (fonction `prioris_delete_keys`, protégée par le jeton).

Sans le second, `push.ps1 -Action delete-keys` répond que la fonction est introuvable : s'arrêter.

## Étapes

### 1. Lire la boîte d'Outlook

Alex ouvre Outlook sur le web dans le navigateur intégré (outlook.office.com, boîte de réception,
onglet « Prioritaire »). Vérifier l'onglet avec `tabs_context`, puis exécuter `sync/lire-outlook.js`
avec l'outil `javascript_tool` (il se découpe en plusieurs appels : l'outil coupe à 45 s). Répéter
`await window.__ol.pas(30)` jusqu'à `fini: true` ou jusqu'à dépasser la date voulue (17 jours avant
le plus ancien message en attente suffit). Puis récupérer
`JSON.stringify(window.__ol.export('AAAA-MM-JJ'))` et l'écrire dans `sync\out\outlook.json`.

Contrôles avant de continuer : `sansDate` vaut 0, le total est cohérent (une boîte active compte
plusieurs dizaines de conversations par mois), la liste commence bien à la date du jour. L'onglet
« Autres » est négligeable en général (quelques notifications) : le signaler s'il est volumineux.

### 2. Extraire Prioris et comparer

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\extract.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\compare-boite.ps1" -Outlook "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\out\outlook.json" -Since AAAA-MM-JJ
```

Produit `sync\out\candidats.json` (tous les candidats, avec leur groupe) et
`sync\out\delete-keys-A.json` (clés du groupe A). `-Since` : date du plus ancien message de la boîte lu.

Les messages de Prioris sont comparés à la boîte par **nom affiché, boîte partagée (Contact, Commande),
adresse ou objet**, pas par identifiant : Outlook regroupe en conversations et affiche des noms, alors
que le classeur garde parfois l'adresse. Conséquences à dire à Alex :
- « introuvable » = aucune conversation de cet expéditeur ou sur cet objet dans la boîte lue : c'est
  un **minimum** (un fil encore présent peut cacher un message supprimé) ;
- un faux positif reste possible (nom affiché sans rapport avec l'adresse) ; un mail rangé dans un
  autre dossier est aussi « introuvable ».

### 3. Présenter les candidats à Alex

Montrer la liste regroupée par expéditeur (nombre, période, dernier objet), en trois groupes :
- **A** : robots, newsletters, publicités, reçus : sûrs ;
- **B** : une demande ou une réponse attendue peut s'y cacher (lots, sponsoring, devis, stand…) ;
- **C** : personnes et collègues, à relire un par un.

Ne rien supprimer à ce stade.

### 4. Supprimer ce qu'Alex a validé

Le groupe A, ou les expéditeurs qu'Alex cite pour B et C. Écrire les clés validées dans un tableau JSON
(UTF-8) puis :

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\push.ps1" -Action delete-keys -File "<fichier des clés>"
```

La fonction ne touche que les messages « à trier » ou archivés (jamais ceux devenus tâche) et refuse
plus de 300 clés d'un coup. Si la lecture d'Outlook date de plus d'une heure, la refaire d'abord.

### 5. Rendre compte, en 6 lignes maximum

- nombre de conversations lues dans Outlook, et sur quelle période ;
- nombre de candidats par groupe ;
- ce qui a été supprimé (clés envoyées, messages supprimés) ;
- ce qui reste à relire (groupes B et C non traités) ;
- rappel que ces messages ne sont pas réimportés par la synchronisation.

### 6. Nettoyer aussi le classeur Excel (uniquement si Alex le demande)
\nLe classeur ne sert plus qu'à alimenter Prioris : les lignes des messages supprimés, et celles déjà « Traité », peuvent en sortir. **Exception à la règle « ne jamais modifier les classeurs », décidée avec Alex le 21/10/2026, à n'appliquer que sur sa demande explicite.**

- **Sauvegarde d'abord** : copier le classeur dans le même dossier sous Traitement des mails 2026 - backup AAAA-MM-JJ avant nettoyage.xlsm.
- **Plan** : lancer extract.ps1 sur une copie du classeur (-Folder), puis lister les lignes à supprimer (celles dont la clé vient d'être supprimée de Prioris) et à déplacer (statut « Traité »), en JSON [{ligne, action: supprimer|deplacer, date, sender, key}].
- **Essai sur une copie** : sync\nettoyer-excel.ps1 -Classeur <copie> -Plan <plan> -Appliquer. Le script vérifie chaque ligne (date, expéditeur, statut) avant d'agir et ne touche à rien au moindre écart. Les lignes « Traité » sont copiées à la suite de l'onglet « Traités » (comme la macro du classeur) puis supprimées ; macros, tableau et listes déroulantes sont conservés.
- **Contrôle** : relancer extract.ps1 sur le résultat : les lignes restantes doivent être exactement celles prévues, et aucun message à importer ne doit apparaître.
- **Mise en place** : après une synchronisation (pour ne perdre aucun nouveau mail), fermer Excel puis remplacer le classeur par la copie nettoyée.


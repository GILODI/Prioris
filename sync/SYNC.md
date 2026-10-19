# Synchroniser Prioris

Procédure suivie par la tâche Claude « Synchroniser Prioris », lancée à la main par Alex
depuis l'application Claude. Elle importe dans Prioris (écran « À trier ») les nouveaux mails
et messages WhatsApp relevés dans les deux classeurs Excel du dossier OneDrive
« Gestion des messageries ».

Dossier du projet : `C:\Users\communication\Documents\Claude\Artifacts\todolist-camp`

## Règles absolues

- Ne jamais modifier les classeurs Excel (le script les lit sur une copie temporaire).
- Ne jamais afficher ni recopier le contenu du fichier `.env` (il contient le jeton de
  synchronisation). Les scripts le lisent eux-mêmes.
- Ne rien supprimer, ni dans Supabase ni sur le disque, en dehors du dossier `sync\out`.
- Si un script échoue, rapporter le message d'erreur tel quel et s'arrêter.

## Étapes

### 1. Lire les classeurs

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\extract.ps1"
```

Produit `sync\out\messages.json` : un tableau d'objets
`source` (mail | whatsapp), `source_key`, `received_on` (AAAA-MM-JJ), `sender`, `subject`,
`content`, `excel_action`, `excel_status`, `excel_reply`, `excel_priority`, `excel_row`.

### 2. Récupérer ce qui est déjà dans Prioris

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\push.ps1" -Action keys
```

Produit `sync\out\existing-keys.json` (liste des `source_key` déjà importés).

Puis récupérer les expéditeurs qu'Alex archive toujours (au moins 3 messages archivés,
jamais transformés en tâche) :

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\push.ps1" -Action archived-senders
```

Produit `sync\out\archived-senders.json` (noms en minuscules). Si la commande échoue parce que
la fonction n'existe pas encore dans Supabase, continuer avec une liste vide et le signaler
dans le compte rendu.

### 3. Retenir les nouveaux messages

Garder les messages dont le `source_key` n'est pas dans `existing-keys.json` et dont
`excel_status` n'est pas « Traité ». S'il n'y en a aucun, répondre « Rien de nouveau à
importer » et s'arrêter.

### 4. Préparer chaque message

Pour chaque message retenu, produire un objet avec exactement ces champs :

| Champ | Contenu |
|---|---|
| `source`, `source_key`, `received_on`, `sender`, `subject` | recopiés tels quels |
| `summary` | 1 à 2 phrases en français, factuelles : qui écrit, quel sujet, quelle demande. Si `content` est déjà un résumé, le reprendre en le resserrant. Jamais de HTML. |
| `needs_action` | `false` si le message ne demande rien : notification automatique, newsletter, accusé de réception, simple remerciement, publicité. `false` aussi si l'expéditeur (`sender` en minuscules, sans espaces autour) figure dans `archived-senders.json` : Alex archive toujours ses messages. Exceptions, qui restent à `true` : message marqué urgent dans le suivi Excel, ou demande de sponsoring, de lots ou de visuel (étape 6). Sinon `true`. |
| `proposed_action` | Une action courte à l'infinitif (« Répondre à Emma sur la liste matériel »). Reprendre `excel_action` s'il est pertinent. Vide si `needs_action` est `false`. |
| `proposed_priority` | 0 = vite fait (moins de 5 min : confirmer, transférer, répondre en deux lignes), 1 = urgent, 2 = cette semaine, 3 = file d'attente / plus tard, 4 = perso. `null` si `needs_action` est `false`. |
| `proposed_due` | AAAA-MM-JJ seulement si le message cite une date limite explicite, sinon `null`. |
| `draft_reply` | Si une réponse est attendue : reprendre `excel_reply` s'il existe, sinon rédiger une réponse courte, prête à envoyer, en français, ton professionnel parlé, signée « Alex ». Reprendre le tutoiement ou le vouvoiement de l'expéditeur. Pour WhatsApp, pas de formule d'en-tête. Ne jamais inventer d'engagement (date, prix, quantité) : écrire `[à compléter]` à la place. Vide si aucune réponse n'est attendue. |
| `urgent` | `true` uniquement si `excel_status` contient « urgence » (marqué « à traiter en urgence » dans le suivi Excel). Sinon `false`. Règle volontairement stricte, choisie par Alex : trop d'urgents rendent le mot inutile. Ne pas marquer urgent pour une relance, un sujet ancien ou un expéditeur important. L'urgence liée à une échéance (dépassée ou dans les 2 jours) est calculée par l'application à partir de `proposed_due` : ne pas la reporter ici. |
| `urgency_reason` | Si `urgent` : « marqué à traiter en urgence dans ton suivi », complété si utile par le motif en quelques mots. Sinon vide. |

Respecter l'orthographe « C.A.M.P. » et ne pas utiliser « on ».

### 5. Envoyer par lots de 40

Écrire chaque lot dans `sync\out\new-items-1.json`, `new-items-2.json`, etc. (tableau JSON
en UTF-8), puis l'envoyer aussitôt :

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\push.ps1" -Action insert -File "<chemin du lot>"
```

Un lot déjà envoyé n'est jamais renvoyé en double : la base ignore les `source_key` existants.

### 6. Repérer les demandes (sponsoring, lots, visuels)

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\push.ps1" -Action request-keys
```

Produit `sync\out\existing-request-keys.json`.

**Messages à examiner :**
- **Rattrapage, une seule fois** : si `existing-request-keys.json` est vide, examiner
  **tous** les messages de `messages.json`, y compris ceux dont `excel_status` est « Traité »
  (pour constituer l'historique).
- **Sinon** : seulement les messages retenus à l'étape 3 de cette synchronisation.

Dans tous les cas, ignorer ceux dont le `source_key` est déjà dans
`existing-request-keys.json`.

**Ce qui compte comme demande** — uniquement une demande **adressée à C.A.M.P. / Alex** :

| `kind` | Exemples |
|---|---|
| `sponsoring` | athlète, grimpeur, club ou événement qui demande un partenariat, un soutien financier ou matériel suivi, une dotation de saison pour un athlète |
| `lots` | lots, dotations, cadeaux ou récompenses pour un événement, une compétition, un podium, une tombola |
| `visuel` | magasin ou partenaire qui demande un visuel, un logo, une bannière, une affiche, de la PLV, un BAT, des photos produits (trade marketing) |

Ne sont **pas** des demandes : un fournisseur ou partenaire qui annonce son propre soutien à un
événement, un échange interne (R&D, collègues), une demande faite **par** C.A.M.P. à quelqu'un,
un visuel envoyé à Alex pour validation, une newsletter. En cas de doute, ne pas créer de demande :
Alex peut en ajouter une depuis le message.

Si plusieurs messages examinés concernent la même demande (relance, suite d'échange), n'en
garder qu'**une**, sur le message le plus ancien, et mentionner la relance dans `summary`.

**Champs de chaque demande :**

| Champ | Contenu |
|---|---|
| `kind` | `sponsoring`, `lots` ou `visuel` |
| `source`, `source_key`, `received_on` | recopiés du message |
| `requester` | la personne qui écrit (nom seul) |
| `organization` | la structure : club, magasin, organisateur ; pour un athlète seul, son nom. Toujours écrit de la même façon (« Au Vieux Campeur », pas « AVC »), pour que Prioris retrouve les demandes précédentes |
| `event_name` | nom court de l'événement ou de la saison (« Contest de Dry Tooling », « Saison 2026 »), vide sinon |
| `event_date` | AAAA-MM-JJ si la date de l'événement est citée, sinon `null`. Pour un événement sur plusieurs jours, le premier jour |
| `reply_by` | AAAA-MM-JJ seulement si le message cite un délai de réponse ou de livraison explicite, sinon `null` (Prioris calcule alors 15 jours avant l'événement) |
| `ask` | ce qui est demandé, en une ligne (« 3 lots pour le podium », « bannière 1200×300 pour le site ») |
| `summary` | 1 à 2 phrases factuelles |
| `draft_reply` | même règle que pour les messages ; reprendre le brouillon du message s'il existe |
| `status` | `done` si `excel_status` est « Traité », sinon `new` |

Écrire les demandes dans `sync\out\new-requests-1.json` (lots de 40, comme à l'étape 5), puis :

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\push.ps1" -Action insert-requests -File "<chemin du lot>"
```

Les demandes sont envoyées **après** les messages : Prioris relie ainsi chaque demande à son
message dans « À trier ».

### 7. Rendre compte, en 9 lignes maximum

- nombre de messages importés (mails / WhatsApp) ;
- nombre de demandes repérées (sponsoring / lots / visuels) ;
- nombre de messages classés « pour info » parce que leur expéditeur est toujours archivé ;
- nombre d'urgents, et les 3 plus urgents en une ligne chacun (expéditeur : action) ;
- nombre de messages « pour info » ;
- rappel : « Ouvre Prioris > À trier, puis Demandes ».

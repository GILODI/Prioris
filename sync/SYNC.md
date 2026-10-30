# Synchroniser Prioris

Procédure suivie par la tâche Claude « Synchroniser Prioris », lancée à la main par Alex
depuis l'application Claude. Elle importe dans Prioris (écran « À trier ») les nouveaux mails
et messages WhatsApp relevés dans les deux classeurs Excel du dossier OneDrive
« Gestion des messageries », ainsi que les messages privés Instagram de camp_france, lus
directement dans Chrome (étape 2 bis).

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
`content`, `excel_action`, `excel_status`, `excel_reply`, `excel_priority`, `excel_row`, et pour
les mails `key_match` (voir ci-dessous).

Le script interroge lui-même Supabase (fonction `prioris_import_index`, écrite dans
`sync\out\existing-index.json`) pour retrouver la clé des mails déjà importés. S'il échoue parce que
cette fonction n'existe pas encore, **s'arrêter** et rapporter le message : Alex doit d'abord
exécuter `sql/2026-10-cles-stables.sql` dans Supabase. Ne pas contourner avec `-SansIndex`.

**Clés des mails.** Le classeur ne contient aucun identifiant de message et la colonne C change
quand la compétence « synthese » remplace le mail brut par un résumé. La clé d'un mail est donc
fixée à son premier import, puis retrouvée à chaque lecture par la date, l'expéditeur et le nombre
de lignes. `key_match` indique comment :

| `key_match` | Sens |
|---|---|
| `exacte` | la clé recalculée existe déjà dans Prioris |
| `rapprochee` | le mail a été résumé depuis son import : il reprend la clé du message de Prioris de même date et même expéditeur. Déjà importé, rien à faire |
| `nouvelle` | aucun message de Prioris ne correspond : mail à importer (sauf statut « Traité ») |
| `sans-index` | mode `-SansIndex`, à ne pas utiliser en synchronisation |

Les messages supprimés dans Prioris (bouton « Supprimer ») gardent leur ligne en base, vidée de son
contenu, avec la clé, la date et l'expéditeur : ils figurent donc dans `existing-keys.json` et
dans l'index, et ne sont jamais réimportés. Ne rien faire de plus pour eux.

Limite connue : si un mail de même date et même expéditeur qu'un message déjà importé, mais sorti
du classeur (passé dans « Traités »), arrive **déjà résumé**, il est pris pour ce message
et n'est pas importé. Rare ; le compte rendu signale les mails « rapprochés » pour que ce soit visible.

**Clés WhatsApp.** Une conversation = une ligne, avec la date du dernier message. La clé contient
cette date : un nouveau message dans le fil change la date, donc la clé, et la conversation
revient dans « À trier » comme un nouvel état du fil. C'est voulu (constaté le 20/10/2026 : tous
les fils concernés avaient une date plus récente et un statut « À traiter »).

### 2. Récupérer ce qui est déjà dans Prioris

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\push.ps1" -Action keys
```

Produit `sync\out\existing-keys.json` (liste des `source_key` déjà importés).

Puis récupérer les expéditeurs qu'Alex a validés « toujours pour info » dans Prioris (rien
n'y entre sans son accord : Prioris lui propose ceux qu'il archive toujours) :

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\push.ps1" -Action archived-senders
```

Et ceux qu'il a marqués « toujours à traiter » :

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\push.ps1" -Action action-senders
```

Produisent `sync\out\archived-senders.json` et `sync\out\action-senders.json` (noms en
minuscules). Si une commande échoue parce que la fonction n'existe pas encore dans Supabase,
continuer avec une liste vide et le signaler dans le compte rendu.

### 2 bis. Relever les messages Instagram (camp_france)

Les messages privés Instagram ne passent par aucun classeur : ils sont lus directement dans la
messagerie du compte **camp_france**, avec Claude in Chrome (outils `mcp__claude-in-chrome__*`,
connexion déjà ouverte dans le Chrome d'Alex). Ajouté le 30/10/2026 à la demande d'Alex.

**Si Chrome ou l'extension ne répond pas**, ou si la page demande de se connecter : sauter cette
étape, continuer avec les mails et WhatsApp, et le signaler dans le compte rendu. Ne jamais saisir
d'identifiant ni de mot de passe.

**Interdits absolus sur Instagram** : ne rien écrire, ne rien envoyer, ne réagir à aucun message,
ne pas accepter ni refuser une demande de message, ne rien supprimer, ne rien archiver. Lecture seule.
Ouvrir une conversation la marque « Vu » chez l'expéditeur : Alex l'a accepté.

1. Ouvrir un nouvel onglet sur `https://www.instagram.com/direct/inbox/` (le refermer à la fin).
2. Date de départ : la plus récente `received_on` des clés `instagram-…` de `existing-index.json`,
   moins 1 jour. S'il n'y en a aucune (premier passage) : le **2026-10-01**.
3. Parcourir les onglets **Principal**, **Général** et **Demandes**, en faisant défiler la liste
   jusqu'aux conversations plus anciennes que la date de départ (la liste se charge en défilant).
4. Ignorer une conversation dont le dernier message vient d'Alex (« Vous : … », « Vous avez
   envoyé… ») : il y a déjà répondu. Ignorer aussi un simple « A aimé un message ».
5. Ouvrir chacune des autres. Son identifiant est la fin de l'adresse
   (`/direct/t/<identifiant>/`). Relever la date exacte du dernier message reçu (séparateurs de
   date de la conversation) et lire les messages reçus depuis la date de départ. Pour une pièce
   jointe (story, post, reel partagé, mention), décrire ce qui est visible : « partage une story
   où il tague C.A.M.P. ». Ne pas inventer ce qu'une image sans texte veut dire.
6. Clé : `instagram-<identifiant>-<AAAA-MM-JJ du dernier message reçu>`. Comme pour WhatsApp, un
   nouveau message dans le fil change la clé et la conversation revient dans « À trier ». Si la
   clé est déjà dans `existing-keys.json`, passer à la suivante sans rien relever.
7. Écrire les conversations relevées dans `sync\out\instagram.json`, au format de
   `messages.json` : `source` = `instagram`, `source_key`, `received_on`, `sender` (nom affiché,
   suivi de « (@identifiant) » s'il est visible), `subject` vide, `content` = l'échange depuis la
   date de départ, en texte, et `excel_action`, `excel_status`, `excel_reply`, `excel_priority`
   vides.

### 3. Retenir les nouveaux messages

Garder les messages de `messages.json` dont le `source_key` n'est pas dans `existing-keys.json`
et dont `excel_status` n'est pas « Traité », plus tous ceux de `instagram.json`. S'il n'y en a
aucun, répondre « Rien de nouveau à importer » et s'arrêter.

### 4. Préparer chaque message

Pour chaque message retenu, produire un objet avec exactement ces champs :

| Champ | Contenu |
|---|---|
| `source`, `source_key`, `received_on`, `sender`, `subject` | recopiés tels quels |
| `summary` | 1 à 2 phrases en français, factuelles : qui écrit, quel sujet, quelle demande. Si `content` est déjà un résumé, le reprendre en le resserrant. Jamais de HTML. |
| `needs_action` | `false` si le message ne demande rien : notification automatique, newsletter, accusé de réception, simple remerciement, publicité. `false` aussi si l'expéditeur (`sender` en minuscules, sans espaces autour) figure dans `archived-senders.json` : Alex a validé « toujours pour info » pour cet expéditeur. Exceptions, qui restent à `true` : message marqué urgent dans le suivi Excel, demande de sponsoring, de lots ou de visuel (étape 6), et **tout expéditeur de `action-senders.json`**, même si le message ressemble à une newsletter : Alex veut toujours les voir. Sinon `true`. |
| `proposed_action` | Une action courte à l'infinitif (« Répondre à Emma sur la liste matériel »). Reprendre `excel_action` s'il est pertinent. Vide si `needs_action` est `false`. |
| `proposed_priority` | 0 = vite fait (moins de 5 min : confirmer, transférer, répondre en deux lignes), 1 = urgent, 2 = cette semaine, 3 = file d'attente / plus tard, 4 = perso. `null` si `needs_action` est `false`. |
| `proposed_due` | AAAA-MM-JJ seulement si le message cite une date limite explicite, sinon `null`. |
| `draft_reply` | Si une réponse est attendue : reprendre `excel_reply` s'il existe, sinon rédiger une réponse courte, prête à envoyer, en français, ton professionnel parlé, signée « Alex ». Reprendre le tutoiement ou le vouvoiement de l'expéditeur. Pour WhatsApp et Instagram, pas de formule d'en-tête. Ne jamais inventer d'engagement (date, prix, quantité) : écrire `[à compléter]` à la place. Vide si aucune réponse n'est attendue. |
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

Les messages Instagram partent dans des lots **à part**, après les mails et WhatsApp. Si leur
envoi échoue sur la règle d'origine (`source_check`), c'est que `sql/2026-10-instagram.sql` n'a
pas encore été exécuté dans Supabase : le signaler dans le compte rendu, sans s'arrêter.

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
| `contact_email` | adresse mail de l'expéditeur si `sender` en contient une (en minuscules), sinon vide. Ne jamais en inventer une. Pour WhatsApp et Instagram, vide |
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

- nombre de messages importés (mails / WhatsApp / Instagram, ou « Instagram sauté » et pourquoi), et combien de mails `rapprochee` (déjà importés, résumés depuis) ;
- nombre de demandes repérées (sponsoring / lots / visuels) ;
- nombre de messages classés « pour info » parce qu'Alex a validé leur expéditeur ;
- nombre d'urgents, et les 3 plus urgents en une ligne chacun (expéditeur : action) ;
- nombre de messages « pour info » ;
- rappel : « Ouvre Prioris > À trier, puis Demandes ».

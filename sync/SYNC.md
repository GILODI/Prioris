# Synchroniser Prioris

Procédure suivie par la tâche Claude « Synchroniser Prioris », lancée à la main par Alex
depuis l'application Claude. Elle importe dans Prioris (écran « À trier ») les nouveaux mails
et messages WhatsApp relevés dans les deux classeurs Excel du dossier OneDrive
« Gestion des messageries ».

Dossier du projet : `C:\Users\communication\Documents\Claude\Artifacts\todolist-camp`

## Règles absolues

- Ne jamais modifier les classeurs Excel (le script les lit sur une copie temporaire).
- Ne jamais afficher, lire à voix haute ni recopier le contenu du fichier `.env` (clé secrète).
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
| `needs_action` | `false` si le message ne demande rien : notification automatique, newsletter, accusé de réception, simple remerciement, publicité. Sinon `true`. |
| `proposed_action` | Une action courte à l'infinitif (« Répondre à Emma sur la liste matériel »). Reprendre `excel_action` s'il est pertinent. Vide si `needs_action` est `false`. |
| `proposed_priority` | 0 = vite fait (moins de 5 min : confirmer, transférer, répondre en deux lignes), 1 = urgent, 2 = cette semaine, 3 = file d'attente / plus tard, 4 = perso. `null` si `needs_action` est `false`. |
| `proposed_due` | AAAA-MM-JJ seulement si le message cite une date limite explicite, sinon `null`. |
| `draft_reply` | Si une réponse est attendue : reprendre `excel_reply` s'il existe, sinon rédiger une réponse courte, prête à envoyer, en français, ton professionnel parlé, signée « Alex ». Reprendre le tutoiement ou le vouvoiement de l'expéditeur. Pour WhatsApp, pas de formule d'en-tête. Ne jamais inventer d'engagement (date, prix, quantité) : écrire `[à compléter]` à la place. Vide si aucune réponse n'est attendue. |
| `urgent` | `true` si au moins un critère : `excel_status` contient « urgence » ; `excel_priority` vaut « Haute » ; échéance aujourd'hui, demain ou dépassée ; relance ou deuxième demande ; sujet bloqué depuis plus de 10 jours ; paiement, facture ou contrat bloqué ; demande de la maison-mère (HQ Italie) ou de la direction. Sinon `false`. Appliquer ces critères aussi aux messages anciens : c'est ce qui permet de rattraper une urgence passée inaperçue. |
| `urgency_reason` | Si `urgent` : la raison en quelques mots (« relance, en attente depuis 20 jours »). Sinon vide. |

Respecter l'orthographe « C.A.M.P. » et ne pas utiliser « on ».

### 5. Envoyer par lots de 40

Écrire chaque lot dans `sync\out\new-items-1.json`, `new-items-2.json`, etc. (tableau JSON
en UTF-8), puis l'envoyer aussitôt :

```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\communication\Documents\Claude\Artifacts\todolist-camp\sync\push.ps1" -Action insert -File "<chemin du lot>"
```

Un lot déjà envoyé n'est jamais renvoyé en double : la base ignore les `source_key` existants.

### 6. Rendre compte, en 5 lignes maximum

- nombre de messages importés (mails / WhatsApp) ;
- nombre d'urgents, et les 3 plus urgents en une ligne chacun (expéditeur : action) ;
- nombre de messages « pour info » ;
- rappel : « Ouvre Prioris > À trier ».

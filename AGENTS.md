# Prioris — consignes de travail

Application personnelle de gestion de tâches d'Alex (C.A.M.P. France). Alex
n'est pas développeur : il décrit ce qu'il veut, l'agent écrit le code,
explique ce qu'il fait et pourquoi. Les explications vont à quelqu'un qui
comprend son métier et son outil, pas le jargon technique.

## Ce qu'est ce projet

- **Un site statique, sans build ni framework.** `index.html` charge
  `css/app.css` et des modules JavaScript natifs dans `js/` (un fichier par
  écran dans `js/views/`). Pas de `npm install`, pas d'étape de compilation.
- **Déployée sur Vercel** depuis GitHub (`GILODI/Prioris`), à chaque push sur
  la branche principale. Chaque branche a aussi son lien d'aperçu.
- **Données dans Supabase** : `tasks` (tâches), `ideas` (boîte à idées),
  `inbox_items` (mails et messages WhatsApp à trier), avec le temps réel
  activé pour synchroniser plusieurs appareils. Les migrations sont dans
  `sql/`, dans l'ordre de leur date.
- **Connexion obligatoire** (adresse + mot de passe, compte créé dans
  Supabase > Authentication > Users). Sans session, l'application n'affiche
  rien.
- **Synchronisation des messages** : `sync/` contient les scripts qui lisent
  les classeurs Excel « Traitement des mails 2026 » et « Suivi WhatsApp »
  (OneDrive) et la procédure `sync/SYNC.md`, suivie par la tâche Claude
  « Synchroniser Prioris » lancée à la main. Elle écrit via deux fonctions
  protégées par un jeton (`SUPABASE_IMPORT_TOKEN` dans `.env`, jamais
  publié), sans clé `service_role`.
- **Installable** sur téléphone (PWA) : `manifest.json` + `sw.js`.
- `versions/` contient d'anciennes versions HTML datées, antérieures au
  renommage en « Prioris ». C'est de l'historique : ne rien y modifier, ne
  pas s'en servir comme référence.

## Comment travailler

Ces règles viennent de la collaboration sur l'autre projet d'Alex
(`camp-app-caisse`). Elles ne sont pas négociables sans son accord.

- **Toujours sur une branche dédiée.** Jamais de push direct sur la branche
  principale. On fusionne **uniquement** après un « go » explicite d'Alex.
- **Les migrations SQL se donnent à copier-coller**, prêtes à être collées
  dans Supabase → SQL Editor. L'agent n'a pas la clé `service_role` et ne
  doit pas la demander. Toujours indiquer si la migration est additive et ce
  qu'elle touche.
- **Ne jamais supprimer de données.** Si quelque chose doit disparaître, on
  privilégie l'anonymisation ou le marquage plutôt que l'effacement — et on
  explique pourquoi.
- **Vérifier avant d'affirmer.** Tester réellement (requête, script, page
  ouverte) plutôt que supposer. Quand une vérification est impossible, le
  dire clairement au lieu de laisser croire que c'est validé.
- **Signaler ce qu'on ne peut pas garantir.** Une solution de contournement
  qui dépend du comportement d'un tiers doit être présentée comme telle.
- **Tout en français** : code, commentaires, messages de commit, échanges.
  Les commits décrivent l'intention, pas la mécanique.

## Points d'attention propres à ce projet

**Le cache a déjà mordu.** Le commit `9a00e14` (« Désactiver le cache
HTTP/service worker : les correctifs n'arrivaient pas ») répond à un vrai
incident : les corrections déployées n'atteignaient pas l'appareil d'Alex.
D'où le `Cache-Control: no-store` dans `vercel.json` et le service worker en
« réseau d'abord, cache en secours ». **Avant de toucher au cache ou au
service worker, comprendre cet historique** — et tester sur un appareil réel,
pas seulement en navigation privée.

*Mises à jour de l'application installée* (octobre 2026) : une application
installée sur téléphone est reprise, pas rechargée, donc elle gardait le code
chargé des jours plus tôt malgré le `no-store`. `js/update.js` compare à chaque
retour au premier plan la version déployée (la constante `CACHE` de `sw.js`) à
celle de la page et affiche un bandeau « Nouvelle version disponible ». La
version figure en bas de l'accueil. **Conséquence : augmenter `CACHE` dans
`sw.js` à chaque déploiement qui change l'application**, sinon ni le bandeau
ni la purge des anciens caches ne se déclenchent. Le service worker bascule
aussi sur la copie locale si le réseau met plus de 5 secondes à répondre ; une
copie plus ancienne que le déploiement peut alors être servie un court instant.

**Accès à la base, réservé au compte d'Alex.** Depuis la v2 (octobre 2026,
`sql/2026-10-etape2-verrouillage.sql`), l'ancienne policy `"Accès complet anon"` est
remplacée par `"Compte Prioris uniquement"` : seul le compte
`communication@campfrance.fr` connecté lit et écrit. Décidé avec Alex quand
les mails sont entrés dans l'application. La clé publique ne donne plus accès
qu'aux deux fonctions de synchronisation, et seulement avec le jeton.

**Avertissements attendus dans Supabase (Security Advisor).** Les fonctions
`prioris_*` de synchronisation sont signalées « Public Can Execute SECURITY
DEFINER Function » : c'est voulu, elles sont appelées avec la clé publique et
refusent tout sans le jeton. L'avertissement « Leaked Password Protection
Disabled » concerne une option des offres payantes. Le reste a été traité par
`sql/2026-10-avertissements-supabase.sql`.

**`config.js` est commité** alors que `config.example.js` affirme qu'il est
ignoré par git. Ce n'est pas une fuite (il ne contient que des clés
publiques), mais l'intention initiale n'était pas celle-là.

**Le projet Supabase est sur le forfait gratuit.** Il se met en pause après
environ 7 jours sans activité suffisante, et **n'est plus réactivable passé
90 jours**. Un projet en pause se réveille uniquement depuis le tableau de
bord Supabase — ouvrir l'application ne suffit pas. Une tâche planifiée
quotidienne (hébergée dans le projet `camp-app-caisse`,
`/api/cron/keepalive`) interroge cette base, mais **une requête par jour
s'est révélée insuffisante** pour éviter l'avertissement de mise en pause.
Consigne pratique : se connecter au tableau de bord tous les deux mois.

## Question ouverte

Le 21/08/2026, les statistiques « API Gateway » de Supabase ne montraient
**aucune requête REST** provenant de l'usage quotidien d'Alex — seul le ping
automatique apparaissait. Or le service worker ne met pas en cache les appels
Supabase (il ignore les requêtes hors origine). L'hypothèse la plus probable
est que l'application communique par **Realtime (websocket)**, dont le trafic
n'apparaît pas sur cette page mais dans la section « Realtime ».

À confirmer avant toute conclusion sur l'activité réelle de la base — et
notamment avant d'affirmer qu'utiliser l'application entretient son éveil.

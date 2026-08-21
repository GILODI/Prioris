# Prioris — consignes de travail

Application personnelle de gestion de tâches d'Alex (C.A.M.P. France). Alex
n'est pas développeur : il décrit ce qu'il veut, l'agent écrit le code,
explique ce qu'il fait et pourquoi. Les explications vont à quelqu'un qui
comprend son métier et son outil, pas le jargon technique.

## Ce qu'est ce projet

- **Une page statique, sans build ni framework.** Tout tient dans
  `index.html` (~33 Ko) : structure, styles et logique. Pas de `npm install`,
  pas d'étape de compilation. On ouvre le fichier, on modifie, c'est tout.
- **Déployée sur Vercel** depuis GitHub (`GILODI/Prioris`), à chaque push sur
  la branche principale.
- **Données dans Supabase**, une seule table `tasks` (voir
  `supabase_schema.sql`), avec le temps réel activé pour synchroniser
  plusieurs appareils.
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

**Accès à la base, ouvert et assumé.** La policy `"Accès complet anon"` donne
un accès complet en lecture et écriture à quiconque possède l'URL et la clé
publique — toutes deux servies au navigateur. C'est documenté et accepté pour
un usage strictement personnel. **À revoir impérativement** si la liste doit
être partagée, si des données sensibles y entrent, ou si l'application devient
publique. Ne pas « corriger » ce point de sa propre initiative : en parler à
Alex d'abord, c'est un choix, pas un oubli.

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

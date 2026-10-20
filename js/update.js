// Mises à jour de l'application installée.
//
// Une application installée sur téléphone est rarement rechargée : elle reprend là où on l'a
// laissée, avec le code chargé des jours plus tôt. Le service worker se met bien à jour en
// arrière-plan, mais pas la page en cours. Ce module compare donc, chaque fois que l'application
// revient au premier plan, la version déployée (le nom du cache dans sw.js) à celle avec laquelle
// la page a démarré, et propose de recharger si elles diffèrent.
// La version à changer à chaque déploiement est la constante CACHE de sw.js.

let versionChargee = null;   // version avec laquelle cette page a démarré
let derniereVerif = 0;
let surChangement = () => {};

export function versionAffichee() {
  return versionChargee;
}

async function versionDeployee() {
  const res = await fetch('sw.js', { cache: 'no-store' });
  if (!res.ok) throw new Error('sw.js : ' + res.status);
  const m = (await res.text()).match(/const CACHE = '([^']+)'/);
  if (!m) throw new Error('version introuvable dans sw.js');
  return m[1];
}

// Hors connexion au démarrage : la page vient de la copie locale, dont le nom de cache est la version
async function versionDuCacheLocal() {
  const noms = (await caches.keys()).filter(k => /^prioris-v\d+$/.test(k));
  noms.sort((a, b) => Number(a.slice(9)) - Number(b.slice(9)));
  return noms.length ? noms[noms.length - 1] : null;
}

function montrerBandeau() {
  const el = document.getElementById('update-banner');
  if (el) el.hidden = false;
}

async function verifier() {
  if (Date.now() - derniereVerif < 60 * 1000) return;
  derniereVerif = Date.now();
  navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
  try {
    const deployee = await versionDeployee();
    if (versionChargee === null) { versionChargee = deployee; surChangement(); return; }
    if (deployee !== versionChargee) montrerBandeau();
  } catch { /* hors connexion : on réessaiera au prochain retour au premier plan */ }
}

// aVersionChangee : appelée quand la version à afficher est connue (pour redessiner l'accueil)
export function initUpdates(aVersionChangee) {
  surChangement = aVersionChangee || surChangement;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.error('SW', err)));

  const bouton = document.getElementById('update-reload');
  if (bouton) bouton.addEventListener('click', () => location.reload());

  versionDeployee()
    .catch(() => versionDuCacheLocal())
    .catch(() => null)
    .then(v => { versionChargee = v; derniereVerif = Date.now(); surChangement(); });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifier(); });
  window.addEventListener('online', verifier);
  setInterval(() => { if (document.visibilityState === 'visible') verifier(); }, 30 * 60 * 1000);
}

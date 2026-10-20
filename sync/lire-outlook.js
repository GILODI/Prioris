// Lecture de la liste des messages d'Outlook sur le web (outlook.office.com), à exécuter avec l'outil
// javascript_tool du navigateur, dans l'onglet Outlook ouvert sur la boîte de réception.
// LECTURE SEULE : fait défiler la liste et relève la date, l'expéditeur affiché et l'objet de chaque
// conversation. Aucun message n'est ouvert, déplacé ni supprimé. Voir NETTOYAGE.md.
//
// L'outil coupe un script après 45 s : on le découpe. Les étapes se font en appels séparés.
//   1. Coller tout ce fichier une fois (il prépare window.__ol, puis lit les 25 premiers pas).
//   2. Répéter  await window.__ol.pas(30)  jusqu'à ce que « fini » soit vrai (ou que la date voulue soit passée).
//   3. Récupérer le résultat : JSON.stringify(window.__ol.export('2026-09-17'))
// Les formats d'Outlook (classes CSS, dates) peuvent changer : si « sansDate » n'est pas 0, ou si le
// total reste très bas, ne pas se fier à la comparaison et le dire.
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // Le conteneur qui défile est celui dont le débordement est « auto » (pas le premier parent plus haut que large)
  const getScroller = () => { let e = document.querySelector('[role=option]'); while (e && !(['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 5)) e = e.parentElement; return e; };
  const JOURS = { dim: 0, lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6 };
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const now = new Date();
  // Formats vus : « 11:58 » (aujourd'hui), « Lun 16:23 » (cette semaine), « Lun 28/09 » (plus ancien)
  function parseDate(t) {
    t = t.trim();
    if (/^\d{1,2}:\d{2}$/.test(t)) return iso(now);
    let m = t.match(/^([A-Za-zéû]+)\.?\s+\d{1,2}:\d{2}$/);
    if (m && JOURS[m[1].toLowerCase()] !== undefined) { for (let i = 1; i <= 7; i++) { const d = new Date(now.getTime() - i * 86400000); if (d.getDay() === JOURS[m[1].toLowerCase()]) return iso(d); } }
    m = t.match(/^[A-Za-zéû]+\.?\s+(\d{1,2})\/(\d{1,2})$/); if (m) return `${now.getFullYear()}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/); if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  }
  function lire(o) {
    const feuilles = [...o.querySelectorAll('span, div')].filter(e => e.children.length === 0 && e.textContent.trim()).map(e => e.textContent.trim());
    const sujetEl = o.querySelector('.TtcXM'); const sujet = sujetEl ? sujetEl.textContent.trim() : '';
    const dateBrute = feuilles.find(t => parseDate(t)) || '';
    // L'expéditeur est la première ligne qui n'est ni la pastille d'initiales, ni « Non vérifié », ni l'objet, ni la date
    const expediteur = feuilles.find(t => t !== 'Non vérifié' && t !== sujet && t !== dateBrute && !/^[A-ZÉÈ]{1,2}$/.test(t)) || '';
    return { id: o.getAttribute('data-convid'), expediteur, sujet: sujet.slice(0, 70), dateBrute, date: parseDate(dateBrute) };
  }
  window.__ol = {
    vus: new Map(), fini: false, sansProgres: 0,
    async pas(n) {
      const sc = getScroller();
      for (let i = 0; i < n && !this.fini; i++) {
        const avant = this.vus.size;
        document.querySelectorAll('[role=option]').forEach(o => { const r = lire(o); if (r.id && !this.vus.has(r.id)) this.vus.set(r.id, r); });
        const bas = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;
        if (this.vus.size === avant) { this.sansProgres++; if (bas && this.sansProgres > 3) { this.fini = true; break; } } else this.sansProgres = 0;
        sc.scrollTop += Math.floor(sc.clientHeight * 0.7); await wait(400);
      }
      const L = [...this.vus.values()];
      return { total: L.length, fini: this.fini, plusAncien: L.map(r => r.date).filter(Boolean).sort()[0], sansDate: L.filter(r => !r.date).length };
    },
    // [date, expéditeur, objet] des conversations à partir de `depuis` (AAAA-MM-JJ)
    export(depuis) { return [...this.vus.values()].filter(r => r.date && r.date >= depuis).map(r => [r.date, r.expediteur, r.sujet.slice(0, 60)]); },
  };
  getScroller().scrollTop = 0; await wait(1500);   // repartir du HAUT de la liste, sinon les messages récents sont manqués
  return await window.__ol.pas(25);
})()

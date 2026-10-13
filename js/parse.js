// Découpage de la saisie (clavier ou dictée) : « contact virgule remarque virgule importance ».
// Logique reprise telle quelle de la première version de Prioris.

export function parsePriority(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  // La dictée ajoute parfois une ponctuation finale invisible (ex: "0." au lieu de "0")
  // et transcrit parfois un chiffre en toutes lettres (ex: "zéro" au lieu de "0").
  const wordNums = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4 };
  const normalized = normWord(s);
  if (Object.prototype.hasOwnProperty.call(wordNums, normalized)) return wordNums[normalized];
  if (/^\d+$/.test(normalized)) { const n = parseInt(normalized, 10); return [0, 1, 2, 3, 4].includes(n) ? n : null; }
  if (/urgent/.test(s)) return 1;
  if (/(vite|5\s?min|cinq\s?minutes)/.test(s)) return 0;
  if (/semaine/.test(s)) return 2;
  if (/(plus tard|attente|file)/.test(s)) return 3;
  if (/perso/.test(s)) return 4;
  return null;
}

export function normWord(w) {
  return w.toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/^[.,;:!?]+|[.,;:!?]+$/g, '');
}

// Retire le mot "étoile" (n'importe où, insensible aux accents/casse) d'un bloc,
// et signale si le bloc ne contenait QUE ce mot (auquel cas il faut le supprimer
// entièrement pour ne pas décaler les positions contact/remarque/importance).
function stripStarWord(part) {
  const words = part.split(/\s+/).filter(Boolean);
  const kept = words.filter(w => normWord(w) !== 'etoile');
  const found = kept.length !== words.length;
  const wasOnlyStar = words.length > 0 && kept.length === 0;
  return { text: kept.join(' '), found, dropBlock: wasOnlyStar };
}

export function parseQuickInput(raw) {
  // "virgule" est le mot recommandé (natif, bien reconnu par la dictée fr-FR).
  // "slash" est souvent mal transcrit par la dictée téléphone (ex: "flash") : on
  // garde ces variantes en reconnaissance de secours.
  const s = raw.trim().replace(/\s*\b(virgule|slash|flash|barre oblique|barre)\b\s*/gi, ' / ');
  const rawParts = s.split('/').map(p => p.trim());

  let star = false;
  const blocks = [];
  for (const rawPart of rawParts) {
    const { text, found, dropBlock } = stripStarWord(rawPart);
    if (found) star = true;
    if (dropBlock) continue;
    blocks.push(text);
  }

  // Repère un bloc "priorité" (mot ou chiffre) n'importe où parmi les blocs et le retire
  // pour ne pas décaler contact/remarque. Un bloc isolé n'est jamais une priorité seule.
  let p = null;
  if (blocks.length > 1) {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const candidate = parsePriority(blocks[i]);
      if (candidate !== null) { p = candidate; blocks.splice(i, 1); break; }
    }
  }

  let c = '', t = '';
  if (blocks.length >= 2) { c = blocks[0]; t = blocks.slice(1).join(' / '); }
  else { t = blocks[0] || ''; }
  return { c, t, p, star };
}

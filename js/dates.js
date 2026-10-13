// Dates au format AAAA-MM-JJ, en heure locale (pas en UTC).

export function isoDate(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function today() { return isoDate(new Date()); }

export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function daysUntil(iso) {
  if (!iso) return null;
  const a = new Date(today() + 'T12:00:00');
  const b = new Date(iso.slice(0, 10) + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}

export function daysSince(ts) {
  if (!ts) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86400000));
}

const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

// "aujourd'hui", "demain", "ven. 17/10", "en retard de 2 j"
export function dueLabel(iso) {
  const n = daysUntil(iso);
  if (n === null) return '';
  if (n < 0) return n === -1 ? 'hier' : `en retard de ${-n} j`;
  if (n === 0) return 'aujourd\'hui';
  if (n === 1) return 'demain';
  const d = new Date(iso + 'T12:00:00');
  return `${WEEKDAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function longDate(d = new Date()) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function shortDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const sameDay = isoDate(d) === today();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `aujourd'hui ${time}` : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

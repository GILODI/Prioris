// Briques d'affichage partagées par les écrans.
import { dueLabel, daysUntil, daysSince } from './dates.js';

export const ZONES = [
  { id: 0, label: 'Vite fait', hint: 'moins de 5 min', cls: 'z0' },
  { id: 1, label: 'Urgent', hint: '', cls: 'z1' },
  { id: 2, label: 'Cette semaine', hint: '', cls: 'z2' },
  { id: 3, label: 'File d\'attente', hint: 'plus tard', cls: 'z3' },
  { id: 4, label: 'Perso', hint: '', cls: 'z4' },
  { id: null, label: 'À classer', hint: '', cls: 'zu' },
];

export function zoneOf(p) { return ZONES.find(z => z.id === (p ?? null)) || ZONES[5]; }

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const ICONS = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16l2 9v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6zm1.6 2-1.4 6H9l1 2h4l1-2h4.8l-1.4-6z"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h13v2H8zm0 6h13v2H8zm0 6h13v2H8zM3 4.5h3v3H3zm0 6h3v3H3zm0 6h3v3H3z"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2zm-3 18h6v1.5a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/></svg>',
  dots: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>',
};

export function dueChip(iso) {
  if (!iso) return '';
  const n = daysUntil(iso);
  const cls = n <= 0 ? 'red' : n <= 3 ? 'amber' : '';
  return `<span class="chip ${cls}">${esc(dueLabel(iso))}</span>`;
}

export function waitingChip(t) {
  if (!t.waiting) return '';
  const d = daysSince(t.waitingSince);
  const label = d === null ? 'en attente' : d === 0 ? 'en attente depuis aujourd\'hui' : `en attente · ${d} j`;
  return `<span class="chip ${d !== null && d > 5 ? 'amber' : ''}">${label}</span>`;
}

export function zoneChip(p) {
  const z = zoneOf(p);
  return `<span class="chip zone ${z.cls}">${esc(z.label)}</span>`;
}

// Une ligne de tâche. opts : handle (poignée de glisser), showZone (rappel de catégorie),
// focusButton ('add' | 'remove').
// Origine d'un message ou d'une tâche : mail, WhatsApp ou appel téléphonique.
const SOURCE_LABELS = { mail: 'Mail', whatsapp: 'WhatsApp', phone: 'Appel' };
export function sourceLabel(s) { return SOURCE_LABELS[s] || ''; }
export function sourceChip(s) { return SOURCE_LABELS[s] ? `<span class="chip src-${s}">${SOURCE_LABELS[s]}</span>` : ''; }

export function taskRow(t, opts = {}) {
  const src = sourceChip(t.source);
  const chips = [opts.showZone ? zoneChip(t.p) : '', src, dueChip(t.due), waitingChip(t)].join('');
  const focusBtn = opts.focusButton === 'add'
    ? `<button class="mini-btn" data-action="focus-add" data-id="${t.id}" aria-label="Ajouter au focus du jour">+ Focus</button>`
    : opts.focusButton === 'remove'
      ? `<button class="icon-btn" data-action="focus-remove" data-id="${t.id}" aria-label="Retirer du focus" title="Retirer du focus">×</button>`
      : '';
  return `<div class="task${t.done ? ' is-done' : ''}${t.star ? ' is-star' : ''}" id="task-${t.id}" data-id="${t.id}">
    ${opts.handle ? '<span class="drag-handle" aria-hidden="true" title="Glisser pour réordonner">⠿</span>' : ''}
    <button class="check${t.done ? ' on' : ''}" data-action="toggle-done" data-id="${t.id}" aria-label="${t.done ? 'Marquer comme à faire' : 'Marquer comme fait'}"></button>
    <button class="task-body" data-action="edit" data-id="${t.id}">
      ${t.c ? `<span class="task-contact">${esc(t.c)}</span>` : ''}
      <span class="task-text">${t.t ? esc(t.t) : '<em>sans description</em>'}</span>
      ${chips ? `<span class="chips">${chips}</span>` : ''}
    </button>
    ${focusBtn}
    <button class="star${t.star ? ' on' : ''}" data-action="toggle-star" data-id="${t.id}" aria-label="${t.star ? 'Retirer l\'étoile' : 'Ajouter une étoile'}">★</button>
  </div>`;
}

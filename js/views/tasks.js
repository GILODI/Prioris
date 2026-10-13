// Tâches : les catégories de toujours (glisser-déposer, étoile, terminées),
// plus deux vues filtrées : en attente et échéances.
import { state, sortForZone } from '../store.js';
import { daysSince } from '../dates.js';
import { esc, ZONES, taskRow } from '../ui.js';

const ui = loadUi();

function loadUi() {
  try { return JSON.parse(localStorage.getItem('prioris_v2_ui') || 'null') || { filter: 'zones', col: {}, doneOpen: {} }; }
  catch (e) { return { filter: 'zones', col: {}, doneOpen: {} }; }
}
function saveUi() { try { localStorage.setItem('prioris_v2_ui', JSON.stringify(ui)); } catch (e) {} }

export function setFilter(f) { ui.filter = f; saveUi(); }
export function toggleCollapse(zone) { ui.col[zone] = !ui.col[zone]; saveUi(); }
export function toggleDoneList(zone) { ui.doneOpen[zone] = !ui.doneOpen[zone]; saveUi(); }

export function renderTasks() {
  const open = state.tasks.filter(t => !t.done);
  const waitingCount = open.filter(t => t.waiting).length;
  const dueCount = open.filter(t => t.due).length;
  const tabs = [
    ['zones', 'Catégories', open.length],
    ['waiting', 'En attente', waitingCount],
    ['due', 'Échéances', dueCount],
  ];
  return `
  <header class="page-head">
    <h1>Tâches</h1>
    <p class="muted">${open.length} à faire</p>
  </header>
  <div class="segmented" role="tablist" aria-label="Affichage">
    ${tabs.map(([key, label, n]) => `<button role="tab" aria-selected="${ui.filter === key}" class="${ui.filter === key ? 'on' : ''}" data-action="filter" data-filter="${key}">${label} <span class="n">${n}</span></button>`).join('')}
  </div>
  ${ui.filter === 'waiting' ? renderWaiting(open) : ui.filter === 'due' ? renderDue(open) : renderZones()}`;
}

function renderZones() {
  return ZONES.map(z => {
    const key = String(z.id);
    const inZone = state.tasks.filter(t => (t.p ?? null) === z.id);
    const active = sortForZone(inZone.filter(t => !t.done));
    const done = inZone.filter(t => t.done);
    const collapsed = !!ui.col[key];
    const doneOpen = !!ui.doneOpen[key];
    return `
    <section class="zone ${z.cls}${collapsed ? ' collapsed' : ''}">
      <button class="zone-head" data-action="collapse" data-zone="${key}" aria-expanded="${!collapsed}">
        <span class="zone-dot"></span>
        <span class="zone-name">${z.id !== null ? `${z.id} · ` : ''}${esc(z.label)}${z.hint ? ` <span class="muted small">${esc(z.hint)}</span>` : ''}</span>
        <span class="count-pill">${active.length}</span>
        <span class="chev" aria-hidden="true">▾</span>
      </button>
      <div class="zone-body">
        <div class="task-list" data-zone="${key}">
          ${active.length ? active.map(t => taskRow(t, { handle: true })).join('') : '<p class="empty">Aucune tâche</p>'}
        </div>
        ${done.length ? `
        <div class="done-block">
          <button class="done-toggle" data-action="done-list" data-zone="${key}" aria-expanded="${doneOpen}">${doneOpen ? '▾' : '▸'} ${done.length} terminée${done.length > 1 ? 's' : ''}</button>
          ${doneOpen ? `<div class="task-list plain">${done.map(t => taskRow(t)).join('')}</div>
          <button class="link danger" data-action="clear-done" data-zone="${key}">Effacer l'historique de cette catégorie</button>` : ''}
        </div>` : ''}
      </div>
    </section>`;
  }).join('');
}

function renderWaiting(open) {
  const list = open.filter(t => t.waiting)
    .sort((a, b) => (a.waitingSince || '').localeCompare(b.waitingSince || ''));
  if (!list.length) return '<p class="empty card">Aucune tâche en attente. Ouvre une tâche et coche « En attente d\'une réponse » quand la balle est dans le camp de quelqu\'un d\'autre.</p>';
  const late = list.filter(t => (daysSince(t.waitingSince) ?? 0) > 5).length;
  return `
  ${late ? `<p class="notice">${late} tâche${late > 1 ? 's attendent' : ' attend'} depuis plus de 5 jours : pense à relancer.</p>` : ''}
  <div class="card"><div class="task-list plain">${list.map(t => taskRow(t, { showZone: true })).join('')}</div></div>`;
}

function renderDue(open) {
  const list = open.filter(t => t.due).sort((a, b) => a.due.localeCompare(b.due));
  if (!list.length) return '<p class="empty card">Aucune échéance. Ajoute une date depuis le menu d\'une tâche ou au moment du tri.</p>';
  return `<div class="card"><div class="task-list plain">${list.map(t => taskRow(t, { showZone: true })).join('')}</div></div>`;
}

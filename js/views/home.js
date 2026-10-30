// Accueil : focus du jour (3 tâches maximum), puis la synthèse du reste.
import { state, focusToday, activeFocus, focusSuggestions, FOCUS_MAX } from '../store.js';
import { longDate, daysUntil, daysSince, dueLabel, shortDateTime } from '../dates.js';
import { esc, taskRow } from '../ui.js';
import { queues } from './inbox.js';
import { openRequests, timing, deadlineChip, KINDS, LEAD_DAYS } from './requests.js';
import { weekCard, weekVisible } from './week.js';
import { versionAffichee } from '../update.js';

function requestsCard() {
  const open = openRequests();
  if (!open.length) return compactCard('req-title', 'Demandes', 'Aucune en attente', 'requests', 'Ouvrir');
  const urgent = open.filter(r => timing(r) === 'urgent');
  const soon = open.filter(r => timing(r) === 'urgent' || timing(r) === 'ok').slice(0, 3);
  return `
    <section class="card${urgent.length ? ' has-urgent' : ''}" aria-labelledby="req-title">
      <div class="card-head"><h2 id="req-title">Demandes</h2><span class="big-num">${open.length}</span></div>
      ${urgent.length ? `<p class="urgent-flag">${urgent.length} demande${urgent.length > 1 ? 's' : ''} à traiter d'urgence</p>` : ''}
      <div class="counts">
        ${KINDS.map(k => `<div><b>${open.filter(r => r.kind === k.id).length}</b><span>${esc((k.short || k.label).toLowerCase())}</span></div>`).join('')}
      </div>
      ${soon.length ? `<ul class="mini-list">
        ${soon.map(r => `<li><button class="link-row" data-action="request-open" data-id="${r.id}">
          <span>${esc(r.organization || r.requester || 'Demande')}${r.eventName ? ` · ${esc(r.eventName)}` : ''}</span>
          ${deadlineChip(r)}
        </button></li>`).join('')}
      </ul>` : `<p class="empty">Rien d'urgent. Réponse au plus tard ${LEAD_DAYS} jours avant l'événement.</p>`}
      <button class="btn wide" data-action="go" data-view="requests">Ouvrir les demandes</button>
    </section>`;
}

// Carte réduite à une ligne quand il n'y a rien à montrer : elle ne prend plus un bloc entier
function compactCard(id, title, text, view, label) {
  return `
    <section class="card compact" aria-labelledby="${id}">
      <div class="card-head"><h2 id="${id}">${title}</h2><span class="muted small">${text}</span></div>
      ${view ? `<button class="btn small-btn" data-action="go" data-view="${view}">${label}</button>` : ''}
    </section>`;
}

// Bande de synthèse sous le titre : ce qui attend une décision, visible sans faire défiler
function glanceStrip({ urgentMessages, toSortMessages, requestsOpen, requestsUrgent, relances }) {
  const plural = (n, un, plus) => `${n} ${n > 1 ? plus : un}`;
  const chips = [];
  if (urgentMessages) chips.push(`<button class="glance-item red" data-action="go" data-view="inbox">${plural(urgentMessages, 'urgent', 'urgents')}</button>`);
  if (toSortMessages) chips.push(`<button class="glance-item" data-action="go" data-view="inbox">${toSortMessages} à trier</button>`);
  if (requestsOpen) chips.push(`<button class="glance-item${requestsUrgent ? ' red' : ''}" data-action="go" data-view="requests">${plural(requestsOpen, 'demande', 'demandes')}${requestsUrgent ? ` · ${requestsUrgent} urgente${requestsUrgent > 1 ? 's' : ''}` : ''}</button>`);
  if (relances) chips.push(`<button class="glance-item amber" data-action="go" data-view="tasks">${plural(relances, 'relance', 'relances')}</button>`);
  return chips.length
    ? `<nav class="glance" aria-label="À traiter en priorité">${chips.join('')}</nav>`
    : `<p class="glance-none muted small">Rien à trier, aucune demande, aucune relance.</p>`;
}

export function renderHome() {
  const focus = focusToday();
  const active = activeFocus();
  const doneCount = focus.length - active.length;
  const room = FOCUS_MAX - active.length;
  const suggestions = room > 0 ? focusSuggestions(room) : [];

  const open = state.tasks.filter(t => !t.done);
  const toSort = open.filter(t => t.p === null && !t.waiting);
  const q = queues('all');
  const mainMessages = q.main.filter(e => e.kind === 'msg').map(e => e.item);
  const mails = mainMessages.filter(m => m.source === 'mail').length;
  const whatsapp = mainMessages.filter(m => m.source === 'whatsapp').length;
  const calls = mainMessages.filter(m => m.source === 'phone').length;
  const urgentCount = mainMessages.filter(m => m.urgent).length;
  const deadlines = open
    .filter(t => t.due && daysUntil(t.due) <= 7)
    .sort((a, b) => a.due.localeCompare(b.due));
  const waiting = open
    .filter(t => t.waiting)
    .sort((a, b) => (a.waitingSince || '').localeCompare(b.waitingSince || ''));

  const requestsOpen = state.requestsAvailable || state.requests.length ? openRequests() : [];
  const glance = glanceStrip({
    urgentMessages: urgentCount,
    toSortMessages: q.main.length,
    requestsOpen: requestsOpen.length,
    requestsUrgent: requestsOpen.filter(r => timing(r) === 'urgent').length,
    relances: waiting.filter(t => { const d = daysSince(t.waitingSince); return d !== null && d > 5; }).length,
  });

  const status = !state.ready ? 'Chargement…'
    : state.online ? 'Synchronisé' : 'Hors ligne · copie locale';

  const focusSummary = focus.length === 0
    ? 'Choisis jusqu\'à 3 tâches pour aujourd\'hui'
    : `${active.length} à faire${doneCount ? ` · ${doneCount} faite${doneCount > 1 ? 's' : ''}` : ''}`;

  return `
  <header class="page-head">
    <h1>Bonjour Alex</h1>
    <p class="muted"><span class="first-cap">${esc(longDate())}</span> · <span class="sync ${state.online ? 'on' : ''}">${status}</span></p>
  </header>

  ${state.ready ? glance : ''}

  ${state.ready && state.online && !state.schemaV2 ? `
  <div class="notice">
    <b>Mise à jour de la base à faire.</b> Les échéances, le focus du jour et la boîte à idées ont besoin du script SQL de l'étape 1 (fichier <code>sql/2026-10-phase1.sql</code>), à exécuter une fois dans Supabase.
  </div>` : ''}

  <section class="card focus-card" aria-labelledby="focus-title">
    <div class="card-head">
      <h2 id="focus-title">Ton focus du jour</h2>
      <span class="count-pill">${active.length} / ${FOCUS_MAX}</span>
    </div>
    <p class="muted small">${focusSummary}</p>
    <div class="task-list plain">
      ${focus.map(t => taskRow(t, { focusButton: t.done ? '' : 'remove', showZone: true })).join('')}
    </div>
    ${active.length ? `<button class="btn primary wide" data-action="focus-mode">Une chose à la fois</button>` : ''}
    ${suggestions.length ? `
      <div class="suggest">
        <p class="label">Suggestions pour compléter ton focus</p>
        <div class="task-list plain">
          ${suggestions.map(t => taskRow(t, { focusButton: 'add', showZone: true })).join('')}
        </div>
      </div>` : ''}
    ${!focus.length && !suggestions.length ? `<p class="empty">Aucune tâche classée à proposer. Ouvre tes tâches et ajoute ce que tu veux avancer aujourd'hui depuis le menu d'une tâche.</p>` : ''}
  </section>

  ${weekVisible() ? weekCard() : ''}

  <div class="grid2">
    <section class="card${urgentCount ? ' has-urgent' : ''}" aria-labelledby="sort-title">
      <div class="card-head"><h2 id="sort-title">À trier</h2><span class="big-num">${q.main.length}</span></div>
      ${urgentCount ? `<p class="urgent-flag">${urgentCount} message${urgentCount > 1 ? 's' : ''} urgent${urgentCount > 1 ? 's' : ''}</p>` : ''}
      <div class="counts">
        <div><b>${mails}</b><span>mails</span></div>
        <div><b>${whatsapp}</b><span>WhatsApp</span></div>
        <div><b>${calls}</b><span>appels</span></div>
        <div><b>${toSort.length}</b><span>tâches</span></div>
      </div>
      ${q.main.length ? `<button class="btn wide" data-action="go" data-view="inbox">Trier maintenant</button>` : '<p class="muted small">Rien à trier pour l\'instant.</p>'}
      <p class="soon">${q.older.length || q.info.length ? `Aussi : ${q.older.length} plus ancien${q.older.length > 1 ? 's' : ''}, ${q.info.length} pour info. ` : ''}Pour importer tes nouveaux messages, lance « Synchroniser Prioris » dans l'application Claude.</p>
    </section>

    ${state.requestsAvailable || state.requests.length ? requestsCard() : ''}

    ${deadlines.length ? `<section class="card" aria-labelledby="due-title">
      <div class="card-head"><h2 id="due-title">Échéances</h2><span class="muted small">7 jours</span></div>
      <ul class="mini-list">
        ${deadlines.slice(0, 5).map(t => `<li><button class="link-row" data-action="edit" data-id="${t.id}">
          <span>${esc(t.c ? `${t.c} : ${t.t}` : t.t)}</span>
          <span class="chip ${daysUntil(t.due) <= 0 ? 'red' : daysUntil(t.due) <= 3 ? 'amber' : ''}">${esc(dueLabel(t.due))}</span>
        </button></li>`).join('')}
      </ul>
    </section>` : compactCard('due-title', 'Échéances', 'Aucune cette semaine')}

    ${waiting.length ? `<section class="card" aria-labelledby="wait-title">
      <div class="card-head"><h2 id="wait-title">En attente de retour</h2><span class="big-num">${waiting.length}</span></div>
      <ul class="mini-list">
        ${waiting.slice(0, 4).map(t => {
          const d = daysSince(t.waitingSince);
          return `<li><button class="link-row" data-action="edit" data-id="${t.id}">
            <span>${esc(t.c || t.t)}</span>
            <span class="${d !== null && d > 5 ? 'warn' : 'muted'} small">${d === null ? '' : d > 5 ? `${d} j · relancer ?` : `${d} j`}</span>
          </button></li>`;
        }).join('')}
      </ul>
    </section>` : compactCard('wait-title', 'En attente de retour', 'Personne ne te doit de réponse')}

    ${state.ideas.length ? `<section class="card" aria-labelledby="idea-title">
      <div class="card-head"><h2 id="idea-title">Idées</h2><span class="big-num">${state.ideas.length}</span></div>
      <ul class="mini-list">
        ${state.ideas.slice(0, 2).map(i => `<li class="idea-mini"><span>${esc(i.text)}</span><span class="muted small">${esc(shortDateTime(i.createdAt))}</span></li>`).join('')}
      </ul>
      <button class="btn wide" data-action="go" data-view="ideas">Ouvrir la boîte à idées</button>
    </section>` : compactCard('idea-title', 'Idées', 'Le bouton + les garde ici', 'ideas', 'Ouvrir')}
  </div>
  ${weekVisible() ? '' : `<p class="account"><button class="btn" data-action="week-show">Voir le bilan de la semaine</button></p>`}
  ${state.user ? `<p class="account muted small">Connecté : ${esc(state.user)} · <button class="link" data-action="sign-out">Se déconnecter</button></p>` : ''}
  ${versionAffichee() ? `<p class="account muted small">Version ${esc(versionAffichee().replace(/^prioris-/, ''))}</p>` : ''}`;
}

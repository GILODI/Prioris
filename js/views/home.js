// Accueil : focus du jour (3 tâches maximum), puis la synthèse du reste.
import { state, focusToday, activeFocus, focusSuggestions, FOCUS_MAX } from '../store.js';
import { longDate, daysUntil, daysSince, dueLabel, shortDateTime } from '../dates.js';
import { esc, taskRow } from '../ui.js';

export function renderHome() {
  const focus = focusToday();
  const active = activeFocus();
  const doneCount = focus.length - active.length;
  const room = FOCUS_MAX - active.length;
  const suggestions = room > 0 ? focusSuggestions(room) : [];

  const open = state.tasks.filter(t => !t.done);
  const toSort = open.filter(t => t.p === null && !t.waiting);
  const deadlines = open
    .filter(t => t.due && daysUntil(t.due) <= 7)
    .sort((a, b) => a.due.localeCompare(b.due));
  const waiting = open
    .filter(t => t.waiting)
    .sort((a, b) => (a.waitingSince || '').localeCompare(b.waitingSince || ''));

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
    ${!focus.length && !suggestions.length ? `<p class="empty">Rien d'urgent repéré. Ouvre tes tâches et ajoute ce que tu veux avancer aujourd'hui depuis le menu d'une tâche.</p>` : ''}
  </section>

  <div class="grid2">
    <section class="card" aria-labelledby="sort-title">
      <div class="card-head"><h2 id="sort-title">À trier</h2><span class="big-num">${toSort.length}</span></div>
      <p class="muted small">${toSort.length ? 'Tâches sans catégorie, à classer une par une.' : 'Tout est classé.'}</p>
      ${toSort.length ? `<button class="btn wide" data-action="go" data-view="inbox">Trier maintenant</button>` : ''}
      <p class="soon">Bientôt : tes mails et tes messages WhatsApp arriveront aussi ici.</p>
    </section>

    <section class="card" aria-labelledby="due-title">
      <div class="card-head"><h2 id="due-title">Échéances</h2><span class="muted small">7 jours</span></div>
      ${deadlines.length ? `<ul class="mini-list">
        ${deadlines.slice(0, 5).map(t => `<li><button class="link-row" data-action="edit" data-id="${t.id}">
          <span>${esc(t.c ? `${t.c} : ${t.t}` : t.t)}</span>
          <span class="chip ${daysUntil(t.due) <= 0 ? 'red' : daysUntil(t.due) <= 3 ? 'amber' : ''}">${esc(dueLabel(t.due))}</span>
        </button></li>`).join('')}
      </ul>` : '<p class="empty">Aucune échéance cette semaine.</p>'}
    </section>

    <section class="card" aria-labelledby="wait-title">
      <div class="card-head"><h2 id="wait-title">En attente de retour</h2><span class="big-num">${waiting.length}</span></div>
      ${waiting.length ? `<ul class="mini-list">
        ${waiting.slice(0, 4).map(t => {
          const d = daysSince(t.waitingSince);
          return `<li><button class="link-row" data-action="edit" data-id="${t.id}">
            <span>${esc(t.c || t.t)}</span>
            <span class="${d !== null && d > 5 ? 'warn' : 'muted'} small">${d === null ? '' : d > 5 ? `${d} j · relancer ?` : `${d} j`}</span>
          </button></li>`;
        }).join('')}
      </ul>` : '<p class="empty">Personne ne te doit de réponse.</p>'}
    </section>

    <section class="card" aria-labelledby="idea-title">
      <div class="card-head"><h2 id="idea-title">Idées</h2><span class="big-num">${state.ideas.length}</span></div>
      ${state.ideas.length ? `<ul class="mini-list">
        ${state.ideas.slice(0, 2).map(i => `<li class="idea-mini"><span>${esc(i.text)}</span><span class="muted small">${esc(shortDateTime(i.createdAt))}</span></li>`).join('')}
      </ul>` : '<p class="empty">Une idée en tête ? Le bouton + la garde ici, sans l\'ajouter à tes tâches.</p>'}
      <button class="btn wide" data-action="go" data-view="ideas">Ouvrir la boîte à idées</button>
    </section>
  </div>
  ${state.user ? `<p class="account muted small">Connecté : ${esc(state.user)} · <button class="link" data-action="sign-out">Se déconnecter</button></p>` : ''}`;
}

// À trier : une tâche à la fois, une décision en un geste.
// Étape 1 : les tâches sans catégorie. Étape 2 : les mails et messages WhatsApp.
import { state, sortForZone } from '../store.js';
import { shortDateTime } from '../dates.js';
import { esc, ZONES, dueChip, waitingChip } from '../ui.js';

const skipped = [];   // tâches passées pendant cette session : elles reviennent en fin de file

export function skipTask(id) { if (!skipped.includes(id)) skipped.push(id); }

export function inboxQueue() {
  const list = sortForZone(state.tasks.filter(t => !t.done && t.p === null && !t.waiting));
  return [...list.filter(t => !skipped.includes(t.id)), ...list.filter(t => skipped.includes(t.id))];
}

export function renderInbox() {
  const queue = inboxQueue();
  const head = `
  <header class="page-head">
    <h1>À trier</h1>
    <p class="muted">${queue.length ? `${queue.length} tâche${queue.length > 1 ? 's' : ''} sans catégorie` : 'Rien à trier'}</p>
  </header>`;

  if (!queue.length) {
    return head + `
    <section class="card center">
      <p class="done-big">Tout est classé.</p>
      <p class="muted">Les nouvelles tâches dictées sans catégorie arriveront ici. Bientôt, tes mails et messages WhatsApp aussi.</p>
      <button class="btn" data-action="go" data-view="tasks">Voir mes tâches</button>
    </section>`;
  }

  const t = queue[0];
  const position = skipped.includes(t.id) ? 'déjà passée une fois' : `1 sur ${queue.length}`;
  return head + `
  <section class="card triage" aria-label="Tâche à trier">
    <div class="triage-meta"><span class="chip">Tâche</span><span class="muted small">${t.createdAt ? `ajoutée ${esc(shortDateTime(t.createdAt))} · ` : ''}${position}</span></div>
    ${t.c ? `<p class="triage-contact">${esc(t.c)}</p>` : ''}
    <p class="triage-text">${t.t ? esc(t.t) : '<em>sans description</em>'}</p>
    <div class="chips">${dueChip(t.due)}${waitingChip(t)}${t.star ? '<span class="chip red">étoile</span>' : ''}</div>

    <p class="label">Dans quelle catégorie ?</p>
    <div class="zone-buttons">
      ${ZONES.filter(z => z.id !== null).map(z => `
        <button class="zone-btn ${z.cls}" data-action="triage-cat" data-id="${t.id}" data-p="${z.id}">
          <b>${z.id}</b><span>${esc(z.label)}</span>
        </button>`).join('')}
    </div>

    <div class="triage-extra">
      <label class="inline-field">Échéance
        <input type="date" id="triage-due" data-action="triage-due" data-id="${t.id}" value="${t.due || ''}">
      </label>
      <button class="btn" data-action="triage-wait" data-id="${t.id}">En attente d'une réponse</button>
    </div>

    <div class="triage-foot">
      <button class="btn ghost" data-action="edit" data-id="${t.id}">Modifier</button>
      <button class="btn ghost danger" data-action="triage-delete" data-id="${t.id}">Supprimer</button>
      <span class="spacer"></span>
      <button class="btn" data-action="triage-skip" data-id="${t.id}">Passer</button>
    </div>
  </section>
  <p class="soon center">Étape 2 : tes mails et messages WhatsApp arriveront ici, résumés, avec une proposition de catégorie et un brouillon de réponse.</p>`;
}

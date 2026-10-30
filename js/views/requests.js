// Demandes : sponsoring, lots et dotations, visuels (trade marketing).
// Une demande reste affichée tant qu'elle n'est pas close, avec une date limite de réponse
// (15 jours avant l'événement), puis rejoint l'historique avec son issue.
import { state } from '../store.js';
import { today, addDays, daysUntil, dueLabel, agoLabel } from '../dates.js';
import { esc } from '../ui.js';
import { normWord } from '../parse.js';

export const LEAD_DAYS = 15;     // répondre au plus tard 15 jours avant l'événement
export const LATE_DAYS = 7;      // à 7 jours de l'événement, c'est déjà tard
const NO_EVENT_DAYS = 7;         // sans date d'événement : répondre dans la semaine

export const KINDS = [
  { id: 'sponsoring', label: 'Sponsoring', one: 'demande de sponsoring' },
  { id: 'lots', label: 'Lots et dotations', short: 'Lots', one: 'demande de lots' },
  { id: 'visuel', label: 'Visuels', one: 'demande de visuel' },
];
export const kindOf = id => KINDS.find(k => k.id === id) || KINDS[0];

const OPEN = ['new', 'pending'];
export function statusLabel(r) {
  return { new: 'À répondre', pending: 'En cours', yes: r.kind === 'visuel' ? 'Envoyé' : 'Accepté', no: 'Refusé', done: 'Traitée avant Prioris' }[r.status] || r.status;
}
export const isOpen = r => OPEN.includes(r.status);

// Date limite de réponse : celle du message (ou saisie), sinon 15 jours avant l'événement,
// sinon une semaine après réception.
export function replyBy(r) {
  if (r.replyBy) return r.replyBy;
  if (r.eventDate) return addDays(r.eventDate, -LEAD_DAYS);
  if (r.receivedOn) return addDays(r.receivedOn, NO_EVENT_DAYS);
  return null;
}

// État d'une demande ouverte : 'past' (événement passé), 'stale' (ancienne, sans événement),
// 'urgent' (date limite dans 2 jours ou dépassée, ou événement dans 7 jours), sinon 'ok'.
export function timing(r) {
  if (!isOpen(r)) return 'closed';
  const ev = daysUntil(r.eventDate);
  if (ev !== null && ev < 0) return 'past';
  const n = daysUntil(replyBy(r));
  if (!r.eventDate && !r.replyBy && n !== null && n < -21) return 'stale';
  if ((n !== null && n <= 2) || (ev !== null && ev <= LATE_DAYS)) return 'urgent';
  return 'ok';
}

export function urgentRequests() { return state.requests.filter(r => timing(r) === 'urgent'); }

const RANK = { urgent: 0, ok: 1, stale: 2, past: 3 };
function byDeadline(a, b) {
  return (RANK[timing(a)] - RANK[timing(b)]) || (replyBy(a) || '9999').localeCompare(replyBy(b) || '9999');
}
const byReceived = (a, b) => (b.receivedOn || '').localeCompare(a.receivedOn || '');

// Demandes ouvertes, de la plus pressée à la moins pressée.
export function openRequests(kind = 'all') {
  return state.requests.filter(r => isOpen(r) && (kind === 'all' || r.kind === kind)).sort(byDeadline);
}

// Autres demandes de la même structure (ou de la même personne) : « déjà refusé le … ».
const who = r => normWord(r.organization || r.requester || '').trim();
export function previousOf(r) {
  const key = who(r);
  if (!key) return [];
  return state.requests.filter(x => x.id !== r.id && who(x) === key).sort(byReceived);
}

export function requestForInbox(inboxId) { return state.requests.find(r => r.inboxId === inboxId); }

// --- Écran ---

let tab = 'sponsoring';
let filter = 'open';
let search = '';
(function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('prioris_v2_requests') || 'null');
    if (p) { tab = p.tab || tab; filter = p.filter || filter; }
  } catch (e) {}
})();
function savePrefs() { try { localStorage.setItem('prioris_v2_requests', JSON.stringify({ tab, filter })); } catch (e) {} }

export function setRequestsTab(t) { tab = t; savePrefs(); }
export function setRequestsFilter(f) { filter = f; savePrefs(); }
export function setRequestsSearch(s) { search = s; }

function shown() {
  const inTab = state.requests.filter(r => r.kind === tab);
  const list = filter === 'open' ? inTab.filter(isOpen).sort(byDeadline)
    : filter === 'promising' ? inTab.filter(r => r.promising).sort(byReceived)
    : filter === 'closed' ? inTab.filter(r => !isOpen(r)).sort(byReceived)
    : [...inTab].sort(byReceived);
  if (!search) return list;
  const q = normWord(search);
  return list.filter(r => normWord(`${r.organization} ${r.requester} ${r.contactEmail || ''} ${r.eventName} ${r.ask} ${r.summary} ${r.notes}`).includes(q));
}

export function renderRequests() {
  const open = openRequests();
  const urgent = open.filter(r => timing(r) === 'urgent').length;
  const inTab = state.requests.filter(r => r.kind === tab);
  const filters = [
    ['open', 'À répondre', inTab.filter(isOpen).length],
    ['promising', '★ Intéressants', inTab.filter(r => r.promising).length],
    ['closed', 'Historique', inTab.filter(r => !isOpen(r)).length],
    ['all', 'Tout', inTab.length],
  ];
  return `
  <header class="page-head head-row">
    <div>
      <h1>Demandes</h1>
      <p class="muted">${open.length ? `${open.length} à répondre${urgent ? ` · <b class="warn-red">${urgent} urgente${urgent > 1 ? 's' : ''}</b>` : ''}` : 'Aucune demande en attente'} · réponse au plus tard ${LEAD_DAYS} j avant l'événement</p>
    </div>
    <button class="btn primary" data-action="request-new">+ Nouvelle</button>
  </header>
  ${!state.requestsAvailable && state.online ? `<p class="notice">L'espace Demandes s'activera après la mise à jour de la base (script <code>sql/2026-10-demandes.sql</code>).</p>` : ''}
  <div class="segmented" role="tablist" aria-label="Type de demande">
    ${KINDS.map(k => {
      const n = openRequests(k.id).length;
      const u = openRequests(k.id).filter(r => timing(r) === 'urgent').length;
      return `<button role="tab" aria-selected="${tab === k.id}" class="${tab === k.id ? 'on' : ''}" data-action="requests-tab" data-tab="${k.id}">${esc(k.short || k.label)} <span class="n${u ? ' n-red' : ''}">${n}</span></button>`;
    }).join('')}
  </div>
  <div class="pills" role="group" aria-label="Filtre">
    ${filters.map(([k, label, n]) => `<button class="pill${filter === k ? ' on' : ''}" aria-pressed="${filter === k}" data-action="requests-filter" data-filter="${k}">${label} ${n}</button>`).join('')}
  </div>
  <label class="search-field"><span class="sr-only">Rechercher</span>
    <input id="requests-search" type="search" placeholder="Rechercher un club, un magasin, un événement…" value="${esc(search)}" autocomplete="off">
  </label>
  <div id="requests-list">${listHtml()}</div>`;
}

export function refreshRequestsList() {
  const el = document.getElementById('requests-list');
  if (el) el.innerHTML = listHtml();
}

function listHtml() {
  const list = shown();
  if (!list.length) {
    if (search) return `<p class="empty card">Aucun résultat pour « ${esc(search)} ».</p>`;
    const msg = filter === 'open' ? 'Aucune demande en attente ici.' : filter === 'promising' ? 'Aucune demande marquée intéressante. Ouvre une demande et coche « Intéressant ».' : 'Rien pour l\'instant.';
    return `<section class="card center"><p class="muted">${msg}</p></section>`;
  }
  return `<ul class="msg-list">${list.map(rowHtml).join('')}</ul>`;
}

export function deadlineChip(r) {
  const t = timing(r);
  if (t === 'closed') return `<span class="chip ${r.status === 'yes' ? 'zone z0' : ''}">${esc(statusLabel(r))}</span>`;
  if (t === 'past') return '<span class="chip">événement passé · à classer</span>';
  const d = replyBy(r);
  if (!d) return '';
  const n = daysUntil(d);
  const label = n < 0 ? `réponse en retard de ${-n} j` : `répondre ${n <= 1 ? dueLabel(d) : `avant ${dueLabel(d)}`}`;
  return `<span class="chip ${t === 'urgent' ? 'red' : n <= 7 ? 'amber' : ''}">${esc(label)}</span>`;
}

function eventLine(r) {
  const parts = [];
  if (r.eventName) parts.push(esc(r.eventName));
  if (r.eventDate) parts.push(`le ${esc(new Date(r.eventDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }))}`);
  return parts.join(' ');
}

function rowHtml(r) {
  const t = timing(r);
  const prev = previousOf(r);
  const refused = prev.find(x => x.status === 'no');
  return `<li><button class="msg-row${t === 'urgent' ? ' is-urgent' : ''}" data-action="request-open" data-id="${r.id}">
    <span class="row-top">
      <b>${esc(r.organization || r.requester || 'Demandeur inconnu')}</b>
      ${r.promising ? '<span class="chip violet">★ intéressant</span>' : ''}
      <span class="row-date">${deadlineChip(r)}</span>
    </span>
    ${eventLine(r) ? `<span class="small">${eventLine(r)}</span>` : ''}
    ${r.ask || r.summary ? `<span class="row-sum">${esc(r.ask || r.summary)}</span>` : ''}
    <span class="chips">
      ${r.status === 'pending' ? '<span class="chip amber">en cours</span>' : ''}
      ${refused ? `<span class="chip">déjà refusé ${esc(agoLabel(refused.receivedOn || today()))}</span>` : prev.length ? `<span class="chip">${prev.length} autre${prev.length > 1 ? 's' : ''} demande${prev.length > 1 ? 's' : ''}</span>` : ''}
      ${r.receivedOn ? `<span class="muted small">reçue ${esc(agoLabel(r.receivedOn))}</span>` : ''}
    </span>
  </button></li>`;
}

// --- Fiche d'une demande (consultation + modification) ---

const fmtDate = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export function requestSheetHtml(r, isNew = false) {
  const prev = isNew ? [] : previousOf(r);
  const t = timing(r);
  const computed = !r.replyBy && replyBy(r);
  const statuses = ['new', 'pending', 'yes', 'no', ...(r.status === 'done' ? ['done'] : [])];
  return `
  <form class="sheet item-sheet" data-form="request" data-id="${isNew ? 'new' : r.id}" role="dialog" aria-modal="true" aria-labelledby="req-title">
    <h2 id="req-title">${isNew ? 'Nouvelle demande' : esc(r.organization || r.requester || 'Demande')}</h2>
    ${!isNew && t === 'urgent' ? `<p class="urgent-flag">Urgent · ${esc(urgencyText(r))}</p>` : ''}
    ${!isNew ? `<p class="muted small">${r.source === 'manuel' ? 'Saisie à la main' : r.source === 'whatsapp' ? 'WhatsApp' : r.source === 'instagram' ? 'Instagram' : r.source === 'phone' ? 'Appel' : 'Mail'}${r.receivedOn ? ` · reçue le ${esc(fmtDate(r.receivedOn))}` : ''}</p>` : ''}
    ${!isNew && r.contactEmail ? `
    <p class="email-line"><span class="email" id="req-email-${r.id}">${esc(r.contactEmail)}</span>
      <button type="button" class="btn small-btn" data-action="copy-draft" data-target="req-email-${r.id}" data-toast="Adresse copiée : colle-la dans la recherche de ta messagerie.">Copier l'adresse</button></p>` : ''}
    ${r.summary ? `<p class="triage-text small-text">${esc(r.summary)}</p>` : ''}
    ${r.draft ? `
    <div class="draft-block">
      <p class="label">Brouillon de réponse</p>
      <p class="draft" id="req-draft-${r.id}">${esc(r.draft)}</p>
      <button type="button" class="btn small-btn" data-action="copy-draft" data-target="req-draft-${r.id}">Copier la réponse</button>
    </div>` : ''}
    ${prev.length ? `
    <div class="history-block">
      <p class="label">Déjà reçu de leur part</p>
      <ul class="mini-list">${prev.slice(0, 5).map(x => `<li><button type="button" class="link-row" data-action="request-open" data-id="${x.id}">
        <span>${esc(fmtDate(x.receivedOn))} · ${esc(kindOf(x.kind).short || kindOf(x.kind).label)}${x.eventName ? ` · ${esc(x.eventName)}` : ''}</span>
        <span class="chip${x.status === 'no' ? ' red' : x.status === 'yes' ? ' zone z0' : ''}">${esc(statusLabel(x))}${x.promising ? ' ★' : ''}</span>
      </button></li>`).join('')}</ul>
    </div>` : ''}

    <fieldset class="choice">
      <legend>Type</legend>
      ${KINDS.map(k => `<label><input type="radio" name="kind" value="${k.id}"${r.kind === k.id ? ' checked' : ''}><span>${esc(k.label)}</span></label>`).join('')}
    </fieldset>
    <fieldset class="choice">
      <legend>Où en est-elle ?</legend>
      ${statuses.map(s => `<label><input type="radio" name="status" value="${s}"${r.status === s ? ' checked' : ''}><span>${esc(statusLabel({ ...r, status: s }))}</span></label>`).join('')}
    </fieldset>
    <label class="switch"><input type="checkbox" name="promising"${r.promising ? ' checked' : ''}><span>★ Intéressant, à garder en tête (même si refusé)</span></label>

    <div class="form-grid">
      <label class="field">Structure <span class="optional">club, magasin, athlète…</span><input name="organization" type="text" value="${esc(r.organization)}" autocomplete="off"></label>
      <label class="field">Contact <input name="requester" type="text" value="${esc(r.requester)}" autocomplete="off"></label>
      <label class="field">Adresse mail <span class="optional">pour retrouver le mail</span><input name="contactEmail" type="email" value="${esc(r.contactEmail || '')}" autocomplete="off" placeholder="nom@exemple.fr"></label>
      <label class="field">Événement <input name="eventName" type="text" value="${esc(r.eventName)}" autocomplete="off"></label>
      <label class="field">Date de l'événement <input name="eventDate" type="date" value="${r.eventDate || ''}"></label>
      <label class="field">Répondre avant <span class="optional">${computed ? `sinon ${esc(fmtDate(computed))}, calculé` : 'facultatif'}</span><input name="replyBy" type="date" value="${r.replyBy || ''}"></label>
    </div>
    <label class="field">Ce qui est demandé <textarea name="ask" rows="2">${esc(r.ask)}</textarea></label>
    <label class="field">Notes <span class="optional">ce qui a été accordé, pourquoi refusé…</span><textarea name="notes" rows="2">${esc(r.notes)}</textarea></label>
    ${isNew && r.inboxId ? `<input type="hidden" name="inboxId" value="${r.inboxId}">` : ''}

    <div class="sheet-actions">
      ${isNew ? '' : `<button type="button" class="btn" data-action="request-task" data-id="${r.id}">Créer une tâche</button>`}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-action="close-sheet">Annuler</button>
      <button type="submit" class="btn primary">${isNew ? 'Ajouter' : 'Enregistrer'}</button>
    </div>
  </form>`;
}

export function urgencyText(r) {
  const ev = daysUntil(r.eventDate);
  const n = daysUntil(replyBy(r));
  if (ev !== null && ev <= LATE_DAYS) return ev === 0 ? 'l\'événement a lieu aujourd\'hui' : `l'événement a lieu ${dueLabel(r.eventDate)}`;
  if (n !== null && n < 0) return `réponse attendue depuis ${-n} j`;
  return `réponse à donner ${dueLabel(replyBy(r))}`;
}

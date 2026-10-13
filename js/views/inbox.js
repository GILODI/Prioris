// À trier : messages (mails, WhatsApp) et tâches sans catégorie.
// Deux façons de travailler : « Une à la fois » (pour trier sans se disperser) ou « Liste »
// (pour naviguer et chercher dans tout). Filtre Tout / Mails / WhatsApp.
// Quatre files : À traiter (urgents + 7 derniers jours + tâches sans catégorie),
// Plus anciens, Pour info, Historique (messages déjà traités).
import { state, sortForZone } from '../store.js';
import { shortDateTime, addDays, today, dueLabel, agoLabel } from '../dates.js';
import { esc, ZONES, zoneOf, dueChip, waitingChip } from '../ui.js';
import { normWord } from '../parse.js';

const skipped = [];   // éléments passés pendant cette session : ils reviennent en fin de file
let tab = 'main';
let search = '';
const prefs = loadPrefs();

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('prioris_v2_inbox') || 'null') || { mode: 'one', source: 'all' }; }
  catch (e) { return { mode: 'one', source: 'all' }; }
}
function savePrefs() { try { localStorage.setItem('prioris_v2_inbox', JSON.stringify(prefs)); } catch (e) {} }

export function getInboxTab() { return tab; }
export function setInboxTab(t) { tab = t; }
export function setInboxMode(m) { prefs.mode = m; savePrefs(); }
export function setInboxSource(s) { prefs.source = s; savePrefs(); }
export function setInboxSearch(s) { search = s; }
export function skipItem(key) { if (!skipped.includes(key)) skipped.push(key); }

function byDateDesc(a, b) { return (b.receivedOn || '').localeCompare(a.receivedOn || ''); }
const msg = i => ({ kind: 'msg', key: 'm' + i.id, item: i });

// Files d'attente, filtrées par source. Les tâches sans catégorie n'apparaissent qu'avec « Tout ».
export function queues(source = 'all') {
  const cut = addDays(today(), -7);
  const messages = state.inbox.filter(i => source === 'all' || i.source === source);
  const recent = i => !i.receivedOn || i.receivedOn >= cut;
  const main = messages.filter(i => i.needsAction && (i.urgent || recent(i)))
    .sort((a, b) => (b.urgent - a.urgent) || byDateDesc(a, b)).map(msg);
  const tasks = source !== 'all' ? [] : sortForZone(state.tasks.filter(t => !t.done && t.p === null && !t.waiting))
    .map(t => ({ kind: 'task', key: 't' + t.id, item: t }));
  const older = messages.filter(i => i.needsAction && !i.urgent && !recent(i)).sort(byDateDesc).map(msg);
  const info = messages.filter(i => !i.needsAction).sort(byDateDesc).map(msg);
  const history = (state.inboxHistory || []).filter(i => source === 'all' || i.source === source)
    .sort(byDateDesc).map(i => ({ kind: 'done', key: 'h' + i.id, item: i }));
  return { main: [...main, ...tasks], older, info, history };
}

function ordered(list) {
  return [...list.filter(e => !skipped.includes(e.key)), ...list.filter(e => skipped.includes(e.key))];
}

function matches(e, q) {
  if (!q) return true;
  const it = e.item;
  const hay = e.kind === 'task' ? `${it.c} ${it.t}` : `${it.sender} ${it.subject} ${it.summary} ${it.action}`;
  return normWord(hay).includes(normWord(q));
}

export function findEntry(key) {
  const q = queues('all');
  return [...q.main, ...q.older, ...q.info, ...q.history].find(e => e.key === key);
}

// --- Écran ---

export function renderInbox() {
  const q = queues(prefs.source);
  const listMode = prefs.mode === 'list' || tab === 'history';
  const tabs = [
    ['main', 'À traiter', q.main.length],
    ['older', 'Plus anciens', q.older.length],
    ['info', 'Pour info', q.info.length],
    ['history', 'Historique', state.inboxHistory ? q.history.length : '…'],
  ];
  const sources = [['all', 'Tout'], ['mail', 'Mails'], ['whatsapp', 'WhatsApp']];

  let html = `
  <header class="page-head">
    <h1>À trier</h1>
    <p class="muted">${q.main.length ? `${q.main.length} élément${q.main.length > 1 ? 's' : ''} à traiter` : 'Rien d\'urgent à trier'}${lastSync()}</p>
  </header>
  <div class="segmented" role="tablist" aria-label="Files">
    ${tabs.map(([k, label, n]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-action="inbox-tab" data-tab="${k}">${label} <span class="n">${n}</span></button>`).join('')}
  </div>
  <div class="toolbar">
    <div class="pills" role="group" aria-label="Source">
      ${sources.map(([k, label]) => `<button class="pill${prefs.source === k ? ' on' : ''}" aria-pressed="${prefs.source === k}" data-action="inbox-source" data-source="${k}">${label}</button>`).join('')}
    </div>
    ${tab === 'history' ? '' : `
    <div class="pills" role="group" aria-label="Affichage">
      <button class="pill${!listMode ? ' on' : ''}" aria-pressed="${!listMode}" data-action="inbox-mode" data-mode="one">Une à la fois</button>
      <button class="pill${listMode ? ' on' : ''}" aria-pressed="${listMode}" data-action="inbox-mode" data-mode="list">Liste</button>
    </div>`}
  </div>
  ${!state.inboxAvailable && state.online ? `<p class="notice">Les mails et messages WhatsApp arriveront ici après la mise à jour de la base et ta première synchronisation.</p>` : ''}`;

  if (tab === 'history' && state.inboxHistory === null) {
    return html + `<section class="card center"><p class="muted">Chargement de l'historique…</p></section>`;
  }

  if (listMode) {
    return html + `
    <label class="search-field"><span class="sr-only">Rechercher</span>
      <input id="inbox-search" type="search" placeholder="Rechercher un expéditeur, un sujet…" value="${esc(search)}" autocomplete="off">
    </label>
    <div id="inbox-list">${listHtml(q[tab])}</div>`;
  }

  const list = ordered(q[tab]);
  if (!list.length) return html + emptyHtml();
  const entry = list[0];
  const position = skipped.includes(entry.key) ? 'déjà passé une fois' : `1 sur ${list.length}`;
  return html + (entry.kind === 'msg' ? messageCard(entry.item, position) : taskCard(entry.item, position));
}

// Met à jour la seule liste (pendant la recherche, sans perdre la saisie).
export function refreshInboxList() {
  const el = document.getElementById('inbox-list');
  if (!el) return;
  el.innerHTML = listHtml(queues(prefs.source)[tab]);
}

function emptyHtml() {
  const empty = {
    main: 'Rien à traiter. Les nouveaux messages arriveront à ta prochaine synchronisation.',
    older: 'Aucun message ancien en attente.',
    info: 'Aucun message pour info.',
    history: 'Aucun message traité pour l\'instant.',
  }[tab];
  return `<section class="card center"><p class="done-big">Tout est trié.</p><p class="muted">${empty}</p></section>`;
}

function listHtml(entries) {
  const shown = entries.filter(e => matches(e, search));
  if (!entries.length) return emptyHtml();
  if (!shown.length) return `<p class="empty card">Aucun résultat pour « ${esc(search)} ».</p>`;
  return `<p class="muted small">${shown.length} élément${shown.length > 1 ? 's' : ''}</p>
  <ul class="msg-list">${shown.map(rowHtml).join('')}</ul>`;
}

function rowHtml(e) {
  const it = e.item;
  if (e.kind === 'task') {
    return `<li><button class="msg-row" data-action="edit" data-id="${it.id}">
      <span class="row-top"><span class="chip">Tâche</span><b>${esc(it.c || 'Sans contact')}</b></span>
      <span class="row-sum">${esc(it.t || 'sans description')}</span>
    </button></li>`;
  }
  const status = e.kind === 'done'
    ? `<span class="chip ${it.status === 'task' ? 'zone z0' : ''}">${it.status === 'task' ? 'tâche créée' : 'classé sans tâche'}</span>` : '';
  return `<li><button class="msg-row${it.urgent && e.kind !== 'done' ? ' is-urgent' : ''}" data-action="open-entry" data-key="${e.key}">
    <span class="row-top">
      <span class="chip src-${it.source}">${it.source === 'whatsapp' ? 'WhatsApp' : 'Mail'}</span>
      ${it.urgent && e.kind !== 'done' ? '<span class="chip red">urgent</span>' : ''}
      <b>${esc(it.sender || 'Expéditeur inconnu')}</b>
      <span class="muted small row-date">${it.receivedOn ? esc(agoLabel(it.receivedOn)) : ''}</span>
    </span>
    <span class="row-sum">${esc(it.summary || it.subject || '—')}</span>
    ${status}
  </button></li>`;
}

// Carte d'un élément ouvert depuis la liste (affichée dans une fenêtre).
export function entrySheetHtml(key) {
  const e = findEntry(key);
  if (!e) return null;
  if (e.kind === 'done') return historyCard(e.item);
  return messageCard(e.item, '', true);
}

function lastSync() {
  const last = state.inbox.map(i => i.createdAt).filter(Boolean).sort().pop();
  return last ? ` · dernier import ${esc(shortDateTime(last))}` : '';
}

function zoneButtons(action, id, proposed) {
  return `<div class="zone-buttons">
    ${ZONES.filter(z => z.id !== null).map(z => `
      <button class="zone-btn ${z.cls}${proposed === z.id ? ' proposed' : ''}" data-action="${action}" data-id="${id}" data-p="${z.id}">
        <b>${z.id}</b><span>${esc(z.label)}</span>${proposed === z.id ? '<em>proposé</em>' : ''}
      </button>`).join('')}
  </div>`;
}

function messageBody(m) {
  return `
    ${m.urgent ? `<p class="urgent-flag">Urgent${m.urgencyReason ? ` · ${esc(m.urgencyReason)}` : ''}</p>` : ''}
    <p class="triage-contact">${esc(m.sender || 'Expéditeur inconnu')}</p>
    ${m.subject ? `<p class="muted">${esc(m.subject)}</p>` : ''}
    <p class="triage-text">${esc(m.summary || '—')}</p>`;
}

function draftHtml(m) {
  if (!m.draft) return '';
  return `
    <div class="draft-block">
      <p class="label">Brouillon de réponse</p>
      <p class="draft" id="draft-${m.id}">${esc(m.draft)}</p>
      <button class="btn small-btn" data-action="copy-draft" data-target="draft-${m.id}">Copier la réponse</button>
    </div>`;
}

function messageCard(m, position, inSheet = false) {
  const sourceLabel = m.source === 'whatsapp' ? 'WhatsApp' : 'Mail';
  return `
  <section class="${inSheet ? '' : 'card '}triage${m.urgent ? ' is-urgent' : ''}" aria-label="Message à trier">
    <div class="triage-meta">
      <span class="chip src-${m.source}">${sourceLabel}</span>
      <span class="muted small">${m.receivedOn ? `reçu ${esc(agoLabel(m.receivedOn))}` : ''}${position ? ` · ${position}` : ''}</span>
    </div>
    ${messageBody(m)}

    ${m.needsAction ? `
    <div class="proposal">
      <p class="label">Proposition</p>
      ${m.action ? `<p><b>Action :</b> ${esc(m.action)}</p>` : ''}
      <p><b>Catégorie :</b> ${m.p === null ? 'à choisir' : `${m.p} · ${esc(zoneOf(m.p).label)}`}${m.due ? ` · <b>échéance</b> ${esc(dueLabel(m.due))}` : ''}</p>
    </div>` : `<p class="muted small">Pour info : aucune action proposée. Tu peux l'archiver, ou en faire une tâche si besoin.</p>`}

    ${draftHtml(m)}

    <p class="label">Créer la tâche dans</p>
    ${zoneButtons('inbox-task', m.id, m.p)}

    <div class="triage-extra">
      <button class="btn" data-action="inbox-wait" data-id="${m.id}" data-p="${m.p ?? 3}">J'attends une réponse</button>
    </div>
    <div class="triage-foot">
      <button class="btn ghost" data-action="inbox-ignore" data-id="${m.id}">${m.needsAction ? 'Pas de tâche' : 'Archiver'}</button>
      ${inSheet ? '' : `<span class="spacer"></span><button class="btn" data-action="triage-skip" data-key="m${m.id}">Passer</button>`}
    </div>
  </section>`;
}

function historyCard(m) {
  return `
  <section class="triage" aria-label="Message déjà traité">
    <div class="triage-meta">
      <span class="chip src-${m.source}">${m.source === 'whatsapp' ? 'WhatsApp' : 'Mail'}</span>
      <span class="chip">${m.status === 'task' ? 'tâche créée' : 'classé sans tâche'}</span>
      <span class="muted small">${m.receivedOn ? `reçu ${esc(agoLabel(m.receivedOn))}` : ''}</span>
    </div>
    ${messageBody(m)}
    ${m.action ? `<p><b>Action proposée :</b> ${esc(m.action)}</p>` : ''}
    ${draftHtml(m)}
    <div class="triage-foot">
      <span class="spacer"></span>
      <button class="btn" data-action="inbox-restore" data-id="${m.id}">Remettre à trier</button>
    </div>
  </section>`;
}

function taskCard(t, position) {
  return `
  <section class="card triage" aria-label="Tâche à trier">
    <div class="triage-meta"><span class="chip">Tâche</span><span class="muted small">${t.createdAt ? `ajoutée ${esc(shortDateTime(t.createdAt))} · ` : ''}${position}</span></div>
    ${t.c ? `<p class="triage-contact">${esc(t.c)}</p>` : ''}
    <p class="triage-text">${t.t ? esc(t.t) : '<em>sans description</em>'}</p>
    <div class="chips">${dueChip(t.due)}${waitingChip(t)}${t.star ? '<span class="chip red">étoile</span>' : ''}</div>
    <p class="label">Dans quelle catégorie ?</p>
    ${zoneButtons('triage-cat', t.id, null)}
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
      <button class="btn" data-action="triage-skip" data-key="t${t.id}">Passer</button>
    </div>
  </section>`;
}

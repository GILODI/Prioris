// À trier : messages (mails, WhatsApp) et tâches sans catégorie.
// Deux façons de travailler : « Une à la fois » (pour trier sans se disperser) ou « Liste »
// (pour naviguer et chercher dans tout). Filtre Tout / Mails / WhatsApp.
// Quatre files : À traiter (urgents + 7 derniers jours + tâches sans catégorie),
// Plus anciens, Pour info, Historique (messages déjà traités).
import { state, sortForZone, senderRule } from '../store.js';
import { shortDateTime, addDays, today, dueLabel, agoLabel, daysUntil } from '../dates.js';
import { esc, ZONES, zoneOf, dueChip, waitingChip } from '../ui.js';
import { normWord } from '../parse.js';
import { requestForInbox, kindOf } from './requests.js';

const skipped = [];   // éléments passés pendant cette session : ils reviennent en fin de file
let tab = 'main';
let search = '';
const prefs = loadPrefs();

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('prioris_v2_inbox') || 'null') || { mode: 'one', source: 'all' }; }
  catch (e) { return { mode: 'one', source: 'all' }; }
}
function savePrefs() { try { localStorage.setItem('prioris_v2_inbox', JSON.stringify(prefs)); } catch (e) {} }

// Mode sélection (liste) : cocher plusieurs messages pour les archiver ou les remettre à trier d'un coup.
let selecting = false;
const selected = new Set();

export function getInboxTab() { return tab; }
export function setInboxTab(t) { tab = t; clearSelection(); }
export function setInboxMode(m) { prefs.mode = m; savePrefs(); clearSelection(); }
export function setInboxSource(s) { prefs.source = s; savePrefs(); clearSelection(); }
export function isSelecting() { return selecting; }
export function startSelecting() { selecting = true; selected.clear(); }
export function clearSelection() { selecting = false; selected.clear(); }
export function toggleSelected(id) { if (selected.has(id)) selected.delete(id); else selected.add(id); }
export function selectedIds() { return [...selected]; }
// Tout sélectionner / tout désélectionner, parmi les messages affichés (filtre et recherche compris).
export function toggleSelectAll() {
  const ids = visibleEntries().filter(e => e.kind !== 'task').map(e => e.item.id);
  const all = ids.length && ids.every(id => selected.has(id));
  selected.clear();
  if (!all) ids.forEach(id => selected.add(id));
}

function visibleEntries() { return queues(prefs.source)[tab].filter(e => matches(e, search)); }

// Message à ouvrir après une action faite depuis la liste : le suivant dans la file affichée
// (même onglet, même filtre, même recherche), ou le précédent si c'était le dernier.
// À appeler avant l'action, tant que le message est encore dans la file.
export function nextEntryKey(key) {
  const list = visibleEntries().filter(e => e.kind !== 'task');
  const i = list.findIndex(e => e.key === key);
  if (i < 0) return null;
  const next = list[i + 1] || list[i - 1];
  return next ? next.key : null;
}
export function inboxTabLabel() {
  return { main: 'À traiter', older: 'Plus anciens', info: 'Pour info', history: 'Historique' }[tab];
}
export function setInboxSearch(s) { search = s; }
export function skipItem(key) { if (!skipped.includes(key)) skipped.push(key); }

function byDateDesc(a, b) { return (b.receivedOn || '').localeCompare(a.receivedOn || ''); }
const msg = i => ({ kind: 'msg', key: 'm' + i.id, item: i });

// Urgence : marquée à la synchronisation (« à traiter en urgence » dans le suivi Excel),
// ou calculée ici d'après l'échéance (dépassée ou dans les 2 jours), pour qu'un message
// devienne urgent tout seul quand sa date approche.
function withUrgency(i) {
  if (i.urgent) return i;
  const n = daysUntil(i.due);
  if (i.due && n !== null && n <= 2) {
    return { ...i, urgent: true, urgencyReason: n < 0 ? 'échéance dépassée' : `échéance ${dueLabel(i.due)}` };
  }
  return i;
}

// Files d'attente, filtrées par source. Les tâches sans catégorie n'apparaissent qu'avec « Tout ».
export function queues(source = 'all') {
  const cut = addDays(today(), -7);
  const messages = state.inbox.filter(i => source === 'all' || i.source === source).map(withUrgency);
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

const OLD_DAYS = 14;

// Anciens messages à traiter (« Plus anciens ») de plus de OLD_DAYS jours : nettoyage en un geste.
export function oldBacklogIds() {
  const cut = addDays(today(), -OLD_DAYS);
  return queues(prefs.source).older.filter(e => e.item.receivedOn && e.item.receivedOn < cut).map(e => e.item.id);
}
export const oldBacklogDays = OLD_DAYS;

const senderKey = s => String(s || '').trim().toLowerCase();

// Autres messages du même expéditeur déjà classés « Pour info » ou « Plus anciens » : jamais les
// messages à traiter récents ni les urgents, pour ne rien archiver d'important par erreur.
export function senderBacklogIds(sender, exceptId) {
  const q = queues('all');
  return [...q.older, ...q.info]
    .filter(e => e.item.id !== exceptId && senderKey(e.item.sender) === senderKey(sender) && senderKey(sender))
    .map(e => e.item.id);
}

function senderBacklogHtml(m) {
  const n = senderBacklogIds(m.sender, m.id).length;
  if (!n) return '';
  const name = esc(m.sender);
  return `<p class="sender-bulk muted small">${n} autre${n > 1 ? 's' : ''} message${n > 1 ? 's' : ''} de ${name} en « Pour info » ou « Plus anciens » :
    <button class="link" data-action="inbox-sender-archive" data-id="${m.id}">tout archiver</button>
    · <button class="link danger" data-action="inbox-sender-delete" data-id="${m.id}">tout supprimer</button></p>`;
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
  ${!state.inboxAvailable && state.online ? `<p class="notice">Les mails et messages WhatsApp arriveront ici après la mise à jour de la base et ta première synchronisation.</p>` : ''}
  ${state.senderSuggestions.length ? `
  <p class="notice senders-notice">${state.senderSuggestions.length} expéditeur${state.senderSuggestions.length > 1 ? 's' : ''} que tu archives toujours : les classer en « Pour info » ?
    <button class="btn small-btn" data-action="senders-open">Vérifier</button></p>`
    : tab === 'info' ? `<p class="muted small"><button class="link" data-action="senders-open">Expéditeurs classés « Pour info »</button></p>` : ''}`;

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
  const selectable = shown.filter(e => e.kind !== 'task');
  // Les ids sélectionnés qui ne sont plus affichés (filtre, recherche, déjà traités) ne comptent pas.
  for (const id of [...selected]) if (!selectable.some(e => e.item.id === id)) selected.delete(id);
  const n = selected.size;
  const allOn = selectable.length && selectable.every(e => selected.has(e.item.id));
  const head = !selectable.length ? `<p class="muted small">${shown.length} élément${shown.length > 1 ? 's' : ''}</p>`
    : selecting ? `
    <div class="select-bar" role="group" aria-label="Sélection">
      <span class="select-count">${n ? `${n} sélectionné${n > 1 ? 's' : ''}` : 'Touche les messages à sélectionner'}</span>
      <button class="btn small-btn" data-action="inbox-select-all">${allOn ? 'Tout désélectionner' : `Tout sélectionner (${selectable.length})`}</button>
      ${tab === 'history'
        ? `<button class="btn small-btn primary" data-action="inbox-bulk-restore"${n ? '' : ' disabled'}>Remettre à trier${n ? ` (${n})` : ''}</button>`
        : `<button class="btn small-btn primary" data-action="inbox-bulk-archive"${n ? '' : ' disabled'}>Archiver${n ? ` (${n})` : ''}</button>`}
      <button class="btn small-btn danger" data-action="inbox-bulk-delete"${n ? '' : ' disabled'}>Supprimer${n ? ` (${n})` : ''}</button>
      <button class="btn small-btn ghost" data-action="inbox-select-stop">Terminer</button>
    </div>`
    : `<div class="list-head"><p class="muted small">${shown.length} élément${shown.length > 1 ? 's' : ''}</p>
      <button class="pill" data-action="inbox-select-start">Sélectionner</button></div>
      ${tab === 'older' && oldBacklogIds().length ? `<p class="muted small">${oldBacklogIds().length} message${oldBacklogIds().length > 1 ? 's' : ''} de plus de ${OLD_DAYS} jours.
        <button class="link" data-action="inbox-archive-old">Tout archiver</button></p>` : ''}`;
  return `${head}
  <ul class="msg-list">${shown.map(rowHtml).join('')}</ul>`;
}

function rowHtml(e) {
  if (selecting && e.kind !== 'task') return selectRowHtml(e);
  return plainRowHtml(e);
}

// Ligne en mode sélection : un appui coche ou décoche, sans ouvrir le message.
function selectRowHtml(e) {
  const it = e.item;
  const on = selected.has(it.id);
  return `<li><button class="msg-row selectable${on ? ' is-selected' : ''}" role="checkbox" aria-checked="${on}" data-action="inbox-select" data-id="${it.id}">
    <span class="row-top">
      <span class="check" aria-hidden="true">${on ? '✓' : ''}</span>
      <span class="chip src-${it.source}">${it.source === 'whatsapp' ? 'WhatsApp' : 'Mail'}</span>
      <b>${esc(it.sender || 'Expéditeur inconnu')}</b>
      <span class="muted small row-date">${it.receivedOn ? esc(agoLabel(it.receivedOn)) : ''}</span>
    </span>
    <span class="row-sum">${esc(it.summary || it.subject || '—')}</span>
  </button></li>`;
}

function plainRowHtml(e) {
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
// Indique sa place dans la file affichée et propose « Suivant » pour avancer sans rien faire.
export function entrySheetHtml(key) {
  const e = findEntry(key);
  if (!e) return null;
  const list = visibleEntries().filter(x => x.kind !== 'task');
  const i = list.findIndex(x => x.key === key);
  const position = i >= 0 ? `${i + 1} sur ${list.length} · ${inboxTabLabel()}` : '';
  const next = i >= 0 && list[i + 1] ? list[i + 1].key : null;
  if (e.kind === 'done') return historyCard(e.item, position, next);
  return messageCard(e.item, position, true, next);
}

function nextButton(next) {
  return next ? `<button class="btn" data-action="open-entry" data-key="${next}">Suivant</button>` : '';
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

function messageCard(m, position, inSheet = false, next = null) {
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
      ${requestLink(m)}
    </div>
    ${senderRuleHtml(m.sender)}
    ${senderBacklogHtml(m)}
    <div class="triage-foot">
      <button class="btn ghost" data-action="inbox-ignore" data-id="${m.id}">${m.needsAction ? 'Pas de tâche' : 'Archiver'}</button>
      <button class="btn ghost danger" data-action="inbox-delete" data-id="${m.id}">Supprimer</button>
      <span class="spacer"></span>
      ${inSheet ? nextButton(next) : `<button class="btn" data-action="triage-skip" data-key="m${m.id}">Passer</button>`}
    </div>
  </section>`;
}

// Fenêtre de vérification : propositions à valider, et choix déjà faits (annulables).
export function sendersSheetHtml() {
  const rules = Object.entries(state.senderRules);
  const info = rules.filter(([, r]) => r === 'info').map(([s]) => s).sort();
  const action = rules.filter(([, r]) => r === 'action').map(([s]) => s).sort();
  const sugg = state.senderSuggestions;
  const undo = s => `<button class="btn small-btn ghost" data-action="sender-rule" data-sender="${esc(s)}" data-rule="none">Annuler</button>`;
  return `
  <section class="senders-sheet" aria-label="Expéditeurs pour info">
    <h2>Expéditeurs « Pour info »</h2>
    <p class="muted small">Leurs prochains messages arrivent directement en « Pour info », sans proposition d'action. Rien n'y entre sans ton accord. Ton choix s'applique à la synchronisation suivante.</p>
    ${sugg.length ? `
    <div class="week-block">
      <p class="label">À valider · ${sugg.length}</p>
      <ul class="week-list">${sugg.map(x => `
        <li>
          <span><b>${esc(x.sender)}</b> <span class="muted small">· archivé ${x.archived} fois${x.lastReceived ? `, dernier message ${esc(agoLabel(x.lastReceived))}` : ''}</span></span>
          <span class="week-btns">
            <button class="btn small-btn" data-action="sender-rule" data-sender="${esc(x.sender)}" data-rule="info">Pour info</button>
            <button class="btn small-btn" data-action="sender-rule" data-sender="${esc(x.sender)}" data-rule="action">Non, à traiter</button>
          </span>
        </li>`).join('')}</ul>
    </div>` : ''}
    <div class="week-block">
      <p class="label">Toujours pour info · ${info.length}</p>
      ${info.length ? `<ul class="week-list">${info.map(s => `<li class="row-line"><b>${esc(s)}</b>${undo(s)}</li>`).join('')}</ul>` : '<p class="empty">Aucun pour l\'instant.</p>'}
    </div>
    ${action.length ? `
    <div class="week-block">
      <p class="label">Toujours à traiter · ${action.length}</p>
      <ul class="week-list">${action.map(s => `<li class="row-line"><b>${esc(s)}</b>${undo(s)}</li>`).join('')}</ul>
    </div>` : ''}
  </section>`;
}

// Choix pour les prochains messages de cet expéditeur (appliqué à la synchronisation).
export function senderRuleHtml(sender) {
  if (!sender) return '';
  const rule = senderRule(sender);
  const name = esc(sender);
  if (rule === 'info') {
    return `<p class="sender-rule muted small">Les prochains messages de ${name} arriveront en « Pour info ».
      <button class="link" data-action="sender-rule" data-sender="${name}" data-rule="none">Annuler</button></p>`;
  }
  if (rule === 'action') {
    return `<p class="sender-rule muted small">${name} reste toujours « À traiter », même s'il est souvent archivé.
      <button class="link" data-action="sender-rule" data-sender="${name}" data-rule="none">Annuler</button></p>`;
  }
  return `<p class="sender-rule muted small">Pour les prochains messages de cet expéditeur :
    <button class="link" data-action="sender-rule" data-sender="${name}" data-rule="info">toujours pour info</button>
    · <button class="link" data-action="sender-rule" data-sender="${name}" data-rule="action">toujours à traiter</button></p>`;
}

// Lien vers l'espace Demandes : la demande déjà repérée, ou de quoi en créer une.
function requestLink(m) {
  const r = requestForInbox(m.id);
  if (r) return `<button class="btn request-link" data-action="request-open" data-id="${r.id}">${esc(kindOf(r.kind).label)} · voir la demande</button>`;
  return `<button class="btn ghost" data-action="request-from-inbox" data-id="${m.id}">C'est une demande (sponsoring, lots, visuel)</button>`;
}

function historyCard(m, position = '', next = null) {
  return `
  <section class="triage" aria-label="Message déjà traité">
    <div class="triage-meta">
      <span class="chip src-${m.source}">${m.source === 'whatsapp' ? 'WhatsApp' : 'Mail'}</span>
      <span class="chip">${m.status === 'task' ? 'tâche créée' : 'classé sans tâche'}</span>
      <span class="muted small">${m.receivedOn ? `reçu ${esc(agoLabel(m.receivedOn))}` : ''}${position ? ` · ${position}` : ''}</span>
    </div>
    ${messageBody(m)}
    ${m.action ? `<p><b>Action proposée :</b> ${esc(m.action)}</p>` : ''}
    ${draftHtml(m)}
    <div class="triage-extra">${requestLink(m)}</div>
    <div class="triage-foot">
      <button class="btn" data-action="inbox-restore" data-id="${m.id}">Remettre à trier</button>
      ${m.status === 'task' ? '' : `<button class="btn ghost danger" data-action="inbox-delete" data-id="${m.id}">Supprimer</button>`}
      <span class="spacer"></span>
      ${nextButton(next)}
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

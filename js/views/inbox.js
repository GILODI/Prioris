// À trier : un élément à la fois, une décision en un geste.
// Trois files : À traiter (urgents + 7 derniers jours + tâches sans catégorie),
// Plus anciens, Pour info (messages sans action attendue).
import { state, sortForZone } from '../store.js';
import { shortDateTime, addDays, today, dueLabel, agoLabel } from '../dates.js';
import { esc, ZONES, zoneOf, dueChip, waitingChip } from '../ui.js';

const skipped = [];          // éléments passés pendant cette session : ils reviennent en fin de file
let tab = 'main';

export function setInboxTab(t) { tab = t; }
export function skipItem(key) { if (!skipped.includes(key)) skipped.push(key); }

function byDateDesc(a, b) { return (b.receivedOn || '').localeCompare(a.receivedOn || ''); }

export function queues() {
  const cut = addDays(today(), -7);
  const messages = state.inbox;
  const recent = i => !i.receivedOn || i.receivedOn >= cut;
  const main = messages.filter(i => i.needsAction && (i.urgent || recent(i)))
    .sort((a, b) => (b.urgent - a.urgent) || byDateDesc(a, b))
    .map(i => ({ kind: 'msg', key: 'm' + i.id, item: i }));
  const tasks = sortForZone(state.tasks.filter(t => !t.done && t.p === null && !t.waiting))
    .map(t => ({ kind: 'task', key: 't' + t.id, item: t }));
  const older = messages.filter(i => i.needsAction && !i.urgent && !recent(i)).sort(byDateDesc)
    .map(i => ({ kind: 'msg', key: 'm' + i.id, item: i }));
  const info = messages.filter(i => !i.needsAction).sort(byDateDesc)
    .map(i => ({ kind: 'msg', key: 'm' + i.id, item: i }));
  return { main: [...main, ...tasks], older, info };
}

function ordered(list) {
  return [...list.filter(e => !skipped.includes(e.key)), ...list.filter(e => skipped.includes(e.key))];
}

export function renderInbox() {
  const q = queues();
  const tabs = [
    ['main', 'À traiter', q.main.length],
    ['older', 'Plus anciens', q.older.length],
    ['info', 'Pour info', q.info.length],
  ];
  const list = ordered(q[tab]);
  const head = `
  <header class="page-head">
    <h1>À trier</h1>
    <p class="muted">${q.main.length ? `${q.main.length} élément${q.main.length > 1 ? 's' : ''} à traiter` : 'Rien d\'urgent à trier'}${lastSync()}</p>
  </header>
  <div class="segmented" role="tablist" aria-label="Files">
    ${tabs.map(([k, label, n]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-action="inbox-tab" data-tab="${k}">${label} <span class="n">${n}</span></button>`).join('')}
  </div>
  ${!state.inboxAvailable && state.online ? `<p class="notice">Les mails et messages WhatsApp arriveront ici après la mise à jour de la base (script SQL de l'étape 2) et ta première synchronisation.</p>` : ''}`;

  if (!list.length) {
    const empty = {
      main: 'Rien à traiter. Les nouveaux messages arriveront à ta prochaine synchronisation.',
      older: 'Aucun message ancien en attente.',
      info: 'Aucun message pour info.',
    }[tab];
    return head + `<section class="card center"><p class="done-big">Tout est trié.</p><p class="muted">${empty}</p></section>`;
  }

  const entry = list[0];
  const position = skipped.includes(entry.key) ? 'déjà passé une fois' : `1 sur ${list.length}`;
  return head + (entry.kind === 'msg' ? messageCard(entry.item, position) : taskCard(entry.item, position));
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

function messageCard(m, position) {
  const sourceLabel = m.source === 'whatsapp' ? 'WhatsApp' : 'Mail';
  return `
  <section class="card triage${m.urgent ? ' is-urgent' : ''}" aria-label="Message à trier">
    <div class="triage-meta">
      <span class="chip src-${m.source}">${sourceLabel}</span>
      <span class="muted small">${m.receivedOn ? `reçu ${esc(agoLabel(m.receivedOn))} · ` : ''}${position}</span>
    </div>
    ${m.urgent ? `<p class="urgent-flag">Urgent${m.urgencyReason ? ` · ${esc(m.urgencyReason)}` : ''}</p>` : ''}
    <p class="triage-contact">${esc(m.sender || 'Expéditeur inconnu')}</p>
    ${m.subject ? `<p class="muted">${esc(m.subject)}</p>` : ''}
    <p class="triage-text">${esc(m.summary || '—')}</p>

    ${m.needsAction ? `
    <div class="proposal">
      <p class="label">Proposition</p>
      ${m.action ? `<p><b>Action :</b> ${esc(m.action)}</p>` : ''}
      <p><b>Catégorie :</b> ${m.p === null ? 'à choisir' : `${m.p} · ${esc(zoneOf(m.p).label)}`}${m.due ? ` · <b>échéance</b> ${esc(dueLabel(m.due))}` : ''}</p>
    </div>` : `<p class="muted small">Pour info : aucune action proposée. Tu peux l'archiver, ou en faire une tâche si besoin.</p>`}

    ${m.draft ? `
    <div class="draft-block">
      <p class="label">Brouillon de réponse</p>
      <p class="draft" id="draft-${m.id}">${esc(m.draft)}</p>
      <button class="btn small-btn" data-action="copy-draft" data-target="draft-${m.id}">Copier la réponse</button>
    </div>` : ''}

    <p class="label">Créer la tâche dans</p>
    ${zoneButtons('inbox-task', m.id, m.p)}

    <div class="triage-extra">
      <button class="btn" data-action="inbox-wait" data-id="${m.id}" data-p="${m.p ?? 3}">J'attends une réponse</button>
    </div>
    <div class="triage-foot">
      <button class="btn ghost" data-action="inbox-ignore" data-id="${m.id}">${m.needsAction ? 'Pas de tâche' : 'Archiver'}</button>
      <span class="spacer"></span>
      <button class="btn" data-action="triage-skip" data-key="m${m.id}">Passer</button>
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

// Fenêtres par-dessus l'écran : ajout rapide (+), modification d'une tâche,
// et mode « une chose à la fois ».
import { state, getTask, activeFocus } from './store.js';
import { parseQuickInput } from './parse.js';
import { esc, ZONES, zoneOf, ICONS, dueChip } from './ui.js';
import { today } from './dates.js';

const root = () => document.getElementById('sheet-root');
let lastFocused = null;

export function isOpen() { return !!root().firstElementChild; }

function open(html, focusSelector) {
  lastFocused = document.activeElement;
  root().innerHTML = `<div class="overlay" data-action="close-sheet-bg">${html}</div>`;
  document.body.classList.add('sheet-open');
  const el = root().querySelector(focusSelector || 'input, textarea, button');
  if (el) setTimeout(() => el.focus(), 30);
}

export function closeSheet() {
  root().innerHTML = '';
  document.body.classList.remove('sheet-open');
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
}

// --- Fenêtre libre (ex. un message ouvert depuis la liste) ---

export function openHtmlSheet(innerHtml, label) {
  open(`<div class="sheet item-sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">
    ${innerHtml}
    <div class="sheet-actions"><span class="spacer"></span><button class="btn ghost" data-action="close-sheet">Fermer</button></div>
  </div>`, '[data-action="close-sheet"]');
}

// Fenêtre dont le contenu est déjà un formulaire complet (ex. fiche d'une demande).
export function openFormSheet(html, focusSelector) { open(html, focusSelector); }

// --- Ajout rapide : tâche ou idée ---

function captureTabs(mode) {
  return `<div class="segmented" role="tablist">
      ${[['task', 'Tâche'], ['call', 'Appel'], ['idea', 'Idée']].map(([k, label]) => `<button type="button" role="tab" aria-selected="${mode === k}" class="${mode === k ? 'on' : ''}" data-action="capture-mode" data-mode="${k}">${label}</button>`).join('')}
    </div>`;
}

// Appel reçu : noté ici, il arrive dans « À trier » avec les mêmes options qu'un mail.
function openCallCapture() {
  open(`
  <form class="sheet" data-form="call" role="dialog" aria-modal="true" aria-labelledby="capture-title">
    <h2 id="capture-title" class="sr-only">Noter un appel</h2>
    ${captureTabs('call')}
    <div class="form-grid">
      <label class="field">Qui a appelé <input id="call-name" name="name" type="text" list="contacts-list" autocomplete="off" placeholder="Nom, club, magasin…"></label>
      <label class="field">Numéro <span class="optional">facultatif</span><input name="phone" type="tel" autocomplete="off" placeholder="06 12 34 56 78"></label>
    </div>
    ${contactsDatalist()}
    <label class="field">Ce qu'il ou elle veut
      <span class="field-row">
        <textarea id="call-content" name="content" rows="3" placeholder="Demande, rappel attendu, infos utiles…"></textarea>
        <button type="button" class="mic" id="call-mic" data-action="mic" data-target="call-content" aria-label="Dicter">${ICONS.mic}</button>
      </span>
    </label>
    <div class="triage-extra">
      <label class="inline-field">Rappeler avant <input type="date" name="due"></label>
      <label class="switch"><input type="checkbox" name="urgent"><span>Urgent</span></label>
    </div>
    <p class="hint">L'appel arrive dans « À trier » : tu pourras en faire une tâche, le mettre en attente, l'archiver ou en faire une demande.</p>
    <div class="sheet-actions">
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-action="close-sheet">Annuler</button>
      <button type="submit" class="btn primary">Ajouter</button>
    </div>
  </form>`, '#call-name');
}

export function openCapture(mode = 'task') {
  if (mode === 'call') { openCallCapture(); return; }
  open(`
  <form class="sheet" data-form="capture" data-mode="${mode}" role="dialog" aria-modal="true" aria-labelledby="capture-title">
    <h2 id="capture-title" class="sr-only">Ajouter</h2>
    ${captureTabs(mode)}
    ${mode === 'task' ? `
    <label class="field">Contact <span class="optional">facultatif</span>
      <input id="capture-contact" name="c" type="text" list="contacts-list" autocomplete="off" placeholder="Commence à taper : Arnaud, Intersport…">
    </label>
    ${contactsDatalist()}` : ''}
    <div class="field-row">
      <input id="capture-input" name="text" type="text" autocomplete="off" aria-label="${mode === 'task' ? 'Action' : 'Idée'}"
        placeholder="${mode === 'task' ? 'Action : rappeler pour le devis, urgent' : 'Ton idée, en quelques mots'}">
      <button type="button" class="mic" id="capture-mic" data-action="mic" data-target="capture-input" aria-label="Dicter">${ICONS.mic}</button>
    </div>
    ${mode === 'task' ? `
    <p class="hint">Dicte « action <b>virgule</b> importance ». Si le champ Contact est vide, tu peux aussi dicter « contact <b>virgule</b> action <b>virgule</b> importance ». Dis « étoile » pour surligner en rouge.</p>
    <p class="preview" id="capture-preview" aria-live="polite"></p>
    <fieldset class="choice">
      <legend>Catégorie</legend>
      <label><input type="radio" name="p" value="auto" checked><span>Selon la dictée</span></label>
      ${ZONES.map(z => `<label><input type="radio" name="p" value="${z.id === null ? 'null' : z.id}"><span>${z.id !== null ? `${z.id} · ` : ''}${esc(z.label)}</span></label>`).join('')}
    </fieldset>
    <label class="inline-field">Échéance <input type="date" name="due"></label>` : `
    <p class="hint">Une idée n'a ni échéance ni priorité. Tu pourras la transformer en tâche plus tard.</p>`}
    <div class="sheet-actions">
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-action="close-sheet">Annuler</button>
      <button type="submit" class="btn primary">Ajouter</button>
    </div>
  </form>`, mode === 'task' ? '#capture-contact' : '#capture-input');
  updateCapturePreview();
}

// Contacts déjà connus (tâches et expéditeurs des messages), proposés pendant la saisie.
function contactsDatalist() {
  const names = new Set();
  state.tasks.forEach(t => { if (t.c) names.add(t.c.trim()); });
  state.inbox.forEach(m => { if (m.sender) names.add(m.sender.trim()); });
  const sorted = [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
  return `<datalist id="contacts-list">${sorted.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;
}

// Découpe la saisie en tenant compte du champ Contact : s'il est rempli, il l'emporte et
// tout le texte dicté devient l'action (rien n'est perdu).
export function readCapture(raw, contactField) {
  const parsed = parseQuickInput(raw);
  const contact = (contactField || '').trim();
  if (!contact) return parsed;
  return { ...parsed, c: contact, t: [parsed.c, parsed.t].filter(Boolean).join(', ') };
}

export function updateCapturePreview() {
  const out = document.getElementById('capture-preview');
  const input = document.getElementById('capture-input');
  if (!out || !input) return;
  const raw = input.value.trim();
  const contactEl = document.getElementById('capture-contact');
  if (!raw) { out.textContent = ''; return; }
  const { c, t, p, star } = readCapture(raw, contactEl ? contactEl.value : '');
  const parts = [];
  if (c) parts.push(`Contact : ${c}`);
  parts.push(`Action : ${t || '—'}`);
  parts.push(p === null ? 'Catégorie : à classer' : `Catégorie : ${p} · ${zoneOf(p).label}`);
  if (star) parts.push('★ étoile');
  out.textContent = parts.join('  ·  ');
}

// --- Modification d'une tâche ---

export function openEdit(id) {
  const t = getTask(id);
  if (!t) return;
  open(`
  <form class="sheet" data-form="edit" data-id="${t.id}" role="dialog" aria-modal="true" aria-labelledby="edit-title">
    <h2 id="edit-title">Modifier la tâche</h2>
    <label class="field">Contact <input name="c" type="text" value="${esc(t.c)}" list="contacts-list" autocomplete="off"></label>
    ${contactsDatalist()}
    <label class="field">Action <textarea name="t" rows="2">${esc(t.t)}</textarea></label>
    <fieldset class="choice">
      <legend>Catégorie</legend>
      ${ZONES.map(z => {
        const v = z.id === null ? 'null' : String(z.id);
        const checked = (t.p ?? null) === z.id ? ' checked' : '';
        return `<label><input type="radio" name="p" value="${v}"${checked}><span>${z.id !== null ? `${z.id} · ` : ''}${esc(z.label)}</span></label>`;
      }).join('')}
    </fieldset>
    <label class="inline-field">Échéance <input type="date" name="due" value="${t.due || ''}"></label>
    <div class="switches">
      <label class="switch"><input type="checkbox" name="focus"${t.focus === today() ? ' checked' : ''}><span>Dans mon focus du jour</span></label>
      <label class="switch"><input type="checkbox" name="waiting"${t.waiting ? ' checked' : ''}><span>En attente d'une réponse</span></label>
      <label class="switch"><input type="checkbox" name="star"${t.star ? ' checked' : ''}><span>Étoile (ligne en rouge)</span></label>
    </div>
    <div class="sheet-actions">
      <button type="button" class="btn ghost danger" data-action="delete-task" data-id="${t.id}">Supprimer</button>
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-action="close-sheet">Annuler</button>
      <button type="submit" class="btn primary">Enregistrer</button>
    </div>
  </form>`, 'input[name="c"]');
}

// --- Une chose à la fois ---

let focusIndex = 0;

export function openFocusMode() {
  focusIndex = 0;
  renderFocusMode();
}

export function focusModeNext() { focusIndex++; renderFocusMode(); }

export function renderFocusMode() {
  const list = activeFocus();
  if (!list.length) {
    open(`<div class="sheet focus-mode" role="dialog" aria-modal="true" aria-labelledby="fm-title">
      <h2 id="fm-title">Focus terminé</h2>
      <p class="muted">Les tâches de ton focus du jour sont faites. Tu peux souffler, ou en choisir d'autres depuis l'accueil.</p>
      <div class="sheet-actions"><span class="spacer"></span><button class="btn primary" data-action="close-sheet">Retour à l'accueil</button></div>
    </div>`);
    return;
  }
  if (focusIndex >= list.length) focusIndex = 0;
  const t = list[focusIndex];
  open(`<div class="sheet focus-mode" role="dialog" aria-modal="true" aria-labelledby="fm-title">
    <p class="label">Une chose à la fois · ${focusIndex + 1} sur ${list.length}</p>
    ${t.c ? `<p class="fm-contact">${esc(t.c)}</p>` : ''}
    <h2 id="fm-title" class="fm-text">${t.t ? esc(t.t) : 'Sans description'}</h2>
    <div class="chips">${dueChip(t.due)}</div>
    <div class="fm-actions">
      <button class="btn primary big" data-action="fm-done" data-id="${t.id}">C'est fait</button>
      ${list.length > 1 ? `<button class="btn big" data-action="fm-next">Plus tard</button>` : ''}
    </div>
    <div class="sheet-actions"><span class="spacer"></span><button class="btn ghost" data-action="close-sheet">Fermer</button></div>
  </div>`, '[data-action="fm-done"]');
}

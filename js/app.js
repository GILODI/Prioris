// Point d'entrée : navigation entre les écrans, actions, ajout rapide, messages.
import * as store from './store.js';
import { renderHome } from './views/home.js';
import { renderInbox, skipItem, setInboxTab, setInboxMode, setInboxSource, setInboxSearch, refreshInboxList, entrySheetHtml, queues } from './views/inbox.js';
import { renderTasks, setFilter, toggleCollapse, toggleDoneList } from './views/tasks.js';
import { renderIdeas } from './views/ideas.js';
import { renderLogin, login, rememberEmail } from './views/login.js';
import { openCapture, openEdit, closeSheet, isOpen, updateCapturePreview, openFocusMode, renderFocusMode, focusModeNext, readCapture, openHtmlSheet } from './sheets.js';
import { startDictation, stopDictation, isListening } from './dictation.js';
import { today } from './dates.js';

const VIEWS = {
  home: { hash: 'accueil', render: renderHome },
  inbox: { hash: 'a-trier', render: renderInbox },
  tasks: { hash: 'taches', render: renderTasks },
  ideas: { hash: 'idees', render: renderIdeas },
};

let current = viewFromHash();
let dragging = false;
let pendingRender = false;
let sortables = [];

function viewFromHash() {
  const h = location.hash.replace('#', '');
  return Object.keys(VIEWS).find(k => VIEWS[k].hash === h) || 'home';
}

function go(view) {
  if (!VIEWS[view]) return;
  current = view;
  if (location.hash !== '#' + VIEWS[view].hash) history.replaceState(null, '', '#' + VIEWS[view].hash);
  render();
  window.scrollTo(0, 0);
}

function render() {
  if (dragging) { pendingRender = true; return; }
  const root = document.getElementById('view');
  const loggedOut = store.state.needsLogin;
  document.body.classList.toggle('logged-out', loggedOut);
  if (loggedOut) {
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('.login-form');
    if (!typing) root.innerHTML = renderLogin();
    return;
  }
  // Pendant une recherche dans la liste, on ne met à jour que la liste pour garder la saisie.
  const searching = current === 'inbox' && document.activeElement && document.activeElement.id === 'inbox-search';
  if (searching) refreshInboxList();
  else root.innerHTML = VIEWS[current].render();
  document.querySelectorAll('[data-nav]').forEach(b => {
    const on = b.dataset.nav === current;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const badge = document.getElementById('inbox-badge');
  const n = queues('all').main.length;
  if (badge) { badge.textContent = n; badge.hidden = n === 0; }
  initSortables();
}

function initSortables() {
  sortables.forEach(s => s.destroy());
  sortables = [];
  if (typeof Sortable === 'undefined') return;
  document.querySelectorAll('#view .task-list[data-zone]').forEach(el => {
    sortables.push(Sortable.create(el, {
      handle: '.drag-handle',
      animation: 150,
      onStart: () => { dragging = true; },
      onEnd: () => {
        dragging = false;
        const ids = Array.from(el.querySelectorAll(':scope > .task')).map(x => Number(x.dataset.id));
        store.reorder(ids);
        if (pendingRender) { pendingRender = false; render(); }
      },
    }));
  });
}

// --- Messages ---

let toastTimer = null;
function toast(msg, tone = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + tone;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

function selectText(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  toast('Texte sélectionné : copie-le avec le menu ou Ctrl+C.');
}

// --- Confirmation en deux temps (les boîtes de dialogue natives sont évitées) ---

function armed(btn, label) {
  if (btn.dataset.armed === '1') return true;
  btn.dataset.armed = '1';
  btn.dataset.label = btn.textContent;
  btn.textContent = label;
  setTimeout(() => {
    if (btn.isConnected && btn.dataset.armed === '1') { btn.dataset.armed = ''; btn.textContent = btn.dataset.label; }
  }, 4000);
  return false;
}

// --- Actions ---

const actions = {
  'go': el => go(el.dataset.view),
  'nav': el => go(el.dataset.nav),
  'toggle-done': el => {
    const t = store.getTask(Number(el.dataset.id));
    if (t) store.updateTask(t.id, { done: !t.done });
  },
  'toggle-star': el => {
    const t = store.getTask(Number(el.dataset.id));
    if (t) store.updateTask(t.id, { star: !t.star });
  },
  'edit': el => openEdit(Number(el.dataset.id)),
  'focus-add': el => {
    if (!store.addToFocus(Number(el.dataset.id))) toast('Ton focus a déjà 3 tâches. Termine ou retire-en une d\'abord.');
  },
  'focus-remove': el => store.removeFromFocus(Number(el.dataset.id)),
  'focus-mode': () => openFocusMode(),
  'fm-done': el => {
    store.updateTask(Number(el.dataset.id), { done: true });
    toast('Bien joué.', 'good');
    renderFocusMode();
  },
  'fm-next': () => focusModeNext(),
  'capture': el => openCapture(el.dataset.mode || 'task'),
  'capture-mode': el => {
    const input = document.getElementById('capture-input');
    const contact = document.getElementById('capture-contact');
    const text = [contact ? contact.value.trim() : '', input ? input.value.trim() : ''].filter(Boolean).join(', ');
    stopDictation();
    openCapture(el.dataset.mode);
    const next = document.getElementById('capture-input');
    if (next) { next.value = text; updateCapturePreview(); }
  },
  'mic': el => {
    if (isListening()) { stopDictation(); return; }
    const input = document.getElementById(el.dataset.target);
    const err = startDictation(input, (msg) => {
      const btn = document.getElementById(el.id);
      if (btn) btn.classList.toggle('listening', isListening());
      if (msg) toast(msg, 'bad');
    });
    if (err) toast(err, 'bad');
  },
  'close-sheet': () => { stopDictation(); closeSheet(); },
  'close-sheet-bg': (el, e) => { if (e.target === el) { stopDictation(); closeSheet(); } },
  'delete-task': el => {
    if (!armed(el, 'Confirmer la suppression')) return;
    store.deleteTasks([Number(el.dataset.id)]);
    closeSheet();
    toast('Tâche supprimée.');
  },
  'collapse': el => { toggleCollapse(el.dataset.zone); render(); },
  'done-list': el => { toggleDoneList(el.dataset.zone); render(); },
  'clear-done': el => {
    if (!armed(el, 'Confirmer : effacer ces tâches terminées')) return;
    const p = el.dataset.zone === 'null' ? null : Number(el.dataset.zone);
    store.deleteTasks(store.state.tasks.filter(t => t.done && (t.p ?? null) === p).map(t => t.id));
  },
  'filter': el => { setFilter(el.dataset.filter); render(); },
  'triage-cat': el => {
    store.updateTask(Number(el.dataset.id), { p: Number(el.dataset.p) });
    toast('Classée.', 'good');
  },
  'triage-wait': el => { store.updateTask(Number(el.dataset.id), { waiting: true }); toast('Mise en attente.'); },
  'triage-skip': el => { skipItem(el.dataset.key); render(); },
  'inbox-tab': el => {
    setInboxTab(el.dataset.tab);
    render();
    if (el.dataset.tab === 'history' && store.state.inboxHistory === null) store.loadInboxHistory();
  },
  'inbox-source': el => { setInboxSource(el.dataset.source); render(); },
  'inbox-mode': el => { setInboxMode(el.dataset.mode); render(); },
  'open-entry': el => {
    const html = entrySheetHtml(el.dataset.key);
    if (html) openHtmlSheet(html, 'Message');
  },
  'inbox-task': el => {
    store.inboxToTask(Number(el.dataset.id), { p: Number(el.dataset.p) });
    if (isOpen()) closeSheet();
    toast('Tâche créée.', 'good');
  },
  'inbox-wait': el => {
    store.inboxToTask(Number(el.dataset.id), { p: Number(el.dataset.p), waiting: true });
    if (isOpen()) closeSheet();
    toast('Tâche créée, en attente de réponse.', 'good');
  },
  'inbox-ignore': el => {
    store.ignoreInbox(Number(el.dataset.id));
    if (isOpen()) closeSheet();
    toast('Classé sans tâche.');
  },
  'inbox-restore': el => {
    store.restoreInbox(Number(el.dataset.id));
    if (isOpen()) closeSheet();
    toast('Remis à trier.', 'good');
  },
  'copy-draft': el => {
    const src = document.getElementById(el.dataset.target);
    if (!src) return;
    const text = src.textContent;
    const done = () => toast('Réponse copiée.', 'good');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => selectText(src));
    } else selectText(src);
  },
  'triage-delete': el => {
    if (!armed(el, 'Confirmer')) return;
    store.deleteTasks([Number(el.dataset.id)]);
  },
  'idea-delete': el => {
    if (!armed(el, 'Confirmer')) return;
    store.deleteIdea(Number(el.dataset.id));
  },
  'sign-out': el => {
    if (!armed(el, 'Confirmer la déconnexion')) return;
    store.signOut();
  },
  'idea-to-task': el => {
    store.ideaToTask(Number(el.dataset.id));
    toast('L\'idée est devenue une tâche, à trier.', 'good');
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (el.dataset.action === 'close-sheet-bg' && e.target !== el) return;
  e.preventDefault();
  fn(el, e);
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.action === 'triage-due') {
    store.updateTask(Number(el.dataset.id), { due: el.value || null });
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'capture-input' || e.target.id === 'capture-contact') updateCapturePreview();
  if (e.target.id === 'inbox-search') { setInboxSearch(e.target.value); refreshInboxList(); }
});

document.addEventListener('submit', e => {
  const form = e.target;
  if (!form.dataset || !form.dataset.form) return;
  e.preventDefault();
  stopDictation();
  const data = new FormData(form);

  if (form.dataset.form === 'login') {
    submitLogin(String(data.get('email') || '').trim().toLowerCase(), String(data.get('password') || ''));
    return;
  }

  if (form.dataset.form === 'capture') {
    const raw = String(data.get('text') || '').trim();
    if (!raw) { toast('Écris ou dicte quelque chose d\'abord.'); return; }
    if (form.dataset.mode === 'idea') {
      store.createIdea(raw);
      closeSheet();
      toast('Idée enregistrée.', 'good');
      return;
    }
    const parsed = readCapture(raw, String(data.get('c') || ''));
    if (!parsed.c && !parsed.t) { toast('Il manque l\'action.'); return; }
    const choice = String(data.get('p') || 'auto');
    const p = choice === 'auto' ? parsed.p : choice === 'null' ? null : Number(choice);
    store.createTask({ p, c: parsed.c, t: parsed.t, star: parsed.star, due: data.get('due') || null });
    closeSheet();
    toast(p === null ? 'Tâche ajoutée, à trier.' : 'Tâche ajoutée.', 'good');
    return;
  }

  if (form.dataset.form === 'edit') {
    const id = Number(form.dataset.id);
    const t = store.getTask(id);
    if (!t) { closeSheet(); return; }
    const pRaw = String(data.get('p'));
    const fields = {
      c: String(data.get('c') || '').trim(),
      t: String(data.get('t') || '').trim(),
      p: pRaw === 'null' ? null : Number(pRaw),
      star: data.get('star') === 'on',
    };
    const due = data.get('due') || null;
    const waiting = data.get('waiting') === 'on';
    if (due !== t.due) fields.due = due;
    if (waiting !== t.waiting) fields.waiting = waiting;
    const wantFocus = data.get('focus') === 'on';
    const inFocus = t.focus === today();
    if (wantFocus && !inFocus && !t.done && store.activeFocus().length >= store.FOCUS_MAX) {
      toast('Ton focus a déjà 3 tâches : celle-ci n\'y a pas été ajoutée.');
    } else if (wantFocus !== inFocus) {
      fields.focus = wantFocus ? today() : null;
    }
    store.updateTask(id, fields);
    closeSheet();
  }
});

function showLoginScreen(focusId) {
  document.getElementById('view').innerHTML = renderLogin();
  const el = document.getElementById(focusId);
  if (el) el.focus();
}

async function submitLogin(email, password) {
  if (!email || !password) return;
  login.email = email;
  login.busy = true;
  login.message = '';
  showLoginScreen('login-password');
  const err = await store.signIn(email, password);
  login.busy = false;
  if (err) {
    login.message = /invalid/i.test(err)
      ? 'Adresse ou mot de passe incorrect.'
      : /confirm/i.test(err)
        ? 'Ce compte n\'est pas encore confirmé dans Supabase.'
        : 'La connexion a échoué. Vérifie ta connexion internet et réessaie.';
    showLoginScreen('login-password');
    return;
  }
  rememberEmail(email);
  go('home');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isOpen()) { stopDictation(); closeSheet(); }
});

window.addEventListener('hashchange', () => { current = viewFromHash(); render(); });

document.getElementById('fab').addEventListener('click', () => openCapture('task'));

store.onError(msg => toast(msg, 'bad'));
store.subscribe(render);
render();
store.init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.error('SW', err)));
}

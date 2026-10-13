// Point d'entrée : navigation entre les écrans, actions, ajout rapide, messages.
import * as store from './store.js';
import { renderHome } from './views/home.js';
import { renderInbox, skipTask } from './views/inbox.js';
import { renderTasks, setFilter, toggleCollapse, toggleDoneList } from './views/tasks.js';
import { renderIdeas } from './views/ideas.js';
import { renderLogin, login, rememberEmail } from './views/login.js';
import { openCapture, openEdit, closeSheet, isOpen, updateCapturePreview, openFocusMode, renderFocusMode, focusModeNext } from './sheets.js';
import { parseQuickInput } from './parse.js';
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
  root.innerHTML = VIEWS[current].render();
  document.querySelectorAll('[data-nav]').forEach(b => {
    const on = b.dataset.nav === current;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const badge = document.getElementById('inbox-badge');
  const n = store.state.tasks.filter(t => !t.done && t.p === null && !t.waiting).length;
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
    const text = input ? input.value : '';
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
  'triage-skip': el => { skipTask(Number(el.dataset.id)); render(); },
  'triage-delete': el => {
    if (!armed(el, 'Confirmer')) return;
    store.deleteTasks([Number(el.dataset.id)]);
  },
  'idea-delete': el => {
    if (!armed(el, 'Confirmer')) return;
    store.deleteIdea(Number(el.dataset.id));
  },
  'login-back': () => {
    login.step = 'email';
    login.message = '';
    document.getElementById('view').innerHTML = renderLogin();
    document.getElementById('login-email').focus();
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
  if (e.target.id === 'capture-input') updateCapturePreview();
});

document.addEventListener('submit', e => {
  const form = e.target;
  if (!form.dataset || !form.dataset.form) return;
  e.preventDefault();
  stopDictation();
  const data = new FormData(form);

  if (form.dataset.form === 'login-email') { submitLoginEmail(String(data.get('email') || '').trim().toLowerCase()); return; }
  if (form.dataset.form === 'login-code') { submitLoginCode(String(data.get('code') || '').replace(/\D/g, '')); return; }

  if (form.dataset.form === 'capture') {
    const raw = String(data.get('text') || '').trim();
    if (!raw) { toast('Écris ou dicte quelque chose d\'abord.'); return; }
    if (form.dataset.mode === 'idea') {
      store.createIdea(raw);
      closeSheet();
      toast('Idée enregistrée.', 'good');
      return;
    }
    const parsed = parseQuickInput(raw);
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

async function submitLoginEmail(email) {
  if (!email) return;
  login.email = email;
  login.busy = true;
  login.message = '';
  showLoginScreen('login-email');
  const err = await store.sendLoginCode(email);
  login.busy = false;
  if (err) {
    login.message = /rate|seconds/i.test(err)
      ? 'Un code vient déjà d\'être envoyé. Patiente une minute avant d\'en redemander un.'
      : 'L\'envoi du code a échoué. Vérifie l\'adresse et réessaie.';
    showLoginScreen('login-email');
    return;
  }
  rememberEmail(email);
  login.step = 'code';
  showLoginScreen('login-code');
}

async function submitLoginCode(code) {
  if (code.length !== 6) { login.message = 'Le code fait 6 chiffres.'; showLoginScreen('login-code'); return; }
  login.busy = true;
  login.message = '';
  showLoginScreen('login-code');
  const err = await store.verifyLoginCode(login.email, code);
  login.busy = false;
  if (err) {
    login.message = 'Code incorrect ou expiré. Vérifie le dernier mail reçu, ou demande un nouveau code.';
    showLoginScreen('login-code');
    return;
  }
  login.step = 'email';
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

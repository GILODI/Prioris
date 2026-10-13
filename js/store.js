// Données de Prioris : tâches et idées, synchronisées avec Supabase (temps réel),
// avec une copie locale pour démarrer vite et fonctionner hors ligne.
import { today, daysUntil } from './dates.js';

const CACHE_KEY = 'prioris_v2_cache';

export const state = {
  tasks: [],
  ideas: [],
  ready: false,
  online: false,
  ideasAvailable: true,   // false tant que la table "ideas" n'existe pas côté Supabase
  schemaV2: true,         // false tant que les colonnes de l'étape 1 n'existent pas
};

let sb = null;
let tmpId = -1;
const listeners = new Set();
const errorListeners = new Set();

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onError(fn) { errorListeners.add(fn); }

function emit() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ tasks: state.tasks, ideas: state.ideas })); } catch (e) {}
  listeners.forEach(fn => fn());
}

function report(error, message) {
  console.error(message, error);
  errorListeners.forEach(fn => fn(message || 'La synchronisation a échoué.'));
}

// --- Correspondance ligne Supabase <-> tâche locale ---

const FIELD_MAP = {
  p: 'priority', c: 'contact', t: 'text', done: 'done', star: 'star', sort: 'sort',
  due: 'due_date', waiting: 'waiting', waitingSince: 'waiting_since', focus: 'focus_date',
};
const V2_FIELDS = ['due', 'waiting', 'waitingSince', 'focus'];

function taskFromRow(r) {
  return {
    id: r.id, p: r.priority ?? null, c: r.contact || '', t: r.text || '',
    done: !!r.done, star: !!r.star, sort: r.sort ?? null,
    due: r.due_date || null, waiting: !!r.waiting, waitingSince: r.waiting_since || null,
    focus: r.focus_date || null, createdAt: r.created_at || null,
  };
}

function toRow(fields) {
  const row = {};
  for (const k in fields) if (FIELD_MAP[k]) row[FIELD_MAP[k]] = fields[k];
  return row;
}

function ideaFromRow(r) { return { id: r.id, text: r.text || '', createdAt: r.created_at || null }; }

// --- Démarrage ---

export async function init() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached) { state.tasks = cached.tasks || []; state.ideas = cached.ideas || []; }
  } catch (e) {}
  listeners.forEach(fn => fn());

  const cfg = window.APP_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || !window.supabase) { state.ready = true; emit(); return; }
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  try {
    const [tasksRes, ideasRes] = await Promise.all([
      sb.from('tasks').select('*').order('id', { ascending: true }),
      sb.from('ideas').select('*').order('created_at', { ascending: false }),
    ]);
    if (tasksRes.error) throw tasksRes.error;
    state.tasks = tasksRes.data.map(taskFromRow);
    state.schemaV2 = tasksRes.data.length === 0 || 'focus_date' in tasksRes.data[0];
    if (ideasRes.error) { state.ideasAvailable = false; state.ideas = []; }
    else { state.ideasAvailable = true; state.ideas = ideasRes.data.map(ideaFromRow); }
    state.online = true;
    listenRealtime();
  } catch (e) {
    state.online = false;
    console.error('Supabase indisponible, copie locale utilisée.', e);
  }
  state.ready = true;
  emit();
}

function listenRealtime() {
  sb.channel('prioris-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
      if (payload.eventType === 'DELETE') {
        state.tasks = state.tasks.filter(x => x.id !== payload.old.id);
      } else {
        const t = taskFromRow(payload.new);
        const i = state.tasks.findIndex(x => x.id === t.id);
        if (i >= 0) state.tasks[i] = t; else state.tasks.push(t);
      }
      emit();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, payload => {
      if (payload.eventType === 'DELETE') {
        state.ideas = state.ideas.filter(x => x.id !== payload.old.id);
      } else {
        const idea = ideaFromRow(payload.new);
        const i = state.ideas.findIndex(x => x.id === idea.id);
        if (i >= 0) state.ideas[i] = idea; else state.ideas.unshift(idea);
      }
      emit();
    })
    .subscribe();
}

// --- Tâches ---

export function getTask(id) { return state.tasks.find(x => x.id === id); }

export async function createTask({ p = null, c = '', t = '', star = false, due = null }) {
  const local = {
    id: tmpId--, p, c, t, done: false, star, sort: Date.now(),
    due, waiting: false, waitingSince: null, focus: null, createdAt: new Date().toISOString(),
  };
  state.tasks.push(local);
  emit();
  if (!sb) return;
  const row = { priority: p, contact: c, text: t, done: false, star, sort: local.sort };
  if (due) row.due_date = due;
  const { data, error } = await sb.from('tasks').insert([row]).select().single();
  if (error) { report(error, 'La tâche est enregistrée sur cet appareil mais pas synchronisée.'); return; }
  const i = state.tasks.indexOf(local);
  if (state.tasks.some(x => x.id === data.id)) { if (i >= 0) state.tasks.splice(i, 1); }
  else if (i >= 0) state.tasks[i] = taskFromRow(data);
  emit();
}

export function updateTask(id, fields) {
  const task = getTask(id);
  if (!task) return;
  if (fields.waiting === true && !task.waiting) fields.waitingSince = new Date().toISOString();
  if (fields.waiting === false) fields.waitingSince = null;
  Object.assign(task, fields);
  emit();
  if (!sb || id < 0) return;
  if (!state.schemaV2 && Object.keys(fields).some(k => V2_FIELDS.includes(k))) {
    report(null, 'Cette option demande la mise à jour de la base (script SQL de l\'étape 1).');
    return;
  }
  sb.from('tasks').update(toRow(fields)).eq('id', id)
    .then(({ error }) => { if (error) report(error, 'La modification n\'a pas été synchronisée.'); });
}

export function deleteTasks(ids) {
  state.tasks = state.tasks.filter(x => !ids.includes(x.id));
  emit();
  const remote = ids.filter(id => id > 0);
  if (!sb || !remote.length) return;
  sb.from('tasks').delete().in('id', remote)
    .then(({ error }) => { if (error) report(error, 'La suppression n\'a pas été synchronisée.'); });
}

// Nouvel ordre d'une catégorie après un glisser-déposer. Une mise à jour par tâche :
// l'ancien "upsert" groupé échouait en silence sur l'identifiant généré par la base.
export function reorder(ids) {
  const changed = [];
  ids.forEach((id, idx) => {
    const t = getTask(id);
    if (t && t.sort !== idx) { t.sort = idx; changed.push(t); }
  });
  if (!changed.length) return;
  emit();
  if (!sb) return;
  Promise.all(changed.filter(t => t.id > 0).map(t => sb.from('tasks').update({ sort: t.sort }).eq('id', t.id)))
    .then(results => {
      const failed = results.find(r => r.error);
      if (failed) report(failed.error, 'Le nouvel ordre n\'a pas été synchronisé.');
    });
}

export function sortForZone(list) {
  return [...list].sort((a, b) => (a.sort ?? a.id) - (b.sort ?? b.id));
}

// --- Focus du jour (3 tâches maximum) ---

export const FOCUS_MAX = 3;

export function focusToday() {
  const d = today();
  return sortForZone(state.tasks.filter(t => t.focus === d));
}

export function activeFocus() { return focusToday().filter(t => !t.done); }

export function addToFocus(id) {
  if (activeFocus().length >= FOCUS_MAX) return false;
  updateTask(id, { focus: today() });
  return true;
}

export function removeFromFocus(id) { updateTask(id, { focus: null }); }

// Score d'urgence : étoile, catégorie, échéance. Les tâches en attente ne comptent pas
// (la balle est dans le camp de quelqu'un d'autre).
export function urgency(t) {
  if (t.done || t.waiting) return 0;
  let s = 0;
  if (t.star) s += 40;
  if (t.p === 1) s += 30;
  if (t.p === 0) s += 10;
  const n = daysUntil(t.due);
  if (n !== null) {
    if (n < 0) s += 50;
    else if (n === 0) s += 45;
    else if (n === 1) s += 35;
    else if (n <= 3) s += 25;
    else if (n <= 7) s += 10;
  }
  return s;
}

export function focusSuggestions(limit) {
  const d = today();
  return state.tasks
    .filter(t => !t.done && t.focus !== d)
    .map(t => ({ t, s: urgency(t) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.t.sort ?? a.t.id) - (b.t.sort ?? b.t.id))
    .slice(0, limit)
    .map(x => x.t);
}

// --- Idées ---

export async function createIdea(text) {
  const local = { id: tmpId--, text, createdAt: new Date().toISOString() };
  state.ideas.unshift(local);
  emit();
  if (!sb) return;
  if (!state.ideasAvailable) {
    report(null, 'Idée gardée sur cet appareil : la boîte à idées demande la mise à jour de la base (script SQL de l\'étape 1).');
    return;
  }
  const { data, error } = await sb.from('ideas').insert([{ text }]).select().single();
  if (error) { report(error, 'L\'idée est enregistrée sur cet appareil mais pas synchronisée.'); return; }
  const i = state.ideas.indexOf(local);
  if (state.ideas.some(x => x.id === data.id)) { if (i >= 0) state.ideas.splice(i, 1); }
  else if (i >= 0) state.ideas[i] = ideaFromRow(data);
  emit();
}

export function deleteIdea(id) {
  state.ideas = state.ideas.filter(x => x.id !== id);
  emit();
  if (!sb || id < 0 || !state.ideasAvailable) return;
  sb.from('ideas').delete().eq('id', id)
    .then(({ error }) => { if (error) report(error, 'La suppression n\'a pas été synchronisée.'); });
}

export async function ideaToTask(id) {
  const idea = state.ideas.find(x => x.id === id);
  if (!idea) return;
  await createTask({ t: idea.text });
  deleteIdea(id);
}

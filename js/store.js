// Données de Prioris : tâches et idées, synchronisées avec Supabase (temps réel),
// avec une copie locale pour démarrer vite et fonctionner hors ligne.
import { today, daysUntil } from './dates.js';

const CACHE_KEY = 'prioris_v2_cache';

export const state = {
  tasks: [],
  ideas: [],
  inbox: [],              // messages (mails, WhatsApp) importés, pas encore traités
  inboxAvailable: true,   // false tant que la table "inbox_items" n'existe pas
  inboxHistory: null,     // messages déjà traités, chargés seulement à l'ouverture de l'historique
  requests: [],           // demandes de sponsoring, de lots et de visuels (toutes, y compris closes)
  requestsAvailable: true, // false tant que la table "requests" n'existe pas
  ready: false,
  online: false,
  needsLogin: false,
  user: null,
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
  source: 'source',
};
const V2_FIELDS = ['due', 'waiting', 'waitingSince', 'focus'];

function taskFromRow(r) {
  return {
    id: r.id, p: r.priority ?? null, c: r.contact || '', t: r.text || '',
    done: !!r.done, star: !!r.star, sort: r.sort ?? null,
    due: r.due_date || null, waiting: !!r.waiting, waitingSince: r.waiting_since || null,
    focus: r.focus_date || null, createdAt: r.created_at || null, source: r.source || null,
  };
}

function inboxFromRow(r) {
  return {
    id: r.id, source: r.source, receivedOn: r.received_on || null, sender: r.sender || '',
    subject: r.subject || '', summary: r.summary || '', action: r.proposed_action || '',
    p: r.proposed_priority ?? null, due: r.proposed_due || null, draft: r.draft_reply || '',
    urgent: !!r.urgent, urgencyReason: r.urgency_reason || '', needsAction: r.needs_action !== false,
    status: r.status, createdAt: r.created_at || null, sourceKey: r.source_key || null,
  };
}

const REQUEST_MAP = {
  kind: 'kind', source: 'source', sourceKey: 'source_key', inboxId: 'inbox_id', receivedOn: 'received_on',
  requester: 'requester', organization: 'organization', eventName: 'event_name', eventDate: 'event_date',
  replyBy: 'reply_by', ask: 'ask', summary: 'summary', draft: 'draft_reply', status: 'status',
  promising: 'promising', notes: 'notes',
};

function requestFromRow(r) {
  return {
    id: r.id, kind: r.kind, source: r.source || 'manuel', sourceKey: r.source_key || null,
    inboxId: r.inbox_id || null, receivedOn: r.received_on || null, requester: r.requester || '',
    organization: r.organization || '', eventName: r.event_name || '', eventDate: r.event_date || null,
    replyBy: r.reply_by || null, ask: r.ask || '', summary: r.summary || '', draft: r.draft_reply || '',
    status: r.status || 'new', promising: !!r.promising, notes: r.notes || '', createdAt: r.created_at || null,
  };
}

function requestToRow(fields) {
  const row = {};
  for (const k in fields) if (REQUEST_MAP[k]) row[REQUEST_MAP[k]] = fields[k] === '' && /Date|replyBy|receivedOn/.test(k) ? null : fields[k];
  return row;
}

function toRow(fields) {
  const row = {};
  for (const k in fields) if (FIELD_MAP[k]) row[FIELD_MAP[k]] = fields[k];
  return row;
}

function ideaFromRow(r) { return { id: r.id, text: r.text || '', createdAt: r.created_at || null }; }

// --- Démarrage ---

function loadCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached) { state.tasks = cached.tasks || []; state.ideas = cached.ideas || []; }
  } catch (e) {}
}

export async function init() {
  const cfg = window.APP_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || !window.supabase) {
    loadCache();
    state.ready = true;
    emit();
    return;
  }
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // Sans session, rien n'est affiché, pas même la copie locale.
  const { data } = await sb.auth.getSession();
  if (!data.session) { showLogin(); return; }
  state.user = data.session.user.email;
  loadCache();
  listeners.forEach(fn => fn());
  await loadRemote();

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') showLogin();
  });
}

function showLogin() {
  state.needsLogin = true;
  state.user = null;
  state.tasks = [];
  state.ideas = [];
  state.inbox = [];
  state.inboxHistory = null;
  state.requests = [];
  state.ready = true;
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
  listeners.forEach(fn => fn());
}

// --- Connexion par adresse + mot de passe ---
// (Le code par e-mail demande un serveur d'envoi personnalisé sur l'offre gratuite de Supabase.)

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return error.message;
  state.needsLogin = false;
  state.user = data.user ? data.user.email : email;
  state.ready = false;
  listeners.forEach(fn => fn());
  await loadRemote();
  return null;
}

export async function signOut() {
  if (sb) { sb.removeAllChannels(); await sb.auth.signOut(); }
  showLogin();
}

async function loadRemote() {
  try {
    const [tasksRes, ideasRes, inboxRes, requestsRes] = await Promise.all([
      sb.from('tasks').select('*').order('id', { ascending: true }),
      sb.from('ideas').select('*').order('created_at', { ascending: false }),
      sb.from('inbox_items').select('*').eq('status', 'new').order('received_on', { ascending: false }),
      sb.from('requests').select('*').order('received_on', { ascending: false }).limit(3000),
    ]);
    if (inboxRes.error) { state.inboxAvailable = false; state.inbox = []; }
    else { state.inboxAvailable = true; state.inbox = inboxRes.data.map(inboxFromRow); }
    if (requestsRes.error) { state.requestsAvailable = false; state.requests = []; }
    else { state.requestsAvailable = true; state.requests = requestsRes.data.map(requestFromRow); }
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_items' }, payload => {
      const row = payload.new && payload.new.id ? payload.new : null;
      const id = row ? row.id : payload.old.id;
      state.inbox = state.inbox.filter(x => x.id !== id);
      if (state.inboxHistory) state.inboxHistory = state.inboxHistory.filter(x => x.id !== id);
      if (row && row.status === 'new') state.inbox.push(inboxFromRow(row));
      else if (row && state.inboxHistory) state.inboxHistory.unshift(inboxFromRow(row));
      emit();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, payload => {
      if (payload.eventType === 'DELETE') {
        state.requests = state.requests.filter(x => x.id !== payload.old.id);
      } else {
        const r = requestFromRow(payload.new);
        const i = state.requests.findIndex(x => x.id === r.id);
        if (i >= 0) state.requests[i] = r; else state.requests.unshift(r);
      }
      emit();
    })
    .subscribe();
}

// --- Tâches ---

export function getTask(id) { return state.tasks.find(x => x.id === id); }

export async function createTask({ p = null, c = '', t = '', star = false, due = null, source = null, waiting = false }) {
  const now = new Date().toISOString();
  const local = {
    id: tmpId--, p, c, t, done: false, star, sort: Date.now(),
    due, waiting, waitingSince: waiting ? now : null, focus: null, createdAt: now, source,
  };
  state.tasks.push(local);
  emit();
  if (!sb) return local;
  const row = { priority: p, contact: c, text: t, done: false, star, sort: local.sort };
  if (due) row.due_date = due;
  if (source) row.source = source;
  if (waiting) { row.waiting = true; row.waiting_since = now; }
  const { data, error } = await sb.from('tasks').insert([row]).select().single();
  if (error) { report(error, 'La tâche est enregistrée sur cet appareil mais pas synchronisée.'); return local; }
  const created = taskFromRow(data);
  const i = state.tasks.indexOf(local);
  if (state.tasks.some(x => x.id === data.id)) { if (i >= 0) state.tasks.splice(i, 1); }
  else if (i >= 0) state.tasks[i] = created;
  emit();
  return created;
}

// --- Messages à trier ---

function setInboxStatus(id, fields, known = null) {
  const item = known || state.inbox.find(x => x.id === id);
  state.inbox = state.inbox.filter(x => x.id !== id);
  if (item && state.inboxHistory) state.inboxHistory.unshift({ ...item, status: fields.status });
  emit();
  if (!sb) return;
  sb.from('inbox_items').update(fields).eq('id', id)
    .then(({ error }) => { if (error) report(error, 'Le message n\'a pas été mis à jour dans la base.'); });
}

// Transforme un message en tâche : contact = expéditeur, action = action proposée.
export async function inboxToTask(id, { p, waiting = false }) {
  const item = state.inbox.find(x => x.id === id);
  if (!item) return;
  state.inbox = state.inbox.filter(x => x.id !== id);
  const task = await createTask({
    p, c: item.sender, t: item.action || item.summary, star: item.urgent,
    due: item.due, source: item.source, waiting,
  });
  setInboxStatus(id, { status: 'task', task_id: task && task.id > 0 ? task.id : null }, item);
}

export function ignoreInbox(id) { setInboxStatus(id, { status: 'ignored' }); }

// Archive plusieurs messages d'un coup (une seule requête). Renvoie les messages archivés,
// pour pouvoir annuler.
export function ignoreInboxMany(ids) {
  const items = state.inbox.filter(x => ids.includes(x.id));
  if (!items.length) return [];
  state.inbox = state.inbox.filter(x => !ids.includes(x.id));
  if (state.inboxHistory) state.inboxHistory.unshift(...items.map(i => ({ ...i, status: 'ignored' })));
  emit();
  if (sb) {
    sb.from('inbox_items').update({ status: 'ignored' }).in('id', items.map(i => i.id))
      .then(({ error }) => { if (error) report(error, 'Les messages n\'ont pas été archivés dans la base.'); });
  }
  return items;
}

// Annule un archivage : les messages reviennent à trier, tels qu'ils étaient.
export function undoIgnoreInbox(items) {
  if (!items.length) return;
  const ids = items.map(i => i.id);
  if (state.inboxHistory) state.inboxHistory = state.inboxHistory.filter(x => !ids.includes(x.id));
  state.inbox = [...state.inbox.filter(x => !ids.includes(x.id)), ...items.map(i => ({ ...i, status: 'new' }))];
  emit();
  if (!sb) return;
  sb.from('inbox_items').update({ status: 'new' }).in('id', ids)
    .then(({ error }) => { if (error) report(error, 'L\'archivage n\'a pas pu être annulé dans la base.'); });
}

// --- Historique : messages déjà traités (chargés à la demande) ---

export async function loadInboxHistory() {
  if (!sb) { state.inboxHistory = []; return; }
  const { data, error } = await sb.from('inbox_items').select('*').neq('status', 'new')
    .order('received_on', { ascending: false }).limit(1000);
  if (error) { report(error, 'L\'historique des messages n\'a pas pu être chargé.'); return; }
  state.inboxHistory = data.map(inboxFromRow);
  emit();
}

// Remet un message déjà traité dans « À trier » (rien n'est effacé, la tâche éventuelle reste).
export function restoreInbox(id) {
  const item = (state.inboxHistory || []).find(x => x.id === id);
  if (!item) return;
  state.inboxHistory = state.inboxHistory.filter(x => x.id !== id);
  state.inbox.push({ ...item, status: 'new' });
  emit();
  if (!sb) return;
  sb.from('inbox_items').update({ status: 'new' }).eq('id', id)
    .then(({ error }) => { if (error) report(error, 'Le message n\'a pas pu être remis à trier.'); });
}

// Remet plusieurs messages de l'historique à trier (une seule requête).
export function restoreInboxMany(ids) {
  const items = (state.inboxHistory || []).filter(x => ids.includes(x.id));
  if (!items.length) return 0;
  state.inboxHistory = state.inboxHistory.filter(x => !ids.includes(x.id));
  state.inbox.push(...items.map(i => ({ ...i, status: 'new' })));
  emit();
  if (sb) {
    sb.from('inbox_items').update({ status: 'new' }).in('id', items.map(i => i.id))
      .then(({ error }) => { if (error) report(error, 'Les messages n\'ont pas pu être remis à trier.'); });
  }
  return items.length;
}

// --- Demandes (sponsoring, lots, visuels) ---
// Jamais supprimées : une demande close garde son issue, pour l'historique.

export function getRequest(id) { return state.requests.find(x => x.id === id); }

export async function createRequest(fields) {
  const local = {
    id: tmpId--, kind: 'sponsoring', source: 'manuel', sourceKey: null, inboxId: null, receivedOn: today(),
    requester: '', organization: '', eventName: '', eventDate: null, replyBy: null, ask: '', summary: '',
    draft: '', status: 'new', promising: false, notes: '', createdAt: new Date().toISOString(), ...fields,
  };
  state.requests.unshift(local);
  emit();
  if (!sb) return local;
  if (!state.requestsAvailable) {
    report(null, 'Demande gardée sur cet appareil : l\'espace Demandes demande la mise à jour de la base (script sql/2026-10-demandes.sql).');
    return local;
  }
  const { id, createdAt, ...rest } = local;
  const { data, error } = await sb.from('requests').insert([requestToRow(rest)]).select().single();
  if (error) {
    report(error, /duplicate|unique/i.test(error.message || '') ? 'Ce message est déjà enregistré comme demande.' : 'La demande est enregistrée sur cet appareil mais pas synchronisée.');
    return local;
  }
  const created = requestFromRow(data);
  const i = state.requests.indexOf(local);
  if (state.requests.some(x => x.id === data.id)) { if (i >= 0) state.requests.splice(i, 1); }
  else if (i >= 0) state.requests[i] = created;
  emit();
  return created;
}

export function updateRequest(id, fields) {
  const r = getRequest(id);
  if (!r) return;
  Object.assign(r, fields);
  emit();
  if (!sb || id < 0) return;
  sb.from('requests').update({ ...requestToRow(fields), updated_at: new Date().toISOString() }).eq('id', id)
    .then(({ error }) => { if (error) report(error, 'La demande n\'a pas été mise à jour dans la base.'); });
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

// Suggestions : d'abord les échéances dépassées ou du jour, puis les premières tâches
// de la liste, dans l'ordre de l'écran Tâches (catégorie 0 à 4, puis l'ordre choisi à la main).
// Les tâches en attente d'une réponse et celles à classer ne sont pas proposées.
export function focusSuggestions(limit) {
  const d = today();
  const candidates = state.tasks.filter(t => !t.done && !t.waiting && t.focus !== d && t.p !== null && t.p !== undefined);
  const late = candidates.filter(t => t.due && daysUntil(t.due) <= 0)
    .sort((a, b) => a.due.localeCompare(b.due) || a.p - b.p || (a.sort ?? a.id) - (b.sort ?? b.id));
  const rest = candidates.filter(t => !late.includes(t))
    .sort((a, b) => a.p - b.p || (a.sort ?? a.id) - (b.sort ?? b.id));
  return [...late, ...rest].slice(0, limit);
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

// Bilan de la semaine : une carte sur l'accueil du vendredi au dimanche (et à la demande),
// préparée par Prioris. Alex ne rédige rien : il décide, un appui par ligne.
import { state } from '../store.js';
import { today, addDays, isoDate, daysSince, daysUntil } from '../dates.js';
import { esc } from '../ui.js';

const STALE_DAYS = 30;      // une tâche « traîne » après un mois sans être faite
const RELANCE_DAYS = 5;     // une attente devient « à relancer » après 5 jours
export const POSTPONE_DAYS = 14;
const HIDE_KEY = 'prioris_v2_week_hidden';

let forced = false;

export function monday(iso = today()) {
  const d = new Date(iso + 'T12:00:00');
  return addDays(iso, -((d.getDay() + 6) % 7));
}

function isReviewDay() { return [5, 6, 0].includes(new Date().getDay()); }

function hiddenThisWeek() {
  try { return localStorage.getItem(HIDE_KEY) === monday(); } catch (e) { return false; }
}

export function showWeek() { forced = true; try { localStorage.removeItem(HIDE_KEY); } catch (e) {} }
export function hideWeek() { forced = false; try { localStorage.setItem(HIDE_KEY, monday()); } catch (e) {} }
export function weekVisible() { return forced || (isReviewDay() && !hiddenThisWeek()); }

export function doneThisWeek() {
  const from = monday();
  return state.tasks.filter(t => t.done && !t.abandoned && t.doneAt && isoDate(new Date(t.doneAt)) >= from)
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
}

// Tâches ouvertes depuis plus d'un mois, sans échéance à venir, pas revues depuis un mois.
export function staleTasks() {
  const limit = addDays(today(), -STALE_DAYS);
  return state.tasks.filter(t => !t.done && !t.waiting && t.createdAt && isoDate(new Date(t.createdAt)) <= limit
    && !(t.due && daysUntil(t.due) >= 0) && t.focus !== today()
    && (!t.reviewedOn || t.reviewedOn <= limit))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export function toChase() {
  return state.tasks.filter(t => !t.done && t.waiting && daysSince(t.waitingSince) >= RELANCE_DAYS)
    .sort((a, b) => (a.waitingSince || '').localeCompare(b.waitingSince || ''));
}

export function relanceDraft(t) {
  return `Bonjour${t.c ? ` ${t.c.split(/[\s(]/)[0]}` : ''},\n\nJe me permets de revenir vers vous au sujet de : ${t.t || 'notre dernier échange'}.\nAvez-vous pu avancer de votre côté ?\n\nBelle journée,\nAlex`;
}

function age(t) {
  const d = daysSince(t.createdAt);
  return d >= 60 ? `${Math.floor(d / 30)} mois` : `${d} j`;
}

export function weekCard() {
  const done = doneThisWeek();
  const stale = staleTasks();
  const chase = toChase();
  const requests = state.requests.filter(r => r.receivedOn && r.receivedOn >= monday()).length;
  const clean = !stale.length && !chase.length;

  return `
  <section class="card week-card" aria-labelledby="week-title">
    <div class="card-head">
      <h2 id="week-title">Ta semaine</h2>
      <button class="link" data-action="week-hide">Masquer</button>
    </div>
    <p class="muted small">Prioris a préparé le ménage : un appui par ligne, environ 5 minutes.</p>

    <div class="week-block">
      <p class="label">Terminé cette semaine · ${done.length}</p>
      ${done.length ? `<ul class="mini-list">${done.slice(0, 5).map(t => `<li class="idea-mini"><span>✓ ${esc(t.c ? `${t.c} : ${t.t}` : t.t)}</span></li>`).join('')}</ul>
        ${done.length > 5 ? `<p class="muted small">et ${done.length - 5} autre${done.length - 5 > 1 ? 's' : ''}</p>` : ''}`
        : `<p class="empty">${state.schemaWeek ? 'Rien de coché pour l\'instant cette semaine.' : 'Disponible après la mise à jour de la base (script sql/2026-10-bilan-archivages.sql).'}</p>`}
      ${requests ? `<p class="muted small">${requests} demande${requests > 1 ? 's' : ''} de sponsoring, lots ou visuels reçue${requests > 1 ? 's' : ''} cette semaine.</p>` : ''}
    </div>

    ${stale.length ? `
    <div class="week-block">
      <p class="label">Ça traîne depuis plus d'un mois · ${stale.length}</p>
      <ul class="week-list">${stale.slice(0, 6).map(t => `
        <li>
          <button class="week-text" data-action="edit" data-id="${t.id}">${t.c ? `<b>${esc(t.c)}</b> ` : ''}${esc(t.t || 'sans description')} <span class="muted small">· ${age(t)}</span></button>
          <span class="week-btns">
            <button class="btn small-btn" data-action="week-keep" data-id="${t.id}">Garder</button>
            <button class="btn small-btn" data-action="week-postpone" data-id="${t.id}">Reporter</button>
            <button class="btn small-btn ghost danger" data-action="week-abandon" data-id="${t.id}">Abandonner</button>
          </span>
        </li>`).join('')}</ul>
      ${stale.length > 6 ? `<p class="muted small">Encore ${stale.length - 6} après celles-ci.</p>` : ''}
    </div>` : ''}

    ${chase.length ? `
    <div class="week-block">
      <p class="label">À relancer · ${chase.length}</p>
      <ul class="week-list">${chase.slice(0, 6).map(t => `
        <li>
          <details class="week-chase">
            <summary>${t.c ? `<b>${esc(t.c)}</b> ` : ''}${esc(t.t || '')} <span class="warn small">· ${daysSince(t.waitingSince)} j sans réponse</span></summary>
            <p class="draft" id="relance-${t.id}">${esc(relanceDraft(t))}</p>
          </details>
          <span class="week-btns">
            <button class="btn small-btn" data-action="copy-draft" data-target="relance-${t.id}">Copier la relance</button>
            <button class="btn small-btn" data-action="week-chased" data-id="${t.id}">Relancé</button>
          </span>
        </li>`).join('')}</ul>
    </div>` : ''}

    ${clean ? '<p class="empty">Rien qui traîne, personne à relancer. Belle semaine.</p>' : ''}
  </section>`;
}

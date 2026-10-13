// Boîte à idées : ce qui te passe par la tête, sans échéance ni priorité.
import { state } from '../store.js';
import { shortDateTime } from '../dates.js';
import { esc } from '../ui.js';

export function renderIdeas() {
  return `
  <header class="page-head">
    <h1>Idées</h1>
    <p class="muted">${state.ideas.length ? `${state.ideas.length} idée${state.ideas.length > 1 ? 's' : ''}` : 'Ta boîte à idées est vide'} · elles ne comptent pas dans tes tâches</p>
  </header>
  ${!state.ideasAvailable && state.online ? `<div class="notice"><b>Boîte à idées pas encore synchronisée.</b> Exécute le script SQL de l'étape 1 dans Supabase ; en attendant, tes idées restent sur cet appareil.</div>` : ''}
  <button class="btn primary wide" data-action="capture" data-mode="idea">Noter une idée</button>
  ${state.ideas.length ? `
  <ul class="idea-list">
    ${state.ideas.map(i => `
    <li class="card idea">
      <p class="idea-text">${esc(i.text)}</p>
      <div class="idea-foot">
        <span class="muted small">${esc(shortDateTime(i.createdAt))}</span>
        <span class="spacer"></span>
        <button class="btn ghost danger small-btn" data-action="idea-delete" data-id="${i.id}">Supprimer</button>
        <button class="btn small-btn" data-action="idea-to-task" data-id="${i.id}">En faire une tâche</button>
      </div>
    </li>`).join('')}
  </ul>` : `<p class="empty card">Quand une idée te vient, appuie sur + et choisis « Idée ». Tu pourras la transformer en tâche le jour où elle mûrit.</p>`}`;
}

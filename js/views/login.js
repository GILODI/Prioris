// Connexion : adresse mail + mot de passe, une seule fois par appareil.
import { esc } from '../ui.js';

export const login = { email: lastEmail(), message: '', busy: false };

function lastEmail() {
  try { return localStorage.getItem('prioris_last_email') || ''; } catch (e) { return ''; }
}

export function rememberEmail(email) {
  try { localStorage.setItem('prioris_last_email', email); } catch (e) {}
}

export function renderLogin() {
  const msg = login.message ? `<p class="login-msg" role="alert">${esc(login.message)}</p>` : '';
  return `
  <section class="login card">
    <img src="icon-192.png" alt="" width="56" height="56">
    <h1>Connexion à Prioris</h1>
    <p class="muted">Tes tâches, tes idées et bientôt tes messages ne sont visibles qu'une fois connecté. Tu ne le fais qu'une fois par appareil.</p>
    <form data-form="login" class="login-form">
      <label class="field">Adresse mail
        <input id="login-email" name="email" type="email" autocomplete="username" required value="${esc(login.email)}" placeholder="prenom@exemple.fr">
      </label>
      <label class="field">Mot de passe
        <input id="login-password" name="password" type="password" autocomplete="current-password" required>
      </label>
      ${msg}
      <button type="submit" class="btn primary wide"${login.busy ? ' disabled' : ''}>${login.busy ? 'Connexion…' : 'Se connecter'}</button>
    </form>
  </section>`;
}

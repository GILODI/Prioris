// Connexion : adresse mail, puis code à 6 chiffres reçu par mail.
// Un code plutôt qu'un lien : sur téléphone, un lien s'ouvrirait dans le navigateur
// et pas dans l'application installée.
import { esc } from '../ui.js';

export const login = { step: 'email', email: lastEmail(), message: '', busy: false };

function lastEmail() {
  try { return localStorage.getItem('prioris_last_email') || ''; } catch (e) { return ''; }
}

export function rememberEmail(email) {
  try { localStorage.setItem('prioris_last_email', email); } catch (e) {}
}

export function renderLogin() {
  const msg = login.message ? `<p class="login-msg" role="alert">${esc(login.message)}</p>` : '';
  if (login.step === 'code') {
    return `
    <section class="login card">
      <img src="icon-192.png" alt="" width="56" height="56">
      <h1>Entre ton code</h1>
      <p class="muted">Un code à 6 chiffres vient d'être envoyé à <b>${esc(login.email)}</b>. Il peut mettre une minute à arriver.</p>
      <form data-form="login-code" class="login-form">
        <label class="field">Code reçu par mail
          <input id="login-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="123456">
        </label>
        ${msg}
        <button type="submit" class="btn primary wide"${login.busy ? ' disabled' : ''}>${login.busy ? 'Vérification…' : 'Se connecter'}</button>
      </form>
      <button class="link" data-action="login-back">Changer d'adresse ou renvoyer un code</button>
    </section>`;
  }
  return `
  <section class="login card">
    <img src="icon-192.png" alt="" width="56" height="56">
    <h1>Connexion à Prioris</h1>
    <p class="muted">Tes tâches, tes idées et bientôt tes messages ne sont visibles qu'une fois connecté. Tu ne le fais qu'une fois par appareil.</p>
    <form data-form="login-email" class="login-form">
      <label class="field">Adresse mail
        <input id="login-email" name="email" type="email" autocomplete="email" required value="${esc(login.email)}" placeholder="prenom@exemple.fr">
      </label>
      ${msg}
      <button type="submit" class="btn primary wide"${login.busy ? ' disabled' : ''}>${login.busy ? 'Envoi…' : 'Recevoir un code'}</button>
    </form>
  </section>`;
}

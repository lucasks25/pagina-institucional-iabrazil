(() => {
  'use strict';

  const key = 'iabr-analytics-consent-v1';
  const changeEvent = 'iabr:privacy-change';
  const english = document.documentElement.lang.toLowerCase().startsWith('en');
  const copy = english ? {
    title: 'Cookie preferences',
    description: 'We save your preference so the site remembers it. If you allow analytics, we measure page visits, time on the site and interactions to improve it.',
    policy: 'Privacy Policy',
    minimum: 'Essential only',
    accept: 'Allow analytics',
  } : {
    title: 'Preferências de cookies',
    description: 'Salvamos sua preferência para o site lembrar da sua escolha. Se você autorizar as estatísticas, medimos páginas visitadas, tempo de navegação e interações para melhorar o site.',
    policy: 'Política de Privacidade',
    minimum: 'Aceitar o mínimo',
    accept: 'Aceitar estatísticas',
  };
  let fallbackChoice = null;

  function readChoice() {
    if (fallbackChoice) return fallbackChoice;
    try { return localStorage.getItem(key); } catch { return null; }
  }

  window.IABRPrivacy = { allowsAnalytics: () => readChoice() === 'accepted' };

  const banner = document.createElement('section');
  banner.className = 'privacy-consent';
  banner.setAttribute('aria-labelledby', 'privacy-consent-title');
  banner.hidden = true;
  banner.innerHTML = `
    <div class="privacy-consent-copy">
      <h2 id="privacy-consent-title" tabindex="-1">${copy.title}</h2>
      <p>${copy.description} <a class="privacy-consent-policy">${copy.policy}</a></p>
    </div>
    <div class="privacy-consent-actions">
      <button class="privacy-consent-minimum" type="button">${copy.minimum}</button>
      <button class="privacy-consent-accept" type="button">${copy.accept}</button>
    </div>`;
  banner.querySelector('.privacy-consent-policy').href = new URL('../privacidade.html#cookies', document.currentScript.src).href;
  document.body.append(banner);

  let preferencesButton;
  let openedFromFooter = false;
  const legal = document.querySelector('#rodape .circular-footer-legal');
  if (legal) {
    preferencesButton = document.createElement('button');
    preferencesButton.type = 'button';
    preferencesButton.className = 'privacy-consent-preferences';
    preferencesButton.textContent = copy.title;
    preferencesButton.addEventListener('click', () => {
      openedFromFooter = true;
      banner.hidden = false;
      banner.querySelector('h2').focus();
    });
    legal.append(preferencesButton);
  }

  function syncChoice() {
    const choice = readChoice();
    if (!openedFromFooter) banner.hidden = choice === 'accepted' || choice === 'rejected';
    window.dispatchEvent(new Event(changeEvent));
  }

  function closePreferences() {
    banner.hidden = true;
    if (openedFromFooter) preferencesButton.focus();
    openedFromFooter = false;
  }

  function choose(choice) {
    try { localStorage.setItem(key, choice); } catch { fallbackChoice = choice; }
    closePreferences();
    syncChoice();
  }

  banner.querySelector('.privacy-consent-minimum').addEventListener('click', () => choose('rejected'));
  banner.querySelector('.privacy-consent-accept').addEventListener('click', () => choose('accepted'));
  banner.addEventListener('keydown', event => {
    if (event.key === 'Escape' && openedFromFooter && readChoice()) closePreferences();
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) syncChoice();
  });
  window.addEventListener('pageshow', syncChoice);
  syncChoice();
})();

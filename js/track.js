/* IA BRAZIL — estatísticas de visitas, próprias e sem cookies.
   Guarda só: página, de onde a pessoa veio, país/cidade (pelo servidor), tipo de aparelho e cliques em WhatsApp/e-mail.
   Não guarda IP, não usa cookies e respeita "Não rastrear" do navegador. */
(() => {
  'use strict';
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  try { if (localStorage.getItem('iabr-no-track')) return; } catch {}
  if (/bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent)) return;

  const KEY = 'iabr-ft'; // primeira página da visita (fica só nesta aba, some ao fechar)
  const q = new URLSearchParams(location.search);
  const utm = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => {
    const v = q.get(k);
    if (v) utm[k] = v.slice(0, 80);
  });

  // Site de origem só conta se for outro site (sem parâmetros)
  let ref = '';
  try {
    const r = new URL(document.referrer);
    if (r.origin !== location.origin) ref = r.origin + r.pathname;
  } catch {}

  let first = false;
  try {
    if (!sessionStorage.getItem(KEY)) {
      first = true;
      sessionStorage.setItem(KEY, JSON.stringify({ ref, landing: location.pathname, ...utm }));
    }
  } catch { first = true; }

  const send = (body) => {
    try {
      fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
    } catch {}
  };

  const lang = document.documentElement.lang || '';
  send({ t: 'view', path: location.pathname, entry: first, ref: first ? ref : '', utm: first ? utm : undefined, lang });

  // Cliques que viram conversa
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (a.hasAttribute('data-wa') || /wa\.me\//.test(href)) send({ t: 'whatsapp', path: location.pathname });
    else if (/^mailto:/i.test(href)) send({ t: 'email', path: location.pathname });
  }, { capture: true, passive: true });
})();

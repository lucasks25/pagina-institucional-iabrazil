/* IA BRAZIL — estatísticas de visitas, próprias e sem cookies.
   Guarda só: página, de onde a pessoa veio, país/estado/cidade (pelo servidor), aparelho, navegador, tempo na página,
   até onde rolou, cliques em botões e as etapas do contato. Não guarda IP, não usa cookies, não identifica a pessoa
   e respeita "Não rastrear" do navegador. O código de visita (sid) só existe enquanto a aba está aberta. */
(() => {
  'use strict';
  const KEY = 'iabr-ft'; // primeira página da visita (fica só nesta aba, some ao fechar)
  const q = new URLSearchParams(location.search);
  const utm = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => {
    const v = q.get(k);
    if (v) utm[k] = v.slice(0, 80);
  });

  // Limpa o endereço: depois de lida, a campanha não precisa ficar visível na barra do navegador
  if (Object.keys(utm).length) {
    try {
      Object.keys(utm).forEach((k) => q.delete(k));
      const rest = q.toString();
      history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    } catch {}
  }

  window.IABRTrack = () => {}; // vira função de verdade só se o rastreio estiver ligado
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  try { if (localStorage.getItem('iabr-no-track')) return; } catch {}
  if (/bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent)) return;

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

  // Código da visita: aleatório, vale só para esta aba e some ao fechá-la
  const rand = () => {
    try { return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join(''); } catch { return Math.random().toString(16).slice(2, 18).padEnd(16, '0'); }
  };
  let sid = '';
  try { sid = sessionStorage.getItem('iabr-sid') || ''; if (!sid) { sid = rand(); sessionStorage.setItem('iabr-sid', sid); } } catch { sid = rand(); }

  const send = (body, leaving) => {
    const data = JSON.stringify({ sid, path: location.pathname, ...body });
    try {
      // Ao sair da página o navegador cancela pedidos comuns; sendBeacon foi feito para isso
      if (leaving && navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([data], { type: 'application/json' }))) return;
      fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: data }).catch(() => {});
    } catch {}
  };
  const once = new Set(); // cada etapa do funil conta uma vez por visita
  const step = (t, label) => {
    const k = t + label;
    try { if (sessionStorage.getItem('iabr-' + k)) return; sessionStorage.setItem('iabr-' + k, '1'); } catch { if (once.has(k)) return; once.add(k); }
    send({ t, label });
  };
  window.IABRTrack = (t, label) => step(t, label || '');

  send({ t: 'view', entry: first, ref: first ? ref : '', utm: first ? utm : undefined, lang: document.documentElement.lang || '' });

  /* Tempo na página (só enquanto a aba está visível) e até onde rolou */
  let since = document.visibilityState === 'visible' ? Date.now() : 0;
  let acc = 0, maxScroll = 0, sentScroll = 0;
  const measure = () => {
    const h = document.documentElement;
    maxScroll = Math.max(maxScroll, Math.min(100, Math.round(((window.scrollY + window.innerHeight) / Math.max(h.scrollHeight, 1)) * 100)));
  };
  addEventListener('scroll', measure, { passive: true });
  measure();
  const flush = (leaving) => {
    if (since) { acc += Date.now() - since; since = leaving === 'beat' ? Date.now() : 0; }
    const dur = Math.round(acc / 1000);
    if (dur >= 1 || maxScroll > sentScroll) {
      send({ t: 'tempo', dur, scroll: maxScroll }, leaving === true);
      acc = 0; sentScroll = maxScroll;
    }
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); else since = Date.now(); });
  addEventListener('pagehide', () => flush(true));
  // Aviso a cada 20 s enquanto a pessoa está na página: o tempo não se perde se o navegador fechar de repente
  setInterval(() => { if (document.visibilityState === 'visible') flush('beat'); }, 20000);

  /* Cliques: conversa (WhatsApp, e-mail) e botões do site */
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a, button');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (a.hasAttribute('data-wa') || /wa\.me\//.test(href)) { send({ t: 'whatsapp' }); return; }
    if (/^mailto:/i.test(href)) { send({ t: 'email' }); return; }
    if (a.matches('.btn, .nav-cta, [data-cta]') && a.type !== 'submit') {
      const label = (a.getAttribute('data-cta') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (label) send({ t: 'clique', label });
    }
  }, { capture: true, passive: true });

  /* Funil: começou a preencher o e-mail do topo ou o formulário */
  document.addEventListener('focusin', (e) => {
    const f = e.target.closest && e.target.closest('form');
    if (!f) return;
    if (f.matches('[data-hero-capture]')) step('form_inicio', 'topo');
    else if (f.matches('#form-contato, .lead-form, form[data-compose]')) step('form_inicio', 'formulario');
  });
})();

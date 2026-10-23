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
  // Código do clique no anúncio do Google: guardado só nesta aba, e só vai junto se a pessoa enviar o formulário
  const ads = {};
  ['gclid', 'gbraid', 'wbraid'].forEach((k) => {
    const v = q.get(k);
    if (v && /^[\w.-]{4,200}$/.test(v)) ads[k] = v;
  });
  // Anúncio sem UTM (só com o código do Google) conta como anúncio, não como acesso direto
  if (Object.keys(ads).length && !utm.utm_source) Object.assign(utm, { utm_source: 'google', utm_medium: 'cpc' });

  // Limpa o endereço: depois de lida, a campanha não precisa ficar visível na barra do navegador
  // Com a tag do Google (Ads/GA4) na página, o endereço fica intacto: ela precisa ler gclid e UTM para atribuir a conversão
  const googleTag = !!document.querySelector('script[src*="googletagmanager.com"]');
  if (!googleTag && (Object.keys(utm).length || Object.keys(ads).length)) {
    try {
      Object.keys(utm).concat(Object.keys(ads)).forEach((k) => q.delete(k));
      const rest = q.toString();
      history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    } catch {}
  }

  window.IABRTrack = () => {}; // vira função de verdade só se o rastreio estiver ligado
  window.dataLayer = window.dataLayer || [];
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
      sessionStorage.setItem(KEY, JSON.stringify({ ref, landing: location.pathname, ...utm, ...ads }));
    } else if (Object.keys(ads).length) {
      // Chegou por um anúncio no meio da visita: guarda o código do clique sem trocar a página de entrada
      sessionStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(sessionStorage.getItem(KEY)), ...ads }));
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
  /* Eventos no formato do Google (dataLayer). Ficam parados até existir um GA4/Google Ads configurado;
     nunca levam nome, e-mail, telefone ou texto digitado. Clique no WhatsApp não é contato recebido. */
  const layer = (event, params) => { try { window.dataLayer.push({ event, page_path: location.pathname, ...params }); } catch {} };
  const LAYER = { form_inicio: 'lead_form_start', case_view: 'case_view' };

  const once = new Set(); // cada etapa do funil conta uma vez por visita
  const step = (t, label) => {
    const k = t + label;
    try { if (sessionStorage.getItem('iabr-' + k)) return; sessionStorage.setItem('iabr-' + k, '1'); } catch { if (once.has(k)) return; once.add(k); }
    send({ t, label });
    // Só o formulário completo é generate_lead. O e-mail do topo é interesse inicial (lead_interest) e vale menos.
    if (t === 'envio' && label === 'topo') layer('lead_interest', { form_location: 'topo', lead_stage: 'interesse_inicial' });
    else if (t === 'envio') layer('generate_lead', { form_location: label || 'formulario', lead_stage: 'lead_recebido' });
    else if (LAYER[t]) layer(LAYER[t], t === 'case_view' ? { case_id: label } : { form_location: label || 'formulario' });
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
    if (a.hasAttribute('data-wa') || /wa\.me\//.test(href)) { send({ t: 'whatsapp' }); layer('contact_whatsapp_click', {}); return; }
    if (/^mailto:/i.test(href)) { send({ t: 'email' }); layer('contact_email_click', {}); return; }
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

  /* Abandono do formulário: cada campo conta uma vez por visita quando a pessoa termina de preenchê-lo (sai dele com algo escrito).
     Vai só o nome do campo, nunca o que foi digitado. O painel cruza com os envios para mostrar onde as pessoas param. */
  const page = location.pathname.replace(/\.html$/, '').replace(/^\/$/, '/index') || '/index';
  document.addEventListener('focusout', (e) => {
    const el = e.target;
    const f = el && el.closest && el.closest('form');
    if (!f || !el.name || el.name === 'site' || !f.matches('#form-contato, .lead-form, form[data-compose]')) return;
    if (String(el.value || '').trim()) step('campo', `${page}:${el.name}`.slice(0, 40));
  });

  /* Até onde a pessoa chega: cada seção conta uma vez por visita quando cruza o meio da tela */
  const secoes = document.querySelectorAll('main section[id]');
  if (secoes.length && 'IntersectionObserver' in window) {
    const so = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { step('secao', `${page}#${e.target.id}`.slice(0, 40)); so.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -50% 0px' });
    secoes.forEach((s) => so.observe(s));
  }

  /* Cases vistos: conta uma vez por visita quando metade do case aparece na tela */
  const cases = document.querySelectorAll('article.case-row[id]');
  if (cases.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { step('case_view', e.target.id.slice(0, 40)); io.unobserve(e.target); } });
    }, { threshold: 0.5 });
    cases.forEach((c) => io.observe(c));
  }
})();

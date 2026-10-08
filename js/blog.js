/* IA BRAZIL — portal de notícias (blog.html). Lê window.NOTICIAS (js/noticias-data.js, gerado por
   scripts/atualizar_noticias.py) e monta: data do dia, faixa "Agora", primeira página (manchete + Últimas),
   três destaques, editorias e "Todas as notícias" com filtros, busca e "carregar mais".
   Cada notícia abre a página dela no site (noticias/<slug>.html). O texto vem de terceiros:
   tudo é criado com textContent e só entram links do próprio site ou http(s). */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const grid = $('[data-news-grid]');
  if (!grid) return;

  const data = window.NOTICIAS;
  const okUrl = (u) => (/^https?:\/\//i.test(u || '') || /^noticias\/[a-z0-9-]+\.html$/.test(u || '') ? u : '');
  const items = data && Array.isArray(data.itens) ? data.itens.filter((n) => okUrl(n.url) && n.titulo) : [];
  const updated = $('[data-news-updated]');

  const dateLine = $('[data-news-date]');
  if (dateLine) {
    const today = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    dateLine.textContent = today.charAt(0).toUpperCase() + today.slice(1);
  }

  if (!items.length) {
    updated.textContent = 'Notícias indisponíveis no momento';
    const empty = $('[data-news-empty]');
    empty.textContent = 'As notícias estão sendo atualizadas. Volte em instantes.';
    empty.hidden = false;
    return;
  }
  // Com o JavaScript montando a página, a lista estática (para robôs) sai de cena
  const staticList = $('[data-news-static]');
  if (staticList) staticList.hidden = true;

  /* Datas: "há 2 horas", "ontem"; na coluna Últimas, o horário */
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const day = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
  const hour = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ago = (iso) => {
    const d = new Date(iso);
    const s = (d - Date.now()) / 1000;
    if (Math.abs(s) < 3600) return rtf.format(Math.min(-1, Math.round(s / 60)), 'minute');
    if (Math.abs(s) < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (Math.abs(s) < 7 * 86400) return rtf.format(Math.round(s / 86400), 'day');
    return day.format(d);
  };
  const clock = (iso) => {
    const d = new Date(iso);
    return new Date().toDateString() === d.toDateString() ? hour.format(d) : ago(iso);
  };

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const link = (n, className) => {
    const a = make('a', className);
    a.href = okUrl(n.url);
    return a;
  };

  // Foto da notícia; sem foto (ou se não carregar), um quadro com a fumaça azul e o nome da fonte
  const media = (n) => {
    const fig = make('figure', 'ph news-ph');
    const fallback = () => { fig.classList.add('is-empty'); fig.replaceChildren(make('span', '', n.fonte)); };
    if (!/^https?:\/\//i.test(n.imagem || '')) { fallback(); return fig; }
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', fallback, { once: true });
    img.src = n.imagem;
    fig.append(img);
    return fig;
  };
  const CATEGORIA = { ia: 'Inteligência artificial', tech: 'Tecnologia' };
  const meta = (n, { cat = false } = {}) => {
    const p = make('p', 'news-meta');
    if (cat) p.append(make('span', `news-cat is-${n.categoria === 'ia' ? 'ia' : 'tech'}`, CATEGORIA[n.categoria] || CATEGORIA.tech));
    p.append(make('span', 'news-src', n.fonte), make('span', '', ago(n.data)));
    // Sem resumo em português, a manchete ainda está no idioma da fonte
    if (!n.original && n.lang === 'en') {
      const tag = make('span', 'news-lang', 'EN');
      tag.title = 'Notícia de fonte internacional';
      p.append(tag);
    }
    return p;
  };

  /* Formatos de cartão */
  const card = (n, { big = false, sum = true, heading = 'h3' } = {}) => {
    const a = link(n, big ? 'news-card is-big' : 'news-card');
    const body = make('div', 'news-body');
    body.append(meta(n), make(heading, 'news-h', n.titulo));
    if (sum && n.descricao) body.append(make('p', 'news-sum', n.descricao));
    a.append(media(n), body);
    return a;
  };
  // Manchete principal: foto grande, editoria e título forte embaixo
  const hero = (n) => {
    const a = link(n, 'news-hero');
    const body = make('div', 'news-hero-body');
    body.append(meta(n, { cat: true }), make('h2', 'news-h', n.titulo));
    if (n.descricao) body.append(make('p', 'news-sum', n.descricao));
    a.append(media(n), body);
    return a;
  };
  const compact = (n) => {
    const a = link(n, 'news-compact');
    const body = make('div', 'news-body');
    body.append(meta(n), make('h3', 'news-h', n.titulo));
    a.append(body, media(n));
    return a;
  };
  const latest = (n) => {
    const li = make('li');
    const a = link(n, 'news-latest-item');
    a.append(make('time', 'news-time', clock(n.data)), make('span', 'news-src', n.fonte), make('span', 'news-h', n.titulo));
    li.append(a);
    return li;
  };

  /* Primeira página, destaques e editorias, sem repetir notícia */
  const used = new Set();
  const take = (pred, count, needImage = false) => {
    const out = [];
    for (const n of items) {
      if (out.length >= count) break;
      if (used.has(n) || !pred(n) || (needImage && !n.imagem)) continue;
      used.add(n);
      out.push(n);
    }
    return out;
  };
  // Destaques só com matéria escrita em português; o resto aparece em "Todas as notícias"
  const any = (n) => n.original;

  const front = $('[data-news-front]');
  // Manchete: a mais recente com foto, de preferência de fonte brasileira
  let [lead] = take((n) => n.original && n.lang === 'pt', 1, true);
  if (!lead) [lead] = take(any, 1, true);
  const side = take(any, 5);
  if (front && lead) {
    const col = make('aside', 'news-latest');
    col.append(make('p', 'label', 'Últimas'));
    const ul = make('ul');
    ul.append(...side.map(latest));
    col.append(ul);
    front.append(hero(lead), col);
  }
  const row = $('[data-news-row]');
  if (row) row.append(...take(any, 3, true).map((n) => card(n)));

  const fits = (n, f) => f === 'todas' || n.categoria === f || n.lang === f;
  $$('[data-desk]').forEach((desk) => {
    const f = desk.dataset.desk;
    // Notícia principal da editoria sempre com foto
    const [main] = take((n) => n.original && fits(n, f), 1, true);
    if (!main) { desk.hidden = true; return; }
    const rest = take((n) => n.original && fits(n, f), 3);
    const wrap = $('[data-desk-grid]', desk);
    const list = make('div', 'news-desk-list');
    list.append(...rest.map(compact));
    wrap.append(card(main, { big: false }), list);
  });

  /* Faixa "Agora": as 12 mais recentes, passando sem parar (a lista vai duas vezes para emendar) */
  const ticker = $('[data-news-ticker]');
  if (ticker) {
    const heads = items.filter((n) => n.original).slice(0, 12);
    const run = (hidden) => heads.map((n) => {
      const a = link(n, 'news-ticker-item');
      a.append(make('span', 'news-src', n.fonte), document.createTextNode(n.titulo));
      if (hidden) { a.tabIndex = -1; a.setAttribute('aria-hidden', 'true'); }
      return a;
    });
    ticker.append(...run(false), ...run(true));
  }

  /* Todas as notícias: filtros (categoria ou idioma) + busca sem acento + carregar mais */
  const more = $('[data-news-more]');
  const empty = $('[data-news-empty]');
  const count = $('[data-news-count]');
  const search = $('[data-news-search]');
  const chips = $$('[data-filter]');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const PAGE = 12;
  let filter = 'todas';
  let term = '';
  let shown = PAGE;
  const matches = (n) => fits(n, filter) && (!term || norm(`${n.titulo} ${n.descricao} ${n.fonte} ${(n.assuntos || []).join(' ')}`).includes(term));
  const render = () => {
    const list = items.filter(matches);
    grid.replaceChildren(...list.slice(0, shown).map((n) => card(n)));
    more.hidden = list.length <= shown;
    empty.hidden = list.length > 0;
    count.textContent = list.length === 1 ? '1 notícia' : `${list.length} notícias`;
  };
  const choose = (f) => {
    filter = f;
    shown = PAGE;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === f)));
    render();
  };
  chips.forEach((chip) => {
    chip.addEventListener('click', () => choose(chip.dataset.filter));
  });
  // "Ver todas" de cada editoria: filtra e desce até a lista
  $$('[data-goto]').forEach((btn) => btn.addEventListener('click', () => {
    choose(btn.dataset.goto);
    $('#noticias').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  let typing = 0;
  search.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => { term = norm(search.value.trim()); shown = PAGE; render(); }, 150);
  });
  more.addEventListener('click', () => {
    const before = shown;
    shown += PAGE;
    render();
    const next = grid.children[before];
    if (next) next.focus({ preventScroll: true });
  });

  const fontes = Array.isArray(data.fontes) ? data.fontes : [];
  updated.textContent = `Atualizado ${ago(data.atualizado)} · ${items.length} notícias de ${fontes.length} fontes`;
  const sources = $('[data-news-sources]');
  if (sources) {
    const links = fontes.filter((f) => /^https?:\/\//i.test(f.site || '')).map((f) => {
      const a = make('a', '', f.nome);
      a.href = f.site;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      return a;
    });
    links.forEach((a, i) => {
      if (i) sources.append(i === links.length - 1 ? ' e ' : ', ');
      sources.append(a);
    });
  }

  render();
})();

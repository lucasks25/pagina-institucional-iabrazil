/* IA BRAZIL — aba "Visitas" do painel: de onde vêm as pessoas e os contatos.
   Tudo é montado com textContent (nenhum dado vira HTML). Os dados vêm do servidor, só com login. */
(() => {
  'use strict';
  const L = window.Leads;
  const $ = (id) => document.getElementById(id);
  if (!L || !$('tela-visitas')) return;

  const abas = $('abas'), painel = $('tela-painel'), vis = $('tela-visitas'), login = $('tela-login'), usuario = $('usuario');
  const corpo = $('visitas-corpo'), aviso = $('visitas-aviso');
  let aba = 'contatos', dias = 30, busy = false;

  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    // style vai pelo CSSOM: a política de segurança do painel (CSP) bloqueia o atributo style escrito em HTML
    Object.entries(attrs || {}).forEach(([k, v]) => { if (k === 'text') n.textContent = v; else if (k === 'style') n.style.cssText = v; else if (v != null) n.setAttribute(k, v); });
    kids.flat().forEach((k) => { if (k != null) n.append(k); });
    return n;
  };
  const nf = new Intl.NumberFormat('pt-BR');
  const num = (v) => nf.format(v || 0);
  const pct = (a, b) => (b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString('pt-BR')}%` : '–');

  /* ---------- Abas ---------- */
  function show(which) {
    aba = which;
    const logged = !usuario.hidden && login.hidden;
    abas.hidden = !logged;
    painel.hidden = !logged || aba !== 'contatos';
    vis.hidden = !logged || aba !== 'visitas';
    abas.querySelectorAll('button').forEach((b) => b.toggleAttribute('aria-current', b.dataset.aba === aba));
    if (logged && aba === 'visitas') load();
  }
  abas.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-aba]');
    if (b) show(b.dataset.aba);
  });
  // Quando o painel entra ou sai (login, sair, sessão vencida), volta para "Contatos"
  new MutationObserver(() => {
    const logged = !usuario.hidden && login.hidden;
    if (!logged) { abas.hidden = true; vis.hidden = true; aba = 'contatos'; return; }
    if (abas.hidden) show('contatos');
  }).observe(usuario, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(() => { if (!login.hidden) { abas.hidden = true; vis.hidden = true; aba = 'contatos'; } }).observe(login, { attributes: true, attributeFilter: ['hidden'] });

  document.querySelectorAll('[data-dias]').forEach((b) => b.addEventListener('click', () => {
    dias = Number(b.dataset.dias);
    document.querySelectorAll('[data-dias]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    load();
  }));

  /* ---------- Peças visuais ---------- */
  const card = (rotulo, valor, nota) => el('li', { class: 'vs-card' }, el('span', { class: 'vs-k', text: rotulo }), el('strong', { text: valor }), nota ? el('small', { text: nota }) : null);

  function tabela(titulo, linhas, cols) {
    const box = el('section', { class: 'vs-box' }, el('h2', { text: titulo }));
    if (!linhas.length) { box.append(el('p', { class: 'vs-vazio', text: 'Ainda sem dados neste período.' })); return box; }
    const t = el('table', { class: 'vs-tab' });
    t.append(el('thead', null, el('tr', null, cols.map((c, i) => el('th', { class: i ? 'n' : '', text: c.t })))));
    t.append(el('tbody', null, linhas.map((l) => el('tr', null, cols.map((c, i) => el('td', { class: i ? 'n' : '', text: c.v(l) }))))));
    box.append(t);
    return box;
  }

  function barras(titulo, linhas, total) {
    const box = el('section', { class: 'vs-box' }, el('h2', { text: titulo }));
    if (!linhas.length) { box.append(el('p', { class: 'vs-vazio', text: 'Ainda sem dados neste período.' })); return box; }
    const max = Math.max(...linhas.map((l) => l.total), 1);
    box.append(el('ul', { class: 'vs-bars' }, linhas.map((l) => el('li', null,
      el('span', { class: 'vs-n', text: l.nome }),
      el('span', { class: 'vs-trilho' }, el('i', { style: `width:${Math.max(3, Math.round((l.total / max) * 100))}%` })),
      el('span', { class: 'vs-v', text: `${num(l.total)} · ${pct(l.total, total)}` })))));
    return box;
  }

  const fmtTempo = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)}min ${String(sec % 60).padStart(2, '0')}s` : `${sec}s`);

  // Funil: cada etapa mostra quantas pessoas chegaram e que parte da etapa anterior seguiu
  function funil(linhas) {
    const box = el('section', { class: 'vs-box vs-wide' }, el('h2', { text: 'Funil: da visita ao contato' }));
    const max = Math.max(linhas[0].total, 1);
    box.append(el('ul', { class: 'vs-funil' }, linhas.map((l, i) => el('li', null,
      el('span', { class: 'vs-n', text: l.etapa }),
      el('span', { class: 'vs-trilho' }, el('i', { style: `width:${Math.max(2, Math.round((l.total / max) * 100))}%` })),
      el('span', { class: 'vs-v', text: `${num(l.total)} · ${pct(l.total, max)}${i ? ` (${pct(l.total, linhas[i - 1].total)} da etapa anterior)` : ''}` })))));
    return box;
  }

  // Colunas simples (horário do dia)
  function colunas(titulo, valores, rotulo) {
    const box = el('section', { class: 'vs-box' }, el('h2', { text: titulo }));
    const max = Math.max(...valores, 1);
    if (!valores.some((v) => v)) { box.append(el('p', { class: 'vs-vazio', text: 'Ainda sem dados neste período.' })); return box; }
    box.append(el('div', { class: 'vs-cols', role: 'img', 'aria-label': titulo },
      valores.map((v, i) => el('span', { class: 'vs-col', title: `${rotulo(i)}: ${v} página(s) vista(s)` }, el('i', { style: `height:${Math.max(v ? 4 : 0, Math.round((v / max) * 100))}%` })))),
      el('div', { class: 'vs-cols-lab' }, el('span', { text: '0h' }), el('span', { text: '6h' }), el('span', { text: '12h' }), el('span', { text: '18h' }), el('span', { text: '23h' })));
    return box;
  }

  // Gráfico de barras por dia (SVG montado por DOM, sem biblioteca)
  function grafico(diario) {
    const W = 760, H = 180, pad = 24, n = diario.length, max = Math.max(...diario.map((d) => d.views), 1);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H + 24}`);
    svg.setAttribute('class', 'vs-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Páginas vistas por dia, de ${diario[0].dia} a ${diario[n - 1].dia}`);
    const bw = (W - pad * 2) / n;
    diario.forEach((d, i) => {
      const h = Math.round((d.views / max) * (H - 10));
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', String(pad + i * bw + bw * 0.12)); r.setAttribute('width', String(Math.max(1, bw * 0.76)));
      r.setAttribute('y', String(H - h)); r.setAttribute('height', String(Math.max(h, d.views ? 2 : 0))); r.setAttribute('rx', '2');
      r.setAttribute('class', d.leads ? 'vs-bar has-lead' : 'vs-bar');
      const t = document.createElementNS(ns, 'title');
      t.textContent = `${d.dia.split('-').reverse().join('/')}: ${d.views} página(s) vista(s), ${d.leads} contato(s)`;
      r.append(t); svg.append(r);
      if (d.leads) {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', String(pad + i * bw + bw / 2)); c.setAttribute('cy', String(Math.max(6, H - h - 8))); c.setAttribute('r', '4'); c.setAttribute('class', 'vs-dot');
        svg.append(c);
      }
    });
    const lab = (x, anchor, txt) => { const t = document.createElementNS(ns, 'text'); t.setAttribute('x', String(x)); t.setAttribute('y', String(H + 18)); t.setAttribute('text-anchor', anchor); t.setAttribute('class', 'vs-lab'); t.textContent = txt; svg.append(t); };
    const f = (d) => d.split('-').reverse().slice(0, 2).join('/');
    lab(pad, 'start', f(diario[0].dia)); lab(W - pad, 'end', f(diario[n - 1].dia));
    return svg;
  }

  function render(d) {
    corpo.replaceChildren();
    aviso.hidden = true;
    if (!d.ready) {
      aviso.hidden = false;
      aviso.textContent = 'As tabelas de visitas ainda não existem no banco. Rode de novo o arquivo scripts/supabase-leads.sql no SQL Editor do Supabase e atualize esta tela.';
      return;
    }
    const t = d.totais;
    if (d.truncated) { aviso.hidden = false; aviso.textContent = 'Muitas visitas neste período: o resumo usa as 40 mil mais recentes.'; }
    corpo.append(el('ul', { class: 'vs-cards' },
      card('Visitas', num(t.visitas), 'pessoas que chegaram ao site'),
      card('Páginas vistas', num(t.paginasVistas), 'todas as páginas abertas'),
      card('Visitantes por dia', num(t.visitantes), 'únicos em cada dia, somados'),
      card('Contatos', num(t.contatos), 'e-mails e formulários'),
      card('Conversão', pct(t.contatos, t.visitas), 'contatos ÷ visitas'),
      card('Cliques no WhatsApp', num(t.cliquesWhatsapp), t.cliquesEmail ? `e ${num(t.cliquesEmail)} no e-mail` : '')));
    if (d.metricas) {
      const m = d.metricas;
      corpo.append(el('ul', { class: 'vs-cards vs-cards-4' },
        card('Tempo médio no site', fmtTempo(m.tempoMedio), 'por visita (aba aberta e visível)'),
        card('Páginas por visita', String(m.paginasPorVisita).replace('.', ','), `em ${num(m.visitasMedidas)} visitas medidas`),
        card('Rejeição', `${String(m.rejeicao).replace('.', ',')}%`, 'abriu uma página e saiu logo'),
        card('Rolagem média', `${m.rolagemMedia}%`, 'até onde as pessoas descem a página')));
    }
    corpo.append(el('section', { class: 'vs-box vs-wide' }, el('h2', { text: 'Páginas vistas por dia' }), grafico(d.diario), el('p', { class: 'vs-leg', text: 'Barra azul-escura com ponto: dia em que chegou algum contato.' })));
    if (d.funil) corpo.append(funil(d.funil));
    if (d.extra) corpo.append(el('div', { class: 'vs-grid vs-grid-top' },
      colunas('Horário de pico (horário de Brasília)', d.horas, (i) => `${i}h`),
      barras('Dia da semana', d.semana, t.paginasVistas)));
    else if (d.ready) { aviso.hidden = false; aviso.textContent = 'Para ver navegador, estado, tempo no site, funil e cliques, rode de novo o arquivo scripts/supabase-leads.sql no Supabase.'; }
    corpo.append(el('div', { class: 'vs-grid' },
      tabela('De onde vêm as visitas e os contatos', d.canais, [{ t: 'Origem', v: (l) => l.nome }, { t: 'Visitas', v: (l) => num(l.total) }, { t: 'Contatos', v: (l) => num(l.contatos) }, { t: 'Conversão', v: (l) => (l.total ? pct(l.contatos, l.total) : '–') }]),
      tabela('Páginas mais acessadas', d.paginas, [{ t: 'Página', v: (l) => l.nome }, { t: 'Vistas', v: (l) => num(l.total) }]),
      tabela('Sites de origem', d.origens, [{ t: 'Site', v: (l) => l.nome }, { t: 'Visitas', v: (l) => num(l.total) }]),
      tabela('Campanhas (UTM)', d.campanhas, [{ t: 'Campanha', v: (l) => l.nome }, { t: 'Visitas', v: (l) => num(l.total) }]),
      barras('Países', d.paises, t.paginasVistas), barras('Aparelhos', d.dispositivos, t.paginasVistas),
      tabela('Cidades', d.cidades, [{ t: 'Cidade', v: (l) => l.nome }, { t: 'Vistas', v: (l) => num(l.total) }]),
      d.extra ? barras('Estados', d.regioes, t.paginasVistas) : null,
      d.extra ? barras('Navegadores', d.navegadores, t.paginasVistas) : null,
      d.extra ? barras('Sistemas', d.sistemas, t.paginasVistas) : null,
      d.extra ? tabela('Botões mais clicados', d.cliques, [{ t: 'Botão', v: (l) => l.nome }, { t: 'Cliques', v: (l) => num(l.total) }]) : null));
    const pf = d.perfil || {};
    const soma = (arr) => (arr || []).reduce((a, b) => a + b.total, 0);
    if (soma(pf.tamanho) + soma(pf.faturamento) + soma(pf.jaIa) + soma(pf.cargo) > 0) {
      corpo.append(el('h2', { class: 'vs-secao', text: 'Perfil de quem preencheu o formulário' }));
      corpo.append(el('div', { class: 'vs-grid' },
        barras('Tamanho da empresa', pf.tamanho || [], soma(pf.tamanho)), barras('Faturamento mensal', pf.faturamento || [], soma(pf.faturamento)),
        barras('Já implementou IA?', pf.jaIa || [], soma(pf.jaIa)), barras('Cargo', pf.cargo || [], soma(pf.cargo))));
    }
  }

  async function load() {
    if (busy) return;
    busy = true;
    aviso.hidden = false; aviso.textContent = 'Carregando…';
    try {
      render(await L.stats(dias));
    } catch (err) {
      if (err instanceof L.AuthError) { aviso.hidden = true; location.reload(); return; }
      aviso.hidden = false; aviso.textContent = err.message || 'Não foi possível carregar agora.';
    } finally { busy = false; }
  }
})();

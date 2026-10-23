/* IA BRAZIL — painel de contatos: login, lista, filtros, detalhes, notas e exportação */
(() => {
  'use strict';

  const L = window.Leads;
  const $ = (id) => document.getElementById(id);
  const STATUS = { novo: 'Novo', em_contato: 'Em contato', qualificado: 'Qualificado', proposta: 'Proposta enviada', fechado: 'Fechado (venda)', perdido: 'Perdido' };
  const LIST_PARTS = ['resumo', 'ferramentas', 'lista-topo', 'tabela'];

  let leads = [];       // contatos carregados
  let current = null;   // contato aberto no painel lateral
  let opener = null;    // botão que abriu o painel (o foco volta para ele)
  let loading = false;
  let toastTimer = 0;

  /* ---------- Utilidades ---------- */

  // Cria elementos sem innerHTML: os dados vêm de um formulário público e entram sempre como texto
  function el(tag, props, ...kids) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    });
    kids.forEach((kid) => { if (kid != null) node.append(kid); });
    return node;
  }

  const fDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fTime = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const toDate = (iso) => { const d = new Date(iso || NaN); return Number.isNaN(d.getTime()) ? null : d; };
  const longDate = (d) => (d ? `${fDate.format(d)} às ${fTime.format(d)}` : '');

  // "há 2 h" para os recentes, data para os antigos; embaixo, o dia e a hora
  function when(iso) {
    const d = toDate(iso);
    if (!d) return { main: 'Sem data', sub: '', full: '' };
    const now = new Date();
    const min = Math.floor((now - d) / 60000);
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const main = min < 1 ? 'agora' : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.floor(min / 60)} h` : fDate.format(d);
    const day = d.toDateString() === now.toDateString() ? 'hoje, ' : d.toDateString() === yesterday.toDateString() ? 'ontem, ' : '';
    return { main, sub: day + fTime.format(d), full: longDate(d) };
  }

  const fullName = (l) => `${l.nome} ${l.sobrenome}`.trim() || (l.parcial ? 'Só deixou o e-mail' : 'Sem nome');
  const plural = (n) => `${n} ${n === 1 ? 'contato' : 'contatos'}`;
  const fold = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const errText = (err) => [err && err.message, err && err.detail].filter(Boolean).join(' ');
  const findRow = (id) => Array.from($('linhas').rows).find((tr) => tr.dataset.id === id);
  const hideList = () => LIST_PARTS.forEach((id) => { $(id).hidden = true; });

  // wa.me só aceita números; sem DDI, assume Brasil (55)
  function waHref(l) {
    let num = digits(l.whatsapp).replace(/^0+/, '');
    if (num.length < 8) return '';
    if (!l.whatsapp.trim().startsWith('+') && num.length <= 11) num = `55${num}`;
    const text = `Olá${l.nome ? `, ${l.nome}` : ''}! Aqui é da IA BRAZIL. Recebemos o seu contato pelo site e queremos entender melhor o que você precisa.`;
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  }

  function mailHref(email) {
    const m = /^([^\s@]+)@([^\s@]+\.[^\s@]+)$/.exec(email || '');
    if (!m) return '';
    return `mailto:${encodeURIComponent(m[1])}@${encodeURIComponent(m[2])}?subject=${encodeURIComponent('Seu contato com a IA BRAZIL')}`;
  }

  // Link sem destino fica desativado
  function setLink(a, href) {
    if (href) a.href = href;
    else a.removeAttribute('href');
    a.setAttribute('aria-disabled', String(!href));
  }

  // Aviso rápido; com o painel lateral aberto, aparece dentro dele
  function toast(text, isError) {
    const node = $('detalhe').open ? $('d-toast') : $('toast');
    [$('toast'), $('d-toast')].forEach((t) => t.classList.remove('is-on'));
    node.textContent = text;
    node.classList.toggle('is-error', !!isError);
    node.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-on'), isError ? 6000 : 3500);
  }

  // Sessão vencida: fecha tudo e volta para o login
  function handleAuth(err) {
    if (!(err instanceof L.AuthError)) return false;
    current = opener = null;
    if ($('detalhe').open) $('detalhe').close();
    showLogin(err.message);
    return true;
  }

  /* ---------- Telas ---------- */

  function showLogin(message) {
    leads = [];
    $('linhas').replaceChildren();
    $('tela-painel').hidden = $('usuario').hidden = true;
    $('tela-login').hidden = false;
    $('login-msg').textContent = message || '';
    const f = $('form-login');
    (f.elements.email.value ? f.elements.password : f.elements.email).focus();
  }

  function showDash() {
    const u = L.user();
    $('tela-login').hidden = true;
    $('tela-painel').hidden = false;
    $('usuario').hidden = !u;
    $('usuario-email').textContent = u ? u.email : '';
    load(false);
  }

  // Carrega a lista; "quiet" mantém a lista na tela enquanto atualiza
  async function load(quiet) {
    if (loading) return;
    loading = true;
    $('atualizar').textContent = 'Atualizando...';
    if (!quiet) hideList();
    if (!quiet) setState('loading');
    try {
      leads = await L.list();
      fillInterests();
      $('atualizado').textContent = `Atualizado às ${fTime.format(new Date())}`;
      render();
    } catch (err) {
      if (handleAuth(err)) return;
      if (quiet && leads.length) return toast(`Não foi possível atualizar. ${errText(err)}`, true);
      hideList();
      setState('error', err);
    } finally {
      loading = false;
      $('atualizar').textContent = 'Atualizar';
    }
  }

  // Bloco único para carregando, vazio, sem resultado e erro
  function setState(kind, err) {
    const box = $('estado');
    box.hidden = !kind;
    if (!kind) return box.replaceChildren();
    const demo = L.mode() === 'demo';
    const texts = {
      loading: ['Carregando contatos...', ''],
      empty: ['Nenhum contato ainda', demo
        ? 'Envie um teste pelo formulário de contato. Ele aparece aqui na hora, neste mesmo navegador.'
        : 'Quando alguém enviar o formulário do site, o contato aparece aqui.'],
      none: ['Nenhum contato com esses filtros', 'Tente outra busca ou limpe os filtros para ver a lista completa.'],
      error: ['Não foi possível carregar os contatos', errText(err)],
    }[kind];
    box.className = `adm-state is-${kind}`;
    box.replaceChildren(el('h2', { text: texts[0] }), texts[1] ? el('p', { text: texts[1] }) : null);
    if (kind === 'empty' && demo) box.append(el('a', { class: 'btn btn-primary btn-sm', href: 'contato.html', target: '_blank', rel: 'noopener', text: 'Abrir o formulário' }));
    if (kind === 'none') box.append(el('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Limpar filtros', onclick: clearFilters }));
    if (kind === 'error') box.append(el('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Tentar de novo', onclick: () => load(false) }));
  }

  /* ---------- Resumo, filtros e lista ---------- */

  function renderStats() {
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const count = (test) => String(leads.filter(test).length);
    $('n-novos').textContent = count((l) => l.status === 'novo');
    $('n-total').textContent = String(leads.length);
    $('n-semana').textContent = count((l) => (toDate(l.created_at) || 0) >= monday);
    $('n-proposta').textContent = count((l) => l.status === 'proposta');
    $('n-qualificados').textContent = count((l) => ['qualificado', 'proposta', 'fechado'].includes(l.status));
    $('n-vendas').textContent = count((l) => l.status === 'fechado');
    $('ver-novos').hidden = $('n-novos').textContent === '0' || $('filtro-status').value === 'novo';
    $('resumo').hidden = false;
  }

  function fillInterests() {
    const select = $('filtro-interesse');
    const keep = select.value;
    const values = Array.from(new Set(leads.map((l) => l.interesse).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    select.replaceChildren(new Option('Todos', ''), ...values.map((v) => new Option(v, v)));
    select.value = values.includes(keep) ? keep : '';
  }

  const isFiltering = () => !!($('busca').value.trim() || $('filtro-status').value || $('filtro-interesse').value);

  // Busca sem acento e sem diferenciar maiúsculas; números também acham o WhatsApp digitado com máscara
  function filtered() {
    const words = fold($('busca').value).split(/\s+/).filter(Boolean);
    const num = digits($('busca').value);
    const status = $('filtro-status').value;
    const interest = $('filtro-interesse').value;
    return leads.filter((l) => {
      if ((status && l.status !== status) || (interest && l.interesse !== interest)) return false;
      if (!words.length) return true;
      const hay = fold([l.nome, l.sobrenome, l.empresa, l.email, l.whatsapp].join(' '));
      return words.every((w) => hay.includes(w)) || (num.length >= 3 && digits(l.whatsapp).includes(num));
    });
  }

  function clearFilters() {
    ['busca', 'filtro-status', 'filtro-interesse'].forEach((id) => { $(id).value = ''; });
    render();
    $('busca').focus();
  }

  function render() {
    renderStats();
    const rows = filtered();
    const filtering = isFiltering();
    $('ferramentas').hidden = !leads.length;
    $('lista-topo').hidden = !leads.length;
    $('contagem').textContent = filtering ? `${rows.length} de ${plural(leads.length)}` : plural(leads.length);
    $('limpar').hidden = !filtering;
    $('exportar').disabled = !rows.length;
    $('linhas').replaceChildren(...rows.map(row));
    $('tabela').hidden = !rows.length;
    setState(!leads.length ? 'empty' : !rows.length ? 'none' : null);
  }

  function row(l) {
    const t = when(l.created_at);
    const name = fullName(l);
    return el('tr', { class: l.status === 'novo' ? 'is-new' : null, 'data-id': l.id },
      el('td', { class: 'c-date' }, el('time', { dateTime: l.created_at, title: t.full, text: t.main }), el('span', { class: 'c-sub', text: t.sub })),
      el('td', { class: 'c-name' }, el('button', { class: 'lead-open', type: 'button', text: name }), el('span', { class: 'c-sub', text: l.empresa || (l.parcial ? l.email : '') })),
      el('td', { class: 'c-int', text: l.interesse }),
      el('td', { class: 'c-contact' }, el('span', { class: 'c-line', text: l.whatsapp }), el('span', { class: 'c-sub', text: l.email })),
      el('td', { class: 'c-status' }, statusPicker(l, `Status de ${name}`)));
  }

  // Select de status: mudou, já salva
  function statusPicker(l, label) {
    const select = el('select', { 'aria-label': label });
    Object.entries(STATUS).forEach(([value, text]) => select.append(new Option(text, value, false, value === l.status)));
    select.addEventListener('change', () => changeStatus(l, select.value));
    return el('span', { class: `status st-${l.status}` }, select);
  }

  // Mesma cor e valor na linha e no painel lateral
  function paintStatus(id, status) {
    const tr = findRow(id);
    const spots = [tr && tr.querySelector('.status'), current && current.id === id ? $('d-status').firstElementChild : null];
    spots.filter(Boolean).forEach((wrap) => {
      wrap.className = `status st-${status}`;
      wrap.querySelector('select').value = status;
    });
    if (tr) tr.classList.toggle('is-new', status === 'novo');
  }

  async function changeStatus(l, next) {
    const prev = l.status;
    paintStatus(l.id, next);
    try {
      Object.assign(l, await L.update(l.id, { status: next }));
      toast(`${fullName(l)}: ${STATUS[l.status]}.`);
    } catch (err) {
      if (handleAuth(err)) return;
      paintStatus(l.id, prev);
      toast(`Não foi possível mudar o status. ${errText(err)}`, true);
    }
    renderStats();
  }

  /* ---------- Painel lateral ---------- */

  function openDrawer(id, from) {
    const l = leads.find((x) => x.id === id);
    if (!l) return;
    current = l;
    opener = from || null;
    fillDrawer(l);
    document.documentElement.classList.add('is-locked');
    $('detalhe').showModal();
    $('detalhe').scrollTop = 0;
    $('d-fechar').focus();
  }

  function fillDrawer(l) {
    const created = toDate(l.created_at);
    const updated = toDate(l.updated_at);
    $('d-quando').textContent = created ? `Recebido em ${longDate(created)}` : 'Data de envio desconhecida';
    $('d-nome').textContent = fullName(l);
    $('d-empresa').textContent = l.empresa || 'Empresa não informada';
    $('d-status').replaceChildren(statusPicker(l, 'Status do contato'));
    $('d-mensagem').textContent = l.mensagem || 'A pessoa não escreveu mensagem.';
    $('d-mensagem').classList.toggle('is-empty', !l.mensagem);
    const data = [['Nome', l.nome], ['Sobrenome', l.sobrenome], ['E-mail', l.email], ['WhatsApp', l.whatsapp],
      ['Empresa', l.empresa], ['Interesse', l.interesse], ['De onde veio', l.canal], ['Campanha', l.campanha], ['Página de entrada', l.pagina_entrada], ['Site de origem', l.referencia], ['Formulário', l.origem], ['Recebido em', longDate(created)]];
    if (updated) data.push(['Atualizado em', longDate(updated)]);
    $('d-dados').replaceChildren(...data.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { class: v ? null : 'is-empty', text: v || 'Não informado' })]));
    fillQualif(l);
    $('d-notas').value = l.notas;
    $('d-notas-info').textContent = '';
    $('d-salvar').setAttribute('aria-disabled', 'true');
    setLink($('d-whatsapp'), waHref(l));
    setLink($('d-email'), mailHref(l.email));
    $('d-copiar').disabled = !l.email;
    $('d-copiar').textContent = 'Copiar e-mail';
    confirmDelete(false);
  }

  const notesDirty = () => !!current && $('d-notas').value.trim() !== current.notas.trim();

  /* Qualificação: o que estiver salvo; se não, o que veio na mensagem de formulários antigos */
  const QUALIF = [['cargo', 'Cargo'], ['tamanho_empresa', 'Tamanho da empresa'], ['faturamento', 'Faturamento mensal'], ['ja_ia', 'Já implementou IA']];
  const fromMessage = (msg, label) => {
    const m = String(msg || '').match(new RegExp(`(?:^|\\n)${label}:\\s*([^\\n]+)`, 'i'));
    return m ? m[1].trim().slice(0, 80) : '';
  };
  const qualifValue = (l, k, label) => l[k] || fromMessage(l.mensagem, label);
  const fMoney = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const qualifDirty = () => !!current && (QUALIF.some(([k]) => $(`q-${k}`).value.trim() !== (current[k] || '').trim())
    || $('q-valor').value.trim() !== (current.valor == null ? '' : fMoney.format(current.valor)));

  function fillQualif(l) {
    QUALIF.forEach(([k, label]) => { $(`q-${k}`).value = qualifValue(l, k, label); });
    $('q-valor').value = l.valor == null ? '' : fMoney.format(l.valor);
    // Valor tirado da mensagem ainda não está salvo nas colunas: o botão já fica liberado
    $('q-salvar').setAttribute('aria-disabled', String(!qualifDirty()));
    $('q-info').textContent = qualifDirty() ? 'Preenchido a partir da mensagem. Salve para registrar.' : '';
  }

  async function saveQualif(l) {
    const here = () => current === l;
    const patch = {};
    QUALIF.forEach(([k]) => { patch[k] = $(`q-${k}`).value; });
    patch.valor = $('q-valor').value;
    if (here()) $('q-info').textContent = 'Salvando...';
    try {
      Object.assign(l, await L.update(l.id, patch));
      if (!here()) return toast('Qualificação salva.');
      $('q-valor').value = l.valor == null ? '' : fMoney.format(l.valor);
      $('q-salvar').setAttribute('aria-disabled', String(!qualifDirty()));
      $('q-info').textContent = `Qualificação salva às ${fTime.format(new Date())}.`;
    } catch (err) {
      if (handleAuth(err)) return;
      if (here()) $('q-info').textContent = `Não foi possível salvar. ${errText(err)}`;
      else toast(`Não foi possível salvar a qualificação de ${fullName(l)}. ${errText(err)}`, true);
    }
  }

  async function saveNotes(l, value) {
    const here = () => current === l;
    if (here()) $('d-notas-info').textContent = 'Salvando...';
    try {
      Object.assign(l, await L.update(l.id, { notas: value }));
      if (!here()) return toast('Notas salvas.');
      if ($('d-notas').value === value) $('d-notas').value = l.notas;
      $('d-salvar').setAttribute('aria-disabled', String(!notesDirty()));
      $('d-notas-info').textContent = `Notas salvas às ${fTime.format(new Date())}.`;
    } catch (err) {
      if (handleAuth(err)) return;
      if (here()) $('d-notas-info').textContent = `Não foi possível salvar. ${errText(err)}`;
      else toast(`Não foi possível salvar as notas de ${fullName(l)}. ${errText(err)}`, true);
    }
  }

  function confirmDelete(show) {
    $('d-confirmar').hidden = !show;
    $('d-excluir').hidden = show;
    if (!show) return;
    $('d-confirmar-txt').textContent = `Excluir o contato de ${fullName(current)}? Essa ação não pode ser desfeita.`;
    $('d-cancelar').focus();
  }

  async function deleteCurrent() {
    const l = current;
    if (!l) return;
    try {
      await L.remove(l.id);
    } catch (err) {
      if (!handleAuth(err)) toast(`Não foi possível excluir. ${errText(err)}`, true);
      return;
    }
    const index = filtered().indexOf(l);
    leads = leads.filter((x) => x !== l);
    fillInterests();
    render();
    // O foco vai para o contato seguinte da lista (ou para o título, se a lista acabou)
    const rows = $('linhas').rows;
    const next = rows.length ? rows[Math.min(Math.max(index, 0), rows.length - 1)] : null;
    opener = next ? next.querySelector('.lead-open') : $('painel-titulo');
    current = null;
    $('detalhe').close();
    toast('Contato excluído.');
  }

  // Copia para a área de transferência; fora de https usa o jeito antigo
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const area = el('textarea', { value: text, readOnly: true, class: 'sr-only' });
    $('detalhe').append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    area.remove();
    $('d-copiar').focus();
    return ok;
  }

  /* ---------- Exportação ---------- */

  function exportCsv() {
    const rows = filtered();
    if (!rows.length) return;
    // Texto que começa com = + - @ viraria fórmula no Excel: ganha um apóstrofo na frente
    const cell = (value) => {
      let s = String(value ?? '');
      if (/^\s*[=+\-@]|^[\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const head = ['Recebido em', 'Status', 'Nome', 'Sobrenome', 'Empresa', 'E-mail', 'WhatsApp', 'Interesse', 'Mensagem', 'Notas', 'Origem',
      'Cargo', 'Tamanho da empresa', 'Faturamento mensal', 'Já usa IA', 'Valor (R$)', 'Qualificado em', 'Proposta em', 'Fechado em', 'De onde veio', 'Campanha', 'Página de entrada', 'Site de origem', 'Veio de anúncio'];
    const body = rows.map((l) => {
      const d = toDate(l.created_at);
      return [d ? `${fDate.format(d)} ${fTime.format(d)}` : '', STATUS[l.status], l.nome, l.sobrenome, l.empresa, l.email, l.whatsapp, l.interesse, l.mensagem, l.notas, l.origem,
        ...QUALIF.map(([k, label]) => qualifValue(l, k, label)), l.valor == null ? '' : fMoney.format(l.valor), stageAt(l.qualificado_em), stageAt(l.proposta_em), stageAt(l.fechado_em), l.canal, l.campanha, l.pagina_entrada, l.referencia, l.clique_id ? 'Sim' : ''];
    });
    // BOM + ponto e vírgula: o Excel em português abre com acentos e colunas certos
    download(`﻿${[head, ...body].map((r) => r.map(cell).join(';')).join('\r\n')}`, 'contatos-ia-brazil');
    toast(`${plural(rows.length)} ${rows.length === 1 ? 'exportado' : 'exportados'} para CSV.`);
  }

  const stageAt = (iso) => { const d = toDate(iso); return d ? `${fDate.format(d)} ${fTime.format(d)}` : ''; };

  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const day = new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
    const a = el('a', { href: url, download: `${name}-${day}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* Conversões off-line para o Google Ads (Metas > Conversões > Enviar). Cada etapa é uma conversão com nome próprio,
     para o Ads não tratar um e-mail deixado no topo como venda. Os nomes precisam ser iguais aos criados no Google Ads. */
  const ADS = [
    ['Lead recebido', (l) => (!l.parcial ? l.created_at : '')],
    ['Lead qualificado', (l) => l.qualificado_em || (['qualificado', 'proposta', 'fechado'].includes(l.status) ? l.updated_at : '')],
    ['Proposta enviada', (l) => l.proposta_em || (['proposta', 'fechado'].includes(l.status) ? l.updated_at : ''), true],
    ['Venda', (l) => l.fechado_em || (l.status === 'fechado' ? l.updated_at : ''), true],
  ];

  function exportAds() {
    const sp = (iso) => { // horário de Brasília, no formato aceito pelo Google Ads
      const d = new Date(new Date(iso).getTime() - 3 * 3600000);
      return d.toISOString().slice(0, 19).replace('T', ' ');
    };
    const comAnuncio = leads.filter((l) => l.clique_id);
    const outros = comAnuncio.filter((l) => /^(gbraid|wbraid):/.test(l.clique_id)).length;
    const lines = [];
    comAnuncio.filter((l) => !/^(gbraid|wbraid):/.test(l.clique_id)).forEach((l) => {
      ADS.forEach(([nome, quando, comValor]) => {
        const t = quando(l);
        if (!t || !toDate(t)) return;
        const v = comValor && l.valor != null ? String(l.valor) : '';
        lines.push([l.clique_id, nome, sp(t), v, v ? 'BRL' : ''].join(','));
      });
    });
    if (!lines.length) {
      toast(comAnuncio.length ? 'Os contatos vindos de anúncio ainda não têm etapas para enviar.' : 'Nenhum contato veio de anúncio do Google ainda.');
      return;
    }
    download(['Parameters:TimeZone=-0300', 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency', ...lines].join('\r\n'), 'conversoes-google-ads');
    toast(`${lines.length} ${lines.length === 1 ? 'conversão exportada' : 'conversões exportadas'}.${outros ? ` ${outros} contato(s) de iPhone (gbraid/wbraid) ficam de fora: o Google só aceita esses pela API.` : ''}`);
  }

  /* ---------- Eventos ---------- */

  async function onLogin(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const button = f.querySelector('[type="submit"]');
    if (button.getAttribute('aria-disabled') === 'true' || !f.reportValidity()) return;
    button.setAttribute('aria-disabled', 'true');
    $('login-rotulo').textContent = 'Entrando...';
    $('login-msg').textContent = '';
    try {
      await L.login(f.elements.email.value, f.elements.password.value);
      f.elements.password.value = '';
      showDash();
      $('painel-titulo').focus();
    } catch (err) {
      $('login-msg').textContent = errText(err);
      f.elements.password.select();
    } finally {
      button.removeAttribute('aria-disabled');
      $('login-rotulo').textContent = 'Entrar';
    }
  }

  function bind() {
    const drawer = $('detalhe');
    $('form-login').addEventListener('submit', onLogin);
    $('sair').addEventListener('click', async () => {
      await L.logout();
      $('form-login').reset();
      showLogin('Você saiu do painel.');
    });

    $('atualizar').addEventListener('click', () => load(true));
    $('busca').addEventListener('input', render);
    $('filtro-status').addEventListener('change', render);
    $('filtro-interesse').addEventListener('change', render);
    $('limpar').addEventListener('click', clearFilters);
    $('exportar').addEventListener('click', exportCsv);
    $('exportar-ads').addEventListener('click', exportAds);
    $('ver-novos').addEventListener('click', () => {
      $('filtro-status').value = 'novo';
      render();
      $('linhas').querySelector('.lead-open')?.focus();
    });

    // Clique em qualquer parte da linha abre os detalhes (menos no status e ao selecionar texto)
    $('linhas').addEventListener('click', (e) => {
      if (e.target.closest('.status') || String(window.getSelection())) return;
      const tr = e.target.closest('tr');
      if (tr) openDrawer(tr.dataset.id, tr.querySelector('.lead-open'));
    });

    $('d-fechar').addEventListener('click', () => drawer.close());
    drawer.addEventListener('click', (e) => { if (e.target === drawer) drawer.close(); }); // clique no fundo escuro
    // Esc, botão ou fundo: salva notas pendentes e devolve o foco para a lista
    drawer.addEventListener('close', () => {
      document.documentElement.classList.remove('is-locked');
      if (current && notesDirty()) saveNotes(current, $('d-notas').value);
      if (current && qualifDirty() && $('q-info').textContent === 'Alterações não salvas.') saveQualif(current);
      current = null;
      if (opener && opener.isConnected && !opener.closest('[hidden]')) opener.focus();
      opener = null;
    });

    $('d-notas').addEventListener('input', () => {
      const dirty = notesDirty();
      $('d-salvar').setAttribute('aria-disabled', String(!dirty));
      $('d-notas-info').textContent = dirty ? 'Alterações não salvas.' : '';
    });
    $('d-salvar').addEventListener('click', () => { if (notesDirty()) saveNotes(current, $('d-notas').value); });
    $('d-qualif').addEventListener('input', () => {
      const dirty = qualifDirty();
      $('q-salvar').setAttribute('aria-disabled', String(!dirty));
      $('q-info').textContent = dirty ? 'Alterações não salvas.' : '';
    });
    $('q-salvar').addEventListener('click', () => { if (qualifDirty()) saveQualif(current); });

    $('d-copiar').addEventListener('click', async () => {
      if (!current || !current.email) return;
      const ok = await copyText(current.email);
      toast(ok ? 'E-mail copiado.' : 'Não foi possível copiar. Selecione o e-mail nos dados do contato.', !ok);
      if (!ok) return;
      $('d-copiar').textContent = 'E-mail copiado';
      setTimeout(() => { $('d-copiar').textContent = 'Copiar e-mail'; }, 2000);
    });

    $('d-excluir').addEventListener('click', () => confirmDelete(true));
    $('d-cancelar').addEventListener('click', () => { confirmDelete(false); $('d-excluir').focus(); });
    $('d-excluir-sim').addEventListener('click', deleteCurrent);

  }

  /* ---------- Início ---------- */

  if (!L) {
    $('conteudo').replaceChildren(el('p', { class: 'adm-wrap adm-fatal', text: 'O arquivo js/leads.js não carregou. Confira se ele foi publicado junto com o admin.html.' }));
    return;
  }
  bind();
  if (L.hasSession()) showDash();
  else showLogin();
})();

'use strict';
/* IA BRAZIL — painel interno. Rota: /api/admin?a=login|logout|me|list|update|remove
   Só quem entra com e-mail e senha recebe um cookie de sessão (HttpOnly, assinado); sem ele, nada é lido. */
const L = require('./_lib');

const FAIL_MAX = 6;          // tentativas erradas por visitante
const FAIL_WINDOW = 15 * 60; // em 15 minutos

module.exports = async (req, res) => {
  const action = String((req.query && req.query.a) || new URL(req.url, 'http://x').searchParams.get('a') || '');
  const mutating = req.method !== 'GET';
  if (mutating && (!L.originOk(req) || req.headers['x-iabr'] !== '1')) return L.send(res, 403, { ok: false });

  try {
    if (action === 'login' && req.method === 'POST') return await login(req, res);
    if (action === 'logout' && req.method === 'POST') { L.clearSession(req, res); return L.send(res, 200, { ok: true }); }

    const s = L.session(req);
    if (!s) return L.send(res, 401, { ok: false });

    if (action === 'me' && req.method === 'GET') return L.send(res, 200, { ok: true, email: s.sub });
    if (action === 'list' && req.method === 'GET') return await list(res);
    if (action === 'stats' && req.method === 'GET') return await stats(req, res);
    if (action === 'update' && req.method === 'PATCH') return await update(req, res);
    if (action === 'remove' && req.method === 'DELETE') return await remove(req, res);
    return L.send(res, 404, { ok: false });
  } catch (err) {
    console.error('admin:', err && err.message, err && err.status);
    return L.send(res, err && err.message === 'config' ? 503 : 502, { ok: false, error: 'indisponivel' });
  }
};

// Tira espaços e aspas que às vezes vêm junto quando o valor é colado no painel da Vercel
const unquote = (v) => String(v || '').trim().replace(/^["']+|["']+$/g, '').trim();

async function login(req, res) {
  const adminEmail = unquote(process.env.ADMIN_EMAIL).toLowerCase();
  const hash = unquote(process.env.ADMIN_PASSWORD_HASH);
  const plain = unquote(process.env.ADMIN_PASSWORD); // alternativa mais simples ao hash
  if (!adminEmail || (!hash && !plain)) throw new Error('config');

  const who = L.visitor(req);
  if (await L.tooMany('login', who, FAIL_MAX, FAIL_WINDOW)) return L.send(res, 429, { ok: false, error: 'limite' });

  const body = await L.readBody(req, 2000).catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  const password = String(body.password || '').slice(0, 200);

  // Todas as conferências sempre rodam, para a resposta não mostrar qual delas errou
  const okEmail = L.equalText(email, adminEmail);
  const okHash = L.checkPassword(password, hash);
  const okPlain = plain ? L.equalText(password, plain) : false;
  if (okEmail && (okHash || okPlain)) {
    L.setSession(req, res, adminEmail);
    return L.send(res, 200, { ok: true, email: adminEmail });
  }
  // Motivo só no log do servidor (Vercel > Logs), sem valores secretos
  console.error('login recusado:', JSON.stringify({ emailConfere: okEmail, hashConfere: okHash, senhaSimplesConfere: okPlain, hashPartes: hash ? hash.split(':').length : 0, hashTamanho: hash.length, temSenhaSimples: !!plain }));
  await L.hit('login', who);
  await L.wait(700);
  return L.send(res, 401, { ok: false, error: 'credenciais' });
}

async function list(res) {
  const rows = [];
  for (let page = 0; page < 50; page += 1) {
    const chunk = await L.sb(`leads?select=*&order=created_at.desc,id.desc&limit=1000&offset=${page * 1000}`);
    rows.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return L.send(res, 200, { ok: true, leads: rows });
}

async function update(req, res) {
  const id = String((req.query && req.query.id) || new URL(req.url, 'http://x').searchParams.get('id') || '');
  if (!L.UUID.test(id)) return L.send(res, 400, { ok: false });
  const body = await L.readBody(req, 8000).catch(() => ({}));
  const patch = {};
  if ('status' in body) {
    if (!L.STATUS.includes(body.status)) return L.send(res, 400, { ok: false });
    patch.status = body.status;
  }
  if ('notas' in body) patch.notas = L.clean(body.notas, 'notas') || null;
  if (!Object.keys(patch).length) return L.send(res, 400, { ok: false });
  const rows = await L.sb(`leads?id=eq.${id}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
  if (!rows || !rows.length) return L.send(res, 404, { ok: false });
  return L.send(res, 200, { ok: true, lead: rows[0] });
}

async function remove(req, res) {
  const id = String((req.query && req.query.id) || new URL(req.url, 'http://x').searchParams.get('id') || '');
  if (!L.UUID.test(id)) return L.send(res, 400, { ok: false });
  const rows = await L.sb(`leads?id=eq.${id}`, { method: 'DELETE', prefer: 'return=representation' });
  if (!rows || !rows.length) return L.send(res, 404, { ok: false });
  return L.send(res, 200, { ok: true });
}

/* Resumo das visitas e de onde vêm os contatos. Soma tudo aqui no servidor e manda só os totais. */
const top = (map, n = 10) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([nome, total]) => ({ nome, total }));
const bump = (map, k, by = 1) => { if (k) map.set(k, (map.get(k) || 0) + by); };

async function stats(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const days = Math.min(Math.max(parseInt(q.get('days') || '30', 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86400000);
  since.setHours(0, 0, 0, 0);
  const iso = encodeURIComponent(since.toISOString());

  const views = [];
  let truncated = false;
  for (let page = 0; page < 40; page += 1) {
    let chunk;
    try {
      chunk = await L.sb(`pageviews?select=at,tipo,path,entrada,canal,detalhe,pais,cidade,dispositivo,vid,utm_campaign&at=gte.${iso}&order=at.desc&limit=1000&offset=${page * 1000}`);
    } catch (err) {
      if (err && (err.status === 404 || err.status === 400)) return L.send(res, 200, { ok: true, ready: false });
      throw err;
    }
    views.push(...chunk);
    if (chunk.length < 1000) break;
    if (page === 39) truncated = true;
  }
  let leads = [];
  try {
    leads = await L.sb(`leads?select=created_at,canal,campanha,pagina_entrada,parcial&created_at=gte.${iso}&order=created_at.desc&limit=5000`);
  } catch (err) {
    if (!(err && (err.status === 400 || err.status === 404))) throw err;
    leads = await L.sb(`leads?select=created_at,parcial&created_at=gte.${iso}&order=created_at.desc&limit=5000`);
  }

  const daily = new Map(), pages = new Map(), canais = new Map(), paises = new Map(), cidades = new Map(), devs = new Map(), camps = new Map(), refs = new Map();
  const visitors = new Set(), leadsByCanal = new Map();
  let pageviews = 0, whats = 0, emails = 0, visits = 0;
  const day = (t) => new Date(new Date(t).getTime() - 3 * 3600000).toISOString().slice(0, 10); // dia no horário de Brasília
  for (let i = 0; i < days; i += 1) daily.set(day(Date.now() - i * 86400000), { views: 0, leads: 0 });

  views.forEach((v) => {
    const d = day(v.at); const slot = daily.get(d);
    if (v.tipo === 'whatsapp') { whats += 1; return; }
    if (v.tipo === 'email') { emails += 1; return; }
    pageviews += 1; if (slot) slot.views += 1;
    bump(pages, v.path);
    if (v.vid) visitors.add(d + v.vid);
    if (v.entrada) {
      visits += 1;
      bump(canais, v.canal || 'Direto');
      if (v.detalhe && !/^(Direto)$/.test(v.canal || '')) bump(refs, `${v.canal} · ${v.detalhe}`);
      if (v.utm_campaign) bump(camps, v.utm_campaign);
    }
    bump(paises, v.pais || 'Desconhecido'); if (v.cidade) bump(cidades, `${v.cidade}${v.pais ? ' (' + v.pais + ')' : ''}`);
    bump(devs, v.dispositivo || 'Desconhecido');
  });
  let leadCount = 0;
  leads.forEach((l) => {
    leadCount += 1;
    const slot = daily.get(day(l.created_at)); if (slot) slot.leads += 1;
    bump(leadsByCanal, l.canal || 'Sem origem registrada');
  });

  const canalTabela = top(canais, 12).map((c) => ({ ...c, contatos: leadsByCanal.get(c.nome) || 0 }));
  leadsByCanal.forEach((n, nome) => { if (!canais.has(nome)) canalTabela.push({ nome, total: 0, contatos: n }); });
  return L.send(res, 200, {
    ok: true, ready: true, days, truncated,
    totais: { visitas: visits, paginasVistas: pageviews, visitantes: visitors.size, contatos: leadCount, cliquesWhatsapp: whats, cliquesEmail: emails },
    diario: Array.from(daily.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([dia, v]) => ({ dia, ...v })),
    canais: canalTabela, paginas: top(pages, 12), paises: top(paises, 8), cidades: top(cidades, 8), dispositivos: top(devs, 4), campanhas: top(camps, 8), origens: top(refs, 10),
  });
}

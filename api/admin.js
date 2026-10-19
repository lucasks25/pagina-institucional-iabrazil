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
    if (action === 'update' && req.method === 'PATCH') return await update(req, res);
    if (action === 'remove' && req.method === 'DELETE') return await remove(req, res);
    return L.send(res, 404, { ok: false });
  } catch (err) {
    console.error('admin:', err && err.message, err && err.status);
    return L.send(res, err && err.message === 'config' ? 503 : 502, { ok: false, error: 'indisponivel' });
  }
};

async function login(req, res) {
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const hash = process.env.ADMIN_PASSWORD_HASH || '';
  if (!adminEmail || !hash) throw new Error('config');

  const who = L.visitor(req);
  if (await L.tooMany('login', who, FAIL_MAX, FAIL_WINDOW)) return L.send(res, 429, { ok: false, error: 'limite' });

  const body = await L.readBody(req, 2000).catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  const password = String(body.password || '').slice(0, 200);

  // As duas conferências sempre rodam, para a resposta não mostrar qual das duas errou
  const okEmail = L.equalText(email, adminEmail);
  const okPass = L.checkPassword(password, hash);
  if (okEmail && okPass) {
    L.setSession(req, res, adminEmail);
    return L.send(res, 200, { ok: true, email: adminEmail });
  }
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

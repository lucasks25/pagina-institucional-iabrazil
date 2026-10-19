'use strict';
/* IA BRAZIL — análise de visitas própria (sem cookies, sem IP). Rota: POST /api/track */
const L = require('./_lib');

const KINDS = new Set(['view', 'whatsapp', 'email']);
// Freio simples por instância contra enchente de visitas falsas (o servidor reinicia, então é só um complemento)
const seen = new Map();
const flooded = (key) => {
  const now = Date.now();
  const arr = (seen.get(key) || []).filter((t) => now - t < 60000);
  arr.push(now);
  seen.set(key, arr);
  if (seen.size > 5000) seen.clear();
  return arr.length > 90;
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 405, { ok: false }, { Allow: 'POST' });
  if (!L.originOk(req)) return L.send(res, 403, { ok: false });
  if (L.isBot(req.headers['user-agent'])) return L.send(res, 200, { ok: true });

  let b;
  try { b = await L.readBody(req, 4000); } catch { return L.send(res, 413, { ok: false }); }

  const tipo = KINDS.has(b.t) ? b.t : 'view';
  let path = String(b.path || '');
  if (!path.startsWith('/') || path.length > 200) return L.send(res, 400, { ok: false });
  path = path.split('?')[0].split('#')[0];
  if (/^\/(api|adminn|painel-adm)/.test(path)) return L.send(res, 200, { ok: true });

  try {
    const vid = L.dailyVisitor(req);
    if (flooded(vid)) return L.send(res, 429, { ok: false });
    const row = { tipo, path, vid, dispositivo: L.deviceOf(req.headers['user-agent']), idioma: L.cut(b.lang, 10) || null, ...L.geo(req) };
    if (tipo === 'view' && b.entry) {
      const refUrl = /^https?:\/\//i.test(String(b.ref || '')) ? String(b.ref).slice(0, 300) : '';
      const c = L.classify(refUrl, b.utm, 'www.iabrazil.com');
      Object.assign(row, { entrada: true, canal: c.canal || 'Direto', detalhe: c.detalhe, referencia: c.referencia });
      const u = b.utm || {};
      row.utm_source = L.cut(u.utm_source, 80) || null;
      row.utm_medium = L.cut(u.utm_medium, 80) || null;
      row.utm_campaign = L.cut(u.utm_campaign, 80) || null;
    }
    await L.sb('pageviews', { method: 'POST', body: row, prefer: 'return=minimal' });
    if (Math.random() < 0.01) {
      const old = new Date(Date.now() - 400 * 86400000).toISOString();
      L.sb(`pageviews?at=lt.${encodeURIComponent(old)}`, { method: 'DELETE' }).catch(() => {});
    }
    return L.send(res, 200, { ok: true });
  } catch (err) {
    console.error('track:', err && err.message, err && err.status);
    return L.send(res, 200, { ok: false }); // quem visita nunca vê erro
  }
};

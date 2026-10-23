'use strict';
/* IA BRAZIL — análise de visitas própria (sem cookies, sem IP). Rota: POST /api/track */
const L = require('./_lib');

const KINDS = new Set(['view', 'whatsapp', 'email', 'tempo', 'clique', 'form_inicio', 'envio', 'case_view', 'secao', 'campo']);
const NEW_COLS = ['navegador', 'sistema', 'regiao', 'sessao', 'duracao', 'rolagem', 'clique'];
// Freio simples por instância contra enchente de visitas falsas (o servidor reinicia, então é só um complemento)
const seen = new Map();
const flooded = (key) => {
  const now = Date.now();
  const arr = (seen.get(key) || []).filter((t) => now - t < 60000);
  arr.push(now);
  seen.set(key, arr);
  if (seen.size > 5000) seen.clear();
  return arr.length > 160;
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
    const sid = /^[0-9a-f]{12,32}$/.test(String(b.sid || '')) ? String(b.sid) : null;
    const num = (v, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null; };
    const row = { tipo, path, vid, dispositivo: L.deviceOf(req.headers['user-agent']), idioma: L.cut(b.lang, 10) || null, ...L.uaInfo(req.headers['user-agent']), ...L.geo(req), sessao: sid };
    if (tipo === 'tempo') { row.duracao = num(b.dur, 3 * 3600); row.rolagem = num(b.scroll, 100); if (!row.duracao && !row.rolagem) return L.send(res, 200, { ok: true }); }
    if (tipo === 'clique' || tipo === 'form_inicio' || tipo === 'envio' || tipo === 'case_view' || tipo === 'secao' || tipo === 'campo') row.clique = L.cut(b.label, 40) || null;
    if (tipo === 'view' && b.entry) {
      const refUrl = /^https?:\/\//i.test(String(b.ref || '')) ? String(b.ref).slice(0, 300) : '';
      const c = L.classify(refUrl, b.utm, 'www.iabrazil.com');
      Object.assign(row, { entrada: true, canal: c.canal || 'Direto', detalhe: c.detalhe, referencia: c.referencia });
      const u = b.utm || {};
      row.utm_source = L.cut(u.utm_source, 80) || null;
      row.utm_medium = L.cut(u.utm_medium, 80) || null;
      row.utm_campaign = L.cut(u.utm_campaign, 80) || null;
    }
    try {
      await L.sb('pageviews', { method: 'POST', body: row, prefer: 'return=minimal' });
    } catch (err) {
      // SQL novo ainda não rodou: grava sem as colunas novas, para não perder a visita
      if (!(err && err.status === 400)) throw err;
      NEW_COLS.forEach((k) => { delete row[k]; });
      if (tipo === 'view' || tipo === 'whatsapp' || tipo === 'email') await L.sb('pageviews', { method: 'POST', body: row, prefer: 'return=minimal' });
    }
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

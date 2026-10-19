'use strict';
/* IA BRAZIL — recebe os contatos do site (formulário e e-mail do topo). Rota: POST /api/lead */
const L = require('./_lib');

const FORM = ['nome', 'sobrenome', 'empresa', 'email', 'whatsapp', 'interesse', 'mensagem', 'origem'];
const REQUIRED = ['nome', 'empresa', 'email', 'whatsapp', 'interesse'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 405, { ok: false }, { Allow: 'POST' });
  if (!L.originOk(req)) return L.send(res, 403, { ok: false });

  let body;
  try { body = await L.readBody(req); } catch { return L.send(res, 413, { ok: false }); }

  // Robô: o campo escondido veio preenchido. Responde "ok" sem guardar nada.
  if (body.site) return L.send(res, 200, { ok: true });

  const onlyEmail = body.tipo === 'email';
  const data = {};
  FORM.forEach((f) => { data[f] = L.clean(body[f], f) || null; });
  if (!data.email || !L.EMAIL.test(data.email)) return L.send(res, 400, { ok: false, error: 'email' });
  if (!onlyEmail && REQUIRED.some((f) => !data[f])) return L.send(res, 400, { ok: false, error: 'campos' });

  try {
    const who = L.visitor(req);
    if (await L.tooMany('lead', who, 8, 3600)) return L.send(res, 429, { ok: false, error: 'limite' });
    await L.hit('lead', who);

    const email = encodeURIComponent(data.email);
    if (onlyEmail) {
      // O mesmo e-mail não vira duas linhas
      const same = await L.sb(`leads?email=eq.${email}&select=id&limit=1`);
      if (!same || !same.length) {
        await L.sb('leads', { method: 'POST', body: { email: data.email, origem: data.origem, parcial: true }, prefer: 'return=minimal' });
      }
      return L.send(res, 200, { ok: true });
    }

    // Formulário completo: se esse e-mail já tinha deixado só o e-mail no topo, completa aquela linha
    const partial = await L.sb(`leads?email=eq.${email}&parcial=eq.true&select=id&order=created_at.desc&limit=1`);
    if (partial && partial.length) {
      await L.sb(`leads?id=eq.${partial[0].id}`, { method: 'PATCH', body: { ...data, parcial: false }, prefer: 'return=minimal' });
    } else {
      await L.sb('leads', { method: 'POST', body: { ...data, parcial: false }, prefer: 'return=minimal' });
    }
    return L.send(res, 200, { ok: true });
  } catch (err) {
    // Sem detalhes para quem chamou; o motivo fica só no log da Vercel
    console.error('lead:', err && err.message, err && err.status);
    return L.send(res, err && err.message === 'config' ? 503 : 502, { ok: false, error: 'indisponivel' });
  }
};

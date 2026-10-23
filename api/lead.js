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

  // De onde a pessoa veio (primeira página da visita). Se o SQL de análise ainda não rodou, o contato é salvo sem isso.
  const ft = body.ft && typeof body.ft === 'object' ? body.ft : {};
  const c = L.classify(String(ft.ref || ''), ft, 'www.iabrazil.com');
  const attr = {
    canal: c.canal || (ft.landing ? 'Direto' : null),
    campanha: L.cut(ft.utm_campaign, 80) || null,
    pagina_entrada: String(ft.landing || '').startsWith('/') ? L.cut(String(ft.landing).split('?')[0], 200) : null,
    referencia: c.referencia || null,
    // Só quando a pessoa chegou por um anúncio. gbraid/wbraid (iPhone) levam o tipo na frente, porque o Google importa cada um num campo
    clique_id: L.cut(ft.gclid || (ft.gbraid && `gbraid:${ft.gbraid}`) || (ft.wbraid && `wbraid:${ft.wbraid}`), 200) || null,
  };
  const withAttr = async (fn) => {
    // Tenta com tudo; se o banco ainda não tem a coluna do anúncio, sem ela; se não tem nenhuma, sem atribuição
    const { clique_id: _, ...semClique } = attr;
    for (const x of [attr, semClique]) {
      try { return await fn(x); } catch (err) { if (!(err && err.status === 400)) throw err; }
    }
    return fn({});
  };

  try {
    const who = L.visitor(req);
    if (await L.tooMany('lead', who, 8, 3600)) return L.send(res, 429, { ok: false, error: 'limite' });
    await L.hit('lead', who);

    // Cada envio vira uma linha nova (e-mail do topo e formulário, mesmo do mesmo e-mail), nada é substituído
    const row = onlyEmail
      ? { email: data.email, origem: data.origem, parcial: true }
      : { ...data, parcial: false };
    await withAttr((x) => L.sb('leads', { method: 'POST', body: { ...row, ...x }, prefer: 'return=minimal' }));
    return L.send(res, 200, { ok: true });
  } catch (err) {
    // Sem detalhes para quem chamou; o motivo fica só no log da Vercel
    console.error('lead:', err && err.message, err && err.status);
    return L.send(res, err && err.message === 'config' ? 503 : 502, { ok: false, error: 'indisponivel' });
  }
};

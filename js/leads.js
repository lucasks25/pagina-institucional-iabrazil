/* IA BRAZIL — contatos do site. O navegador só fala com as funções do próprio site (/api/...).
   Não existe aqui URL, chave ou senha do banco: tudo isso fica no servidor. */
(() => {
  'use strict';

  const FLAG = 'iabr-adm'; // só um aviso de "entrei"; a sessão de verdade é um cookie que o JS não consegue ler
  const TIMEOUT = 15000;
  const LIMITS = { nome: 80, sobrenome: 80, empresa: 120, email: 254, whatsapp: 30, interesse: 120, mensagem: 2000, origem: 300, notas: 5000 };
  const FORM_FIELDS = ['nome', 'sobrenome', 'empresa', 'email', 'whatsapp', 'interesse', 'mensagem', 'origem'];
  const REQUIRED = ['nome', 'empresa', 'email', 'whatsapp', 'interesse'];
  const MULTILINE = ['mensagem', 'notas'];
  const STATUS = ['novo', 'em_contato', 'proposta', 'fechado', 'perdido'];
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const EXPIRED = 'Sua sessão expirou. Entre de novo para continuar.';

  // Erro de sessão: quem usa (admin.js) volta para a tela de login
  class AuthError extends Error {
    constructor(message) {
      super(message);
      this.name = 'AuthError';
    }
  }

  const clean = (value, field) => {
    let s = String(value ?? '').normalize('NFC');
    s = MULTILINE.includes(field)
      ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      : s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ');
    s = Array.from(s.trim()).slice(0, LIMITS[field]).join('').trim();
    return field === 'email' ? s.toLowerCase() : s;
  };

  // Formato único para a tela
  const normalize = (x) => {
    const out = {
      id: String(x.id ?? ''),
      created_at: String(x.created_at || ''),
      updated_at: x.updated_at ? String(x.updated_at) : '',
      status: STATUS.includes(x.status) ? x.status : 'novo',
      parcial: !!x.parcial,
    };
    FORM_FIELDS.concat('notas').forEach((f) => { out[f] = x[f] == null ? '' : String(x[f]); });
    return out;
  };

  async function request(url, opts) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      return await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...opts, signal: ctrl.signal });
    } catch {
      throw new Error('Sem resposta do servidor. Confira a conexão e tente de novo.');
    } finally {
      clearTimeout(timer);
    }
  }

  const json = (res) => res.json().catch(() => ({}));

  /* Sessão do painel */
  let who = null;
  try { who = JSON.parse(sessionStorage.getItem(FLAG) || 'null'); } catch {}
  const remember = (email) => {
    who = { email: String(email || '') };
    try { sessionStorage.setItem(FLAG, JSON.stringify(who)); } catch {}
  };
  const forget = () => {
    who = null;
    try { sessionStorage.removeItem(FLAG); } catch {}
  };

  // Chamadas do painel: o servidor confere o cookie em toda chamada
  async function admin(action, { method = 'GET', body, id } = {}) {
    const q = `a=${encodeURIComponent(action)}${id ? `&id=${encodeURIComponent(id)}` : ''}`;
    const res = await request(`/api/admin?${q}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-IABR': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await json(res);
    if (res.status === 401 && action !== 'login') {
      forget();
      throw new AuthError(EXPIRED);
    }
    if (!res.ok || !data.ok) {
      const err = new Error(res.status === 429 ? 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' : 'O servidor não conseguiu concluir. Tente de novo em instantes.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const checkId = (id) => {
    const s = String(id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(s)) throw new Error('Contato inválido.');
    return s;
  };

  /* API pública */

  const mode = () => 'live';

  // Formulário do site: salva um contato completo
  async function save(lead) {
    const src = lead || {};
    const data = {};
    FORM_FIELDS.forEach((f) => { data[f] = clean(src[f], f) || null; });
    if (REQUIRED.some((f) => !data[f])) throw new Error('Preencha todos os campos obrigatórios.');
    if (!EMAIL.test(data.email)) throw new Error('Informe um e-mail válido.');
    const res = await request('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) {
      const err = new Error(res.status === 429 ? 'Muitos envios seguidos. Tente de novo mais tarde.' : 'Não foi possível enviar agora.');
      err.status = res.status;
      throw err;
    }
  }

  // Campo de e-mail do topo: guarda só o e-mail e devolve true se o servidor aceitou
  async function saveEmail(email, origem) {
    const e = clean(email, 'email');
    if (!EMAIL.test(e)) return false;
    try {
      const res = await request('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'email', email: e, origem: `Topo do site (só e-mail) · ${clean(origem || location.pathname, 'origem')}`.slice(0, LIMITS.origem) }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function login(email, password) {
    forget();
    try {
      const data = await admin('login', { method: 'POST', body: { email: String(email || '').trim(), password: String(password || '') } });
      remember(data.email);
    } catch (err) {
      if (err.status === 401) throw new AuthError('E-mail ou senha incorretos.');
      if (err.status === 429) throw new AuthError(err.message);
      throw err;
    }
  }

  async function logout() {
    forget();
    try { await admin('logout', { method: 'POST' }); } catch {}
  }

  const hasSession = () => !!who;
  const user = () => (who ? { email: who.email } : null);

  async function list() {
    const data = await admin('list');
    return (data.leads || []).map(normalize);
  }

  // Painel só muda status e notas
  async function update(id, patch) {
    const key = checkId(id);
    const body = {};
    if (patch && 'status' in patch) {
      if (!STATUS.includes(patch.status)) throw new Error('Status inválido.');
      body.status = patch.status;
    }
    if (patch && 'notas' in patch) body.notas = clean(patch.notas, 'notas') || null;
    if (!Object.keys(body).length) throw new Error('Nada para salvar.');
    const data = await admin('update', { method: 'PATCH', id: key, body });
    return normalize(data.lead);
  }

  async function remove(id) {
    await admin('remove', { method: 'DELETE', id: checkId(id) });
  }

  window.Leads = Object.freeze({ mode, save, saveEmail, login, logout, hasSession, user, list, update, remove, AuthError, STATUS: STATUS.slice(), LIMITS: { ...LIMITS } });
})();

/* IA BRAZIL — contatos do formulário: Supabase pela API REST (sem SDK) ou, sem configuração, modo demonstração no navegador */
(() => {
  'use strict';

  const cfg = window.IABR_CONFIG || {};
  const BASE = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
  const KEY = String(cfg.supabaseAnonKey || '').trim();
  const DEMO_KEY = 'iabr-leads';
  const SESSION_KEY = 'iabr-admin-sessao';
  const TIMEOUT = 15000;
  const PAGE = 1000;

  // Mesmos limites do scripts/supabase-leads.sql
  const LIMITS = { nome: 80, sobrenome: 80, empresa: 120, email: 254, whatsapp: 30, interesse: 120, mensagem: 2000, origem: 300, notas: 5000 };
  const FORM_FIELDS = ['nome', 'sobrenome', 'empresa', 'email', 'whatsapp', 'interesse', 'mensagem', 'origem'];
  const REQUIRED = ['nome', 'empresa', 'email', 'whatsapp', 'interesse'];
  const MULTILINE = ['mensagem', 'notas'];
  const STATUS = ['novo', 'em_contato', 'proposta', 'fechado', 'perdido'];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const EXPIRED = 'Sua sessão expirou. Entre de novo para continuar.';

  // Erro de sessão: quem usa (admin.js) volta para a tela de login
  class AuthError extends Error {
    constructor(message) {
      super(message);
      this.name = 'AuthError';
    }
  }

  const mode = () => (BASE && KEY ? 'supabase' : 'demo');
  if (mode() === 'demo') console.info('IA BRAZIL: modo demonstração. Os contatos ficam só neste navegador. Preencha js/config.js para receber de verdade.');

  /* Limpeza: tira caracteres de controle e espaços das pontas e corta no limite (conta caracteres, não bytes) */
  const clean = (value, field) => {
    let s = String(value ?? '').normalize('NFC');
    s = MULTILINE.includes(field)
      ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      : s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ');
    s = Array.from(s.trim()).slice(0, LIMITS[field]).join('').trim();
    return field === 'email' ? s.toLowerCase() : s;
  };

  // Formato único para a tela, venha do Supabase ou do navegador
  const normalize = (x) => {
    const out = {
      id: String(x.id ?? ''),
      created_at: String(x.created_at || ''),
      updated_at: x.updated_at ? String(x.updated_at) : '',
      status: STATUS.includes(x.status) ? x.status : 'novo',
    };
    FORM_FIELDS.concat('notas').forEach((f) => { out[f] = x[f] == null ? '' : String(x[f]); });
    return out;
  };

  const newest = (a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);

  /* Modo demonstração: lista guardada no localStorage */
  const readDemo = () => {
    try {
      const all = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
      return Array.isArray(all) ? all.filter((x) => x && typeof x === 'object') : [];
    } catch {
      return [];
    }
  };
  const writeDemo = (all) => {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(all));
    } catch {
      throw new Error('Não foi possível salvar neste navegador.');
    }
  };
  const uid = () => (window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  /* HTTP */
  // A chave antiga "anon" é um JWT (começa com eyJ) e também vai no Authorization.
  // A nova "publishable" (sb_publishable_...) vai só no apikey, senão o Supabase recusa.
  const publicHeaders = (extra) => Object.assign({ apikey: KEY }, KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}, extra);

  async function request(url, opts) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      return await fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' });
    } catch {
      throw new Error('Sem resposta do servidor. Confira a conexão e tente de novo.');
    } finally {
      clearTimeout(timer);
    }
  }

  // Erro com mensagem em português e o detalhe técnico separado (o admin mostra os dois)
  async function apiError(res) {
    let detail = '';
    try {
      const body = await res.json();
      detail = String(body.msg || body.message || body.error_description || body.error || '');
    } catch {}
    const err = new Error(res.status === 404
      ? 'Tabela não encontrada no Supabase. Rode o arquivo scripts/supabase-leads.sql no SQL Editor do projeto.'
      : `O servidor recusou o pedido (erro ${res.status}).`);
    err.status = res.status;
    err.detail = detail.slice(0, 300);
    return err;
  }

  /* Sessão do admin: fica no sessionStorage e some ao fechar a aba */
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch {}

  const setSession = (data) => {
    session = {
      access_token: String(data.access_token),
      refresh_token: String(data.refresh_token || ''),
      expires_at: Number(data.expires_at) || Math.floor(Date.now() / 1000) + (Number(data.expires_in) || 3600),
      email: String((data.user && data.user.email) || ''),
    };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
  };
  const clearSession = () => {
    session = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  };

  // Mensagens do login em português, a partir da resposta do Supabase Auth
  const loginMessage = (status, data) => {
    const code = String(data.error_code || data.error || '');
    const text = String(data.msg || data.message || data.error_description || '');
    if (status === 429) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
    if (code === 'email_not_confirmed') return 'Este e-mail ainda não foi confirmado. Confirme o usuário em Authentication > Users no Supabase.';
    if (/api ?key/i.test(text)) return 'O Supabase não aceitou a chave de js/config.js. Confira se copiou a chave pública certa.';
    if (status === 400 || code === 'invalid_credentials' || code === 'invalid_grant') return 'E-mail ou senha incorretos.';
    return `Não foi possível entrar agora (erro ${status}).`;
  };

  async function tokenCall(grant, body) {
    const res = await request(`${BASE}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: publicHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.access_token) return setSession(data);
    // Falha do servidor não derruba a sessão: dá para tentar de novo
    if (res.status >= 500) throw new Error(`O login do Supabase não respondeu (erro ${res.status}). Tente de novo em instantes.`);
    throw new AuthError(grant === 'refresh_token' ? EXPIRED : loginMessage(res.status, data));
  }

  // Renova o token vencido; vários pedidos ao mesmo tempo usam a mesma renovação
  let refreshing = null;
  function refresh() {
    if (!refreshing) {
      const token = session && session.refresh_token;
      refreshing = (token ? tokenCall('refresh_token', { refresh_token: token }) : Promise.reject(new AuthError(EXPIRED)))
        .catch((err) => {
          if (err instanceof AuthError) clearSession();
          throw err;
        })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function accessToken(force) {
    if (!session) throw new AuthError('Entre com seu e-mail e senha para ver os contatos.');
    if (force || session.expires_at - 60 <= Date.now() / 1000) await refresh();
    return session.access_token;
  }

  // Pedido com o token de quem entrou; no 401 renova uma vez e, se falhar de novo, volta ao login
  async function authed(path, opts = {}, retried = false) {
    const token = await accessToken(retried);
    const res = await request(BASE + path, { ...opts, headers: { apikey: KEY, Authorization: `Bearer ${token}`, ...opts.headers } });
    if (res.status === 401) {
      if (!retried) return authed(path, opts, true);
      clearSession();
      throw new AuthError(EXPIRED);
    }
    if (!res.ok) throw await apiError(res);
    return res;
  }

  const checkId = (id) => {
    const s = String(id ?? '');
    if (mode() === 'supabase' ? !UUID.test(s) : !s) throw new Error('Contato inválido.');
    return s;
  };

  /* API pública */

  // Formulário do site: salva um contato novo
  async function save(lead) {
    const src = lead || {};
    const data = {};
    FORM_FIELDS.forEach((f) => { data[f] = clean(src[f], f) || null; });
    if (REQUIRED.some((f) => !data[f])) throw new Error('Preencha todos os campos obrigatórios.');

    if (mode() === 'demo') {
      const all = readDemo();
      all.unshift({ id: uid(), created_at: new Date().toISOString(), updated_at: null, ...data, status: 'novo', notas: null });
      writeDemo(all);
      return;
    }
    const res = await request(`${BASE}/rest/v1/leads`, {
      method: 'POST',
      headers: publicHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await apiError(res);
  }

  // Login do admin; além da senha certa, o e-mail precisa estar na tabela admins
  async function login(email, password) {
    if (mode() === 'demo') return;
    clearSession();
    await tokenCall('password', { email: String(email || '').trim(), password: String(password || '') });
    let rows = null;
    try {
      rows = await (await authed('/rest/v1/admins?select=email&limit=1')).json();
    } catch (err) {
      await logout();
      throw err;
    }
    if (!Array.isArray(rows) || !rows.length) {
      await logout();
      throw new AuthError('Senha certa, mas este e-mail não está liberado na tabela admins do Supabase.');
    }
  }

  async function logout() {
    const s = session;
    clearSession();
    if (mode() === 'demo' || !s) return;
    try {
      await request(`${BASE}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}` } });
    } catch {}
  }

  const hasSession = () => mode() === 'demo' || !!session;
  const user = () => (mode() === 'supabase' && session ? { email: session.email } : null);

  // Todos os contatos, do mais novo para o mais antigo
  async function list() {
    if (mode() === 'demo') return readDemo().map(normalize).sort(newest);
    const rows = [];
    for (let page = 0; page < 50; page += 1) {
      const res = await authed(`/rest/v1/leads?select=*&order=created_at.desc,id.desc&limit=${PAGE}&offset=${page * PAGE}`);
      const chunk = await res.json();
      rows.push(...chunk);
      if (chunk.length < PAGE) break;
    }
    return rows.map(normalize);
  }

  // Admin só muda status e notas
  async function update(id, patch) {
    const key = checkId(id);
    const data = {};
    if (patch && 'status' in patch) {
      if (!STATUS.includes(patch.status)) throw new Error('Status inválido.');
      data.status = patch.status;
    }
    if (patch && 'notas' in patch) data.notas = clean(patch.notas, 'notas') || null;
    if (!Object.keys(data).length) throw new Error('Nada para salvar.');

    if (mode() === 'demo') {
      const all = readDemo();
      const lead = all.find((x) => String(x.id) === key);
      if (!lead) throw new Error('Contato não encontrado.');
      Object.assign(lead, data, { updated_at: new Date().toISOString() });
      writeDemo(all);
      return normalize(lead);
    }
    const res = await authed(`/rest/v1/leads?id=eq.${encodeURIComponent(key)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(data),
    });
    const rows = await res.json();
    if (!rows.length) throw new Error('Contato não encontrado ou sem permissão para editar.');
    return normalize(rows[0]);
  }

  async function remove(id) {
    const key = checkId(id);
    if (mode() === 'demo') {
      const all = readDemo();
      const next = all.filter((x) => String(x.id) !== key);
      if (next.length === all.length) throw new Error('Contato não encontrado.');
      writeDemo(next);
      return;
    }
    const res = await authed(`/rest/v1/leads?id=eq.${encodeURIComponent(key)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    const rows = await res.json();
    if (!rows.length) throw new Error('Contato não encontrado ou sem permissão para excluir.');
  }

  window.Leads = Object.freeze({ mode, save, login, logout, hasSession, user, list, update, remove, AuthError, STATUS: STATUS.slice(), LIMITS: { ...LIMITS } });
})();

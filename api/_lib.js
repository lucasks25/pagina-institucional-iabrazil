'use strict';
/* IA BRAZIL — base das funções do servidor (Vercel). Nada daqui chega ao navegador.
   Variáveis de ambiente (cadastradas na Vercel, nunca no código):
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH */
const crypto = require('crypto');

const LIMITS = { nome: 80, sobrenome: 80, empresa: 120, email: 254, whatsapp: 30, interesse: 120, mensagem: 2000, origem: 300, notas: 5000 };
const STATUS = ['novo', 'em_contato', 'proposta', 'fechado', 'perdido'];
const MULTILINE = ['mensagem', 'notas'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HOSTS = new Set(['www.iabrazil.com', 'iabrazil.com', 'pagina-institucional-iabrazil.vercel.app']);
const COOKIE = 'iabr_adm';
const SESSION_SECONDS = 8 * 3600;

const isLocal = (req) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(req.headers.host || ''));

/* Mesma limpeza do formulário, repetida aqui porque o servidor nunca confia no navegador */
function clean(value, field) {
  let s = String(value == null ? '' : value).normalize('NFC');
  s = MULTILINE.includes(field)
    ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    : s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ');
  s = Array.from(s.trim()).slice(0, LIMITS[field]).join('').trim();
  return field === 'email' ? s.toLowerCase() : s;
}

function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  Object.keys(headers || {}).forEach((k) => res.setHeader(k, headers[k]));
  res.end(JSON.stringify(body));
}

async function readBody(req, max = 24000) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else {
    raw = await new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > max) { reject(new Error('grande')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }
  if (raw.length > max) throw new Error('grande');
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

/* Só aceita pedidos vindos das páginas do próprio site */
function originOk(req) {
  const origin = String(req.headers.origin || '');
  if (!origin) return false;
  try {
    const host = new URL(origin).host;
    return HOSTS.has(host) || (isLocal({ headers: { host } }) && process.env.ALLOW_LOCAL === '1');
  } catch { return false; }
}

const ip = (req) => String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '').trim();

function secret() {
  const s = process.env.SESSION_SECRET || '';
  if (s.length < 32) throw new Error('config');
  return s;
}

// Apelido irreversível do visitante (o IP em si nunca é guardado)
const visitor = (req) => crypto.createHmac('sha256', secret()).update('v1|' + ip(req)).digest('hex').slice(0, 32);

/* Banco (Supabase REST, só pelo servidor e com a chave secreta) */
async function sb(path, { method = 'GET', body, prefer } = {}) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base) && !(process.env.ALLOW_LOCAL === '1' && base)) throw new Error('config');
  if (!key) throw new Error('config');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      method,
      signal: ctrl.signal,
      headers: Object.assign({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, prefer ? { Prefer: prefer } : {}),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const err = new Error('db');
      err.status = res.status;
      throw err;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

/* Limite de tentativas por visitante */
async function tooMany(bucket, key, max, windowSec) {
  const since = new Date(Date.now() - windowSec * 1000).toISOString();
  const rows = await sb(`rate_limits?bucket=eq.${bucket}&key=eq.${key}&at=gte.${encodeURIComponent(since)}&select=id&limit=${max}`);
  return Array.isArray(rows) && rows.length >= max;
}
async function hit(bucket, key) {
  await sb('rate_limits', { method: 'POST', body: { bucket, key }, prefer: 'return=minimal' });
  if (Math.random() < 0.05) {
    const old = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    sb(`rate_limits?at=lt.${encodeURIComponent(old)}`, { method: 'DELETE' }).catch(() => {});
  }
}

/* Sessão do admin: cookie HttpOnly assinado (HMAC). O navegador não consegue ler nem forjar. */
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}
function verify(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p && p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}
function cookieOf(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : '';
}
const session = (req) => verify(cookieOf(req));
function setSession(req, res, email) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const flags = `HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${isLocal(req) ? '' : '; Secure'}`;
  res.setHeader('Set-Cookie', `${COOKIE}=${sign({ sub: email, exp })}; ${flags}`);
}
function clearSession(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${isLocal(req) ? '' : '; Secure'}`);
}

/* Senha: guardada só como hash (scrypt); formato  scrypt:sal:hash  */
function checkPassword(password, stored) {
  const parts = String(stored || '').split(':');
  const [kind, salt, hash] = parts;
  // Sempre faz a conta, mesmo se o formato estiver errado, para o tempo não revelar nada
  const expected = Buffer.from(kind === 'scrypt' && hash ? hash : '00'.repeat(64), 'hex');
  const got = crypto.scryptSync(String(password), Buffer.from(salt || '00', 'hex'), 64);
  return kind === 'scrypt' && expected.length === got.length && crypto.timingSafeEqual(expected, got);
}
const equalText = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};


/* ---------- Análise de visitas ---------- */

const BOT = new RegExp([
  'bot', 'crawl', 'spider', 'slurp', 'headless', 'lighthouse', 'pagespeed', 'gtmetrix', 'preview', 'monitor', 'uptime', 'pingdom',
  'statuscake', 'datadog', 'newrelic', 'curl', 'wget', 'python', 'axios', 'node-fetch', 'okhttp', 'go-http', 'java/', 'libwww', 'scrapy',
  'facebookexternalhit', 'facebot', 'linkedinbot', 'slackbot', 'slack-imgproxy', 'twitterbot', 'discordbot', 'telegrambot', 'whatsapp/',
  'skypeuripreview', 'embedly', 'quora link', 'pinterestbot', 'vkshare', 'outbrain', 'validator', 'semrush', 'ahrefs', 'mj12', 'dotbot',
  'petalbot', 'bytespider', 'vercel-screenshot', 'vercel-favicon', 'feedfetcher', 'mediapartners', 'google-read-aloud', 'storebot',
  'chrome-lighthouse',
].join('|'), 'i');
const isBot = (ua) => !ua || String(ua).length < 30 || BOT.test(String(ua));

/* Navegador e sistema, a partir do texto que o navegador envia */
const uaInfo = (ua) => {
  const u = String(ua || '');
  const navegador = /edg\//i.test(u) ? 'Edge' : /opr\/|opera/i.test(u) ? 'Opera' : /samsungbrowser/i.test(u) ? 'Samsung Internet'
    : /firefox|fxios/i.test(u) ? 'Firefox' : /crios|chrome/i.test(u) ? 'Chrome' : /safari/i.test(u) ? 'Safari' : 'Outro';
  const sistema = /iphone|ipad|ipod/i.test(u) ? 'iOS' : /android/i.test(u) ? 'Android' : /windows/i.test(u) ? 'Windows'
    : /mac os|macintosh/i.test(u) ? 'macOS' : /cros/i.test(u) ? 'ChromeOS' : /linux/i.test(u) ? 'Linux' : 'Outro';
  return { navegador, sistema };
};

const BR_UF = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };

const deviceOf = (ua) => {
  const u = String(ua || '');
  if (/ipad|tablet|(android(?!.*mobile))/i.test(u)) return 'Tablet';
  if (/mobi|iphone|android/i.test(u)) return 'Celular';
  return 'Computador';
};

const hostOnly = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
};

const SEARCH = [[/(^|\.)google\./, 'Google (busca)'], [/(^|\.)bing\.com$/, 'Bing (busca)'], [/duckduckgo\.com$/, 'DuckDuckGo (busca)'],
  [/(^|\.)yahoo\./, 'Yahoo (busca)'], [/ecosia\.org$/, 'Ecosia (busca)'], [/brave\.com$/, 'Brave (busca)']];
const AI = [[/chatgpt\.com$|(^|\.)openai\.com$/, 'ChatGPT'], [/perplexity\.ai$/, 'Perplexity'], [/gemini\.google\.com$/, 'Gemini'],
  [/claude\.ai$/, 'Claude'], [/copilot\.microsoft\.com$/, 'Copilot']];
const SOCIAL = [[/instagram\.com$/, 'Instagram'], [/(^|\.)facebook\.com$|(^|\.)fb\.com$|fb\.me$/, 'Facebook'], [/linkedin\.com$|lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)t\.co$|twitter\.com$|(^|\.)x\.com$/, 'X (Twitter)'], [/youtube\.com$|youtu\.be$/, 'YouTube'], [/tiktok\.com$/, 'TikTok'],
  [/wa\.me$|whatsapp\.com$/, 'WhatsApp'], [/(^|\.)t\.me$|telegram\.org$/, 'Telegram'], [/pinterest\./, 'Pinterest'], [/reddit\.com$/, 'Reddit']];
const pick = (table, host) => { const hit = table.find(([re]) => re.test(host)); return hit ? hit[1] : ''; };
const cut = (v, n) => String(v || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);

/* Decide "de onde veio" a partir das UTM (se houver) ou do site de origem */
function classify(refUrl, utm, ownHost) {
  const u = utm || {};
  const src = cut(u.utm_source, 60).toLowerCase(), med = cut(u.utm_medium, 60).toLowerCase(), camp = cut(u.utm_campaign, 80);
  const host = hostOnly(refUrl);
  if (host && ownHost && (host === ownHost || host.endsWith('.' + ownHost))) return { canal: null, detalhe: null, referencia: null };
  const refPath = (() => { try { const x = new URL(refUrl); return cut(x.hostname.replace(/^www\./, '') + (x.pathname === '/' ? '' : x.pathname), 200); } catch { return ''; } })();
  if (src || med) {
    const paid = /cpc|ppc|paid|ads|display|cpm|social-paid/.test(med);
    const name = cut(u.utm_source, 60) || host || 'campanha';
    return { canal: paid ? `Anúncio (${name})` : `Campanha (${name})`, detalhe: camp || med || null, referencia: refPath || null };
  }
  if (!host) return { canal: 'Direto', detalhe: null, referencia: null };
  const ai = pick(AI, host); if (ai) return { canal: `IA (${ai})`, detalhe: host, referencia: refPath };
  const se = pick(SEARCH, host); if (se) return { canal: se, detalhe: host, referencia: refPath };
  const so = pick(SOCIAL, host); if (so) return { canal: so, detalhe: host, referencia: refPath };
  return { canal: 'Outros sites', detalhe: host, referencia: refPath };
}

// Código de visitante que muda todo dia e não tem como ser desfeito (não é cookie, não guarda IP)
const dailyVisitor = (req) => crypto.createHmac('sha256', secret())
  .update(`d1|${new Date().toISOString().slice(0, 10)}|${ip(req)}|${String(req.headers['user-agent'] || '')}`).digest('hex').slice(0, 16);

const geo = (req) => {
  const dec = (v) => { try { return decodeURIComponent(String(v || '')); } catch { return ''; } };
  const pais = cut(req.headers['x-vercel-ip-country'], 2).toUpperCase() || null;
  const reg = cut(req.headers['x-vercel-ip-country-region'], 8).toUpperCase();
  const regiao = reg ? (pais === 'BR' && BR_UF[reg] ? BR_UF[reg] : `${reg}${pais && pais !== 'BR' ? ' (' + pais + ')' : ''}`) : null;
  return { pais, cidade: cut(dec(req.headers['x-vercel-ip-city']), 80) || null, regiao };
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { isBot, uaInfo, deviceOf, hostOnly, classify, dailyVisitor, geo, cut, LIMITS, STATUS, UUID, EMAIL, clean, send, readBody, originOk, visitor, sb, tooMany, hit, session, setSession, clearSession, checkPassword, equalText, wait };

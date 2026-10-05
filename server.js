// Challenge site server — zero dependencies, Node.js >= 18.
// Run: node server.js   (settings in .env, see .env.example)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- config ----------
loadEnv(path.join(__dirname, '.env'));
const C = {
  PORT: +(process.env.PORT || 3000),
  PUBLIC_URL: (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
  BRAND: process.env.BRAND || 'ITTY',
  INSTAGRAM: (process.env.INSTAGRAM || 'itty.company').replace(/^@/, ''),
  // Kyiv time (UTC+3 in October until the 25th)
  START_AT: Date.parse(process.env.START_AT || '2026-10-18T00:00:00+03:00'),
  END_AT: Date.parse(process.env.END_AT || '2026-11-18T00:00:00+03:00'),
  PRICE_CENTS: +(process.env.PRICE_CENTS || 100),
  CURRENCY: (process.env.CURRENCY || 'usd').toLowerCase(),
  WINNERS: +(process.env.WINNERS || 5),
  PRIZES: (process.env.PRIZES || 'Головний приз|Приз за 2 місце|Приз за 3 місце|Приз за 4 місце|Приз за 5 місце').split('|'),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  SECRET: process.env.SESSION_SECRET || '',
  EXPORT_KEY: process.env.EXPORT_KEY || '', // secret for live Google Sheets links
  PAYMENT_MODE: process.env.PAYMENT_MODE || 'demo', // demo | stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  PREREGISTRATION: process.env.PREREGISTRATION !== '0', // default on — регистрация до старта
  DATA_FILE: process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json'),
};
if (!C.SECRET) {
  C.SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[warn] SESSION_SECRET не задан — сессии сбросятся после перезапуска');
}
if (!C.ADMIN_PASSWORD) console.warn('[warn] ADMIN_PASSWORD не задан — админка отключена');
if (C.PAYMENT_MODE === 'demo') console.warn('[warn] PAYMENT_MODE=demo — шансы начисляются без оплаты (только для теста!)');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ---------- storage (JSON file, atomic writes) ----------
let db = { users: [], payments: [], tickets: [], ticketSeq: 0, feed: [], draw: null, seq: 0 };
let needsMigration = false;
if (fs.existsSync(C.DATA_FILE)) {
  const loaded = JSON.parse(fs.readFileSync(C.DATA_FILE, 'utf8'));
  db = { ...db, ...loaded };
  needsMigration = !loaded.tickets;
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(C.DATA_FILE), { recursive: true });
    const tmp = C.DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, C.DATA_FILE);
  }, 50);
}

// ---------- tickets ("номерки") ----------
// Every chance is a ticket with a unique, never reused number, issued in order of acquisition.
// type: free | paid | manual | bonus. Removed tickets are marked void, numbers are not recycled.
let tIndex = null;
function ticketIndex() {
  if (tIndex) return tIndex;
  tIndex = new Map();
  for (const t of db.tickets) if (!t.void) { if (!tIndex.has(t.userId)) tIndex.set(t.userId, []); tIndex.get(t.userId).push(t); }
  return tIndex;
}
function issue(u, qty, type, paymentId) {
  const nums = [];
  for (let k = 0; k < qty; k++) {
    const t = { n: ++db.ticketSeq, userId: u.id, type, at: Date.now() };
    if (paymentId) t.paymentId = paymentId;
    db.tickets.push(t); nums.push(t.n);
  }
  tIndex = null;
  return nums;
}
function voidTickets(list, reason) {
  for (const t of list) { t.void = true; t.voidReason = reason; t.voidAt = Date.now(); }
  tIndex = null;
}
const ticketsOf = u => ticketIndex().get(u.id) || [];
const chancesOf = u => ticketsOf(u).length;
const countType = (u, ...types) => ticketsOf(u).filter(t => types.includes(t.type)).length;
const fmtT = n => '#' + String(n).padStart(4, '0');
function ranges(nums) {
  const s = [...nums].sort((a, b) => a - b), out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? fmtT(s[i]) : `${fmtT(s[i])}–${fmtT(s[j])}`); i = j;
  }
  return out.join(', ');
}
function migrateToTickets() {
  // older data kept only counters: rebuild tickets in chronological order
  db.tickets = []; db.ticketSeq = 0;
  const ev = [];
  for (const u of db.users) {
    ev.push({ at: u.createdAt, u, type: 'free', qty: 1 });
    if (u.bonusChances > 0) ev.push({ at: u.createdAt + 1, u, type: 'bonus', qty: u.bonusChances });
  }
  for (const p of db.payments) {
    const u = db.users.find(x => x.id === p.userId);
    if (u && p.status === 'paid' && p.qty > 0) ev.push({ at: p.paidAt || p.createdAt, u, type: p.provider === 'manual' ? 'manual' : 'paid', qty: p.qty, p });
  }
  ev.sort((a, b) => a.at - b.at);
  for (const e of ev) {
    const nums = issue(e.u, e.qty, e.type, e.p?.id);
    db.tickets.slice(-e.qty).forEach(t => (t.at = e.at));
    if (e.p) { e.p.ticketFrom = nums[0]; e.p.ticketTo = nums[nums.length - 1]; }
  }
  for (const u of db.users) { // apply manual deductions recorded as negative payments
    const extra = countType(u, 'paid', 'manual') - (u.paidChances || 0);
    if (extra > 0) voidTickets(ticketsOf(u).filter(t => t.type === 'paid' || t.type === 'manual').slice(-extra), 'списано админом');
  }
  console.log(`[migrate] выдано номерков: ${db.ticketSeq}`);
  save();
}
if (needsMigration) migrateToTickets();

// ---------- helpers ----------
function phase(now = Date.now()) {
  if (db.draw) return 'results';
  if (now < C.START_AT) return 'soon';
  if (now < C.END_AT) return 'live';
  return 'ended';
}
const canJoin = () => phase() === 'live' || (C.PREREGISTRATION && phase() === 'soon');
const normIg = s => String(s || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '').toLowerCase();
const mask = h => '@' + (h.length <= 3 ? h[0] + '**' : h.slice(0, 2) + '*'.repeat(Math.min(4, h.length - 3)) + h.slice(-1));
function hashPass(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPass(pw, u) {
  const h = crypto.scryptSync(pw, u.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(u.hash, 'hex'));
}
function sign(v) { return crypto.createHmac('sha256', C.SECRET).update(v).digest('base64url'); }
function makeToken(kind, id, days = 30) {
  const v = `${kind}.${id}.${Date.now() + days * 864e5}`;
  return `${v}.${sign(v)}`;
}
function readToken(req, kind) {
  const raw = (req.headers.cookie || '').split(/;\s*/).map(c => c.split('=')).find(([k]) => k === kind)?.[1];
  if (!raw) return null;
  const parts = decodeURIComponent(raw).split('.');
  if (parts.length !== 4) return null;
  const v = parts.slice(0, 3).join('.');
  const a = Buffer.from(sign(v)), b = Buffer.from(parts[3]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (parts[0] !== kind || +parts[2] < Date.now()) return null;
  return parts[1];
}
function cookie(name, val, maxAgeSec) {
  const secure = C.PUBLIC_URL.startsWith('https') ? '; Secure' : '';
  return `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}
const currentUser = req => { const id = readToken(req, 'sid'); return id ? db.users.find(u => u.id === id) : null; };
const isAdmin = req => !!C.ADMIN_PASSWORD && readToken(req, 'adm') === 'admin';
const safeEq = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

function publicUser(u) {
  return {
    id: u.id, num: u.num, name: u.name, email: u.email, instagram: u.instagram, igStatus: u.igStatus,
    free: countType(u, 'free'), paid: countType(u, 'paid', 'manual'), bonus: countType(u, 'bonus'),
    chances: chancesOf(u), tickets: ticketsOf(u).map(t => t.n), createdAt: u.createdAt,
  };
}
function pushFeed(type, u, qty) {
  db.feed.unshift({ type, who: mask(u.instagram), qty, at: Date.now() });
  db.feed.length = Math.min(db.feed.length, 50);
}
function credit(payment) {
  if (payment.status === 'paid') return null;
  const u = db.users.find(x => x.id === payment.userId);
  if (!u) return null;
  payment.status = 'paid';
  payment.paidAt = Date.now();
  const nums = issue(u, payment.qty, payment.provider === 'manual' ? 'manual' : 'paid', payment.id);
  payment.ticketFrom = nums[0]; payment.ticketTo = nums[nums.length - 1];
  pushFeed('buy', u, payment.qty);
  save();
  return nums;
}
const paymentTickets = p => (p.ticketFrom ? Array.from({ length: p.ticketTo - p.ticketFrom + 1 }, (_, k) => p.ticketFrom + k) : []);

// naive per-IP rate limit
const hits = new Map();
function limited(req, key, max, windowMs) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const k = key + ip, now = Date.now();
  const arr = (hits.get(k) || []).filter(t => now - t < windowMs);
  arr.push(now);
  hits.set(k, arr);
  return arr.length > max;
}

// ---------- draw: random ticket numbers ----------
function runDraw() {
  const verified = new Set(db.users.filter(u => u.igStatus === 'verified').map(u => u.id));
  let pool = db.tickets.filter(t => !t.void && verified.has(t.userId));
  const total = pool.length;
  const snapshot = pool.map(t => `${t.n}:${db.users.find(u => u.id === t.userId).num}`).join(',');
  const winners = [];
  while (winners.length < C.WINNERS && pool.length) {
    const t = pool[crypto.randomInt(pool.length)];
    const u = db.users.find(x => x.id === t.userId);
    winners.push({ place: winners.length + 1, userId: u.id, ticket: t.n, chances: chancesOf(u) });
    pool = pool.filter(x => x.userId !== u.id); // one place per person
  }
  db.draw = {
    at: Date.now(), totalTickets: total, participants: verified.size, winners,
    snapshotHash: crypto.createHash('sha256').update(snapshot).digest('hex'),
  };
  save();
  return db.draw;
}
function publicResults() {
  if (!db.draw) return null;
  return {
    at: db.draw.at, totalTickets: db.draw.totalTickets, participants: db.draw.participants, hash: db.draw.snapshotHash,
    winners: db.draw.winners.map(w => {
      const u = db.users.find(x => x.id === w.userId);
      return { place: w.place, who: u ? mask(u.instagram) : '—', name: u ? u.name.split(' ')[0] : '', ticket: w.ticket, chances: w.chances, prize: C.PRIZES[w.place - 1] || '' };
    }),
  };
}

// ---------- tables (Excel download + live Google Sheets) ----------
const TYPE_RU = { free: 'Бесплатный', paid: 'Купленный', manual: 'Оплата вручную', bonus: 'Бонус' };
const IG_RU = { pending: 'На проверке', verified: 'Подписка ✓', rejected: 'Нет подписки' };
const kyiv = ts => new Date(ts).toLocaleString('ru-RU', { timeZone: 'Europe/Kyiv' });
function ticketsTable() {
  const users = new Map(db.users.map(u => [u.id, u]));
  const head = ['Номерок', 'Дата и время (Киев)', 'Тип', 'Имя', 'Email', 'Instagram', 'Подписка', '№ участника', 'Платёж', 'Статус'];
  const rows = db.tickets.map(t => {
    const u = users.get(t.userId);
    return [fmtT(t.n), kyiv(t.at), TYPE_RU[t.type] || t.type, u?.name ?? '(удалён)', u?.email ?? '', u ? '@' + u.instagram : '', u ? IG_RU[u.igStatus] : '', u?.num ?? '', t.paymentId || '', t.void ? `Аннулирован (${t.voidReason || ''})` : 'Активен'];
  });
  return [head, ...rows];
}
function participantsTable() {
  const paidBy = {};
  for (const p of db.payments) if (p.status === 'paid') paidBy[p.userId] = (paidBy[p.userId] || 0) + p.amount;
  const head = ['№ участника', 'Дата регистрации (Киев)', 'Имя', 'Email', 'Instagram', 'Подписка', 'Бесплатных', 'Купленных', 'Бонусных', 'Всего шансов', 'Номерки', 'Оплачено $', 'Заметка'];
  const rows = db.users.map(u => [u.num, kyiv(u.createdAt), u.name, u.email, '@' + u.instagram, IG_RU[u.igStatus], countType(u, 'free'), countType(u, 'paid', 'manual'), countType(u, 'bonus'), chancesOf(u), ranges(ticketsOf(u).map(t => t.n)), ((paidBy[u.id] || 0) / 100).toFixed(2), u.note]);
  return [head, ...rows];
}
function sendCsv(res, table, filename, forExcel) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const sep = forExcel ? ';' : ',';
  const text = table.map(r => r.map(esc).join(sep)).join('\r\n');
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', ...(forExcel ? { 'Content-Disposition': `attachment; filename="${filename}"` } : {}) });
  res.end((forExcel ? '﻿' : '') + text);
}

// ---------- stripe (plain REST, no SDK) ----------
async function stripe(method, p, params) {
  const r = await fetch('https://api.stripe.com/v1/' + p, {
    method,
    headers: { Authorization: 'Bearer ' + C.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'Stripe error');
  return j;
}
function verifyStripeSig(raw, header) {
  const parts = Object.fromEntries(String(header || '').split(',').map(kv => kv.split('=')));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - +parts.t) > 300) return false;
  const exp = crypto.createHmac('sha256', C.STRIPE_WEBHOOK_SECRET).update(`${parts.t}.${raw}`).digest('hex');
  const a = Buffer.from(exp), b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- http ----------
const send = (res, code, data, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
};
const fail = (res, code, error) => send(res, code, { error });
function body(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > limit) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}
async function json(req) { try { return JSON.parse(await body(req) || '{}'); } catch { return {}; } }

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp' };
function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';
  const file = path.join(__dirname, 'public', path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const routes = {
  'GET /api/state': (req, res) => {
    const users = db.users;
    send(res, 200, {
      brand: C.BRAND, instagram: C.INSTAGRAM, now: Date.now(), startAt: C.START_AT, endAt: C.END_AT,
      phase: phase(), canJoin: canJoin(), price: C.PRICE_CENTS / 100, currency: C.CURRENCY, winners: C.WINNERS,
      prizes: C.PRIZES.slice(0, C.WINNERS), demo: C.PAYMENT_MODE === 'demo',
      stats: { participants: users.length, chances: users.reduce((s, u) => s + chancesOf(u), 0) },
      feed: db.feed.slice(0, 20), results: publicResults(),
      top: [...users].sort((a, b) => chancesOf(b) - chancesOf(a) || a.num - b.num).slice(0, 10).map(u => ({ who: mask(u.instagram), chances: chancesOf(u) })),
    });
  },

  'POST /api/register': async (req, res) => {
    if (limited(req, 'reg', 30, 36e5)) return fail(res, 429, 'Занадто багато спроб, спробуй пізніше');
    if (!canJoin()) return fail(res, 403, phase() === 'soon' ? 'Реєстрація відкриється на старті челенджу' : 'Реєстрацію закрито');
    const b = await json(req);
    const name = String(b.name || '').trim().slice(0, 60);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
    const instagram = normIg(b.instagram);
    const password = String(b.password || '');
    if (name.length < 2) return fail(res, 400, 'Вкажи ім’я');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Некоректний email');
    if (!/^[a-z0-9._]{1,30}$/.test(instagram)) return fail(res, 400, 'Некоректний Instagram-нік');
    if (password.length < 6) return fail(res, 400, 'Пароль — мінімум 6 символів');
    if (!b.followed) return fail(res, 400, `Підпишись на @${C.INSTAGRAM}`);
    if (!b.agree) return fail(res, 400, 'Потрібно прийняти правила');
    if (db.users.some(u => u.email === email)) return fail(res, 409, 'Цей email уже зареєстровано — увійди');
    if (db.users.some(u => u.instagram === instagram)) return fail(res, 409, 'Цей Instagram уже бере участь');
    const u = {
      id: crypto.randomUUID(), num: ++db.seq, name, email, instagram, ...hashPass(password),
      igStatus: 'pending', note: '', createdAt: Date.now(),
    };
    db.users.push(u);
    const newTickets = issue(u, 1, 'free');
    pushFeed('join', u, 1);
    save();
    send(res, 200, { user: publicUser(u), newTickets }, { 'Set-Cookie': cookie('sid', makeToken('sid', u.id), 30 * 86400) });
  },

  'POST /api/login': async (req, res) => {
    if (limited(req, 'login', 20, 9e5)) return fail(res, 429, 'Занадто багато спроб, спробуй пізніше');
    const b = await json(req);
    const email = String(b.email || '').trim().toLowerCase();
    const u = db.users.find(x => x.email === email);
    if (!u || !checkPass(String(b.password || ''), u)) return fail(res, 401, 'Невірний email або пароль');
    send(res, 200, { user: publicUser(u) }, { 'Set-Cookie': cookie('sid', makeToken('sid', u.id), 30 * 86400) });
  },

  'POST /api/logout': (req, res) => send(res, 200, { ok: true }, { 'Set-Cookie': cookie('sid', '', 0) }),

  'GET /api/me': (req, res) => {
    const u = currentUser(req);
    send(res, 200, { user: u ? publicUser(u) : null });
  },

  'POST /api/checkout': async (req, res) => {
    const u = currentUser(req);
    if (!u) return fail(res, 401, 'Спочатку увійди');
    if (phase() !== 'live') return fail(res, 403, 'Купівля шансів доступна лише під час челенджу');
    const qty = Math.floor(+(await json(req)).qty);
    if (!(qty >= 1 && qty <= 1000)) return fail(res, 400, 'Кількість: від 1 до 1000');
    const p = { id: crypto.randomUUID(), userId: u.id, qty, amount: qty * C.PRICE_CENTS, currency: C.CURRENCY, status: 'pending', provider: C.PAYMENT_MODE, createdAt: Date.now() };
    db.payments.push(p);
    if (C.PAYMENT_MODE === 'demo') {
      const newTickets = credit(p);
      return send(res, 200, { credited: true, user: publicUser(u), newTickets });
    }
    try {
      const s = await stripe('POST', 'checkout/sessions', {
        mode: 'payment',
        success_url: `${C.PUBLIC_URL}/?paid={CHECKOUT_SESSION_ID}`,
        cancel_url: `${C.PUBLIC_URL}/?canceled=1`,
        customer_email: u.email,
        client_reference_id: p.id,
        'line_items[0][quantity]': qty,
        'line_items[0][price_data][currency]': C.CURRENCY,
        'line_items[0][price_data][unit_amount]': C.PRICE_CENTS,
        'line_items[0][price_data][product_data][name]': `${C.BRAND} COMPANY — додатковий шанс у челенджі`,
        'metadata[paymentId]': p.id,
      });
      p.sessionId = s.id;
      save();
      send(res, 200, { url: s.url });
    } catch (e) {
      p.status = 'failed';
      save();
      fail(res, 502, 'Платіжна система недоступна: ' + e.message);
    }
  },

  // fallback confirmation after redirect (webhook remains the primary source)
  'GET /api/checkout/confirm': async (req, res, url) => {
    const sid = url.searchParams.get('session_id') || '';
    const p = db.payments.find(x => x.sessionId === sid);
    if (!p) return fail(res, 404, 'Платіж не знайдено');
    if (p.status !== 'paid' && C.PAYMENT_MODE === 'stripe') {
      try {
        const s = await stripe('GET', 'checkout/sessions/' + encodeURIComponent(sid));
        if (s.payment_status === 'paid') credit(p);
      } catch (e) { return fail(res, 502, e.message); }
    }
    send(res, 200, { status: p.status, qty: p.qty, newTickets: paymentTickets(p) });
  },

  'POST /api/stripe/webhook': async (req, res) => {
    const raw = await body(req);
    if (!C.STRIPE_WEBHOOK_SECRET || !verifyStripeSig(raw, req.headers['stripe-signature'])) return fail(res, 400, 'bad signature');
    const ev = JSON.parse(raw);
    if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
      const s = ev.data.object;
      const p = db.payments.find(x => x.id === s.metadata?.paymentId);
      if (p && s.payment_status === 'paid') credit(p);
    }
    send(res, 200, { received: true });
  },

  // ----- live tables for Google Sheets: =IMPORTDATA("<url>") -----
  'GET /api/export/tickets.csv': (req, res, url) => {
    if (!C.EXPORT_KEY || !safeEq(url.searchParams.get('key') || '', C.EXPORT_KEY)) return fail(res, 403, 'bad key');
    sendCsv(res, ticketsTable(), 'tickets.csv', false);
  },
  'GET /api/export/participants.csv': (req, res, url) => {
    if (!C.EXPORT_KEY || !safeEq(url.searchParams.get('key') || '', C.EXPORT_KEY)) return fail(res, 403, 'bad key');
    sendCsv(res, participantsTable(), 'participants.csv', false);
  },

  // ----- admin -----
  'POST /api/admin/login': async (req, res) => {
    if (limited(req, 'adm', 10, 9e5)) return fail(res, 429, 'Слишком много попыток');
    const pw = String((await json(req)).password || '');
    if (!C.ADMIN_PASSWORD || !safeEq(pw, C.ADMIN_PASSWORD)) return fail(res, 401, 'Неверный пароль');
    send(res, 200, { ok: true }, { 'Set-Cookie': cookie('adm', makeToken('adm', 'admin', 7), 7 * 86400) });
  },
  'POST /api/admin/logout': (req, res) => send(res, 200, { ok: true }, { 'Set-Cookie': cookie('adm', '', 0) }),
  'GET /api/admin/data': (req, res) => {
    if (!isAdmin(req)) return fail(res, 401, 'auth');
    const paidBy = {};
    for (const p of db.payments) if (p.status === 'paid') paidBy[p.userId] = (paidBy[p.userId] || 0) + p.amount;
    const byId = new Map(db.users.map(u => [u.id, u]));
    send(res, 200, {
      phase: phase(), startAt: C.START_AT, endAt: C.END_AT, paymentMode: C.PAYMENT_MODE, currency: C.CURRENCY,
      ticketSeq: db.ticketSeq,
      sheets: C.EXPORT_KEY ? {
        tickets: `${C.PUBLIC_URL}/api/export/tickets.csv?key=${encodeURIComponent(C.EXPORT_KEY)}`,
        participants: `${C.PUBLIC_URL}/api/export/participants.csv?key=${encodeURIComponent(C.EXPORT_KEY)}`,
      } : null,
      users: db.users.map(u => ({ ...publicUser(u), ticketRanges: ranges(ticketsOf(u).map(t => t.n)), note: u.note, revenue: (paidBy[u.id] || 0) / 100 })),
      tickets: db.tickets.map(t => {
        const u = byId.get(t.userId);
        return { n: t.n, at: t.at, type: t.type, void: !!t.void, voidReason: t.voidReason, paymentId: t.paymentId, name: u?.name, email: u?.email, instagram: u?.instagram, igStatus: u?.igStatus, num: u?.num };
      }),
      payments: db.payments.slice(-300).reverse().map(p => ({ ...p, email: byId.get(p.userId)?.email, tickets: p.ticketFrom ? ranges(paymentTickets(p)) : '' })),
      draw: db.draw && { ...db.draw, winners: db.draw.winners.map(w => ({ ...w, user: byId.get(w.userId) ? publicUser(byId.get(w.userId)) : {} })) },
    });
  },
  'POST /api/admin/user': async (req, res) => {
    if (!isAdmin(req)) return fail(res, 401, 'auth');
    const b = await json(req);
    const u = db.users.find(x => x.id === b.id);
    if (!u) return fail(res, 404, 'Не найден');
    if (['pending', 'verified', 'rejected'].includes(b.igStatus)) u.igStatus = b.igStatus;
    let newTickets = [];
    if (Number.isInteger(b.addPaid) && b.addPaid !== 0) {
      if (db.draw) return fail(res, 409, 'Розыгрыш уже проведён — номерки менять нельзя');
      // manual payment (e.g. card transfer) — logged as a payment
      const p = { id: crypto.randomUUID(), userId: u.id, qty: b.addPaid, amount: b.addPaid * C.PRICE_CENTS, currency: C.CURRENCY, status: 'pending', provider: 'manual', createdAt: Date.now() };
      if (b.addPaid > 0) { db.payments.push(p); newTickets = credit(p); }
      else {
        const own = ticketsOf(u).filter(t => t.type === 'paid' || t.type === 'manual');
        if (own.length < -b.addPaid) return fail(res, 400, `У участника только ${own.length} купленных номерков`);
        voidTickets(own.slice(b.addPaid), 'списано админом');
        Object.assign(p, { status: 'paid', paidAt: Date.now() });
        db.payments.push(p);
      }
    }
    if (Number.isInteger(b.addBonus) && b.addBonus !== 0) {
      if (db.draw) return fail(res, 409, 'Розыгрыш уже проведён — номерки менять нельзя');
      if (b.addBonus > 0) newTickets = issue(u, b.addBonus, 'bonus');
      else {
        const own = ticketsOf(u).filter(t => t.type === 'bonus');
        if (own.length < -b.addBonus) return fail(res, 400, `У участника только ${own.length} бонусных номерков`);
        voidTickets(own.slice(b.addBonus), 'бонус снят админом');
      }
    }
    if (typeof b.note === 'string') u.note = b.note.slice(0, 300);
    save();
    send(res, 200, { user: publicUser(u), newTickets });
  },
  'POST /api/admin/delete': async (req, res) => {
    if (!isAdmin(req)) return fail(res, 401, 'auth');
    const { id } = await json(req);
    const u = db.users.find(x => x.id === id);
    if (u) voidTickets(ticketsOf(u), 'участник удалён');
    db.users = db.users.filter(x => x.id !== id);
    save();
    send(res, 200, { ok: true });
  },
  'POST /api/admin/draw': async (req, res) => {
    if (!isAdmin(req)) return fail(res, 401, 'auth');
    const b = await json(req);
    if (b.reset) { db.draw = null; save(); return send(res, 200, { ok: true }); }
    if (db.draw) return fail(res, 409, 'Розыгрыш уже проведён');
    if (Date.now() < C.END_AT && !b.force) return fail(res, 403, 'Челлендж ещё идёт');
    if (!db.users.some(u => u.igStatus === 'verified')) return fail(res, 400, 'Нет подтверждённых участников — проверь подписки в таблице');
    runDraw();
    send(res, 200, { ok: true });
  },
  'GET /api/admin/export.csv': (req, res) => {
    if (!isAdmin(req)) return fail(res, 401, 'auth');
    sendCsv(res, participantsTable(), 'participants.csv', true);
  },
  'GET /api/admin/tickets.csv': (req, res) => {
    if (!isAdmin(req)) return fail(res, 401, 'auth');
    sendCsv(res, ticketsTable(), 'tickets.csv', true);
  },
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    const h = routes[`${req.method} ${url.pathname}`];
    if (h) return await h(req, res, url);
    if (req.method === 'GET') return serveStatic(req, res, decodeURIComponent(url.pathname));
    fail(res, 404, 'Not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, 500, 'Ошибка сервера');
  }
}).listen(C.PORT, () => console.log(`▶ ${C.BRAND} COMPANY challenge: ${C.PUBLIC_URL}  (admin: /admin)  phase=${phase()}`));

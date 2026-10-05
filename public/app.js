'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

let S = null;          // server state
let me = null;         // current user
let offset = 0;        // server time - client time
let pendingQty = 0;    // qty chosen before registration

async function api(path, data, method) {
  const r = await fetch(path, {
    method: method || (data ? 'POST' : 'GET'),
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'same-origin',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || t('api.error', { n: r.status }));
  return j;
}
const t = (k, v) => (window.I18N && I18N.t(k, v)) || k;
const money = n => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US');
const shans = n => `${n} ${window.I18N ? I18N.pluralChance(n) : 'шансів'}`;
const fmtDate = ts => new Date(ts).toLocaleDateString(window.I18N ? I18N.locale() : 'uk-UA', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Kyiv' });
const fmtDT = ts => new Date(ts).toLocaleString(window.I18N ? I18N.locale() : 'uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' });
const locNum = n => Number(n).toLocaleString(window.I18N ? I18N.locale() : 'uk-UA');

window.resplitHero = function resplitHero() {
  $$('.hero__title .split').forEach((w, wi) => {
    const key = w.getAttribute('data-i18n');
    const txt = key ? t(key) : w.textContent.replace(/\u00a0/g, ' ');
    w.textContent = '';
    [...txt].forEach((ch, k) => {
      const s = document.createElement('span');
      s.className = ch === ' ' ? 'ch ch--space' : 'ch';
      s.textContent = ch === ' ' ? '\u00a0' : ch;
      s.style.transitionDelay = (0.05 * k + 0.1 * wi) + 's';
      w.appendChild(s);
    });
  });
  if (document.body.classList.contains('ready')) {
    $$('.hero__title .split .ch').forEach(c => { c.style.transitionDelay = '0s'; });
  }
};

/* ================= boot ================= */
(function boot() {
  const lines = ['> init challenge.exe', '> loading 5 places…', '> chances: ready'];
  const el = $('[data-boot]');
  let i = 0, j = 0;
  const type = () => {
    if (i >= lines.length) return;
    el.textContent = lines[i].slice(0, ++j);
    if (j >= lines[i].length) { i++; j = 0; setTimeout(type, 180); } else setTimeout(type, 18);
  };
  type();
  window.resplitHero();
  const done = () => { $('#loader').classList.add('done'); document.body.classList.add('ready'); };
  setTimeout(done, reduced ? 0 : 1500);
})();

/* ================= CSS 3D decorations ================= */
let billSrc = 'img/dollar.png';
function buildDeco(el, type) {
  const src = el.dataset.src;
  const inner = {
    bill: () => `<img class="bill3d" alt="" src="${billSrc}">`,
    mock: () => `<img class="mock3d" alt="" src="${src || 'img/mockup.png'}">`,
    sign: () => `<img class="sign3d" alt="" src="img/dollar-sign.png">`,
    swag: () => `<img class="swag3d" alt="" src="img/swag.png">`,
  }[type];
  if (inner) el.innerHTML = `<div class="float" style="animation-delay:${-Math.random() * 6}s">${inner()}</div>`;
}
$$('.deco').forEach(d => buildDeco(d, d.dataset.type));
(window.dollarReady || Promise.resolve({ url: billSrc })).then(({ url }) => {
  billSrc = url;
  $('.bill3d').forEach(i => i.src = url);
});

/* ================= magnetic buttons, tilt, 3D text light, parallax ================= */
(function pointer() {
  const root = document.documentElement;
  let mx = innerWidth / 2, my = innerHeight / 2, lx = 1, ly = 1, moved = false;
  addEventListener('pointermove', e => {
    mx = e.clientX; my = e.clientY; if (e.pointerType === 'mouse') moved = true;
  });
  const decos = $$('.deco');
  (function loop() {
    if (!reduced) {
      // extrusion of .x3d text points away from the cursor, like a light source
      // bias toward bottom-right so the text always has depth; the cursor tilts it
      const cl = v => Math.max(-1, Math.min(1, v));
      const tx = moved ? cl((innerWidth / 2 - mx) / (innerWidth / 2)) * .9 + .5 : 1;
      const ty = moved ? cl((innerHeight / 2 - my) / (innerHeight / 2)) * .9 + .5 : 1;
      lx += (tx - lx) * .08; ly += (ty - ly) * .08;
      root.style.setProperty('--lx', lx.toFixed(3)); root.style.setProperty('--ly', ly.toFixed(3));
      const cxm = (mx / innerWidth - .5), cym = (my / innerHeight - .5);
      for (const d of decos) {
        const r = d.getBoundingClientRect();
        if (r.bottom < -300 || r.top > innerHeight + 300) continue;
        const k = +getComputedStyle(d).getPropertyValue('--depth') || .5;
        const sy = (r.top + r.height / 2 - innerHeight / 2) * -k * .35;
        d.style.setProperty('--px', `${cxm * -80 * k}px`);
        d.style.setProperty('--py', `${sy + cym * -60 * k}px`);
      }
    }
    requestAnimationFrame(loop);
  })();

  if (!fine || reduced) return;
  document.addEventListener('pointermove', e => {
    $$('.magnetic').forEach(b => {
      const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      b.style.transform = Math.hypot(dx, dy) < 120 ? `translate(${dx * .25}px,${dy * .3}px)` : '';
    });
  });
  const TILT = '.tilt,.prize,.ticket';
  document.addEventListener('pointermove', e => {
    const el = e.target.closest(TILT);
    $$(TILT).forEach(t => { if (t !== el) { t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); } });
    if (!el) return;
    const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(.5 - py) * 12}deg`);
    el.style.setProperty('--ry', `${(px - .5) * 14}deg`);
    el.style.setProperty('--hx', `${px * 100}%`); el.style.setProperty('--hy', `${py * 100}%`);
  });
})();

/* ================= wallpaper of $ / #SWAG / bills ================= */
(function wall() {
  const box = $('#wall'); if (!box) return;
  const pics = [['img/dollar-sign.png', 70, 100], ['img/swag.png', 130, 170], ['img/dollar-sign.png', 60, 80], ['img/swag.png', 110, 150]];
  const cols = innerWidth < 700 ? 2 : 4, rows = 2, items = [];
  let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const [src, wmin, wmax] = pics[(r * 2 + c) % pics.length];
    const sp = document.createElement('span');
    sp.style.setProperty('--w', (wmin + Math.random() * (wmax - wmin)) + 'px');
    sp.innerHTML = `<img alt="" src="${src}" style="--r:${(Math.random() * 40 - 20).toFixed(1)}deg;--t:${(5 + Math.random() * 5).toFixed(1)}s;--dl:${(-Math.random() * 6).toFixed(1)}s">`;
    box.appendChild(sp);
    items.push({ el: sp, x: (c + .15 + Math.random() * .6) / cols, y: (r + Math.random() * .7) / rows, k: .15 + Math.random() * .35 });
    n++;
  }
  const place = () => {
    const H = innerHeight + 320, W = innerWidth;
    for (const it of items) {
      const y = ((it.y * H - scrollY * it.k) % H + H) % H - 200;
      it.el.style.transform = `translate3d(${it.x * W - 60}px,${y}px,0)`;
    }
  };
  addEventListener('scroll', () => requestAnimationFrame(place), { passive: true });
  addEventListener('resize', place);
  place();
})();

/* ================= twinkling glitter sparkles on the background ================= */
(function sparkles() {
  const c = $('#sparkles'); if (!c) return;
  const x = c.getContext('2d'); if (!x) return;
  let w, h, dpr, stars = [], dust = [];
  const COLORS = ['#A9ED3D', '#34CD3F', '#FF6B1A', '#eef8dc'];
  function init() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr;
    const area = innerWidth * innerHeight;
    stars = Array.from({ length: Math.round(Math.min(70, area / 16000)) }, () => ({
      x: Math.random(), y: Math.random(), s: (5 + Math.random() * 13) * dpr, c: COLORS[Math.floor(Math.random() * COLORS.length)],
      ph: Math.random() * 6.28, sp: .6 + Math.random() * 1.6, k: .05 + Math.random() * .2, rot: Math.random() * .5,
    }));
    dust = Array.from({ length: Math.round(Math.min(160, area / 7000)) }, () => ({
      x: Math.random(), y: Math.random(), r: (.8 + Math.random() * 1.8) * dpr, c: COLORS[Math.floor(Math.random() * COLORS.length)],
      ph: Math.random() * 6.28, sp: 1 + Math.random() * 3, k: .03 + Math.random() * .12,
    }));
  }
  function star(px, py, s, a, col, rot) {
    // soft pink halo, then a 4-point glint
    const g = x.createRadialGradient(px, py, 0, px, py, s * 1.1);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(.25, `rgba(255,140,198,${a * .55})`); g.addColorStop(1, 'rgba(255,46,147,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, s * 1.1, 0, 6.283); x.fill();
    x.save(); x.translate(px, py); x.rotate(rot); x.globalAlpha = a; x.fillStyle = col;
    const t = s * .13;
    x.beginPath(); x.moveTo(0, -s); x.quadraticCurveTo(t, -t, s, 0); x.quadraticCurveTo(t, t, 0, s); x.quadraticCurveTo(-t, t, -s, 0); x.quadraticCurveTo(-t, -t, 0, -s); x.fill();
    x.rotate(Math.PI / 4); const s2 = s * .45;
    x.beginPath(); x.moveTo(0, -s2); x.quadraticCurveTo(t, -t, s2, 0); x.quadraticCurveTo(t, t, 0, s2); x.quadraticCurveTo(-t, t, -s2, 0); x.quadraticCurveTo(-t, -t, 0, -s2); x.fill();
    x.restore();
  }
  const wrapY = (y, k) => { const H = h + 80 * dpr; return ((y * h - scrollY * dpr * k) % H + H) % H - 40 * dpr; };
  function frame(now) {
    const t = (now || 0) / 1000;
    x.clearRect(0, 0, w, h);
    for (const d of dust) {
      const a = Math.pow(Math.max(0, Math.sin(t * d.sp + d.ph)), 4) * .9;
      if (a < .03) continue;
      x.globalAlpha = a; x.fillStyle = d.c; x.beginPath(); x.arc(d.x * w, wrapY(d.y, d.k), d.r, 0, 6.283); x.fill();
    }
    x.globalAlpha = 1;
    for (const s of stars) {
      const a = Math.pow(Math.max(0, Math.sin(t * s.sp + s.ph)), 3);
      if (a < .03) continue;
      star(s.x * w, wrapY(s.y, s.k), s.s * (.6 + a * .4), a, s.c, s.rot + t * .2);
    }
    if (!reduced) requestAnimationFrame(frame);
  }
  addEventListener('resize', init);
  if (reduced) addEventListener('scroll', () => frame(0), { passive: true });
  init(); requestAnimationFrame(frame);
})();

/* ================= manifesto: words light up while scrolling ================= */
let manifestoWords = [];
function wrapManifesto() {
  const p = $('#manifesto'); if (!p) return;
  // unwrap previous spans so we can re-apply after language change
  if (p.querySelector('.w')) {
    p.innerHTML = (window.I18N ? I18N.t('manifesto.text') : p.innerHTML);
  }
  const HOT = /^(безкоштовно|бесплатно|free|gratis|\$?1|долар|доллар|dollar|п.?ять|п’ять|five|vijf|ITTY|челендж|челлендж|challenge)[.,!]?$/i;
  const walk = node => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
          const s = document.createElement('span'); s.className = 'w' + (HOT.test(part) ? ' hot' : ''); s.textContent = part; frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) {
        if (n.classList.contains('you')) return; // keep finale badge intact
        n.classList.add('w'); if (HOT.test(n.textContent)) n.classList.add('hot');
      }
    });
  };
  walk(p);
  manifestoWords = $$('.w', p);
  const r = p.getBoundingClientRect();
  const prog = Math.max(0, Math.min(1, (innerHeight * .9 - r.top) / Math.max(80, r.height * .65)));
  const n = Math.round(prog * manifestoWords.length);
  manifestoWords.forEach((w, k) => w.classList.toggle('on', k < n || reduced));
}
addEventListener('scroll', () => {
  const p = $('#manifesto'); if (!p || !manifestoWords.length) return;
  const r = p.getBoundingClientRect();
  const prog = Math.max(0, Math.min(1, (innerHeight * .9 - r.top) / Math.max(80, r.height * .65)));
  const n = Math.round(prog * manifestoWords.length);
  manifestoWords.forEach((w, k) => w.classList.toggle('on', k < n || reduced));
}, { passive: true });

/* ================= reveal on scroll ================= */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15 });
const observe = () => $$('.reveal:not(.in)').forEach(el => io.observe(el));
observe();

/* ================= count-up ================= */
function countTo(el, to) {
  const from = +el.dataset.v || 0; el.dataset.v = to;
  if (from === to) { el.textContent = locNum(to); return; }
  const t0 = performance.now(), dur = 1200;
  (function step(nowT) {
    const p = Math.min(1, (nowT - t0) / dur), e = 1 - Math.pow(1 - p, 4);
    el.textContent = locNum(Math.round(from + (to - from) * e));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}

/* ================= state ================= */
async function loadState() {
  try {
    const t0 = Date.now();
    S = await api('/api/state');
    offset = S.now - (t0 + Date.now()) / 2;
    render();
  } catch (e) { console.warn(e); }
}
const now = () => Date.now() + offset;

function render() {
  $$('[data-brand-name]').forEach(e => e.textContent = S.brand);
  document.title = t('meta.title', { brand: S.brand, n: S.winners });
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.content = t('meta.desc');
  $$('[data-ig]').forEach(e => e.textContent = '@' + S.instagram);
  $$('[data-ig-link]').forEach(e => e.href = 'https://instagram.com/' + S.instagram);
  $('#tlStart').textContent = fmtDate(S.startAt);
  $('#tlEnd').textContent = fmtDate(S.endAt);
  $('#phaseBadge').textContent = {
    soon: t('phase.soon', { when: fmtDT(S.startAt) }),
    live: t('phase.live'),
    ended: t('phase.ended'),
    results: t('phase.results'),
  }[S.phase];
  countTo($('[data-count=participants]'), S.stats.participants);
  $('#boostNote').textContent = S.demo ? t('boost.noteDemo') : t('boost.note');
  renderPrizes(); renderMarquee(); renderResults(); renderTimeline(); updateBoost();
  renderOdds(); renderTop(); renderWeek();
  const joinTxt = S.phase === 'results' ? t('cta.results') : S.phase === 'ended' ? t('cta.ended') : me ? t('cta.cabinet') : t('cta.join');
  $('#heroJoin span').textContent = joinTxt;
  $('#finalJoin span').textContent = S.phase === 'results' ? t('cta.results') : me ? t('cta.boost') : t('cta.joinShort');
  updateNav();
}

let prizesKey = '';
function renderPrizes() {
  const key = S.prizes.join('|') + ':' + (window.I18N?.lang || 'uk');
  if (key === prizesKey) return; prizesKey = key;
  $('#prizeGrid').innerHTML = S.prizes.map((p, i) => {
    const pk = 'prize.name.' + (i + 1), pname = t(pk);
    return `
    <article class="prize reveal" style="--d:${i * .08}s">
      <div class="prize__in">
        <div class="prize__tag">${t('prize.place', { n: i + 1 })}</div>
        <div class="prize__name">${esc(pname !== pk ? pname : p)}</div>
        <div class="prize__place x3d${i === 0 ? ' x3d--lemon' : i === 1 ? '' : ' x3d--pink'}">${i + 1}</div>
        ${i === 0 ? `<div class="prize__bill"><img class="bill3d" alt="" src="${billSrc}"></div>` : ''}
      </div>
    </article>`;
  }).join('');
  observe();
}

let oddsKey = '';
function renderOdds() {
  const key = String(S.price) + ':' + (window.I18N?.lang || 'uk');
  if (key === oddsKey) return; oddsKey = key;
  const packs = [[0, t('odds.tag.base')], [5, t('odds.tag.warm')], [10, '🔥 ' + t('odds.tag.hot')], [25, t('odds.tag.hot')], [50, t('odds.tag.max')], [100, t('odds.tag.max')]];
  $('#oddsTable').innerHTML = packs.map(([extra, tag]) => {
    const total = extra + 1;
    return `<div class="odd${extra === 10 ? ' odd--hot' : ''}">
      <div class="odd__n">${total}<small>${I18N.pluralChance(total)}</small></div>
      <div class="odd__bar"><i style="--w:${Math.max(3, total / 101 * 100)}%"></i></div>
      <div class="odd__price">${extra ? money(extra * S.price) : '$0'}</div>
      <div class="odd__tag">${extra ? '×' + total + ' · ' : ''}${tag}</div>
    </div>`;
  }).join('');
}

let topKey = '';
function renderTop() {
  const top = S.top || [];
  const key = JSON.stringify(top) + ':' + (window.I18N?.lang || 'uk');
  if (key === topKey) return; topKey = key;
  const max = Math.max(1, ...top.map(row => row.chances));
  $('#topList').innerHTML = top.length ? top.map((row, i) => `
    <div class="toprow">
      <div class="toprow__rank">${i + 1}</div>
      <div><div class="toprow__who">${esc(row.who)}</div><div class="toprow__bar"><i style="width:${row.chances / max * 100}%"></i></div></div>
      <div class="toprow__n">${row.chances}<small>${I18N.pluralChance(row.chances)}</small></div>
    </div>`).join('')
    : `<div class="top__empty">${S.phase === 'soon' ? t('top.empty.soon', { when: esc(fmtDT(S.startAt)) }) : t('top.empty')}</div>`;
}

let weekKey = '';
function renderWeek() {
  const days = Math.min(31, Math.max(1, Math.round((S.endAt - S.startAt) / 864e5)));
  const today = Math.floor((now() - S.startAt) / 864e5);
  const key = days + ':' + today + ':' + S.startAt + ':' + (window.I18N?.lang || 'uk');
  if (key === weekKey) return; weekKey = key;
  $('#week').innerHTML = Array.from({ length: days }, (_, k) => {
    const ts = S.startAt + k * 864e5;
    const wd = new Date(ts).toLocaleDateString(I18N.locale(), { weekday: 'short', timeZone: 'Europe/Kyiv' });
    const cls = k < today ? ' day--past' : k === today && S.phase === 'live' ? ' day--now' : '';
    return `<div class="day${cls}"><span>${t('time.day', { n: k + 1 })}</span><b>${fmtDate(ts).slice(0, 2)}</b><span>${esc(wd)}</span></div>`;
  }).join('');
}

let mqKey = '';
function renderMarquee() {
  const base = [t('mq.free1'), t('mq.plus1', { price: S.price }), t('mq.winners', { n: S.winners }), t('mq.start', { when: fmtDate(S.startAt) }), t('mq.end', { when: fmtDate(S.endAt) }), `@${S.instagram}`];
  const html1 = base.map(txt => `<span>${esc(txt)}</span><span class="star">✦</span>`).join('');
  const feed = S.feed.length ? S.feed.map(f => f.type === 'join'
    ? `<span class="feed"><b>${esc(f.who)}</b> ${t('mq.joined')}</span><span class="star">◆</span>`
    : `<span class="feed"><b>${esc(f.who)}</b> ${t('mq.took', { n: shans(f.qty) })}</span><span class="star">◆</span>`).join('')
    : `<span class="feed">${t('mq.first')}</span><span class="star">◆</span><span class="feed">${t('mq.each')}</span><span class="star">◆</span>`;
  const key = html1 + feed + (window.I18N?.lang || 'uk');
  if (key === mqKey) return; mqKey = key;
  const fill = h => { let s = h; while (s.length < 3000) s += h; return s + s; };
  $('#mq1').innerHTML = fill(html1);
  $('#mq2').innerHTML = fill(feed);
}

function renderTimeline() {
  const p = Math.max(0, Math.min(1, (now() - S.startAt) / (S.endAt - S.startAt)));
  const pct = S.phase === 'soon' ? 2 : S.phase === 'live' ? 15 + p * 70 : 100;
  $('#tlProgress').style.width = pct + '%';
  $('.timeline').style.setProperty('--tlp', pct + '%');
}

let resultsShown = false;
function renderResults() {
  const sec = $('#results');
  if (!S.results) { sec.hidden = true; return; }
  sec.hidden = false;
  if (resultsShown) return; resultsShown = true;
  const R = S.results;
  $('#resultsMeta').textContent = t('results.meta', { when: fmtDT(R.at), people: R.participants, tickets: R.totalTickets, hash: R.hash.slice(0, 16) });
  $('#winners').innerHTML = R.winners.map(w => `
    <div class="winner">
      <div class="winner__place">${w.place}</div>
      <div><div class="winner__who rolling" data-final="${esc(w.who)}">@••••••</div><div class="winner__prize">${esc(w.prize)}${w.name ? ' · ' + esc(w.name) : ''}</div></div>
      <div class="winner__ticket">${t('results.ticket')}<b>#${w.ticket}</b>${shans(w.chances)}</div>
    </div>`).join('');
  const reveal = new IntersectionObserver(es => {
    if (!es[0].isIntersecting) return; reveal.disconnect();
    $$('.winner').forEach((el, i) => setTimeout(() => {
      el.classList.add('in');
      const who = $('.winner__who', el), abc = 'abcdefghijklmnopqrstuvwxyz0123456789._';
      let n = 0; const iv = setInterval(() => {
        who.textContent = '@' + Array.from({ length: 8 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
        if (++n > 18) { clearInterval(iv); who.textContent = who.dataset.final; who.classList.remove('rolling'); if (i === 0) confetti(); }
      }, 60);
    }, (S.results.winners.length - 1 - i) * 900));
  }, { threshold: .3 });
  reveal.observe(sec);
}

/* ================= countdown ================= */
const cdPrev = {};
function tickCountdown() {
  if (!S) return;
  let target = null, label = '';
  if (S.phase === 'soon') { target = S.startAt; label = t('cd.soon'); }
  else if (S.phase === 'live') { target = S.endAt; label = t('cd.live'); }
  else if (S.phase === 'ended') label = t('cd.ended');
  else label = t('cd.results');
  $('#cdLabel').textContent = label;
  let diff = target ? Math.max(0, target - now()) : 0;
  if (target && diff === 0) { loadState(); }
  const v = { d: Math.floor(diff / 864e5), h: Math.floor(diff / 36e5) % 24, m: Math.floor(diff / 6e4) % 60, s: Math.floor(diff / 1e3) % 60 };
  for (const k in v) {
    const el = $(`[data-cd=${k}]`), val = String(v[k]).padStart(2, '0');
    if (cdPrev[k] !== val) { el.textContent = val; if (cdPrev[k] !== undefined) { el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); } cdPrev[k] = val; }
  }
  renderTimeline();
}
setInterval(tickCountdown, 1000);

/* ================= boost calculator ================= */
const range = $('#boostRange');
function updateBoost(bump) {
  const extra = +range.value, total = extra + 1, price = S ? S.price : 1;
  range.style.setProperty('--p', `${extra}%`);
  $('#bExtra').textContent = extra;
  $('#bMult').textContent = '×' + total;
  $('#bPrice').textContent = money(extra * price);
  const big = $('#bTotal');
  if (big.textContent !== String(total)) { big.textContent = total; if (bump) { big.classList.remove('bump'); void big.offsetWidth; big.classList.add('bump'); } }
  const bars = $('#bBars');
  if (!bars.children.length) bars.innerHTML = '<i></i>'.repeat(30);
  const lit = Math.max(1, Math.round(Math.sqrt(total / 101) * 30));
  [...bars.children].forEach((b, i) => { b.className = i === 0 ? 'free on' : i < lit ? 'on' : ''; b.style.height = i < lit ? (35 + (i / 30) * 65) + '%' : '20%'; });
  $$('#quickBoost button').forEach(b => b.classList.toggle('on', +b.dataset.q === extra));
  $('#boostBuy span').textContent = extra ? t('boost.buyN', { n: shans(extra), price: money(extra * price) }) : t('boost.buyFree');
  $('.ticket__no').textContent = me ? '№ ' + String(me.num).padStart(4, '0') : '№ ••••';
}
range.addEventListener('input', () => updateBoost(true));
$$('#quickBoost button').forEach(b => b.addEventListener('click', () => { range.value = b.dataset.q; updateBoost(true); }));
$('#boostBuy').addEventListener('click', () => {
  const q = +range.value;
  if (!q) return join();
  if (!S || S.phase !== 'live') return toast(S?.phase === 'soon' ? t('toast.buySoon', { when: fmtDT(S.startAt) }) : t('toast.buyClosed'), true);
  if (!me) { pendingQty = q; return openAuth('register'); }
  checkout(q);
});

/* ================= CTAs ================= */
function join() {
  if (me) return openCabinet();
  if (S?.phase === 'results') return $('#results')?.scrollIntoView({ behavior: 'smooth' });
  if (S?.phase === 'ended') return toast(t('toast.joinClosed'), true);
  openAuth('register');
}
$('#heroJoin').addEventListener('click', join);
$('#finalJoin').addEventListener('click', () => (me && S?.phase === 'live') ? $('#boost').scrollIntoView({ behavior: 'smooth' }) : join());
$('#navAuth').addEventListener('click', () => me ? openCabinet() : openAuth('register'));
$('#openRules').addEventListener('click', openRules);
const stepReg = $('#stepRegister');
if (stepReg) {
  stepReg.addEventListener('click', join);
  stepReg.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); join(); } });
}

/* ================= modal ================= */
const modal = $('#modal'), mbody = $('#modalBody');
function openModal(html) { mbody.innerHTML = html; modal.hidden = false; document.body.classList.add('locked'); }
function closeModal() { modal.hidden = true; document.body.classList.remove('locked'); }
modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

function openSoon() {
  const ig = igHandle();
  openModal(`
    <h3>${t('auth.soon.h', { when: esc(fmtDate(S.startAt)) })}</h3>
    <p class="lead">${t('auth.soon.p', { when: esc(fmtDT(S.startAt)) })}</p>
    <a class="btn btn--primary btn--block" href="https://instagram.com/${esc(ig)}" target="_blank" rel="noopener"><span>${t('auth.soon.btn', { ig: esc(ig) })}</span><i>→</i></a>`);
}

function openAuth(tab) {
  const reg = tab === 'register';
  openModal(`
    <div class="tabs"><button data-tab="register" class="${reg ? 'on' : ''}">${t('auth.register')}</button><button data-tab="login" class="${reg ? '' : 'on'}">${t('auth.login')}</button></div>
    <div id="authPane"></div>`);
  $$('.tabs button', mbody).forEach(b => b.addEventListener('click', () => openAuth(b.dataset.tab)));
  reg ? regStep1() : loginPane();
}

const draft = { followed: false };
function igHandle() { return S?.instagram || 'itty.company'; }
function regStep1() {
  const igName = igHandle();
  $('#authPane').innerHTML = `
    <div class="progress"><i class="on"></i><i></i></div>
    <h3>${t('auth.s1.h')}</h3>
    <p class="lead">${t('auth.s1.p')}</p>
    <div class="igbox ${draft.followed ? 'done' : ''}" id="igbox">
      <div class="igbox__ico">◎</div>
      <div><b>@${esc(igName)}</b><small>${draft.followed ? t('auth.s1.ok') : t('auth.s1.must')}</small></div>
      <a class="btn btn--primary btn--sm" id="igFollow" href="https://instagram.com/${esc(igName)}" target="_blank" rel="noopener">${draft.followed ? t('auth.s1.open') : t('auth.s1.follow')}</a>
    </div>
    <label class="field"><span>${t('auth.s1.nick')}</span><input id="rIg" placeholder="@username" autocomplete="off" value="${esc(draft.instagram || '')}"></label>
    <label class="check"><input type="checkbox" id="rFollowed" ${draft.followed ? 'checked' : ''}> ${t('auth.s1.check', { ig: esc(igName) })}</label>
    <div class="err" id="err"></div>
    <button class="btn btn--primary btn--block" id="next"><span>${t('auth.s1.next')}</span><i>→</i></button>`;
  $('#igFollow').addEventListener('click', () => { draft.followed = true; setTimeout(() => { $('#rFollowed').checked = true; $('#igbox').classList.add('done'); }, 400); });
  $('#next').addEventListener('click', () => {
    const ig = $('#rIg').value.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/.*$/, '');
    if (!/^[A-Za-z0-9._]{1,30}$/.test(ig)) return ($('#err').textContent = t('auth.err.ig'));
    if (!$('#rFollowed').checked) return ($('#err').textContent = t('auth.err.follow', { ig: igName }));
    draft.instagram = ig; draft.followed = true;
    regStep2();
  });
}
function regStep2() {
  $('#authPane').innerHTML = `
    <div class="progress"><i class="on"></i><i class="on"></i></div>
    <h3>${t('auth.s2.h')}</h3>
    <p class="lead">${t('auth.s2.p')}</p>
    <form id="regForm">
      <label class="field"><span>${t('auth.s2.name')}</span><input name="name" required autocomplete="name"></label>
      <label class="field"><span>${t('auth.s2.email')}</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>${t('auth.s2.pass')}</span><input name="password" type="password" minlength="6" required autocomplete="new-password"></label>
      <label class="check"><input type="checkbox" name="agree" required> <span>${t('auth.s2.agree')}<button type="button" id="rulesLink">${t('auth.s2.rules')}</button></span></label>
      <div class="rules" id="rulesInline" hidden>${rulesHtml()}</div>
      <div class="err" id="err"></div>
      <button class="btn btn--primary btn--block" type="submit"><span>${t('auth.s2.submit')}</span><i>→</i></button>
    </form>
    <p class="tiny"><button class="linklike" id="back">${t('auth.s2.back')}</button></p>`;
  $('#back').addEventListener('click', regStep1);
  $('#rulesLink').addEventListener('click', () => { const r = $('#rulesInline'); r.hidden = !r.hidden; });
  $('#regForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target), btn = $('button[type=submit]', e.target);
    btn.disabled = true;
    try {
      const r = await api('/api/register', { name: f.get('name'), email: f.get('email'), password: f.get('password'), agree: !!f.get('agree'), instagram: draft.instagram, followed: draft.followed });
      me = r.user; render(); updateNav();
      confetti();
      const qty = pendingQty; pendingQty = 0;
      showTickets(r.newTickets || me.tickets, t('tickets.in'), t('tickets.freeLead'), () => openCabinet(qty));
      loadState();
    } catch (err) { $('#err').textContent = err.message; btn.disabled = false; }
  });
}
function loginPane() {
  $('#authPane').innerHTML = `
    <h3>${t('auth.login.h')}</h3>
    <p class="lead">${t('auth.login.p')}</p>
    <form id="loginForm">
      <label class="field"><span>${t('auth.s2.email')}</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>${t('auth.s2.pass')}</span><input name="password" type="password" required autocomplete="current-password"></label>
      <div class="err" id="err"></div>
      <button class="btn btn--primary btn--block" type="submit"><span>${t('auth.login.submit')}</span><i>→</i></button>
    </form>`;
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/api/login', { email: f.get('email'), password: f.get('password') });
      me = r.user; render(); updateNav(); openCabinet(pendingQty); pendingQty = 0;
    } catch (err) { $('#err').textContent = err.message; }
  });
}

function statusLabel(st) {
  return ({
    pending: ['status--pending', '⏳ ' + t('status.pending')],
    verified: ['status--verified', '✓ ' + t('status.verified')],
    rejected: ['status--rejected', '✕ ' + t('status.rejected')],
  })[st] || ['status--pending', '⏳ ' + t('status.pending')];
}
function openCabinet(prefill) {
  const live = S.phase === 'live';
  const [cls, txt] = statusLabel(me.igStatus);
  openModal(`
    <h3>${t('cab.hi', { name: esc(me.name.split(' ')[0]) })}</h3>
    <span class="status ${cls}">${txt}</span>
    ${me.igStatus === 'rejected' ? `<p class="lead" style="margin-top:12px">${t('cab.ig.rejected', { user: esc(me.instagram), ig: esc(S.instagram) })}</p>` : ''}
    <div class="cab__chances"><b>${me.chances}</b><span class="muted">${shans(me.chances)} ${t('cab.inPlay')}</span></div>
    <div class="cab__row"><span>${t('cab.member')}</span><b>№ ${String(me.num).padStart(4, '0')}</b></div>
    <div class="cab__row"><span>Instagram</span><b>@${esc(me.instagram)}</b></div>
    <div class="cab__row"><span>${t('cab.free')}</span><b>${me.free}</b></div>
    <div class="cab__row"><span>${t('cab.paid')}</span><b>${me.paid}</b></div>
    ${me.bonus ? `<div class="cab__row"><span>${t('cab.bonus')}</span><b>${me.bonus}</b></div>` : ''}
    <div class="cab__tickets">
      <div class="cab__tickets-head"><b>${t('cab.tickets')}</b><span>${t('cab.pcs', { n: me.tickets.length })}</span></div>
      <div class="tks tks--small">${ticketChips(me.tickets, 300, false)}</div>
    </div>
    ${live ? `
    <div class="cab__buy">
      <b>${t('cab.boost')}</b><div class="muted" style="font-size:14px">${t('cab.price', { price: S.price })}</div>
      <div class="quick" style="margin-top:12px">${[1, 5, 10, 25, 50].map(q => `<button data-q="${q}">+${q}</button>`).join('')}</div>
      <div class="cab__qty"><input id="cabQty" type="number" min="1" max="1000" value="${prefill || 10}"><button class="btn btn--primary" id="cabBuy"><span>${t('cab.buy')}</span><i>→</i></button></div>
      <div class="muted" id="cabSum" style="font-size:14px"></div>
    </div>` : `<p class="lead" style="margin-top:18px">${S.phase === 'soon' ? t('cab.soonBuy') : t('cab.endedBuy')}</p>`}
    <p class="tiny"><button class="linklike" id="logout">${t('cab.logout')}</button></p>`);
  $('#logout').addEventListener('click', async () => { await api('/api/logout', {}); me = null; closeModal(); render(); updateNav(); });
  if (!live) return;
  const q = $('#cabQty');
  const upd = () => { const n = Math.max(0, Math.floor(+q.value || 0)); $('#cabSum').textContent = n ? t('cab.sum', { price: money(n * S.price), n: shans(me.chances + n) }) : ''; };
  q.addEventListener('input', upd); upd();
  $$('.cab__buy .quick button').forEach(b => b.addEventListener('click', () => { q.value = b.dataset.q; upd(); }));
  $('#cabBuy').addEventListener('click', () => checkout(Math.floor(+q.value)));
}

function openRules() { openModal(`<h3>${t('rules.title')}</h3><div class="rules">${rulesHtml()}</div>`); }
function rulesHtml() {
  const brand = esc(S?.brand || 'ITTY'), ig = esc(S?.instagram || 'itty.company');
  const start = esc(S ? fmtDT(S.startAt) : ''), end = esc(S ? fmtDT(S.endAt) : '');
  const price = S?.price ?? 1, n = S?.winners ?? 5;
  return `<ol>
      <li>${t('rules.1', { brand, start, end })}</li>
      <li>${t('rules.2')}</li>
      <li>${t('rules.3', { ig })}</li>
      <li>${t('rules.4', { price })}</li>
      <li>${t('rules.5')}</li>
      <li>${t('rules.6', { n })}</li>
      <li>${t('rules.7')}</li>
      <li>${t('rules.8')}</li>
    </ol>`;
}

function updateNav() { $('#navAuth').textContent = me ? t('nav.cabinet', { n: me.chances }) : t('nav.login'); }

/* ================= checkout ================= */
async function checkout(qty) {
  if (!(qty >= 1 && qty <= 1000)) return toast(t('toast.qty'), true);
  try {
    const r = await api('/api/checkout', { qty });
    if (r.url) { location.href = r.url; return; }
    if (r.credited) { me = r.user; afterPaid(qty, r.newTickets); }
  } catch (e) { toast(e.message, true); }
}
function afterPaid(qty, newTickets) {
  confetti(); updateNav(); render();
  showTickets(newTickets || [], t('tickets.paidTitle', { n: shans(qty) }), t('tickets.paidLead', { total: shans(me.chances) }), () => openCabinet());
  loadState();
}

/* ================= ticket numbers ("номерки") ================= */
const fmtT = n => '#' + String(n).padStart(4, '0');
function ticketRanges(nums) {
  const s = [...nums].sort((a, b) => a - b), out = [];
  for (let i = 0; i < s.length; i++) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++; out.push(i === j ? fmtT(s[i]) : `${fmtT(s[i])}–${fmtT(s[j])}`); i = j; }
  return out.join(', ');
}
function ticketChips(nums, limit = 120, animate = true) {
  const list = [...nums].sort((a, b) => a - b);
  return list.slice(0, limit).map((n, k) => `<span class="tk"${animate ? ` style="animation-delay:${Math.min(k, 40) * .04}s"` : ''}>${fmtT(n)}</span>`).join('')
    + (list.length > limit ? `<span class="tk tk--more">${t('tickets.more', { n: list.length - limit })}</span>` : '');
}
function showTickets(nums, title, lead, next) {
  openModal(`
    <h3>${esc(title)}</h3>
    <p class="lead">${esc(lead)}</p>
    <div class="tks">${ticketChips(nums)}</div>
    ${nums.length > 1 ? `<p class="tk-range">${esc(ticketRanges(nums))}</p>` : ''}
    <p class="tk-note">${t('tickets.note')}</p>
    <button class="btn btn--black btn--block" id="tkNext"><span>${t('tickets.ok')}</span><i>→</i></button>`);
  $('#tkNext').addEventListener('click', next || closeModal);
}
async function handleReturn() {
  const p = new URLSearchParams(location.search);
  if (p.get('canceled')) toast(t('toast.cancel'), true);
  const sid = p.get('paid');
  if (sid) {
    try {
      let r;
      for (let i = 0; i < 5; i++) { r = await api('/api/checkout/confirm?session_id=' + encodeURIComponent(sid)); if (r.status === 'paid') break; await new Promise(z => setTimeout(z, 1500)); }
      const m = await api('/api/me'); me = m.user;
      if (r.status === 'paid') afterPaid(r.qty, r.newTickets); else toast(t('toast.pendingPay'));
    } catch (e) { toast(e.message, true); }
  }
  if (location.search) history.replaceState(null, '', location.pathname);
}

/* ================= toast ================= */
let toastT;
function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 4200);
}

/* ================= confetti ================= */
function confetti() {
  if (reduced) return;
  const c = $('#confetti'), x = c?.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 2);
  if (!x) return; // decoration only — never break registration or payment flows
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const cols = ['#FF6B1A', '#081910', '#A9ED3D', '#34CD3F', '#eef8dc'];
  const ps = Array.from({ length: 220 }, (_, i) => ({
    x: c.width * (i % 2 ? .15 : .85), y: c.height * .75, vx: (Math.random() - .5) * 26 * dpr + (i % 2 ? 9 : -9) * dpr, vy: -(Math.random() * 26 + 14) * dpr,
    r: (Math.random() * 6 + 4) * dpr, c: cols[i % cols.length], a: Math.random() * 6, va: (Math.random() - .5) * .4, life: 1,
  }));
  (function f() {
    x.clearRect(0, 0, c.width, c.height);
    let alive = 0;
    for (const p of ps) {
      p.vy += .55 * dpr; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.a += p.va; p.life -= .006;
      if (p.life <= 0 || p.y > c.height + 40) continue; alive++;
      x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.globalAlpha = Math.min(1, p.life * 2); x.fillStyle = p.c;
      x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2 * (1 + Math.sin(p.a * 3))); x.restore();
    }
    if (alive) requestAnimationFrame(f); else x.clearRect(0, 0, c.width, c.height);
  })();
}

/* ================= language change ================= */
document.addEventListener('i18n:change', () => {
  prizesKey = oddsKey = topKey = weekKey = mqKey = '';
  wrapManifesto();
  updateNav();
  if (S) {
    render();
    if (S.results && resultsShown) {
      const R = S.results;
      $('#resultsMeta').textContent = t('results.meta', { when: fmtDT(R.at), people: R.participants, tickets: R.totalTickets, hash: R.hash.slice(0, 16) });
      $$('#winners .winner').forEach((el, i) => {
        const w = R.winners[i]; if (!w) return;
        const ticket = $('.winner__ticket', el);
        if (ticket) ticket.innerHTML = `${t('results.ticket')}<b>#${w.ticket}</b>${shans(w.chances)}`;
      });
    }
    tickCountdown();
    updateBoost();
  }
});

/* ================= init ================= */
(async () => {
  updateBoost();
  try { me = (await api('/api/me')).user; } catch {}
  updateNav();
  await loadState();
  tickCountdown();
  handleReturn();
  setInterval(loadState, 15000);
})();

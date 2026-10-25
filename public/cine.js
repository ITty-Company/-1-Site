'use strict';
/* =====================================================================
   Scroll-driven intro (Devialet-style mechanics) + section text reveals.
   The intro's "video" is the live 3D coin in world.js: this file pins the
   intro, slides its text through masks and publishes the smoothed scroll
   progress as window.ITTY_cine for the 3D scene.
   ===================================================================== */

/* ---------- copy for the intro (merged into i18n before it applies) ---------- */
(function cineI18n() {
  const I = window.I18N; if (!I) return;
  const add = {
    uk: {
      'cine.kicker': '// IT-челендж · 5 місць',
      'cine.s1.a': 'Один місяць.', 'cine.s1.b': 'П’ять місць.',
      'cine.s2.a': 'Перший', 'cine.s2.b': 'шанс —', 'cine.s2.c': 'безкоштовно',
      'cine.s3.a': 'Кожен', 'cine.s3.b': 'наступний —', 'cine.s3.c': 'лише $1',
      'cine.d1': 'Підпишись, зареєструйся — і твій перший номерок уже в барабані. Без оплати.',
      'cine.d2': 'Без лімітів і пакетів: один долар — ще один номерок. Більше номерків — ближче перемога.',
      'cine.price': '1-й шанс <b>$0</b> · далі <b>$1</b>', 'cine.join': 'Участь', 'cine.scroll': 'Гортай',
      'hint.spin': '↻ покрути монету',
    },
    en: {
      'cine.kicker': '// IT challenge · 5 places',
      'cine.s1.a': 'One month.', 'cine.s1.b': 'Five places.',
      'cine.s2.a': 'Your first', 'cine.s2.b': 'chance —', 'cine.s2.c': 'free',
      'cine.s3.a': 'Every', 'cine.s3.b': 'next one —', 'cine.s3.c': 'just $1',
      'cine.d1': 'Follow, sign up — and your first ticket is already in the drum. No payment.',
      'cine.d2': 'No limits, no bundles: one dollar — one more ticket. More tickets, closer to the win.',
      'cine.price': '1st chance <b>$0</b> · then <b>$1</b>', 'cine.join': 'Join', 'cine.scroll': 'Scroll',
      'hint.spin': '↻ spin the coin',
    },
    nl: {
      'cine.kicker': '// IT-challenge · 5 plekken',
      'cine.s1.a': 'Eén maand.', 'cine.s1.b': 'Vijf plekken.',
      'cine.s2.a': 'Je eerste', 'cine.s2.b': 'kans —', 'cine.s2.c': 'gratis',
      'cine.s3.a': 'Elke', 'cine.s3.b': 'volgende —', 'cine.s3.c': 'maar $1',
      'cine.d1': 'Volg, meld je aan — en je eerste lot zit al in de trommel. Zonder betaling.',
      'cine.d2': 'Geen limieten, geen bundels: één dollar — nog een lot. Meer loten, dichter bij de winst.',
      'cine.price': '1e kans <b>$0</b> · daarna <b>$1</b>', 'cine.join': 'Meedoen', 'cine.scroll': 'Scroll',
      'hint.spin': '↻ draai de munt',
    },
    ru: {
      'cine.kicker': '// IT-челлендж · 5 мест',
      'cine.s1.a': 'Один месяц.', 'cine.s1.b': 'Пять мест.',
      'cine.s2.a': 'Первый', 'cine.s2.b': 'шанс —', 'cine.s2.c': 'бесплатно',
      'cine.s3.a': 'Каждый', 'cine.s3.b': 'следующий —', 'cine.s3.c': 'всего $1',
      'cine.d1': 'Подпишись, зарегистрируйся — и твой первый номерок уже в барабане. Без оплаты.',
      'cine.d2': 'Без лимитов и пакетов: один доллар — ещё один номерок. Больше номерков — ближе победа.',
      'cine.price': '1-й шанс <b>$0</b> · дальше <b>$1</b>', 'cine.join': 'Участие', 'cine.scroll': 'Листай',
      'hint.spin': '↻ покрути монету',
    },
  };
  for (const l in add) I.dict[l] = Object.assign(I.dict[l] || {}, add[l]);
})();

(function cinema() {
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- math (from the guide) ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mapRange = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  /* =================================================================
     1) PINNED INTRO
     ================================================================= */
  const cine = q('#cine');
  const C = cine && {
    vp: q('.cine__vp', cine), top: q('.cine__top', cine), mid: q('.cine__mid', cine),
    g1: qa('[data-g="1"] p', cine), g2: qa('[data-g="2"] p', cine), g3: qa('[data-g="3"] p', cine),
    g3box: q('.cine__g3', cine), kicker: q('.cine__kicker', cine),
    desc: q('.cine__desc', cine), t1: q('.cine__desc [data-d="1"]', cine), t2: q('.cine__desc [data-d="2"]', cine),
    short: q('.cine__desc-short', cine),
    dots: qa('.cdot', cine), count: q('.cine__count b', cine), hint: q('.cine__hint', cine), bar: q('.cine__bar', cine),
    video: q('.cine__video', cine),
  };
  const A1 = .08, B1 = .36, A2 = .52, B2 = .82;
  window.ITTY_cine = { sp: 0, p1: 0, p2: 0, p3: 0, intro: 0, active: true };

  let sp = 0, introStart = 0, vidDur = 0, pin = '', W = 0, H = 0;
  let dh1 = 0, dh2 = 0, dbox = 0;

  function measureDesc() { if (cine) { dh1 = C.t1.offsetHeight; dh2 = C.t2.offsetHeight; dbox = C.desc.offsetHeight; } }
  function cineLayout() {
    if (!cine) return;
    const isM = innerWidth < 760;
    cine.classList.toggle('is-m', isM);
    W = innerWidth; H = innerHeight;
    const DW = isM ? 430 : 1440, DH = isM ? 932 : 900;
    const s = W / DW;                                      // scale = width / design width
    C.top.style.transform = `scale(${s})`;
    C.mid.style.transform = `scale(${s})`;
    C.mid.style.top = ((H - DH * s) / 2) + 'px';           // vertically centred
    measureDesc();
  }

  // optional real video: drop img/cine.mp4 and it plays behind the text, scrubbed by scroll
  if (cine && C.video) {
    const src = C.video.dataset.src;
    fetch(src, { method: 'HEAD' }).then(r => {
      if (!r.ok || !/video/.test(r.headers.get('content-type') || '')) return;
      C.video.addEventListener('loadedmetadata', () => { vidDur = C.video.duration || 0; cine.classList.add('has-video'); });
      C.video.src = src; C.video.load();
    }).catch(() => {});
  }

  function cineFrame(now) {
    const r = cine.getBoundingClientRect();
    const max = cine.offsetHeight - H;
    const raw = max > 0 ? clamp(-r.top / max, 0, 1) : 0;

    const state = r.top > 0 ? 'pre' : r.bottom <= H ? 'post' : 'pin';
    if (state !== pin) {
      pin = state;
      C.vp.classList.toggle('is-pin', state === 'pin');
      C.vp.classList.toggle('is-post', state === 'post');
    }
    sp += (raw - sp) * (reduced ? 1 : .12);
    if (Math.abs(raw - sp) < 1e-4) sp = raw;

    if (document.body.classList.contains('ready') && !introStart) introStart = now;
    const introAt = i => reduced ? 1 : introStart ? easeOut(clamp((now - introStart - 250 - i * 130) / 1000, 0, 1)) : 0;
    const ph = (a, b, i) => ease(mapRange(sp, a + i * .018, b + i * .018));
    const p1 = ph(A1, B1, 0), p2 = ph(A2, B2, 0), p3 = ease(mapRange(sp, .9, 1));
    Object.assign(window.ITTY_cine, { sp, p1, p2, p3, intro: introAt(0), active: r.bottom > 0 });
    if (r.bottom < -50) return;

    const put = (el, y) => { el.style.transform = `translate3d(0,${y.toFixed(2)}%,0) rotate(${(y * .04).toFixed(2)}deg)`; };
    C.g1.forEach((p, i) => put(p, 130 * (1 - introAt(i)) - 135 * ph(A1, B1, i)));
    C.g2.forEach((p, i) => put(p, 130 * (1 - ph(A1, B1, i)) - 135 * ph(A2, B2, i)));
    C.g3.forEach((p, i) => put(p, 130 * (1 - ph(A2, B2, i))));
    C.g3box.style.transform = p3 ? `translate3d(0,${(-80 * p3).toFixed(1)}px,0) scale(${(1 - p3 * .1).toFixed(3)})` : '';
    C.g3box.style.opacity = (1 - p3).toFixed(3);
    C.kicker.style.opacity = (introAt(2) * (1 - p1 * 1.8)).toFixed(3);
    C.kicker.style.transform = `translate3d(${(-24 * p1).toFixed(1)}px,${(14 * (1 - introAt(2))).toFixed(1)}px,0)`;
    C.bar.style.opacity = (1 - p3).toFixed(3);

    C.desc.style.opacity = (p1 * (1 - p3 * 1.5)).toFixed(3);
    C.desc.style.transform = `translate3d(${(30 * (1 - p1)).toFixed(1)}px,0,0)`;
    C.t1.style.transform = `translate3d(0,${(-(dh1 + 30) * p2).toFixed(1)}px,0)`;
    C.t2.style.transform = `translate3d(0,${lerp(dbox + 10, 30, p2).toFixed(1)}px,0)`;
    C.short.style.transform = `translate3d(0,${(30 * p2).toFixed(1)}px,0)`;
    C.short.style.height = lerp(Math.min(dh1, dbox), Math.min(dh2, dbox - 30), p2).toFixed(1) + 'px';
    C.desc.style.setProperty('--ft', (30 * p2).toFixed(1) + 'px');
    C.desc.style.setProperty('--fb', (30 * (1 - p2)).toFixed(1) + 'px');

    const idx = sp < .22 ? 0 : sp < .67 ? 1 : 2;
    C.dots.forEach((d, i) => d.classList.toggle('on', i === idx));
    if (C.count.textContent !== '0' + (idx + 1)) C.count.textContent = '0' + (idx + 1);
    C.hint.style.opacity = (introAt(3) * (1 - mapRange(sp, 0, .06))).toFixed(3);

    if (vidDur) {
      const t = sp * vidDur;
      if (Math.abs(C.video.currentTime - t) > .01) C.video.currentTime = t;
    }
  }

  /* =================================================================
     2) SECTION TEXT: heading lines rise through masks, sections tilt up
     ================================================================= */
  const SX = !reduced;
  const secs = qa('main > section:not(.cine):not(.marquee)');
  const heads = [];

  function maskLines(h) {
    if (h.dataset.sx) return [];
    h.dataset.sx = '1';
    const lines = [[]];
    [...h.childNodes].forEach(n => {
      if (n.nodeName === 'BR') { lines.push([]); n.remove(); } else lines[lines.length - 1].push(n);
    });
    const ins = [];
    lines.filter(l => l.some(n => n.nodeType === 1 || n.textContent.trim())).forEach(l => {
      const m = document.createElement('span'); m.className = 'tm';
      const inner = document.createElement('span'); inner.className = 'tm__in';
      l[0].before(m); m.appendChild(inner); l.forEach(n => inner.appendChild(n));
      ins.push(inner);
    });
    return ins;
  }

  function sxSetup() {
    if (!SX) return;
    document.body.classList.add('sx');
    qa('.section__head, .boost__left, .dollar__text, .final').forEach(boxEl => {
      const h = q('h2', boxEl); if (!h) return;
      const lines = maskLines(h);
      const k = q(':scope > .kicker', boxEl);
      let kin = null;
      if (k) {
        const m = document.createElement('span'); m.className = 'tm tm--k';
        kin = document.createElement('span'); kin.className = 'tm__in';
        k.before(m); m.appendChild(kin); kin.appendChild(k);
      }
      heads.push({ box: boxEl, h, lines, kin });
    });
  }

  const cache = new WeakMap();
  const set = (el, prop, v) => { const c = cache.get(el) || {}; if (c[prop] !== v) { c[prop] = v; cache.set(el, c); el.style[prop] = v; } };
  // layout position ignoring transforms
  function box(el) {
    let y = 0, n = el;
    while (n) { y += n.offsetTop; n = n.offsetParent; }
    const top = y - scrollY;
    return { top, bottom: top + el.offsetHeight, height: el.offsetHeight };
  }

  function sxFrame() {
    const vh = innerHeight;
    const M = { secs: secs.map(s => s.hidden ? null : box(q('.scene__in', s) || s)), heads: heads.map(h => box(h.h)), hero: q('.hero') ? box(q('.hero')) : null };

    // content blocks rise with a 3D tilt as they arrive, lean back as they leave
    secs.forEach((s, i) => {
      const r = M.secs[i]; const inner = q('.scene__in', s) || s;
      if (!r || r.top > vh + 150 || r.bottom < -150) return;
      const e = ease(mapRange(vh - r.top, 0, vh * .6));
      const x = ease(mapRange(vh * .35 - r.bottom, 0, vh * .35));
      if (e >= 1 && x <= 0) { set(inner, 'transform', ''); set(inner, 'opacity', '1'); return; }
      set(inner, 'transform', `perspective(1400px) translate3d(0,${((1 - e) * 80 - x * 40).toFixed(1)}px,0) rotateX(${((1 - e) * 14 - x * 8).toFixed(2)}deg)`);
      set(inner, 'opacity', ((.15 + .85 * e) * (1 - x * .7)).toFixed(3));
    });

    heads.forEach((h, hi) => {
      const hr = M.heads[hi];
      if (hr.top > vh + 200 || hr.bottom < -300) return;
      const line = (el, i) => {
        const e = ease(mapRange(vh - hr.top, vh * (.02 + i * .05), vh * (.34 + i * .05)));
        const x = ease(mapRange(vh * .22 - hr.bottom - i * 18, 0, vh * .2));
        const y = 130 * (1 - e) - 135 * x;
        set(el, 'transform', `translate3d(0,${y.toFixed(2)}%,0) rotate(${(y * .04).toFixed(2)}deg)`);
      };
      if (h.kin) line(h.kin, 0);
      h.lines.forEach((el, i) => line(el, i + (h.kin ? 1 : 0)));
    });

    const hero = q('.hero');
    if (hero && M.hero && !hero.classList.contains('hero--in') && M.hero.top < vh * .6) hero.classList.add('hero--in');
  }

  function frame(now) {
    if (SX) sxFrame();
    if (cine) cineFrame(now);
    requestAnimationFrame(frame);
  }

  function init() {
    sxSetup();
    cineLayout();
    addEventListener('resize', cineLayout);
    document.addEventListener('i18n:change', () => requestAnimationFrame(measureDesc));
    if (document.fonts) document.fonts.ready.then(measureDesc);
    const j = q('#cineJoin'); if (j) j.addEventListener('click', () => q('#heroJoin')?.click());
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

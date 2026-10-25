/* =====================================================================
   ITTY 3D world — one glossy $1 coin travels through the whole page.
   Every section is a keyframe: the coin moves, spins, flips, rolls,
   turns into prize towers, a stack that grows with the slider, a lottery
   drum and the drawn ball. Background colour morphs between sections.
   Interactive: cursor parallax, drag to spin, click to flip + coin burst,
   variable-font letters that react to the cursor.
   ===================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

/* ---------------- variable-font letters (works even without WebGL) ---------------- */
(function varFont() {
  if (!fine || reduced) return;
  const split = () => {
    $$('.section__head h2 [data-i18n]:not(.hl), .boost h2 [data-i18n]:not(.hl), .x3d-h [data-i18n]:not(.hl), .final__title [data-i18n]:not(.final__acc)').forEach(el => {
      const txt = el.textContent;
      if (el.dataset.vf === txt) return;
      el.textContent = '';
      // words stay unbreakable; letters inside them react to the cursor
      txt.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(' ')); return; }
        const w = document.createElement('span'); w.className = 'vf-w';
        [...part].forEach(ch => { const s = document.createElement('span'); s.className = 'vf-c'; s.textContent = ch; w.appendChild(s); });
        el.appendChild(w);
      });
      el.dataset.vf = txt;
    });
  };
  document.addEventListener('i18n:change', () => requestAnimationFrame(split));
  addEventListener('load', split);
  let mx = -9999, my = -9999, queued = false;
  const run = () => {
    queued = false;
    const vh = innerHeight;
    $$('.section__head h2, .boost h2, .x3d-h, .final__title, .hero__title').forEach(h => {
      const r = h.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      const near = my > r.top - 260 && my < r.bottom + 260;
      $$('.vf-c, .ch', h).forEach(c => {
        if (!near) { if (c.style.getPropertyValue('--w')) { c.style.removeProperty('--w'); c.style.removeProperty('--s'); c.style.removeProperty('--k'); } return; }
        const b = c.getBoundingClientRect();
        const f = Math.max(0, 1 - Math.hypot(b.left + b.width / 2 - mx, b.top + b.height / 2 - my) / 240);
        c.style.setProperty('--w', (720 + 180 * f).toFixed(0));
        c.style.setProperty('--s', (100 * f).toFixed(0));
        c.style.setProperty('--k', (-12 * f).toFixed(1));
      });
    });
  };
  addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; if (!queued) { queued = true; requestAnimationFrame(run); } }, { passive: true });
})();

/* ---------------- the WebGL world ---------------- */
const canvas = $('#world');
let renderer = null;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
catch (e) { document.documentElement.classList.add('no-webgl'); }
if (renderer) build();

function build() {
  const mobile = () => innerWidth < 860;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile() ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  camera.position.set(0, 0, 14);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), .04).texture;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9ccff, .6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 6, 8); scene.add(key);
  const pinkL = new THREE.PointLight(0xff3d9a, 70); pinkL.position.set(-6, 2, 6); scene.add(pinkL);
  const violetL = new THREE.PointLight(0x7b5cff, 70); violetL.position.set(6, -3, 5); scene.add(violetL);

  /* ---------- materials ---------- */
  const metal = new THREE.MeshPhysicalMaterial({
    color: 0xff4fa6, metalness: 1, roughness: .2, clearcoat: 1, clearcoatRoughness: .08,
    iridescence: .75, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 620], envMapIntensity: 1.3,
  });
  const violetMetal = metal.clone(); violetMetal.color.set(0x8d6bff);

  /* ---------- the coin: lathe profile with a raised rim + printed faces ---------- */
  const R = 1.6, T = .34;
  const prof = [[0, T / 2], [R * .84, T / 2], [R * .88, T / 2 + .07], [R * .97, T / 2 + .07], [R, T / 2 - .02], [R, -T / 2 + .02], [R * .97, -T / 2 - .07], [R * .88, -T / 2 - .07], [R * .84, -T / 2], [0, -T / 2]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const coinGeo = new THREE.LatheGeometry(prof, 110); coinGeo.rotateX(Math.PI / 2);
  const faceCanvas = (label, top, bottom) => {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const draw = () => {
      const x = c.getContext('2d');
      const g = x.createRadialGradient(380, 330, 40, 512, 512, 540);
      g.addColorStop(0, '#ffd6ec'); g.addColorStop(.45, '#ff4fa6'); g.addColorStop(1, '#9c0f58');
      x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
      x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 10; x.beginPath(); x.arc(512, 512, 455, 0, TAU); x.stroke();
      x.fillStyle = 'rgba(255,255,255,.7)';
      for (let i = 0; i < 64; i++) { const a = i / 64 * TAU; x.beginPath(); x.arc(512 + Math.cos(a) * 412, 512 + Math.sin(a) * 412, 6, 0, TAU); x.fill(); }
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '900 400px Geologica, "Arial Black", sans-serif';
      x.fillStyle = 'rgba(90,0,48,.45)'; x.fillText(label, 524, 548);
      x.fillStyle = '#fff'; x.fillText(label, 512, 532);
      x.font = '700 58px Geologica, Arial, sans-serif';
      if ('letterSpacing' in x) x.letterSpacing = '10px';
      x.fillText(top, 512, 230); x.fillText(bottom, 512, 812);
    };
    draw();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    document.fonts && document.fonts.load('900 100px Geologica').then(() => { draw(); tex.needsUpdate = true; });
    return tex;
  };
  const faceMat = tex => new THREE.MeshPhysicalMaterial({ map: tex, bumpMap: tex, bumpScale: 2, metalness: .55, roughness: .26, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.2 });
  const coin = new THREE.Group();
  coin.add(new THREE.Mesh(coinGeo, metal));
  const front = new THREE.Mesh(new THREE.CircleGeometry(R * .84, 110), faceMat(faceCanvas('$1', 'ITTY', 'CHALLENGE')));
  front.position.z = T / 2 + .002; coin.add(front);
  const back = new THREE.Mesh(new THREE.CircleGeometry(R * .84, 110), faceMat(faceCanvas('$0', '1-Й ШАНС', 'FREE')));
  back.position.z = -T / 2 - .002; back.rotation.y = Math.PI; coin.add(back);
  const coinRoot = new THREE.Group(); coinRoot.add(coin); scene.add(coinRoot);

  /* ---------- stacks of small coins (prize towers + the boost stack) ---------- */
  const miniGeo = new THREE.CylinderGeometry(.6, .6, .16, 44);
  const makeStack = (n, mat) => {
    const m = new THREE.InstancedMesh(miniGeo, mat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false;
    m.userData.cur = Array.from({ length: n }, () => new THREE.Vector3(0, 30, 0));
    m.userData.on = new Array(n).fill(false);
    m.userData.yaw = Array.from({ length: n }, () => Math.random() * TAU);
    const g = new THREE.Group(); g.add(m); scene.add(g); return { g, m };
  };
  const podium = makeStack(34, metal);
  const stack = makeStack(60, metal);
  // little violet crown coin on top of tower #1
  const crown = new THREE.Mesh(coinGeo, violetMetal); crown.scale.setScalar(.42); podium.g.add(crown);

  const PODIUM = (() => {
    const towers = [[0, 11], [-1.45, 8], [1.45, 6], [-2.9, 5], [2.9, 4]]; const out = [];
    towers.forEach(([x, h]) => { for (let j = 0; j < h; j++) out.push(new THREE.Vector3(x, j * .17 - 1.9, 0)); });
    return out;
  })();
  const stackTarget = (i, n) => {
    const cols = Math.ceil(n / 15), c = Math.floor(i / 15), row = i % 15;
    return new THREE.Vector3((c - (cols - 1) / 2) * 1.35, row * .17 - 1.45, (c % 2) * .3);
  };
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), s4 = new THREE.Vector3();
  function updateStack(S, n, targetFn, t) {
    const { m } = S, cur = m.userData.cur, on = m.userData.on, yaw = m.userData.yaw;
    for (let i = 0; i < m.count; i++) {
      if (i < n) {
        const tg = targetFn(i);
        if (!on[i]) { cur[i].set(tg.x, tg.y + 5 + i * .05, tg.z); on[i] = true; }   // new coins drop from above
        cur[i].lerp(tg, reduced ? 1 : .14);
        e4.set(Math.sin(t * 2 + i) * .03, yaw[i] + t * .1, Math.cos(t * 2 + i) * .03);
        q4.setFromEuler(e4); s4.setScalar(1);
      } else { on[i] = false; s4.setScalar(0); }
      m4.compose(cur[i], q4, s4); m.setMatrixAt(i, m4);
    }
    m.instanceMatrix.needsUpdate = true;
  }

  /* ---------- lottery drum ---------- */
  const drum = new THREE.Group(); scene.add(drum);
  const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.3, 1)), new THREE.LineBasicMaterial({ color: 0x7b5cff, transparent: true, opacity: .55 }));
  const glass = new THREE.Mesh(new THREE.SphereGeometry(2.3, 48, 32), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, clearcoat: 1, transparent: true, opacity: .14, envMapIntensity: 2 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.45, .07, 16, 120), violetMetal);
  const cageSpin = new THREE.Group(); cageSpin.add(cage, glass); drum.add(cageSpin, ring);
  const BALLS = 30, PAL = [0xff3d9a, 0x7b5cff, 0xffc93d, 0x3fd9b0, 0xffffff, 0xff8cc6];
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(.3, 28, 18), new THREE.MeshPhysicalMaterial({ metalness: .05, roughness: .14, clearcoat: 1, clearcoatRoughness: .05 }), BALLS);
  const ballData = Array.from({ length: BALLS }, (_, i) => {
    balls.setColorAt(i, new THREE.Color(PAL[i % PAL.length]));
    const axis = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize();
    return { axis, r: .7 + Math.random() * 1.15, sp: .6 + Math.random() * 1.4, ph: Math.random() * TAU, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis) };
  });
  balls.instanceColor.needsUpdate = true; balls.frustumCulled = false; drum.add(balls);
  const vb = new THREE.Vector3();

  /* ---------- the drawn ball (fair / results) ---------- */
  const ballTex = (() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const draw = () => {
      const x = c.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, 1024, 512);
      x.fillStyle = '#ff3d9a'; x.fillRect(0, 196, 1024, 120);
      x.beginPath(); x.arc(256, 256, 120, 0, TAU); x.fillStyle = '#fff'; x.fill();
      x.lineWidth = 12; x.strokeStyle = '#7b5cff'; x.stroke();
      x.fillStyle = '#16121f'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '900 120px Geologica, "Arial Black", sans-serif'; x.fillText('42', 256, 262);
      x.beginPath(); x.arc(768, 256, 70, 0, TAU); x.fillStyle = '#fff'; x.fill();
      x.fillStyle = '#16121f'; x.font = '900 64px Geologica, Arial, sans-serif'; x.fillText('$1', 768, 260);
    };
    draw();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    document.fonts && document.fonts.load('900 100px Geologica').then(() => { draw(); t.needsUpdate = true; });
    return t;
  })();
  const bigBall = new THREE.Mesh(new THREE.SphereGeometry(1.35, 64, 40), new THREE.MeshPhysicalMaterial({ map: ballTex, metalness: .05, roughness: .12, clearcoat: 1, clearcoatRoughness: .04 }));
  const ballRoot = new THREE.Group(); ballRoot.add(bigBall); scene.add(ballRoot);

  /* ---------- sparkle field ---------- */
  const NP = mobile() ? 220 : 420;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3);
  const pc = [new THREE.Color(0xff3d9a), new THREE.Color(0x7b5cff), new THREE.Color(0xffc93d)];
  for (let i = 0; i < NP; i++) {
    pPos.set([(Math.random() - .5) * 26, (Math.random() - .5) * 18, -6 + Math.random() * 7], i * 3);
    const c = pc[i % 3]; pCol.set([c.r, c.g, c.b], i * 3);
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .14, map: dot, vertexColors: true, transparent: true, opacity: .75, depthWrite: false }));
  points.frustumCulled = false; scene.add(points);

  /* ---------- click burst: mini coins fly out ---------- */
  const BURST = 36;
  const burst = new THREE.InstancedMesh(new THREE.CylinderGeometry(.2, .2, .05, 24), metal, BURST);
  burst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); burst.frustumCulled = false;
  const bd = Array.from({ length: BURST }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), rv: new THREE.Vector3(), life: 0 }));
  scene.add(burst);
  function fireBurst(origin) {
    bd.forEach(b => {
      b.p.copy(origin); b.life = 1.6 + Math.random() * .6;
      const a = Math.random() * TAU, s = 4 + Math.random() * 5;
      b.v.set(Math.cos(a) * s, 4 + Math.random() * 6, Math.sin(a) * s * .5 + 2);
      b.rv.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
    });
  }

  /* ---------- keyframes: one state per section ---------- */
  const P = Math.PI;
  const D = { cx: .4, cy: 0, cs: 1, crx: 0, cry: 0, crz: 0, wob: 1, podium: 0, stack: 0, drum: 0, ball: 0, ox: .5, oy: 0, bg: '#eee9ff' };
  const S = {
    intro0: { cx: .5, cy: -.02, cs: 1.25, crx: .12, cry: 0, bg: '#eee9ff' },
    intro1: { cx: .3, cy: -.04, cs: .85, crx: .18, cry: P, crz: -.15, bg: '#ffeef7' },
    intro2: { cx: .26, cy: 0, cs: 1, crx: .1, cry: TAU, bg: '#efe9ff' },
    hero: { cx: .5, cy: .04, cs: 1, crx: .38, cry: TAU - .65, crz: .12, bg: '#eee9ff' },
    about: { cx: -.6, cy: .06, cs: .62, crx: -.3, cry: TAU + .7, crz: -.2, bg: '#fff0f7' },
    facts: { cx: .66, cy: -.12, cs: .55, crx: .4, cry: 2 * TAU - .4, bg: '#fff0f7' },
    prizes: { cx: .55, cy: .5, cs: 0, podium: 1, ox: .58, oy: -.08, bg: '#eaf2ff' },
    how0: { cx: .92, cy: .5, cs: .4, crz: 0, cry: 2 * TAU, wob: 0, bg: '#eafff4' },
    how1: { cx: .06, cy: .5, cs: .4, crz: 9.5, cry: 2 * TAU, wob: 0, bg: '#eafff4' },
    boost: { cx: -.5, cy: -.3, cs: 0, stack: 1, ox: -.52, oy: .02, bg: '#fff5e1' },
    odds: { cx: .55, cy: .3, cs: 0, drum: 1, ox: .55, oy: 0, bg: '#f0ebff' },
    dollar: { cx: -.55, cy: .02, cs: 1, crx: .25, cry: 3 * TAU - .5, crz: .1, bg: '#ffeef7' },
    top: { cx: -.55, cy: .3, cs: 0, drum: 1, ox: -.55, oy: 0, bg: '#f0ebff' },
    results: { cs: 0, ball: 1, ox: .52, oy: .02, bg: '#fff5e1' },
    fair: { cs: 0, ball: 1, ox: .55, oy: .02, bg: '#eaf2ff' },
    time: { cx: .62, cy: .16, cs: .58, crx: .3, cry: 4 * TAU - .5, bg: '#eafff4' },
    faq: { cx: -.62, cy: .1, cs: .55, crx: -.2, cry: 4 * TAU + .6, bg: '#fff5e1' },
    final: { cx: 0, cy: .55, cs: .62, crx: .05, cry: 5 * TAU, bg: '#140e21' },
  };
  for (const k in S) S[k] = Object.assign({}, D, S[k], { bgc: new THREE.Color(S[k].bg || D.bg) });
  const NUM = ['cx', 'cy', 'cs', 'crx', 'cry', 'crz', 'wob', 'podium', 'stack', 'drum', 'ball', 'ox', 'oy'];

  // phones: objects float in the top band above the text, smaller
  const forMobile = (st, k) => {
    if (!mobile()) return st;
    const o = Object.assign({}, st);
    if (k.startsWith('intro')) { o.cx = 0; o.cy = -.08; o.cs = st.cs * .62; return o; }
    if (k === 'final') { o.cx = 0; o.cs = .5; o.cy = .6; return o; }
    if (k === 'how0' || k === 'how1') { o.cs = 0; return o; }
    o.cx = st.cx * .25; o.cy = .52; o.cs = st.cs * .55; o.ox = 0; o.oy = .5;
    return o;
  };

  let keys = [];
  const docTop = el => { let y = 0, n = el; while (n) { y += n.offsetTop; n = n.offsetParent; } return y; };
  function buildKeys() {
    const vh = innerHeight, list = [];
    const add = (y, k) => list.push({ y, st: forMobile(S[k], k) });
    const cine = $('#cine');
    if (cine) { const t = docTop(cine), m = cine.offsetHeight - vh; add(t, 'intro0'); add(t + m * .44, 'intro1'); add(t + m * .88, 'intro2'); }
    $$('main > section[data-3d]').forEach(sec => {
      const k = sec.dataset['3d'];
      if (!S[k] && k !== 'how' || sec.hidden) return;
      const top = docTop(sec), h = sec.offsetHeight;
      if (k === 'how') { add(top - vh * .35, 'how0'); add(top + h - vh * .65, 'how1'); return; }
      const a = top - vh * .2, b = top + h - vh * .8;
      if (b > a + vh * .15) { add(a, k); add(b, k); } else add(top + h / 2 - vh / 2, k);
    });
    keys = list.sort((p, q) => p.y - q.y);
  }

  const cur = Object.assign({}, D, { bgc: new THREE.Color(D.bg) });
  function sample(y) {
    if (!keys.length) return;
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].y <= y) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
    const t = b.y > a.y ? smooth(clamp((y - a.y) / (b.y - a.y), 0, 1)) : 0;
    NUM.forEach(n => { cur[n] = lerp(a.st[n], b.st[n], t); });
    cur.bgc.copy(a.st.bgc).lerp(b.st.bgc, t);
  }

  /* ---------- interaction ---------- */
  const mouse = new THREE.Vector2(), mSm = new THREE.Vector2();
  let mpx = innerWidth / 2, mpy = innerHeight / 2;
  const spot = $('#spot');
  const ray = new THREE.Raycaster();
  let hover = false, dragging = false, downX = 0, downY = 0, lastX = 0, moved = 0;
  let spinA = 0, spinV = 0, flip = 0, flipT = 0, glow = 0;
  const interactive = t => t.closest && t.closest('a, button, input, label, summary, details, .glass, .prize, .toprow, .modal, .nav, .cine__bar');
  addEventListener('pointermove', e => {
    mpx = e.clientX; mpy = e.clientY;
    mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (dragging) { const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx); spinV = dx * .012; spinA += dx * .012; }
  }, { passive: true });
  addEventListener('pointerdown', e => {
    if (!hover || interactive(e.target)) return;
    downX = e.clientX; downY = e.clientY; lastX = e.clientX; moved = 0;
    if (e.pointerType === 'mouse') { dragging = true; document.body.classList.add('coin-drag'); }
    else { flipCoin(); }
  });
  addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false; document.body.classList.remove('coin-drag');
    if (moved < 6) flipCoin();
  });
  function flipCoin() {
    flipT += P; glow = 1;
    const p = new THREE.Vector3(); coin.getWorldPosition(p); fireBurst(p);
  }

  /* ---------- layout ---------- */
  let halfH = 1, halfW = 1;
  function layout() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    halfH = Math.tan(THREE.MathUtils.degToRad(16)) * camera.position.z;
    halfW = halfH * camera.aspect;
    buildKeys();
  }
  addEventListener('resize', layout);
  layout();
  setInterval(buildKeys, 1200);               // content heights change as data arrives
  document.addEventListener('i18n:change', () => setTimeout(buildKeys, 50));

  /* ---------- loop ---------- */
  const rng = $('#boostRange');
  const clock = new THREE.Clock();
  let sy = scrollY, lastSy = scrollY, vel = 0, stackN = 11;
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    sy += (scrollY - sy) * (reduced ? 1 : .1);
    vel += ((sy - lastSy) - vel) * .1; lastSy = sy;
    sample(sy + innerHeight * 0);
    document.body.style.backgroundColor = '#' + cur.bgc.getHexString();

    mSm.lerp(mouse, .06);
    camera.position.x = mSm.x * .7; camera.position.y = mSm.y * .45; camera.lookAt(0, 0, 0);
    if (spot) spot.style.transform = `translate3d(${mpx}px,${mpy}px,0)`;

    // coin
    spinV *= .95; if (!dragging && !reduced) spinA += spinV;
    flip += (flipT - flip) * .12; glow *= .94;
    const cs = Math.max(cur.cs, .0001);
    coinRoot.visible = cur.cs > .01;
    coinRoot.position.set(cur.cx * halfW, cur.cy * halfH, 0);
    coinRoot.scale.setScalar(cs * (1 + glow * .08));
    const wob = reduced ? 0 : cur.wob;
    coin.rotation.set(
      cur.crx + Math.sin(t * .7) * .12 * wob - mSm.y * .35,
      cur.cry + Math.sin(t * .5) * .3 * wob + mSm.x * .45 + spinA + flip,
      cur.crz + Math.cos(t * .6) * .05 * wob);
    coinRoot.position.y += Math.sin(t * 1.1) * .08 * wob;
    metal.emissive.setRGB(glow * .35, glow * .05, glow * .2);

    // hover test on the coin
    if (fine && coinRoot.visible && cs > .2) {
      ray.setFromCamera(mouse, camera);
      const h = ray.intersectObject(coin, true).length > 0;
      if (h !== hover) { hover = h; document.body.classList.toggle('coin-hover', h); }
    } else if (hover) { hover = false; document.body.classList.remove('coin-hover'); }

    // prize towers
    const pw = cur.podium;
    podium.g.visible = pw > .01;
    if (podium.g.visible) {
      podium.g.position.set(cur.ox * halfW, cur.oy * halfH, 0);
      podium.g.scale.setScalar(pw * (mobile() ? .55 : 1));
      podium.g.rotation.set(.18 - mSm.y * .1, Math.sin(t * .3) * .25 + mSm.x * .3, 0);
      updateStack(podium, Math.round(PODIUM.length * clamp(pw * 1.4, 0, 1)), i => PODIUM[i], t);
      crown.position.set(0, 11 * .17 - 1.9 + .55 + Math.sin(t * 2) * .1, 0);
      crown.rotation.set(0, t * 1.5, 0);
    }

    // boost stack follows the slider
    const sw = cur.stack;
    stack.g.visible = sw > .01;
    if (rng) stackN = clamp(Math.round(1 + (+rng.value) * .59), 1, 60);
    if (stack.g.visible) {
      stack.g.position.set(cur.ox * halfW, cur.oy * halfH, 0);
      stack.g.scale.setScalar(sw * (mobile() ? .6 : 1.05));
      stack.g.rotation.set(.22 - mSm.y * .1, -.5 + Math.sin(t * .4) * .15 + mSm.x * .3, 0);
      updateStack(stack, Math.round(stackN * clamp(sw * 1.3, 0, 1)), i => stackTarget(i, stackN), t);
    }

    // lottery drum
    const dw = cur.drum;
    drum.visible = dw > .01;
    if (drum.visible) {
      drum.position.set(cur.ox * halfW, cur.oy * halfH, 0);
      drum.scale.setScalar(dw * (mobile() ? .5 : .95));
      drum.rotation.set(.25 - mSm.y * .15, mSm.x * .4, 0);
      const spin = 1 + Math.min(4, Math.abs(vel) * .05);
      cageSpin.rotation.z += dt * .5 * spin; cageSpin.rotation.y += dt * .2 * spin;
      ballData.forEach((b, i) => {
        const a = t * b.sp * spin + b.ph;
        vb.set(Math.cos(a) * b.r, Math.sin(a) * b.r, 0).applyQuaternion(b.q);
        vb.y -= .35 * (1 - Math.abs(Math.sin(a)));
        m4.makeTranslation(vb.x, vb.y, vb.z); balls.setMatrixAt(i, m4);
      });
      balls.instanceMatrix.needsUpdate = true;
    }

    // the drawn ball
    const bw = cur.ball;
    ballRoot.visible = bw > .01;
    if (ballRoot.visible) {
      ballRoot.position.set(cur.ox * halfW, cur.oy * halfH + Math.sin(t * 1.3) * .12, 0);
      ballRoot.scale.setScalar(bw * (mobile() ? .6 : 1));
      bigBall.rotation.set(Math.sin(t * .8) * .2 - mSm.y * .4, Math.sin(t * .6) * .45 + mSm.x * .6 + (1 - bw) * 6, 0);
    }

    // sparkles drift and follow the scroll
    points.rotation.y = t * .015 + mSm.x * .05;
    points.position.y = ((sy * .0025) % 18 + 18) % 18 - 9 + 0;
    points.material.opacity = cur.bgc.getHSL({}).l < .3 ? 1 : .75;

    // burst coins
    let alive = 0;
    bd.forEach((b, i) => {
      if (b.life > 0) {
        b.life -= dt; alive++;
        b.v.y -= 14 * dt; b.p.addScaledVector(b.v, dt);
        b.r.x += b.rv.x * dt; b.r.y += b.rv.y * dt; b.r.z += b.rv.z * dt;
        q4.setFromEuler(b.r); s4.setScalar(Math.min(1, b.life * 2));
        m4.compose(b.p, q4, s4);
      } else { m4.makeScale(0, 0, 0); }
      burst.setMatrixAt(i, m4);
    });
    burst.instanceMatrix.needsUpdate = true;
    burst.visible = alive > 0;

    renderer.render(scene, camera);
  }
  frame();
}

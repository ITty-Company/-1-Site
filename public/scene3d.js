'use strict';
/* The bill image (transparent PNG), shared with app.js via window.dollarReady. */
window.dollarReady = new Promise(resolve => {
  const img = new Image();
  img.onload = () => resolve({ url: img.src, img });
  img.onerror = () => resolve({ url: 'img/dollar.png', img: null });
  img.src = 'img/dollar.png';
});

/* ================= three.js background scene ================= */
(function scene3d() {
  const T = window.THREE;
  const canvas = document.getElementById('bg');
  if (!T || !canvas) return;
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' }); }
  catch { return; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(40, 1, .1, 200);
  camera.position.z = 30;

  const objs = [];
  const mobile = innerWidth < 760;
  let halfH = 0, halfW = 0, span = 0;
  function layout() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    halfH = Math.tan(T.MathUtils.degToRad(20)) * camera.position.z;
    halfW = halfH * camera.aspect;
    span = halfH * 2 + 12;
  }
  addEventListener('resize', layout); layout();

  function add(mesh, i, opts = {}) {
    const side = i % 2 ? 1 : -1;
    const edge = mobile ? .78 + Math.random() * .25 : .62 + Math.random() * .3;
    mesh.userData = {
      fx: side * edge,                       // fraction of half width
      y0: (i / 5) * span + Math.random() * 3,
      speed: .008 + Math.random() * .014,    // parallax: world units per scrolled px
      rs: new T.Vector3((Math.random() - .5) * .6, (Math.random() - .5) * .9, (Math.random() - .5) * .4),
      ph: Math.random() * 6.28, base: (opts.scale || 1) * (mobile ? .6 : 1), hover: 0, ...opts,
    };
    mesh.position.z = -4 + Math.random() * 6;
    scene.add(mesh); objs.push(mesh);
  }

  let i = 0;
  // floating pictures: website mockup cards, glitter $ sign, #SWAG
  const loadImg = src => new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = src; });
  const SPRITES = [
    { src: 'img/mockup.png', w: 9.6, h: 6.4, n: mobile ? 1 : 0, wave: .04, rock: .45, scale: [.85, .35] },
    { src: 'img/dollar-sign.png', w: 4.2, h: 6.3, n: mobile ? 1 : 2, wave: .12, rock: .9, scale: [.8, .5] },
    { src: 'img/swag.png', w: 9, h: 4.5, n: mobile ? 0 : 1, wave: .3, scale: [.8, .4] },
  ];
  SPRITES.forEach(sp => loadImg(sp.src).then(img => {
    if (!img) return;
    const tex = new T.Texture(img); tex.needsUpdate = true;
    const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.DoubleSide, depthWrite: false });
    for (let k = 0; k < sp.n; k++) {
      const g = new T.PlaneGeometry(sp.w, sp.h, 32, 24);
      const m = new T.Mesh(g, mat);
      m.userData.orig = Float32Array.from(g.attributes.position.array);
      add(m, i++, { wave: sp.wave, rock: sp.rock || .5, scale: sp.scale[0] + Math.random() * sp.scale[1] });
      m.rotation.z = (Math.random() - .5) * .7;
    }
  }));

  // interaction
  let mx = 0, my = 0, scroll = scrollY, lastScroll = scrollY, vel = 0;
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth * 2 - 1; my = -(e.clientY / innerHeight * 2 - 1); });
  addEventListener('scroll', () => { scroll = scrollY; }, { passive: true });
  const ray = new T.Raycaster(), v2 = new T.Vector2();

  const clock = new T.Clock();
  function frame() {
    const t = clock.getElapsedTime();
    vel += ((scroll - lastScroll) - vel) * .1; lastScroll = scroll;
    camera.position.x += (mx * 1.6 - camera.position.x) * .05;
    camera.position.y += (my * 1.2 - camera.position.y) * .05;
    camera.lookAt(0, 0, 0);

    v2.set(mx, my); ray.setFromCamera(v2, camera);
    const hit = ray.intersectObjects(objs, false)[0]?.object;

    for (const o of objs) {
      const u = o.userData;
      let y = u.y0 + scroll * u.speed + Math.sin(t * .8 + u.ph) * .6;
      y = ((y % span) + span) % span - span / 2;
      o.position.x = u.fx * halfW + Math.cos(t * .5 + u.ph) * .4;
      o.position.y = y;
      u.hover += ((o === hit ? 1 : 0) - u.hover) * .1;
      o.scale.setScalar(u.base * (1 + u.hover * .3));
      const boost = 1 + Math.abs(vel) * .05 + u.hover * 4;
      if (u.wave !== undefined) {
        o.rotation.y = Math.sin(t * .6 + u.ph) * u.rock + u.hover * Math.sin(t * 6) * .3;
        o.rotation.x = Math.cos(t * .4 + u.ph) * .3;
        const pos = o.geometry.attributes.position, a = pos.array, src = u.orig;
        for (let k = 0; k < a.length; k += 3) {
          const px = src[k], py = src[k + 1];
          a[k + 2] = (Math.sin(px * .55 + t * 2.2 + u.ph) + Math.cos(py * .7 + t * 1.4) * .45) * u.wave;
        }
        pos.needsUpdate = true;
      } else {
        o.rotation.x += u.rs.x * .01 * boost;
        o.rotation.y += (u.spinY || u.rs.y) * .01 * boost;
        o.rotation.z += u.rs.z * .01;
      }
    }
    renderer.render(scene, camera);
    if (!reduced) requestAnimationFrame(frame);
  }
  frame();
  if (reduced) setTimeout(frame, 1500);
})();

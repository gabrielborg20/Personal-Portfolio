/* Gabriel Borg portfolio: aperture, scroll, and reveal motion.
   Everything degrades to a static, fully readable page without this file. */
(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent && parent.appendChild(n);
    return n;
  };

  /* ---------- Aperture geometry ----------
     An n-gon opening of radius r, rotated by `rot`. Blade edges are the polygon's
     sides extended to the outer disc, which reads as overlapping iris blades. */
  const BLADES = 7;
  function irisGeometry(open, R, { rMin = 0.14, rMax = 0.92, twist = 0.7 } = {}) {
    const r = R * lerp(rMin, rMax, open);
    const rot = -open * twist - Math.PI / 2;
    const v = Array.from({ length: BLADES }, (_, k) => {
      const a = rot + (k * 2 * Math.PI) / BLADES;
      return [r * Math.cos(a), r * Math.sin(a)];
    });
    const poly = 'M' + v.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z';
    const rays = v.map((p, k) => {
      const q = v[(k + 1) % BLADES];
      let dx = p[0] - q[0], dy = p[1] - q[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      // solve |p + t d| = R for t > 0
      const b = p[0] * dx + p[1] * dy;
      const c = p[0] * p[0] + p[1] * p[1] - R * R;
      const t = -b + Math.sqrt(Math.max(0, b * b - c));
      return [p[0], p[1], p[0] + dx * t, p[1] + dy * t];
    });
    return { poly, rays };
  }

  /* ---------- Hero lens ---------- */
  const lens = $('#lens');
  const irisFill = $('#iris-fill');
  const irisEdge = $('#iris-edge');
  const bladeG = $('#iris-blades');
  const R_LENS = 92;
  let bladeLines = [];
  if (irisFill) {
    bladeLines = Array.from({ length: BLADES }, () => el('line', {}, bladeG));
    const ticks = $('#ticks');
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const major = i % 6 === 0;
      const r1 = major ? 93.6 : 95.2, r2 = 98;
      el('line', {
        x1: (r1 * Math.cos(a)).toFixed(2), y1: (r1 * Math.sin(a)).toFixed(2),
        x2: (r2 * Math.cos(a)).toFixed(2), y2: (r2 * Math.sin(a)).toFixed(2),
        stroke: major ? 'oklch(100% 0 0 / .55)' : 'oklch(100% 0 0 / .22)',
        'stroke-width': major ? '.8' : '.5', 'stroke-linecap': 'round'
      }, ticks);
    }
  }
  function drawLens(open) {
    if (!irisFill) return;
    const { poly, rays } = irisGeometry(open, R_LENS);
    irisFill.setAttribute('d', `M-${R_LENS} 0a${R_LENS} ${R_LENS} 0 1 0 ${R_LENS * 2} 0a${R_LENS} ${R_LENS} 0 1 0 -${R_LENS * 2} 0Z${poly}`);
    irisEdge.setAttribute('d', poly);
    rays.forEach((r, i) => {
      const l = bladeLines[i];
      l.setAttribute('x1', r[0].toFixed(2)); l.setAttribute('y1', r[1].toFixed(2));
      l.setAttribute('x2', r[2].toFixed(2)); l.setAttribute('y2', r[3].toFixed(2));
    });
  }

  /* ---------- Mini irises (nav mark and f-stop readout) ---------- */
  function buildMini(group) {
    el('circle', { r: 46, fill: 'currentColor', opacity: '.0' }, group);
    const ring = el('circle', { r: 46, fill: 'none', stroke: 'oklch(100% 0 0 / .35)', 'stroke-width': 4 }, group);
    const body = el('path', { 'fill-rule': 'evenodd' }, group);
    const edge = el('path', { fill: 'none', stroke: 'oklch(100% 0 0 / .8)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, group);
    return { ring, body, edge };
  }
  const mini = [
    { g: $('#mark-iris'), fill: 'oklch(19% 0.028 258)', ring: 'oklch(19% 0.028 258)', edge: 'oklch(100% 0 0 / .85)' },
    { g: $('#fstop-iris'), fill: 'oklch(100% 0 0 / .92)', ring: 'oklch(100% 0 0 / .4)', edge: 'oklch(19% 0.028 258)' }
  ].filter(m => m.g).map(m => {
    const parts = buildMini(m.g);
    parts.body.setAttribute('fill', m.fill);
    parts.ring.setAttribute('stroke', m.ring);
    parts.edge.setAttribute('stroke', m.edge);
    return parts;
  });
  function drawMini(open) {
    const { poly } = irisGeometry(open, 46, { rMin: .12, rMax: .9, twist: .9 });
    const d = `M-46 0a46 46 0 1 0 92 0a46 46 0 1 0 -92 0Z${poly}`;
    mini.forEach(m => { m.body.setAttribute('d', d); m.edge.setAttribute('d', poly); });
  }

  /* ---------- Scroll-driven f-stop ---------- */
  const STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
  const fVal = $('#fstop-val');
  const fstop = $('#fstop');
  const nav = $('#nav');
  const state = { open: 0, openTarget: 0, miniOpen: 1, miniTarget: 1, tx: 0, ty: 0, tilt: [0, 0], tiltTarget: [0, 0] };
  let loaded = 0;          // 0..1 entrance of the lens
  let lastShown = '';
  let lastY = 0;

  function readScroll() {
    const y = scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const p = clamp(y / max, 0, 1);
    const heroP = clamp(y / (innerHeight * 0.9), 0, 1);
    // the big lens closes while the hero scrolls away
    state.openTarget = lerp(0.8, 0.12, heroP * heroP) * loaded;
    // the page-level readout travels through every stop
    state.miniTarget = 1 - p;
    const fIdx = p * (STOPS.length - 1);
    const lo = Math.floor(fIdx), hi = Math.min(STOPS.length - 1, lo + 1);
    const f = lerp(STOPS[lo], STOPS[hi], fIdx - lo);
    const shown = (f < 10 ? f.toFixed(1) : Math.round(f).toString());
    if (shown !== lastShown && fVal) { fVal.textContent = shown; lastShown = shown; }
    fstop && fstop.classList.toggle('is-dim', y < innerHeight * 0.35 || y > max - 140);
    // nav hides on scroll-down, returns on scroll-up
    if (nav) nav.classList.toggle('is-hidden', y > lastY + 4 && y > 240 ? true : (y < lastY - 4 ? false : nav.classList.contains('is-hidden')));
    lastY = y;
    // lens drifts up slightly as the hero leaves
    if (lens) state.ty = -heroP * 60;
  }

  /* ---------- Frame loop (critically damped follow) ---------- */
  let raf = 0, running = false;
  function frame() {
    state.open += (state.openTarget - state.open) * 0.09;
    state.miniOpen += (state.miniTarget - state.miniOpen) * 0.12;
    state.tilt[0] += (state.tiltTarget[0] - state.tilt[0]) * 0.08;
    state.tilt[1] += (state.tiltTarget[1] - state.tilt[1]) * 0.08;
    drawLens(state.open);
    drawMini(state.miniOpen);
    if (lens) lens.style.transform = `translate3d(${state.tilt[0] * 14}px, ${state.ty + state.tilt[1] * 14}px, 0) rotate(${state.tilt[0] * 3}deg)`;
    const settled = Math.abs(state.openTarget - state.open) < .0006 && Math.abs(state.miniTarget - state.miniOpen) < .0006
      && Math.abs(state.tiltTarget[0] - state.tilt[0]) < .001 && Math.abs(state.tiltTarget[1] - state.tilt[1]) < .001;
    if (settled && loaded >= 1) { running = false; return; }
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }

  /* ---------- Entrance ---------- */
  function enter() {
    document.body.classList.add('is-ready');
    $$('.line__in').forEach((n, i) => { n.style.setProperty('--d', (0.12 + i * 0.12) + 's'); });
    $('.hero__name') && $('.hero__name').classList.add('is-ready');
    $$('.hero .reveal').forEach((n, i) => { n.style.setProperty('--d', (0.45 + i * 0.12) + 's'); n.classList.add('is-in'); });
    if (reduce) { loaded = 1; readScroll(); state.open = state.openTarget; state.miniOpen = state.miniTarget; drawLens(state.open); drawMini(state.miniOpen); return; }
    // lens opens like a shutter on load
    const t0 = performance.now(), dur = 1700;
    (function step(now) {
      const t = clamp((now - t0) / dur, 0, 1);
      loaded = 1 - Math.pow(1 - t, 4);
      readScroll(); wake();
      if (t < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ---------- Scroll reveal with stagger ---------- */
  function setupReveal() {
    const items = $$('.reveal').filter(n => !n.closest('.hero'));
    // stagger siblings that enter together
    items.forEach(n => {
      const sibs = [...n.parentElement.children].filter(c => c.classList.contains('reveal'));
      n.style.setProperty('--d', (Math.max(0, sibs.indexOf(n)) * 0.09) + 's');
    });
    if (!('IntersectionObserver' in window)) { items.forEach(n => n.classList.add('is-in')); return; }
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    items.forEach(n => io.observe(n));
  }

  /* ---------- Timeline: line drawing + node activation ---------- */
  function setupTimeline() {
    const tl = $('#timeline'), fill = $('#timeline-fill');
    if (!tl || !fill) return;
    const roles = $$('.role', tl);
    const update = () => {
      const r = tl.getBoundingClientRect();
      const p = clamp((innerHeight * 0.62 - r.top) / r.height, 0, 1);
      fill.style.setProperty('--p', p.toFixed(4));
      roles.forEach(n => n.classList.toggle('is-in', n.getBoundingClientRect().top < innerHeight * 0.62));
    };
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();
  }

  /* ---------- Spotlight on cards (origin-aware glow) ---------- */
  function setupSpotlight() {
    if (!finePointer) return;
    $$('[data-spot]').forEach(c => {
      c.addEventListener('pointermove', e => {
        const r = c.getBoundingClientRect();
        c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        c.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ---------- Magnetic buttons with spring release ---------- */
  function setupMagnetic() {
    if (!finePointer || reduce) return;
    $$('[data-magnetic]').forEach(b => {
      b.addEventListener('pointermove', e => {
        const r = b.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * 0.22;
        const y = (e.clientY - (r.top + r.height / 2)) * 0.32;
        b.style.transition = 'transform .15s ease-out';
        b.style.transform = `translate(${x}px, ${y}px)`;
      });
      b.addEventListener('pointerleave', () => {
        b.style.transition = 'transform .9s var(--spring)';
        b.style.transform = '';
      });
    });
  }

  /* ---------- Active nav link ---------- */
  function setupNavState() {
    const links = $$('.nav__links a');
    const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => es.forEach(e => {
      const a = map.get(e.target.id);
      if (a) a.setAttribute('aria-current', e.isIntersecting ? 'true' : 'false');
    }), { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); s && io.observe(s); });
  }

  /* ---------- Pointer parallax on the lens ---------- */
  function setupTilt() {
    if (!finePointer || reduce) return;
    addEventListener('pointermove', e => {
      state.tiltTarget[0] = (e.clientX / innerWidth - 0.5) * 2;
      state.tiltTarget[1] = (e.clientY / innerHeight - 0.5) * 2;
      if (scrollY < innerHeight) wake();
    }, { passive: true });
  }

  /* ---------- Only animate what is on screen ---------- */
  function whenVisible(node, onChange) {
    if (!('IntersectionObserver' in window)) { onChange(true); return; }
    new IntersectionObserver(es => es.forEach(e => onChange(e.isIntersecting)), { rootMargin: '80px 0px' }).observe(node);
  }

  /* ---------- Research: stereo VR headset looking out to sea ----------
     Two lenses share one scene (<use>), offset slightly per eye. Wave rows march
     toward the viewer in perspective; a rescue ring bobs on the swell (Project WAVE). */
  function setupVR() {
    const root = $('#vr');
    if (!root) return;
    const svg = $('svg', root);
    const eyes = $('#vr-eyes'), grid = $('#vr-grid'), waveG = $('#vr-waves'), glint = $('#vr-glint'), buoy = $('#vr-buoy');
    const HZ = 6, DEPTH = 56, ROWS = 11;

    const defs = $('defs', svg);
    const glare = el('radialGradient', { id: 'vr-glare', cx: '32%', cy: '22%', r: '60%' }, defs);
    el('stop', { offset: '0', 'stop-color': 'oklch(100% 0 0 / .32)' }, glare);
    el('stop', { offset: '.55', 'stop-color': 'oklch(100% 0 0 / 0)' }, glare);

    [[-70, 2.4], [70, -2.4]].forEach(([cx, shift]) => {
      const g = el('g', { transform: `translate(${cx} -6)` }, eyes);
      el('circle', { r: 62, fill: 'url(#rim)' }, g);
      el('circle', { r: 58.5, fill: 'oklch(15% 0.025 258)' }, g);
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2, major = i % 5 === 0, r1 = major ? 54.6 : 55.6, r2 = 57.4;
        el('line', {
          x1: (r1 * Math.cos(a)).toFixed(2), y1: (r1 * Math.sin(a)).toFixed(2),
          x2: (r2 * Math.cos(a)).toFixed(2), y2: (r2 * Math.sin(a)).toFixed(2),
          stroke: major ? 'oklch(100% 0 0 / .5)' : 'oklch(100% 0 0 / .2)', 'stroke-width': major ? '.7' : '.45', 'stroke-linecap': 'round'
        }, g);
      }
      const view = el('g', { 'clip-path': 'url(#vr-eye)' }, g);
      el('use', { href: '#vr-scene', transform: `translate(${shift} 0)` }, view);
      el('circle', { r: 54, fill: 'url(#vr-glare)' }, g);
      el('circle', { r: 54, fill: 'none', stroke: 'oklch(0% 0 0 / .5)', 'stroke-width': 1.1 }, g);
    });

    // wireframe floor converging on the horizon: the "virtual" in the view
    for (let x = -240; x <= 240; x += 30) el('line', { x1: 0, y1: HZ, x2: x, y2: HZ + DEPTH }, grid);

    const rows = Array.from({ length: ROWS }, () => el('path', {}, waveG));
    function draw(time) {
      const march = time * 0.55;
      let gl = '';
      rows.forEach((path, i) => {
        const d = ((i + march) % ROWS) / ROWS;          // 0 at horizon, 1 at the viewer
        const y = HZ + DEPTH * Math.pow(d, 1.8);
        const amp = .2 + 1.7 * d * d, k = (Math.PI * 2) / (9 + 34 * d), ph = time * 1.3 + i * 1.7;
        let dStr = '';
        for (let x = -60; x <= 60; x += 4) {
          dStr += (x === -60 ? 'M' : 'L') + x + ' ' + (y + amp * Math.sin(x * k + ph)).toFixed(2);
        }
        path.setAttribute('d', dStr);
        path.setAttribute('stroke', `oklch(100% 0 0 / ${(Math.min(1, d * 4) * Math.min(1, (1 - d) * 6) * .42).toFixed(3)})`);
        path.setAttribute('stroke-width', (.25 + d * .9).toFixed(2));
        // the sun's reflection: a short, flickering streak on each row
        const w = (1.2 + 9 * d) * (.6 + .4 * Math.sin(time * 3.1 + i * 2.3));
        const gx = Math.sin(time * .9 + i) * d * 2.5;
        gl += `M${(gx - w).toFixed(2)} ${y.toFixed(2)}H${(gx + w).toFixed(2)}`;
      });
      glint.setAttribute('d', gl);
      glint.setAttribute('stroke-width', '.9');
      const by = HZ + DEPTH * Math.pow(.56, 1.8) + Math.sin(time * 1.6) * .9;
      buoy.setAttribute('transform', `translate(17 ${by.toFixed(2)}) rotate(${(Math.sin(time * 1.1) * 5).toFixed(2)})`);
    }

    if (reduce) { draw(1.2); return; }
    let on = false, id = 0, t0 = performance.now(), tilt = [0, 0];
    function loop(now) {
      draw((now - t0) / 1000);
      tilt[0] += (state.tiltTarget[0] - tilt[0]) * .06;
      tilt[1] += (state.tiltTarget[1] - tilt[1]) * .06;
      svg.style.transform = `translate3d(${(tilt[0] * 10).toFixed(2)}px, ${(tilt[1] * 6).toFixed(2)}px, 0) rotate(${(tilt[0] * 1.6).toFixed(2)}deg)`;
      if (on) id = requestAnimationFrame(loop);
    }
    draw(0);
    whenVisible(root, v => {
      if (v && !on) { on = true; id = requestAnimationFrame(loop); }
      else if (!v) { on = false; cancelAnimationFrame(id); }
    });
  }

  /* ---------- Research: the RSO pipeline ----------
     Light leaves a lesson card and enters a small neural network. Each spark triggers a
     forward pass: activations ripple layer by layer, then leave from the output neuron that
     matches one format (slides, video, assessment, VR). The language tags keep changing:
     language-agnostic. */
  function setupPipe() {
    const root = $('#pipe');
    if (!root) return;
    const edgesG = $('#pipe-edges'), nodesG = $('#pipe-nodes'), rays = $('#pipe-rays'), sparksG = $('#pipe-sparks');
    const wave = $('#pipe-wave'), progress = $('#pipe-progress');
    const outs = [0, 1, 2, 3].map(i => $('#pipe-o' + i));
    const langs = $$('.pipe__lang', root);
    const HOT = 'oklch(76% 0.16 50)';

    // network: 3 inputs, two hidden layers of 5, 4 outputs (one per format)
    const LAYERS = [[-31, [-20, 0, 20]], [-14, [-32, -16, 0, 16, 32]], [3, [-32, -16, 0, 16, 32]], [21, [-27, -9, 9, 27]]];
    const nodes = LAYERS.map(([x, ys]) => ys.map(y => ({ x, y, a: 0 })));
    const edges = [];
    for (let l = 0; l < nodes.length - 1; l++) {
      nodes[l].forEach((n, i) => nodes[l + 1].forEach((m, j) => {
        const base = el('line', { x1: n.x, y1: n.y, x2: m.x, y2: m.y, stroke: 'oklch(100% 0 0 / .1)', 'stroke-width': .5 }, edgesG);
        const hot = el('line', { x1: n.x, y1: n.y, x2: m.x, y2: m.y, stroke: HOT, 'stroke-width': 1.1, opacity: 0 }, edgesG);
        edges.push({ l, i, j, a: 0, hot, w: .35 + Math.random() * .65 });
      }));
    }
    nodes.forEach(layer => layer.forEach(n => {
      n.glow = el('circle', { cx: n.x, cy: n.y, r: 5.5, fill: HOT, opacity: 0 }, nodesG);
      el('circle', { cx: n.x, cy: n.y, r: 2.9, fill: 'oklch(26% 0.03 258)', stroke: 'oklch(100% 0 0 / .45)', 'stroke-width': .6 }, nodesG);
      n.core = el('circle', { cx: n.x, cy: n.y, r: 1.6, fill: 'oklch(97% 0.03 80)', opacity: 0 }, nodesG);
    }));
    const fire = (l, i, amt) => {
      const n = nodes[l][i]; n.a = Math.max(n.a, amt);
      if (l > 0) edges.forEach(e => { if (e.l === l - 1 && e.j === i) e.a = Math.max(e.a, nodes[l - 1][e.i].a * e.w); });
    };

    // beams in (to each input neuron) and out (from each output neuron to its card)
    const IN_X = -42, OUT_X = 34;
    const INS = nodes[0].map(n => [[-90, n.y * 1.25], [IN_X, n.y]]);
    const OUTY = [-65, -21, 23, 67];
    const OUTS = nodes[3].map((n, k) => [[OUT_X, n.y], [58, OUTY[k] * .6], [79, OUTY[k]]]);
    INS.forEach(([a, b]) => el('path', { d: `M${a[0]} ${a[1]}L${b[0]} ${b[1]}` }, rays));
    OUTS.forEach(([a, c, b]) => el('path', { d: `M${a[0]} ${a[1]}Q${c[0]} ${c[1]} ${b[0]} ${b[1]}` }, rays));
    const bars = Array.from({ length: 12 }, (_, i) => el('rect', { x: 7 + i * 4.1, width: 2.4, rx: 1.2 }, wave));

    const qpt = ([a, c, b], t) => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
    const sparks = [];
    let next = 0, nextOut = 0;
    const T_IN = .36, T_NET = .64;      // spark timeline: travel in, forward pass, travel out

    function draw(time, dt) {
      bars.forEach((b, i) => {
        const h = 2 + 8 * Math.abs(Math.sin(time * 4.2 + i * .9) * Math.sin(time * 1.7 + i * .4));
        b.setAttribute('y', (72 - h / 2).toFixed(2)); b.setAttribute('height', h.toFixed(2));
      });
      progress.setAttribute('width', (3 + ((time * 4) % 19)).toFixed(2));

      if (time >= next) {
        sparks.push({ t: 0, inp: Math.floor(Math.random() * 3), out: nextOut, stage: 0, node: el('circle', { r: 1.7 }, sparksG) });
        nextOut = (nextOut + 1) % 4; next = time + .7;
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.t += dt / 2.1;
        let pt, vis = 1;
        if (sp.t < T_IN) {
          const k = sp.t / T_IN, [a, b] = INS[sp.inp];
          pt = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; vis = Math.min(1, k * 5);
        } else if (sp.t < T_NET) {
          // forward pass: one layer per quarter of the window
          const stage = 1 + Math.floor(((sp.t - T_IN) / (T_NET - T_IN)) * 4);
          while (sp.stage < stage) {
            sp.stage++;
            if (sp.stage === 1) fire(0, sp.inp, 1);
            else if (sp.stage === 2 || sp.stage === 3) nodes[sp.stage - 1].forEach((_, j) => fire(sp.stage - 1, j, .45 + Math.random() * .55));
            else fire(3, sp.out, 1);
          }
          pt = [nodes[0][sp.inp].x, nodes[0][sp.inp].y]; vis = 0;
        } else {
          pt = qpt(OUTS[sp.out], Math.min(1, (sp.t - T_NET) / (1 - T_NET)));
        }
        sp.node.setAttribute('cx', pt[0].toFixed(2)); sp.node.setAttribute('cy', pt[1].toFixed(2));
        sp.node.setAttribute('opacity', vis.toFixed(2));
        if (sp.t >= 1) {
          const card = outs[sp.out];
          card.classList.add('is-hit'); setTimeout(() => card.classList.remove('is-hit'), 260);
          sp.node.remove(); sparks.splice(i, 1);
        }
      }

      // activations decay; draw them
      const fade = Math.exp(-dt * 3.2);
      nodes.forEach(layer => layer.forEach(n => {
        n.a *= fade;
        n.glow.setAttribute('opacity', (n.a * .6).toFixed(3));
        n.core.setAttribute('opacity', n.a.toFixed(3));
      }));
      edges.forEach(e => { e.a *= fade; e.hot.setAttribute('opacity', Math.min(1, e.a * 1.5).toFixed(3)); });
    }

    // language tags: one changes at a time, never duplicating a language on screen
    const POOL = ['EN', 'MT', 'IT', 'FR', 'DE', 'ES', 'NL', 'PT', 'PL', 'EL'];
    let li = 0;
    function swapLang() {
      const tag = langs[li % langs.length]; li++;
      const used = new Set(langs.map(l => l.textContent));
      const free = POOL.filter(x => !used.has(x));
      tag.classList.add('is-swap');
      setTimeout(() => { tag.textContent = free[Math.floor(Math.random() * free.length)]; tag.classList.remove('is-swap'); }, 260);
    }

    if (reduce) {
      // a still frame of one forward pass, so the picture still reads
      fire(0, 1, 1); nodes[1].forEach((_, j) => fire(1, j, .3 + .15 * j)); nodes[2].forEach((_, j) => fire(2, j, .7 - .1 * j)); fire(3, 1, 1);
      draw(0, 0);
      return;
    }
    draw(0, 0);
    let on = false, id = 0, langTimer = 0, last = 0, clock = 0;
    function loop(now) {
      const dt = last ? Math.min(.05, (now - last) / 1000) : 0;
      last = now; clock += dt;
      draw(clock, dt);
      if (on) id = requestAnimationFrame(loop);
    }
    whenVisible(root, v => {
      if (v && !on) { on = true; last = 0; id = requestAnimationFrame(loop); langTimer = setInterval(swapLang, 1400); }
      else if (!v && on) { on = false; cancelAnimationFrame(id); clearInterval(langTimer); }
    });
  }

  /* ---------- Scouts: a compass that points at your cursor ----------
     The needle swings in from the east as the card arrives. Once a mouse is over the page,
     "north" becomes wherever the cursor is. It chases its target on an underdamped spring,
     so it overshoots and settles like a real needle. Touch screens keep the scroll swing. */
  function setupCompass() {
    const needle = $('#compass-needle'), ticks = $('#compass-ticks'), sec = $('#scouts');
    if (!needle || !sec) return;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, major = i % 18 === 0, mid = i % 9 === 0;
      const r1 = major ? 45.5 : mid ? 47 : 49, r2 = 51.5;
      el('line', {
        x1: (r1 * Math.cos(a)).toFixed(2), y1: (r1 * Math.sin(a)).toFixed(2),
        x2: (r2 * Math.cos(a)).toFixed(2), y2: (r2 * Math.sin(a)).toFixed(2),
        stroke: major ? 'oklch(100% 0 0 / .7)' : 'oklch(100% 0 0 / .25)', 'stroke-width': major ? '1' : '.5', 'stroke-linecap': 'round'
      }, ticks);
    }
    const heading = () => {
      const r = sec.getBoundingClientRect();
      const p = clamp((innerHeight - r.top) / (innerHeight + r.height * .5), 0, 1);
      return clamp(.62 - p, 0, 1) * 230;   // swings in from the east, rests on north
    };
    const set = a => needle.setAttribute('transform', `rotate(${a.toFixed(2)})`);
    const dial = $('.compass svg');
    let ptr = null, lastBearing = 0;
    const target = () => {
      if (!ptr) return heading();
      const r = dial.getBoundingClientRect();
      const dx = ptr[0] - (r.left + r.width / 2), dy = ptr[1] - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) > r.width * .12) lastBearing = Math.atan2(dx, -dy) * 180 / Math.PI;   // dead zone over the pivot
      return lastBearing;
    };
    const unwrap = (t, from) => from + ((((t - from) % 360) + 540) % 360 - 180);   // shortest way round
    if (finePointer) {
      addEventListener('pointermove', e => { if (e.pointerType === 'mouse') ptr = [e.clientX, e.clientY]; if (reduce) set(target()); }, { passive: true });
      document.documentElement.addEventListener('pointerleave', () => { ptr = null; if (reduce) set(0); });
    }
    if (reduce) { set(0); return; }
    let ang = heading(), vel = 0, on = false, id = 0;
    set(ang);
    function loop() {
      vel = (vel + (unwrap(target(), ang) - ang) * .018) * .9;
      ang += vel;
      set(ang + Math.sin(performance.now() / 900) * .8);   // a living needle never sits perfectly still
      if (on) id = requestAnimationFrame(loop);
    }
    whenVisible(sec, v => {
      if (v && !on) { on = true; id = requestAnimationFrame(loop); }
      else if (!v) { on = false; cancelAnimationFrame(id); }
    });
  }

  /* ---------- "Get in touch": glide to contact, then autofocus on the address ----------
     Scrolls the email to the middle of the screen, waits for the scroll to settle,
     then the brackets close in and the address racks into focus like a camera locking on. */
  function setupFocusContact() {
    const af = $('#af'), mail = $('#af .mail');
    if (!af || !mail) return;
    let pending = 0;
    const lock = () => {
      af.classList.remove('is-focusing');
      void af.offsetWidth;                               // restart the animation on repeat clicks
      mail.classList.add('is-in');                       // make sure the reveal has happened
      af.classList.add('is-focusing');
      mail.focus({ preventScroll: true });
    };
    $$('[data-focus-contact]').forEach(btn => btn.addEventListener('click', e => {
      e.preventDefault();
      history.replaceState(null, '', '#contact');
      const r = mail.getBoundingClientRect();
      const y = clamp(scrollY + r.top + r.height / 2 - innerHeight / 2, 0, document.documentElement.scrollHeight - innerHeight);
      if (reduce || Math.abs(y - scrollY) < 4) { scrollTo(0, y); lock(); return; }
      scrollTo({ top: y, behavior: 'smooth' });
      clearTimeout(pending);
      let done = false;
      const finish = () => { if (done) return; done = true; removeEventListener('scrollend', finish); clearTimeout(pending); lock(); };
      if ('onscrollend' in window) addEventListener('scrollend', finish, { once: true });
      pending = setTimeout(finish, 1400);                // fallback for browsers without scrollend
    }));
  }

  /* ---------- Init ---------- */
  const yr = $('#year'); if (yr) yr.textContent = new Date().getFullYear();
  drawLens(0); drawMini(1);
  setupReveal(); setupTimeline(); setupSpotlight(); setupMagnetic(); setupNavState(); setupTilt(); setupPipe(); setupVR(); setupCompass(); setupFocusContact();
  addEventListener('scroll', () => { readScroll(); if (!reduce) wake(); else { state.open = state.openTarget; state.miniOpen = state.miniTarget; drawLens(state.open); drawMini(state.miniOpen); } }, { passive: true });
  addEventListener('resize', readScroll);
  document.fonts && document.fonts.ready ? document.fonts.ready.then(enter) : enter();
})();

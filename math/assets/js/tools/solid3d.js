/* solid3d.js — 旋转体 3D：把 y=f(x) 绕轴旋转成立体，纯 Canvas 手写 3D 渲染
   数学：绕 x 轴 → V = π∫f(x)²dx，S = 2π∫|f(x)|√(1+f'(x)²)dx
        绕 y 轴 → V = 2π∫x·f(x)dx（壳法）
   渲染：把参数网格投影到屏幕，按深度排序后逐片填充（画家算法）+ Lambert 明暗。 */
import { el, fmt, clamp, debounce, downloadBlob } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, getLang } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import { toast } from '../core/ui.js';
import { tryCompile, derivative, integrate, SAMPLES } from '../plot/expr.js';

export function initSolid(host, lang = 'zh') {
  const st = {
    src: 'sqrt(x)+0.6',
    a: 0.05,
    b: 6,
    axis: 'x',
    nu: 64,          // 圆周方向分段
    nv: 78,          // 母线方向分段
    azim: -0.9,
    elev: 0.42,
    dist: 2.9,
    spin: true,
    playing: true
  };
  let compiled = null;
  let drag = null;
  let raf = 0;
  let last = 0;

  const chartWrap = el('div', { class: 'chart-card solid-card' });
  const canvas = el('canvas');
  chartWrap.appendChild(canvas);

  const fnInput = el('input', { class: 'input mono', value: st.src, spellcheck: 'false' });
  const axisSel = el('select', { class: 'select' }, [
    el('option', { value: 'x', text: t('solid.axisX') }),
    el('option', { value: 'y', text: t('solid.axisY') })
  ]);
  const aIn = el('input', { class: 'input input-sm mono', type: 'text', value: String(st.a), style: { width: '64px' } });
  const bIn = el('input', { class: 'input input-sm mono', type: 'text', value: String(st.b), style: { width: '64px' } });
  const resIn = el('input', { type: 'range', min: '24', max: '120', step: '4', value: String(st.nu) });
  const resOut = el('span', { class: 'val mono', text: String(st.nu) });
  const spinCb = el('input', { type: 'checkbox', checked: st.spin });
  const playBtn = el('button', { class: 'btn btn-sm', type: 'button', html: icon('pause', { size: 14 }) + t('tools.timer.pause') });
  const resetBtn = el('button', { class: 'btn btn-sm', type: 'button', html: icon('refresh', { size: 14 }) + t('solid.reset') });
  const statsHost = el('div', { class: 'stat-grid' });
  const formulaHost = el('div', { class: 'deriv-code mono' });

  const readBounds = () => {
    const a = Number(aIn.value);
    const b = Number(bIn.value);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) > 1e-9) { st.a = a; st.b = b; }
    return [Math.min(st.a, st.b), Math.max(st.a, st.b)];
  };

  const compile = () => {
    const res = tryCompile(fnInput.value);
    if (res.error) {
      fnInput.classList.add('input-invalid');
      toast(res.error, { type: 'err' });
      return false;
    }
    fnInput.classList.remove('input-invalid');
    st.src = fnInput.value;
    compiled = { fn: (x) => res.fn({ x }), ast: res.ast, error: null };
    return true;
  };

  const geometry = () => {
    if (!compiled) return null;
    const [a, b] = readBounds();
    const nv = Math.max(8, Math.round(st.nv));
    const nu = Math.max(8, Math.round(st.nu));
    const prof = [];
    for (let i = 0; i <= nv; i++) {
      const x = a + ((b - a) * i) / nv;
      let y = NaN;
      try { y = compiled.fn(x); } catch { y = NaN; }
      prof.push({ x, y: Number.isFinite(y) ? y : 0, ok: Number.isFinite(y) });
    }
    return { a, b, prof, nu, nv };
  };

  /* 计算结果：体积与侧面积 */
  const computeStats = (geo) => {
    if (!geo) return null;
    const [a, b] = [geo.a, geo.b];
    const f = (x) => {
      const v = compiled.fn(x);
      return Number.isFinite(v) ? Math.abs(v) : 0;
    };
    let volume, area, formula;
    if (st.axis === 'x') {
      volume = Math.PI * integrate((x) => f(x) * f(x), a, b, { tol: 1e-7 });
      area = 2 * Math.PI * integrate((x) => f(x) * Math.sqrt(1 + derivative(f, x) ** 2), a, b, { tol: 1e-6 });
      formula = 'V = π ∫ f(x)² dx = ' + fmt(volume, 6) + '\nS = 2π ∫ |f(x)| √(1+f′(x)²) dx = ' + fmt(area, 6);
    } else {
      volume = 2 * Math.PI * integrate((x) => x * f(x), a, b, { tol: 1e-7 });
      area = 2 * Math.PI * integrate((x) => f(x) * Math.sqrt(1 + derivative(f, x) ** 2), a, b, { tol: 1e-6 });
      formula = 'V = 2π ∫ x·f(x) dx = ' + fmt(volume, 6) + '\nS = 2π ∫ |f(x)| √(1+f′(x)²) dx = ' + fmt(area, 6);
    }
    return { volume, area, formula };
  };

  /* 3D → 2D 投影 */
  const project = (p, W, H, scale) => {
    const ca = Math.cos(st.azim), sa = Math.sin(st.azim);
    const ce = Math.cos(st.elev), se = Math.sin(st.elev);
    // 绕 Y 轴（竖直方向）旋转，再按俯仰角倾斜
    const x1 = p.x * ca - p.z * sa;
    const z1 = p.x * sa + p.z * ca;
    const y1 = p.y * ce - z1 * se;
    const z2 = p.y * se + z1 * ce;
    const persp = 1 / (1 + z2 * 0.14);
    return {
      x: W / 2 + x1 * scale * persp,
      y: H / 2 - y1 * scale * persp,
      z: z2,
      s: persp
    };
  };

  const draw = () => {
    const geo = geometry();
    const rect = chartWrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(320, Math.round(rect.width));
    const H = Math.max(260, Math.round(rect.height));
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tokens = theme.tokens();
    const bg = tokens['--canvas-bg'] || '#0b0f14';
    const accent = theme.toHex(tokens['--accent'], '#3fb950');
    const accent2 = theme.toHex(tokens['--accent-2'], '#d29922');
    const axisColor = tokens['--axis'] || 'rgba(240,246,252,0.4)';
    const labelColor = tokens['--axis-label'] || '#8b949e';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    if (!geo) {
      ctx.fillStyle = labelColor;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('solid.needFn'), W / 2, H / 2);
      return;
    }

    // 自动取景：把母线范围缩放到合适大小
    const rng = geo.prof.reduce((acc, p) => {
      acc.min = Math.min(acc.min, p.y, 0);
      acc.max = Math.max(acc.max, p.y, 0);
      return acc;
    }, { min: 0, max: 0 });
    const xSpan = Math.max(1e-6, geo.b - geo.a);
    const ySpan = Math.max(1e-6, rng.max - rng.min, Math.abs(rng.max), Math.abs(rng.min));
    /* 取景：让整个立体留出边距，避免"贴脸" */
    const span = Math.max(xSpan, ySpan * 2, 1) * 1.5;
    const scale = ((Math.min(W, H) / span) * st.dist) / 3.4;
    const cx = (geo.a + geo.b) / 2;
    const cy = (rng.min + rng.max) / 2;

    /* 交互时用较低分辨率保证流畅，静止时用用户设定的精度 */
    const nu = drag ? Math.min(36, geo.nu) : geo.nu;
    const nv = drag ? Math.min(42, geo.nv) : geo.nv;

    // 顶点网格（把母线绕轴旋转成环）
    const verts = [];
    for (let i = 0; i <= nv; i++) {
      const src = geo.prof[Math.round((geo.prof.length - 1) * (i / nv))];
      const r = Math.abs(src.y);
      const row = [];
      for (let j = 0; j <= nu; j++) {
        const u = (Math.PI * 2 * j) / nu;
        const p = st.axis === 'x'
          ? { x: src.x - cx, y: src.y * Math.cos(u), z: src.y * Math.sin(u) }
          : { x: r * Math.cos(u), y: src.y - cy, z: r * Math.sin(u) };
        row.push({ p, sx: project(p, W, H, scale), src });
      }
      verts.push(row);
    }

    // 收集四边形 + 光照
    const quads = [];
    const light = { x: -0.45, y: 0.75, z: 0.65 };
    for (let i = 0; i < nv; i++) {
      for (let j = 0; j < nu; j++) {
        const p00 = verts[i][j], p10 = verts[i + 1][j], p11 = verts[i + 1][j + 1], p01 = verts[i][j + 1];
        const depth = (p00.sx.z + p10.sx.z + p11.sx.z + p01.sx.z) / 4;
        // 法线
        const ax = p10.p.x - p00.p.x, ay = p10.p.y - p00.p.y, az = p10.p.z - p00.p.z;
        const bx = p01.p.x - p00.p.x, by = p01.p.y - p00.p.y, bz = p01.p.z - p00.p.z;
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        const lam = Math.abs(nx * light.x + ny * light.y + nz * light.z);
        const shade = 0.22 + 0.78 * lam;
        const radius = Math.abs(p00.src.y);
        const tRadius = clamp(radius / Math.max(1e-6, Math.max(Math.abs(rng.max), Math.abs(rng.min))), 0, 1);
        quads.push({ pts: [p00, p10, p11, p01], depth, shade, tRadius });
      }
    }
    quads.sort((q1, q2) => q1.depth - q2.depth);

    // 旋转轴
    const axisP1 = st.axis === 'x' ? { x: -span / 2, y: 0, z: 0 } : { x: 0, y: -span / 2, z: 0 };
    const axisP2 = st.axis === 'x' ? { x: span / 2, y: 0, z: 0 } : { x: 0, y: span / 2, z: 0 };
    const A1 = project(axisP1, W, H, scale), A2 = project(axisP2, W, H, scale);
    ctx.save();
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(A1.x, A1.y);
    ctx.lineTo(A2.x, A2.y);
    ctx.stroke();
    ctx.restore();

    // 画四边形（画家算法）
    const base = theme.toHex(tokens['--accent'] || '#3fb950');
    const br = parseInt(base.slice(1, 3), 16), bg2 = parseInt(base.slice(3, 5), 16), bb = parseInt(base.slice(5, 7), 16);
    const tint = theme.toHex(tokens['--accent-2'] || '#d29922');
    const tr = parseInt(tint.slice(1, 3), 16), tg = parseInt(tint.slice(3, 5), 16), tb = parseInt(tint.slice(5, 7), 16);
    ctx.save();
    ctx.lineJoin = 'round';
    for (const q of quads) {
      const k = q.tRadius;
      const R = Math.round(br + (tr - br) * k);
      const G = Math.round(bg2 + (tg - bg2) * k);
      const B = Math.round(bb + (tb - bb) * k);
      const s = q.shade;
      ctx.fillStyle = 'rgba(' + Math.round(R * s) + ',' + Math.round(G * s) + ',' + Math.round(B * s) + ',0.93)';
      ctx.beginPath();
      ctx.moveTo(q.pts[0].sx.x, q.pts[0].sx.y);
      ctx.lineTo(q.pts[1].sx.x, q.pts[1].sx.y);
      ctx.lineTo(q.pts[2].sx.x, q.pts[2].sx.y);
      ctx.lineTo(q.pts[3].sx.x, q.pts[3].sx.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    ctx.restore();

    // 母线轮廓（旋转前的那条曲线）
    ctx.save();
    ctx.strokeStyle = accent2;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    geo.prof.forEach((p, i) => {
      const q = st.axis === 'x' ? { x: p.x - cx, y: p.y, z: 0 } : { x: 0, y: p.y - cy, z: p.y };
      const pr = project(q, W, H, scale);
      if (i === 0) ctx.moveTo(pr.x, pr.y);
      else ctx.lineTo(pr.x, pr.y);
    });
    ctx.stroke();
    ctx.restore();

    // 提示
    ctx.save();
    ctx.fillStyle = labelColor;
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(t('solid.rotateHint') + '   |   ' + t('solid.method'), 12, H - 12);
    ctx.restore();

    // 数值
    const stats = computeStats(geo);
    statsHost.innerHTML = '';
    if (stats) {
      [
        [t('solid.volume'), fmt(stats.volume, 6)],
        [t('solid.area'), fmt(stats.area, 6)],
        ['a → b', fmt(geo.a, 3) + ' → ' + fmt(geo.b, 3)]
      ].forEach(([k, v]) => statsHost.appendChild(el('div', { class: 'stat-box' }, [
        el('div', { class: 'k', text: k }),
        el('div', { class: 'v', text: v })
      ])));
      formulaHost.textContent = stats.formula + '\n' + t('solid.method');
    }
    void accent;
  };

  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (st.playing && st.spin && !drag) {
      st.azim += dt * 0.45;
      draw();
    } else if (st.playing && !drag) {
      draw();
    }
  };

  /* 交互 */
  const pointerPos = (e) => ({ x: e.clientX, y: e.clientY });
  canvas.addEventListener('pointerdown', (e) => {
    drag = { ...pointerPos(e), azim: st.azim, elev: st.elev };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    st.azim = drag.azim + dx * 0.008;
    st.elev = clamp(drag.elev + dy * 0.006, -1.45, 1.45);
    draw();
  });
  const endDrag = () => { drag = null; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    st.dist = clamp(st.dist * Math.pow(1.0016, e.deltaY), 0.6, 9);
    draw();
  }, { passive: false });
  canvas.addEventListener('dblclick', () => {
    st.azim = -0.9; st.elev = 0.42; st.dist = 2.9;
    draw();
  });

  fnInput.addEventListener('change', () => { if (compile()) draw(); });
  axisSel.addEventListener('change', () => { st.axis = axisSel.value; draw(); });
  [aIn, bIn].forEach((inp) => inp.addEventListener('change', () => { readBounds(); draw(); }));
  resIn.addEventListener('input', () => {
    st.nu = Number(resIn.value);
    st.nv = Math.round(st.nu * 1.2);
    resOut.textContent = String(st.nu);
    draw();
  });
  spinCb.addEventListener('change', () => { st.spin = spinCb.checked; if (!st.playing) draw(); });
  playBtn.addEventListener('click', () => {
    st.playing = !st.playing;
    playBtn.innerHTML = icon(st.playing ? 'pause' : 'play', { size: 14 }) + (st.playing ? t('tools.timer.pause') : t('tools.timer.resume'));
    if (!st.playing) draw();
  });
  resetBtn.addEventListener('click', () => {
    st.azim = -0.9; st.elev = 0.42; st.dist = 2.9;
    if (!st.playing) draw();
  });

  host.appendChild(el('div', { class: 'tool-layout' }, [
    el('div', { class: 'col' }, [
      chartWrap,
      el('div', { class: 'row-inline' }, [
        el('span', { class: 'label', text: 'f(x) =' }),
        fnInput,
        el('button', {
          class: 'btn btn-sm', type: 'button', html: icon('download', { size: 14 }) + ' PNG',
          onclick: () => {
            canvas.toBlob((blob) => {
              if (blob) { downloadBlob(blob, 'solid-3d.png'); toast(t('plot.saved'), { type: 'ok' }); }
            }, 'image/png');
          }
        }),
        el('button', {
          class: 'btn btn-sm', type: 'button', text: t('common.example'),
          onclick: () => {
            const list = lang === 'zh'
              ? ['sqrt(x)+0.6', 'sin(x)+1.4', 'e^(-x^2/3)*2', 'x^2/8+0.4', '1+cos(x)']
              : ['sqrt(x)+0.6', 'sin(x)+1.4', 'e^(-x^2/3)*2', 'x^2/8+0.4', '1+cos(x)'];
            const pick = list[Math.floor(Math.random() * list.length)];
            fnInput.value = pick;
            if (compile()) draw();
          }
        })
      ]),
      formulaHost
    ]),
    el('div', { class: 'col' }, [
      el('div', { class: 'card card-pad col' }, [
        el('strong', { text: t('tools.solid') }),
        el('div', { class: 'field' }, [el('label', { text: t('solid.axis') }), axisSel]),
        el('div', { class: 'row-inline' }, [
          el('span', { class: 'label', text: t('solid.from') }), aIn,
          el('span', { class: 'label', text: t('solid.to') }), bIn
        ]),
        el('div', { class: 'slider-row' }, [el('span', { class: 'label', text: t('solid.resolution') }), resOut, resIn]),
        el('label', { class: 'checkbox' }, [spinCb, el('span', { text: t('solid.spin') })]),
        el('div', { class: 'row-inline' }, [playBtn, resetBtn])
      ]),
      el('div', { class: 'card card-pad col' }, [el('strong', { text: t('solid.formula') }), statsHost])
    ])
  ]));

  if (!compile()) { fnInput.value = 'sin(x)+1.4'; compile(); }
  playBtn.innerHTML = icon('pause', { size: 14 }) + t('tools.timer.pause');
  canvas.style.cursor = 'grab';
  const ro = new ResizeObserver(debounce(draw, 120));
  ro.observe(chartWrap);
  theme.subscribe(draw);
  setTimeout(() => { draw(); raf = requestAnimationFrame(loop); }, 40);
  void SAMPLES;
}
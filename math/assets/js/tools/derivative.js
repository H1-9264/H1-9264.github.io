/* derivative.js — 导数探索器：拖动点观察切线与导函数 */
import { el, fmt, clamp, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import { toast } from '../core/ui.js';
import { tryCompile, derivative, SAMPLES } from '../plot/expr.js';
import { PlotEngine, parseColor } from '../plot/engine.js';
import { exportPNG, stamp } from '../plot/exporter.js';

/* 容器尺寸兜底：面板刚显示或 CSS 未及时生效时 rect 可能为 0，
   退回 clientWidth/clientHeight，保证画布后备分辨率与显示尺寸一致。 */
function measureHost(host) {
  let w = 0;
  let h = 0;
  try {
    const r = host.getBoundingClientRect();
    w = r.width;
    h = r.height;
  } catch { /* ignore */ }
  if (w < 40 || h < 40) {
    w = Math.max(w, host.clientWidth || 0);
    h = Math.max(h, host.clientHeight || 0);
  }
  if (w < 40) w = 320;
  if (h < 40) h = 300;
  return { width: Math.round(w), height: Math.round(h) };
}


/* 容器尺寸兜底：保证画布后备分辨率与显示尺寸一致 */

export function initDerivative(host, lang = 'zh') {
  const state = {
    src: 'sin(x)*x/3',
    x0: 1.2,
    scale: 2
  };
  const compiled = { fn: null, error: null };
  const input = el('input', { class: 'input mono', value: state.src, spellcheck: 'false' });
  const canvasWrap = el('div', { class: 'chart-card' });
  const canvas = el('canvas');
  canvasWrap.appendChild(canvas);
  const readout = el('div', { class: 'stat-grid' });
  const codeBox = el('div', { class: 'deriv-code mono' });

  const engine = new PlotEngine({ xMin: -8, xMax: 8, yMin: -5, yMax: 5, samples: 1400 });

  const compile = () => {
    const res = tryCompile(input.value);
    if (res.error) {
      compiled.error = res.error;
      compiled.fn = null;
      input.classList.add('input-invalid');
      toast(res.error, { type: 'err' });
    } else {
      compiled.error = null;
      compiled.fn = (x) => res.fn({ x });
      input.classList.remove('input-invalid');
      state.src = input.value;
    }
    draw();
  };
  input.addEventListener('change', compile);

  const chips = el('div', { class: 'row-inline' }, SAMPLES[lang === 'zh' ? 'zh' : 'en'].slice(0, 6).map((s) =>
    el('button', { class: 'btn btn-sm', type: 'button', text: s, onclick: () => { input.value = s; compile(); } })));

  /* 同步画布尺寸：无论表达式是否编译成功都先做，保证后备分辨率 == 显示尺寸 */
  const syncSize = () => {
    const rect = measureHost(canvasWrap);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(240, rect.width);
    const H = Math.max(220, rect.height);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    return { W, H, dpr };
  };

  const draw = () => {
    const { W, H, dpr } = syncSize();
    const ctx = canvas.getContext('2d');
    if (!compiled.fn) {
      const tokens0 = theme.tokens();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = tokens0['--canvas-bg'] || '#0b0f14';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const rect = { width: W, height: H };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tokens = theme.tokens();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    engine.setSize(W, H, dpr);
    engine.setOption({
      bg: tokens['--canvas-bg'], gridMinor: tokens['--grid-minor'], gridMajor: tokens['--grid-major'],
      axis: tokens['--axis'], label: tokens['--axis-label'], glow: theme.getKey('glow')
    });
    const f = compiled.fn;
    const y0 = f(state.x0);
    const d1 = derivative(f, state.x0);
    const fObj = { id: 'f', kind: 'cartesian', color: theme.toHex(tokens['--accent'], '#3fb950'), width: 2.2, source: state.src, fn: (s) => f(s.x) };
    const dObj = { id: 'df', kind: 'cartesian', color: theme.toHex(tokens['--accent-2'], '#d29922'), width: 1.6, dash: [6, 4], source: "f'(x)", fn: (s) => derivative(f, s.x) };
    engine.setFunctions([fObj, dObj]);
    engine.o.integral = { enabled: false };
    engine.o.trace = { enabled: true, x: state.x0, pinned: true, fnId: 'f' };
    engine.o.tangent = { enabled: true };
    engine.o.marks = [{ x: state.x0, y: y0, color: theme.toHex(tokens['--accent-2'], '#d29922'), label: '' }];
    engine.render(ctx);

    const angle = Math.atan(d1) * (180 / Math.PI);
    const normal = Number.isFinite(d1) && Math.abs(d1) > 1e-9 ? 'y = ' + fmt(-1 / d1, 4) + '(x − ' + fmt(state.x0, 4) + ') + ' + fmt(y0, 4) : '—';
    readout.innerHTML = '';
    const rows = [
      [t('tools.deriv.x0'), fmt(state.x0, 5)],
      [t('tools.deriv.fx'), fmt(y0, 6)],
      [t('tools.deriv.df'), fmt(d1, 6)],
      [t('tools.deriv.angle'), fmt(angle, 3) + '°']
    ];
    rows.forEach(([k, v]) => readout.appendChild(el('div', { class: 'stat-box' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v })])));
    codeBox.innerHTML = t('tools.deriv.tangent') + ': y = ' + fmt(d1, 5) + '(x − ' + fmt(state.x0, 4) + ') + ' + fmt(y0, 5) +
      '\n' + t('tools.deriv.normal') + ': ' + normal;
  };

  /* 鼠标交互：拖动选择 x0 */
  const pick = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = engine.pxToX(ev.clientX - rect.left);
    state.x0 = clamp(x, engine.o.xMin, engine.o.xMax);
    draw();
  };
  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; canvas.setPointerCapture(e.pointerId); pick(e); });
  canvas.addEventListener('pointermove', (e) => { if (dragging) pick(e); });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    engine.zoomAt(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top, Math.pow(1.0016, e.deltaY));
    draw();
  }, { passive: false });

  host.appendChild(el('div', { class: 'tool-layout' }, [
    el('div', { class: 'col' }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'label', text: 'f(x) =' }),
        input,
        el('button', {
          class: 'btn btn-sm', type: 'button', html: icon('download', { size: 14 }) + ' PNG',
          onclick: async () => { await exportPNG(engine, { scale: state.scale, background: 'theme', filename: stamp('derivative') + '.png' }); toast(t('plot.saved'), { type: 'ok' }); }
        })
      ]),
      chips,
      canvasWrap,
      codeBox
    ]),
    el('div', { class: 'col' }, [
      el('div', { class: 'card card-pad col' }, [el('strong', { text: t('tools.deriv') }), readout]),
      el('div', { class: 'card card-pad col' }, [
        el('p', { class: 'text-xs text-dim', text: lang === 'zh' ? '在图上按住并拖动可改变 x₀；滚轮缩放；虚线为导函数 f′(x)。' : 'Drag on the chart to change x₀; scroll to zoom. The dashed curve is f′(x).' })
      ])
    ])
  ]));
  const ro = new ResizeObserver(debounce(() => draw(), 120));
  ro.observe(canvasWrap);
  theme.subscribe(() => draw());
  /* 首帧：先定尺寸再绘制，并做一次延迟兜底（面板首次显示时容器可能还没有高度） */
  syncSize();
  setTimeout(() => draw(), 30);
  setTimeout(() => draw(), 600);
  void parseColor;
}
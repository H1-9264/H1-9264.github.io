/* derivative.js — 导数探索器：拖动点观察切线与导函数 */
import { el, fmt, clamp, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import { toast } from '../core/ui.js';
import { tryCompile, derivative, SAMPLES } from '../plot/expr.js';
import { PlotEngine, parseColor } from '../plot/engine.js';
import { exportPNG, stamp } from '../plot/exporter.js';

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

  const draw = () => {
    if (!compiled.fn) return;
    const rect = canvasWrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(240, rect.width);
    const H = Math.max(220, rect.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tokens = theme.tokens();
    engine.setSize(W, H, dpr);
    engine.setOption({
      bg: tokens['--canvas-bg'], gridMinor: tokens['--grid-minor'], gridMajor: tokens['--grid-major'],
      axis: tokens['--axis'], label: tokens['--axis-label'], glow: theme.getKey('glow')
    });
    const f = compiled.fn;
    const y0 = f(state.x0);
    const d1 = derivative(f, state.x0);
    const fObj = { id: 'f', kind: 'cartesian', color: theme.toHex(tokens['--accent'], '#6c8cff'), width: 2.2, source: state.src, fn: (s) => f(s.x) };
    const dObj = { id: 'df', kind: 'cartesian', color: theme.toHex(tokens['--accent-2'], '#22d3ee'), width: 1.6, dash: [6, 4], source: "f'(x)", fn: (s) => derivative(f, s.x) };
    engine.setFunctions([fObj, dObj]);
    engine.o.integral = { enabled: false };
    engine.o.trace = { enabled: true, x: state.x0, pinned: true, fnId: 'f' };
    engine.o.tangent = { enabled: true };
    engine.o.marks = [{ x: state.x0, y: y0, color: theme.toHex(tokens['--accent-2'], '#22d3ee'), label: '' }];
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
  const ro = new ResizeObserver(debounce(draw, 120));
  ro.observe(canvasWrap);
  theme.subscribe(draw);
  setTimeout(draw, 30);
  void parseColor;
}

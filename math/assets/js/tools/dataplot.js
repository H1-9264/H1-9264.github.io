/* dataplot.js — 数据绘图：CSV 解析、折线/柱状/散点图、统计量与线性回归 */
import { el, fmt, debounce, downloadText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import { toast } from '../core/ui.js';
import { PlotEngine } from '../plot/engine.js';
import { exportPNG, stamp } from '../plot/exporter.js';

const SAMPLE = 'x,y\n0,1.2\n1,2.4\n2,2.1\n3,3.8\n4,4.2\n5,5.9\n6,5.4\n7,7.1\n8,7.6\n9,8.9';

export function parseCSV(text) {
  const rows = [];
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const line of lines) {
    const parts = line.split(/[,;\t]+/).map((p) => p.trim()).filter((p) => p !== '');
    const nums = parts.map(Number);
    if (parts.length >= 2 && nums.every((n) => Number.isFinite(n))) rows.push({ x: nums[0], y: nums[1], label: parts[2] || '' });
    else if (parts.length === 1 && Number.isFinite(nums[0])) rows.push({ x: rows.length, y: nums[0], label: '' });
    else if (parts.length >= 2 && Number.isFinite(nums[1])) rows.push({ x: rows.length, y: nums[1], label: parts[0] });
  }
  return rows;
}

export function statsOf(values) {
  const n = values.length;
  if (!n) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  return { n, sum, mean, median, stdev: Math.sqrt(variance), min: sorted[0], max: sorted[n - 1] };
}

export function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  const sx = points.reduce((a, p) => a + p.x, 0);
  const sy = points.reduce((a, p) => a + p.y, 0);
  const sxx = points.reduce((a, p) => a + p.x * p.x, 0);
  const sxy = points.reduce((a, p) => a + p.x * p.y, 0);
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const meanY = sy / n;
  const ssTot = points.reduce((a, p) => a + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((a, p) => a + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = ssTot > 1e-12 ? 1 - ssRes / ssTot : 1;
  return { slope, intercept, r2 };
}

export function initDataPlot(host, lang = 'zh') {
  /* 说明：render 采用函数声明提升，便于 parse / 事件回调在定义处之前引用 */
  const textarea = el('textarea', { class: 'textarea', rows: '10', value: SAMPLE, spellcheck: 'false' });
  const typeSel = el('select', { class: 'select' }, [
    el('option', { value: 'line', text: t('tools.data.line') }),
    el('option', { value: 'bar', text: t('tools.data.bar') }),
    el('option', { value: 'scatter', text: t('tools.data.scatter') })
  ]);
  const canvasWrap = el('div', { class: 'chart-card' });
  const canvas = el('canvas');
  canvasWrap.appendChild(canvas);
  const statHost = el('div', { class: 'stat-grid' });
  const regHost = el('div', { class: 'text-sm mono' });
  let points = parseCSV(SAMPLE);
  let engineRef = null;

  function parse() {
    points = parseCSV(textarea.value);
    if (!points.length) { toast(t('tools.data.parseFailed'), { type: 'err' }); return; }
    toast(t('tools.data.parsed', { n: points.length }), { type: 'ok', timeout: 1600 });
    render();
  }
  textarea.addEventListener('input', debounce(() => { points = parseCSV(textarea.value); render(); }, 400));
  typeSel.addEventListener('change', () => render());

  function render() {
    if (!points.length) return;
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
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys, 0), y1 = Math.max(...ys);
    const padX = (x1 - x0) * 0.08 || 1;
    const padY = (y1 - y0) * 0.12 || 1;
    const engine = new PlotEngine({
      xMin: x0 - padX, xMax: x1 + padX, yMin: y0 - padY, yMax: y1 + padY,
      showMinorGrid: false, showLabels: true, samples: 1200,
      bg: tokens['--canvas-bg'], gridMinor: tokens['--grid-minor'], gridMajor: tokens['--grid-major'],
      axis: tokens['--axis'], label: tokens['--axis-label'], glow: false
    });
    engine.setSize(W, H, dpr);
    const color = theme.toHex(tokens['--accent'], '#6c8cff');
    const color2 = theme.toHex(tokens['--accent-2'], '#22d3ee');
    const kind = typeSel.value;
    engine.setFunctions([{ id: 'data', kind: 'points', color, width: 2, visible: true, points, source: 'data', label: 'data' }]);
    engine.o.marks = [];
    engine.render(ctx);

    // 用引擎的坐标变换手动画柱状图 / 折线 / 散点
    if (kind === 'bar') {
      const barW = Math.max(2, ((engine.o.xMax - engine.o.xMin) / Math.max(1, points.length)) * 0.6);
      points.forEach((p) => {
        const cx = engine.xToPx(p.x);
        const yBase = engine.yToPx(Math.max(0, Math.min(0, engine.o.yMin)));
        const yTop = engine.yToPx(p.y);
        ctx.fillStyle = theme.withAlpha(color2, 0.55);
        ctx.fillRect(cx - (barW * engine.width) / (engine.o.xMax - engine.o.xMin) / 2, Math.min(yTop, yBase),
          (barW * engine.width) / (engine.o.xMax - engine.o.xMin), Math.abs(yBase - yTop));
      });
    } else if (kind === 'line') {
      ctx.save();
      ctx.strokeStyle = color2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      points.forEach((p, i) => {
        const px = engine.xToPx(p.x), py = engine.yToPx(p.y);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    }
    // 散点
    ctx.save();
    ctx.fillStyle = color;
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(engine.xToPx(p.x), engine.yToPx(p.y), 3.4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
    // 回归线
    const reg = linearRegression(points);
    if (reg) {
      ctx.save();
      ctx.strokeStyle = theme.toHex(tokens['--accent-3'], '#b07cff');
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(engine.xToPx(engine.o.xMin), engine.yToPx(reg.slope * engine.o.xMin + reg.intercept));
      ctx.lineTo(engine.xToPx(engine.o.xMax), engine.yToPx(reg.slope * engine.o.xMax + reg.intercept));
      ctx.stroke();
      ctx.restore();
    }
    engineRef = engine;

    const st = statsOf(ys);
    statHost.innerHTML = '';
    if (st) {
      const rows = [
        [t('tools.data.count'), String(st.n)], [t('tools.data.mean'), fmt(st.mean, 5)],
        [t('tools.data.median'), fmt(st.median, 5)], [t('tools.data.stdev'), fmt(st.stdev, 5)],
        [t('tools.data.min'), fmt(st.min, 5)], [t('tools.data.max'), fmt(st.max, 5)],
        [t('tools.data.sum'), fmt(st.sum, 6)]
      ];
      rows.forEach(([k, v]) => statHost.appendChild(el('div', { class: 'stat-box' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v })])));
    }
    regHost.textContent = reg
      ? t('tools.data.regression') + ': y = ' + fmt(reg.slope, 5) + 'x + ' + fmt(reg.intercept, 5) + '   R² = ' + fmt(reg.r2, 5)
      : '';
  }

  host.appendChild(el('div', { class: 'tool-layout' }, [
    el('div', { class: 'col' }, [
      canvasWrap,
      el('div', { class: 'row-inline' }, [
        el('button', { class: 'btn btn-sm', type: 'button', text: t('tools.data.loadSample'), onclick: () => { textarea.value = SAMPLE; parse(); } }),
        el('button', {
          class: 'btn btn-sm', type: 'button', html: icon('download', { size: 14 }) + ' PNG',
          onclick: async () => { if (engineRef) { await exportPNG(engineRef, { scale: 2, background: 'theme', filename: stamp('data') + '.png' }); toast(t('plot.saved'), { type: 'ok' }); } }
        }),
        el('button', { class: 'btn btn-sm', type: 'button', html: icon('file', { size: 14 }) + ' CSV', onclick: () => downloadText(points.map((p) => p.x + ',' + p.y).join('\n'), stamp('data') + '.csv', 'text/csv') })
      ])
    ]),
    el('div', { class: 'col' }, [
      el('div', { class: 'card card-pad col' }, [
        el('div', { class: 'row-between' }, [el('strong', { text: t('tools.data.input') }), typeSel]),
        textarea,
        el('div', { class: 'row-inline' }, [
          el('button', { class: 'btn btn-sm btn-primary', type: 'button', text: t('tools.data.parse'), onclick: () => parse() }),
          el('span', { class: 'badge mono', text: points.length + ' pts' })
        ])
      ]),
      el('div', { class: 'card card-pad col' }, [el('strong', { text: t('tools.data.stats') }), statHost, regHost])
    ])
  ]));
  const ro = new ResizeObserver(debounce(() => render(), 150));
  ro.observe(canvasWrap);
  theme.subscribe(() => render());
  setTimeout(() => render(), 40);
  void lang;
}

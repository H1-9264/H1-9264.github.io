/* dataplot.js — 数据绘图：CSV 解析、折线/柱状/散点图、统计量与线性回归 */
import { el, fmt, debounce, downloadText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import { toast } from '../core/ui.js';
import { PlotEngine } from '../plot/engine.js';
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

const SAMPLE = 'x,y\n0,1.2\n1,2.4\n2,2.1\n3,3.8\n4,4.2\n5,5.9\n6,5.4\n7,7.1\n8,7.6\n9,8.9';

/* CSV / 粘贴数据解析
   兼容：逗号、分号、制表符、空格（含多个空格）；带引号（Excel 复制）；
   有/无表头；单列；注释行（# 或 //）；日期等文字首列（自动忽略）；
   全角逗号与 BOM。返回 [{ x, y, label }]。 */
export function parseCSV(text) {
  let src = String(text || '').replace(/^\uFEFF/, '');
  const lines = src.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));

  const cellSplit = (line) => {
    if (line.includes('\t')) return line.split('\t');
    if (line.includes(';') || line.includes('；')) return line.split(/[;；]/);
    if (line.includes(',') || line.includes('，')) return line.split(/[,，]/);
    return line.split(/\s+/); // 空格分隔（从 Word / 网页复制的常见格式）
  };
  const clean = (s) => String(s).trim().replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, '').trim();
  const num = (s) => {
    const c = clean(s);
    if (c === '' || /^(null|na|nan|n\/a|-|—)$/i.test(c)) return NaN;
    const v = Number(c);
    return Number.isFinite(v) ? v : NaN;
  };

  const table = lines.map((line) => cellSplit(line).map(clean));
  if (!table.length) return [];

  const columnNumeric = (idx) => {
    let ok = 0, total = 0;
    for (const row of table) {
      if (row.length <= idx) continue;
      total++;
      if (Number.isFinite(num(row[idx]))) ok++;
    }
    return total ? ok / total : 0;
  };
  const width = Math.max(...table.map((r) => r.length));
  const numericCols = [];
  for (let i = 0; i < width; i++) if (columnNumeric(i) >= 0.6) numericCols.push(i);

  const out = [];
  if (numericCols.length === 0) return out;

  if (numericCols.length === 1) {
    /* 单列 → 序号作 x */
    const ci = numericCols[0];
    table.forEach((row) => {
      const y = num(row[ci]);
      if (Number.isFinite(y)) out.push({ x: out.length, y, label: '' });
    });
    return out;
  }

  /* 两列及以上：把第一个数字列当 x、第二个当 y；若首行全是文字则视为表头跳过 */
  const [cx, cy] = numericCols;
  const headerLike = table.length > 1 && table[0].every((c) => num(c) === num(c) === false || !Number.isFinite(num(c)));
  table.forEach((row, i) => {
    if (i === 0 && headerLike) return;
    const x = num(row[cx]);
    const y = num(row[cy]);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y, label: '' });
  });
  return out;
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
  const tableHost = el('div', { class: 'data-table-wrap' });
  const equalCb = el('input', { type: 'checkbox', checked: true });
  /* 坐标范围锁定：防止个别离群值把坐标轴拉到几千 */
  const lockCb = el('input', { type: 'checkbox', checked: false });
  const rangeInputs = {};
  const rangeBox = (axis) => {
    const min = el('input', { class: 'input input-sm mono', type: 'text', placeholder: 'auto', style: { width: '74px', padding: '2px 6px' } });
    const max = el('input', { class: 'input input-sm mono', type: 'text', placeholder: 'auto', style: { width: '74px', padding: '2px 6px' } });
    [min, max].forEach((inp) => inp.addEventListener('change', () => {
      const v = Number(inp.value);
      const arr = axis === 'x' ? viewLock.x : viewLock.y;
      if (inp === min) arr[0] = Number.isFinite(v) && inp.value.trim() !== '' ? v : null;
      else arr[1] = Number.isFinite(v) && inp.value.trim() !== '' ? v : null;
      if (arr[0] !== null || arr[1] !== null) { lockCb.checked = true; }
      syncLockUI();
      render();
    }));
    rangeInputs[axis] = { min, max };
    return el('div', { class: 'scope-row' }, [
      el('span', { class: 'text-dim', text: axis + ' ∈' }),
      min,
      el('span', { class: 'text-dim', text: '~' }),
      max
    ]);
  };
  /* 锁定范围：null 表示该端自动 */
  const viewLock = { x: [null, null], y: [null, null] };
  const ptsBadge = el('span', { class: 'badge mono', text: '0' });
  let points = parseCSV(SAMPLE);
  let engineRef = null;

  function parse() {
    points = parseCSV(textarea.value);
    if (!points.length) { toast(t('tools.data.parseFailed'), { type: 'err' }); return; }
    toast(t('tools.data.parsed', { n: points.length }), { type: 'ok', timeout: 1600 });
    render();
  }
  textarea.addEventListener('input', debounce(() => { points = parseCSV(textarea.value); render(); }, 350));
  typeSel.addEventListener('change', () => render());
  equalCb.addEventListener('change', () => render());
  lockCb.addEventListener('change', () => { syncLockUI(); render(); });

  /* 容器尺寸可能在首帧为 0（面板刚显示），这里做兜底测量 */
  function measure() {
    let rect = measureHost(canvasWrap);
    let W = Math.round(rect.width);
    let H = Math.round(rect.height);
    if (W < 80 || H < 80) {
      W = Math.max(320, canvasWrap.clientWidth || 0);
      H = Math.max(240, Math.round(W * 0.56));
    }
    return { W, H };
  }

  /* 把自动计算出来的范围回填成占位提示，用户一眼能看到当前值 */
  function syncLockUI() {
    const auto = autoRange();
    ['x', 'y'].forEach((axis) => {
      const { min, max } = rangeInputs[axis];
      const manual = viewLock[axis];
      const a = axis === 'x' ? auto.x : auto.y;
      min.placeholder = 'auto ' + fmt(a[0], 3);
      max.placeholder = 'auto ' + fmt(a[1], 3);
      if (Number.isFinite(manual[0]) && document.activeElement !== min) min.value = String(Number(manual[0].toPrecision(6)));
      if (Number.isFinite(manual[1]) && document.activeElement !== max) max.value = String(Number(manual[1].toPrecision(6)));
      if (manual[0] === null && document.activeElement !== min) min.value = '';
      if (manual[1] === null && document.activeElement !== max) max.value = '';
    });
  }

  /* 由数据自动推导的显示范围 */
  function autoRange() {
    if (!points.length) return { x: [0, 1], y: [0, 1] };
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys, 0), y1 = Math.max(...ys);
    const padX = (x1 - x0) * 0.08 || 1;
    const padY = (y1 - y0) * 0.12 || 1;
    return { x: [x0 - padX, x1 + padX], y: [y0 - padY, y1 + padY] };
  }

  function render() {
    ptsBadge.textContent = t('tools.data.parsed', { n: points.length });
    syncLockUI();
    if (!points.length) {
      const ctx0 = canvas.getContext('2d');
      const m0 = measure();
      const dpr0 = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = m0.W * dpr0;
      canvas.height = m0.H * dpr0;
      canvas.style.width = m0.W + 'px';
      canvas.style.height = m0.H + 'px';
      ctx0.setTransform(dpr0, 0, 0, dpr0, 0, 0);
      const tokens0 = theme.tokens();
      ctx0.fillStyle = tokens0['--canvas-bg'] || '#0b0f14';
      ctx0.fillRect(0, 0, m0.W, m0.H);
      ctx0.fillStyle = tokens0['--axis-label'] || '#8b949e';
      ctx0.font = '13px system-ui, sans-serif';
      ctx0.textAlign = 'center';
      ctx0.fillText(t('tools.data.parseFailed'), m0.W / 2, m0.H / 2 - 8);
      ctx0.font = '12px system-ui, sans-serif';
      ctx0.fillText(t('tools.data.formatHint'), m0.W / 2, m0.H / 2 + 14);
      tableHost.innerHTML = '';
      renderTable();
      return;
    }
    const { W, H } = measure();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    let vxMin = x0 - padX, vxMax = x1 + padX, vyMin = y0 - padY, vyMax = y1 + padY;
    /* 用户锁定的范围优先（只覆盖填写的端点） */
    if (lockCb.checked) {
      const lx = viewLock.x, ly = viewLock.y;
      if (Number.isFinite(lx[0])) vxMin = lx[0];
      if (Number.isFinite(lx[1])) vxMax = lx[1];
      if (Number.isFinite(ly[0])) vyMin = ly[0];
      if (Number.isFinite(ly[1])) vyMax = ly[1];
      if (vxMax - vxMin < 1e-9) vxMax = vxMin + 1;
      if (vyMax - vyMin < 1e-9) vyMax = vyMin + 1;
    }
    if (equalCb.checked && !lockCb.checked) {
      /* 保持数据的真实比例，避免图形被拉伸变形 */
      const ratio = W / Math.max(1, H);
      const wantH = (vxMax - vxMin) / ratio;
      const cy = (vyMin + vyMax) / 2;
      if (wantH > vyMax - vyMin) { vyMin = cy - wantH / 2; vyMax = cy + wantH / 2; }
      else {
        const wantW = (vyMax - vyMin) * ratio;
        const cx = (vxMin + vxMax) / 2;
        vxMin = cx - wantW / 2; vxMax = cx + wantW / 2;
      }
    }
    const engine = new PlotEngine({
      xMin: vxMin, xMax: vxMax, yMin: vyMin, yMax: vyMax,
      showMinorGrid: false, showLabels: true, samples: 1200,
      bg: tokens['--canvas-bg'], gridMinor: tokens['--grid-minor'], gridMajor: tokens['--grid-major'],
      axis: tokens['--axis'], label: tokens['--axis-label'], glow: false
    });
    engine.setSize(W, H, dpr);
    const color = theme.toHex(tokens['--accent'], '#3fb950');
    const color2 = theme.toHex(tokens['--accent-2'], '#d29922');
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
      ctx.strokeStyle = theme.toHex(tokens['--accent-3'], '#2ea043');
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
    renderTable();
  }

  /* 解析结果表格：一眼看出有没有解析错位 */
  function renderTable() {
    tableHost.innerHTML = '';
    if (!points.length) return;
    const head = el('div', { class: 'row-between' }, [
      el('span', { class: 'label', text: t('tools.data.table') }),
      el('span', { class: 'badge mono', text: points.length + '' })
    ]);
    const table = el('table', { class: 'table' });
    table.innerHTML = '<thead><tr><th class="num">#</th><th class="num">x</th><th class="num">y</th></tr></thead>';
    const body = el('tbody');
    const shown = points.slice(0, 60);
    shown.forEach((p, i) => {
      body.appendChild(el('tr', {}, [
        el('td', { class: 'num text-dim', text: String(i + 1) }),
        el('td', { class: 'num', text: fmt(p.x, 6) }),
        el('td', { class: 'num', text: fmt(p.y, 6) })
      ]));
    });
    table.appendChild(body);
    const wrap = el('div', { class: 'data-table-scroll' }, [table]);
    tableHost.appendChild(head);
    tableHost.appendChild(wrap);
    if (points.length > shown.length) {
      tableHost.appendChild(el('p', { class: 'text-xs text-dim', text: '… +' + (points.length - shown.length) }));
    }
  }

  if (!textarea.value) textarea.value = SAMPLE;
  points = parseCSV(textarea.value);
  host.appendChild(el('div', { class: 'tool-layout' }, [
    el('div', { class: 'col' }, [
      canvasWrap,
      el('div', { class: 'row-inline' }, [
        el('button', { class: 'btn btn-sm', type: 'button', text: t('tools.data.loadSample'), onclick: () => { textarea.value = SAMPLE; parse(); } }),
        el('button', {
          class: 'btn btn-sm', type: 'button', html: icon('download', { size: 14 }) + ' PNG',
          onclick: async () => { if (engineRef) { await exportPNG(engineRef, { scale: 2, background: 'theme', filename: stamp('data') + '.png' }); toast(t('plot.saved'), { type: 'ok' }); } }
        }),
        el('button', { class: 'btn btn-sm', type: 'button', html: icon('file', { size: 14 }) + ' CSV', onclick: () => downloadText(points.map((p) => p.x + ',' + p.y).join('\n'), stamp('data') + '.csv', 'text/csv') }),
        el('label', { class: 'checkbox text-xs' }, [equalCb, el('span', { text: t('tools.data.keepRatio') })]),
        el('label', { class: 'checkbox text-xs' }, [lockCb, el('span', { text: t('tools.data.lockRange') })]),
        el('div', { class: 'data-range-box' }, [
          rangeBox('x'),
          rangeBox('y'),
          el('button', {
            class: 'btn btn-sm btn-ghost', type: 'button', text: t('tools.data.autoRange'),
            onclick: () => {
              viewLock.x = [null, null];
              viewLock.y = [null, null];
              lockCb.checked = false;
              Object.values(rangeInputs).forEach(({ min, max }) => { min.value = ''; max.value = ''; });
              render();
            }
          })
        ]),
        el('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: t('common.clear'), onclick: () => { textarea.value = ''; points = []; render(); } })
      ])
    ]),
    el('div', { class: 'col' }, [
      el('div', { class: 'card card-pad col' }, [
        el('div', { class: 'row-between' }, [el('strong', { text: t('tools.data.input') }), typeSel]),
        textarea,
        el('div', { class: 'row-inline' }, [
          el('button', { class: 'btn btn-sm btn-primary', type: 'button', text: t('tools.data.parse'), onclick: () => parse() }),
          ptsBadge
        ])
      ]),
      el('div', { class: 'card card-pad col' }, [el('strong', { text: t('tools.data.stats') }), statHost, regHost]),
      el('div', { class: 'card card-pad col' }, [tableHost])
    ])
  ]));
  const ro = new ResizeObserver(debounce(() => render(), 150));
  ro.observe(canvasWrap);
  theme.subscribe(() => render());
  setTimeout(() => render(), 40);
  void lang;
}
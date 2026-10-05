/* plotter.js — 函数绘图器页面逻辑
   职责：函数列表（含单条范围/1:1）、变量滑杆、视图控制、分析工具、导出（PNG/SVG/CSV/讲义/PDF）、分享链接、撤销重做。 */
import { el, $, $$, on, fmt, clamp, copyText, debounce, downloadText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, getLang } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import * as store from '../core/storage.js';
import { toast, modal, initChrome, initReveal, registerCommand, mountMobilePanelToggle } from '../core/ui.js';
import { tryCompile, FUNCTIONS, SAMPLES } from '../plot/expr.js';
import { PlotEngine } from '../plot/engine.js';
import { exportPNG, exportSVG, exportCSV, exportJSON, readJSONFile, stamp } from '../plot/exporter.js';
import { downloadWorksheet } from '../plot/worksheet.js';
import { PdfDoc } from '../plot/pdf.js';
import { copyShareLink, readShared, encodeState as encodeShare } from '../core/share.js';
import { createTools } from './plotter-tools.js';
import { bindPanels } from './plotter-panel.js';
import { bindPlotterKeys } from './plotter-keys.js';

const VAR_DEFAULTS = { a: 1, b: 1, c: 1, k: 1, m: 1, n: 2, s: 1, u: 1, v: 1, w: 1, h: 1, p: 1, q: 1 };

let state = loadState();
let uid = 1;
/* 比例自适应进行中：此时不要把引擎范围回写成新基准，否则量一次画布就放大一轮 */
let fitting = false;
const nextId = () => 'f' + (uid++);

function defaultState() {
  return {
    view: { xMin: -10, xMax: 10, yMin: -6.5, yMax: 6.5 },
    options: {
      showGrid: true, showMinorGrid: true, showAxes: true, showLabels: true, showLegend: false,
      equalAspect: false, samples: 1600, exportScale: 2, exportBg: 'theme'
    },
    vars: { ...VAR_DEFAULTS },
    /* 默认空白画板：用工具栏的 ✨ 载入示例 */
    functions: []
  };
}

function loadState() {
  const saved = store.load('plotter', null);
  const base = defaultState();
  if (!saved || !Array.isArray(saved.functions)) return base;
  return {
    view: { ...base.view, ...(saved.view || {}) },
    options: { ...base.options, ...(saved.options || {}) },
    vars: { ...base.vars, ...(saved.vars || {}) },
    functions: saved.functions
  };
}

let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.save('plotter', {
      view: state.view,
      options: state.options,
      vars: state.vars,
      functions: state.functions
    });
  }, 400);
}

/* ------------------------------- 引擎与画布 ------------------------------- */
const canvas = $('#plotCanvas');
const stage = $('#stage');
const ctx = canvas.getContext('2d');
const engine = new PlotEngine({ ...state.view, samples: state.options.samples });
engine.setFunctions([]);

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function applyOptions() {
  const o = state.options;
  engine.setOption({
    ...state.view,
    showGrid: o.showGrid, showMinorGrid: o.showMinorGrid, showAxes: o.showAxes,
    showLabels: o.showLabels, showLegend: false, equalAspect: o.equalAspect, samples: o.samples,
    bg: cssVar('--canvas-bg', '#0b0f14'),
    gridMinor: cssVar('--grid-minor', 'rgba(240,246,252,0.05)'),
    gridMajor: cssVar('--grid-major', 'rgba(240,246,252,0.11)'),
    axis: cssVar('--axis', 'rgba(240,246,252,0.42)'),
    label: cssVar('--axis-label', '#8b949e'),
    glow: theme.getKey('glow')
  });
}

let frameHandle = 0;
function requestRender() {
  if (frameHandle) return;
  frameHandle = requestAnimationFrame(() => {
    frameHandle = 0;
    render();
  });
}

function resizeCanvas() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.max(200, Math.round(rect.width || stage.clientWidth || 600));
  /* boot 时布局可能还没算完（尤其手机：侧栏收起会再次改变高度），
     取不到有效高度时用 clientHeight 兜底，并由 scheduleResize 多次重算 */
  const h = Math.max(200, Math.round(rect.height || stage.clientHeight || 400));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  engine.setSize(w, h, dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (state.options.equalAspect) engine.fitAspect();
  applyDefaultAspect();
  requestRender();
}

/* 布局稳定后再量几次：首屏、字体加载完成、侧栏展开/收起之后 */
function scheduleResize() {
  resizeCanvas();
  applyDefaultAspect();
  [60, 200, 600].forEach((ms) => setTimeout(() => { resizeCanvas(); applyDefaultAspect(); requestRender(); }, ms));
}

function render() {
  /* 画布比例变了（手机竖屏 / 旋转屏幕）：在绘制前把 x/y 单位调成一致，
     只用"想要的范围"向外扩展，用户手动改过的范围不干预 */
  if (!state.view.userRange && !state.options.equalAspect) {
    const ratio = engine.width / Math.max(1, engine.height);
    const f = state.view.fittedFor;
    if (ratio > 0 && (!f || Math.abs(f.ratio - ratio) / ratio >= 0.03)) {
      const cur = halfOfView(state.view);
      const bx = Math.min(state.view.baseHalfX || cur.x, cur.x);
      const by = Math.min(state.view.baseHalfY || cur.y, cur.y);
      const cx = cur.cx;
      const cy = cur.cy;
      const halfX = Math.max(bx, by * ratio);
      state.view = {
        xMin: cx - halfX, xMax: cx + halfX,
        yMin: cy - halfX / ratio, yMax: cy + halfX / ratio,
        baseHalfX: bx, baseHalfY: by, fittedFor: { ratio: ratio }
      };
    }
  }
  applyOptions();
  engine.setOption({ ...state.view });
  engine.setFunctions(compiled);
  engine.render(ctx);
  try {
    updateStatus();
  } catch (err) {
    /* 状态栏更新失败不应影响绘图 */
    if (window.console && console.warn) console.warn('updateStatus failed', err);
  }
}

/* ------------------------------- 撤销 / 重做 ------------------------------- */
const undoStack = [];
const redoStack = [];
let lastSnapshotKey = '';
let snapshotTimer = 0;

const opSnapshot = () => JSON.stringify({
  view: state.view,
  options: {
    showGrid: state.options.showGrid, showMinorGrid: state.options.showMinorGrid,
    showAxes: state.options.showAxes, showLabels: state.options.showLabels,
    showLegend: state.options.showLegend, equalAspect: state.options.equalAspect
  },
  vars: state.vars,
  functions: state.functions
});

function pushUndo(force) {
  const snap = opSnapshot();
  if (!force && snap === lastSnapshotKey) return;
  lastSnapshotKey = snap;
  undoStack.push(snap);
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function queueUndo(ms) {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => pushUndo(false), ms || 600);
}

function applySnapshot(snap) {
  try {
    const data = JSON.parse(snap);
    state.view = { ...state.view, ...(data.view || {}) };
    Object.assign(state.options, data.options || {});
    state.vars = { ...state.vars, ...(data.vars || {}) };
    state.functions = data.functions || [];
    lastSnapshotKey = snap;
    renderFnList();
    renderVarPanel();
    recompile();
    syncViewInputs();
    const g = $('#optGrid');
    if (g) {
      g.checked = state.options.showGrid;
      $('#optMinor').checked = state.options.showMinorGrid;
      $('#optAxes').checked = state.options.showAxes;
      $('#optLabels').checked = state.options.showLabels;
    }
    requestRender();
    persist();
  } catch { /* ignore */ }
}

function setTraceX(v) { traceX = v; pinned = false; updateTrace(); }

function undo() {
  if (!undoStack.length) { toast(t('plot.nothingToUndo'), { type: 'info', timeout: 1200 }); return; }
  const cur = opSnapshot();
  applySnapshot(undoStack.pop());
  redoStack.push(cur);
  if (redoStack.length > 60) redoStack.shift();
  updateHistoryButtons();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(opSnapshot());
  applySnapshot(redoStack.pop());
  updateHistoryButtons();
}

function updateHistoryButtons() {
  const u = $('#btnUndo');
  const r = $('#btnRedo');
  if (u) u.disabled = !undoStack.length;
  if (r) r.disabled = !redoStack.length;
}
/* ------------------------------- 函数编译 ------------------------------- */
let compiled = [];
const errors = new Map();

function recompile() {
  compiled = [];
  errors.clear();
  state.functions.forEach((f) => {
    const label = f.label || f.source || t('plot.functions');
    const full = (v) => (Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? v : null);
    if (f.kind === 'points') {
      compiled.push({ id: f.id, kind: 'points', color: f.color, width: f.width, visible: f.visible, points: f.points || [], label, source: label });
      return;
    }
    const res = tryCompile(f.source || '');
    if (res.error) { errors.set(f.id, res.error); return; }
    const scope = { ...state.vars };
    const fn = (scopeObj) => res.fn({ ...scope, ...scopeObj });
    if (f.kind === 'parametric') {
      const res2 = tryCompile(f.source2 || '');
      if (res2.error) { errors.set(f.id, res2.error); return; }
      const fn2 = (scopeObj) => res2.fn({ ...scope, ...scopeObj });
      compiled.push({
        id: f.id, kind: 'parametric', color: f.color, width: f.width, visible: f.visible, label,
        source: f.source + ' ; ' + f.source2,
        param: full(f.param) || [0, Math.PI * 2],
        aspect: !!f.aspect, xDomain: f.xDomain, yDomain: f.yDomain,
        fn, fn2
      });
      return;
    }
    const hasRange = (v) => Array.isArray(v) && (Number.isFinite(v[0]) || Number.isFinite(v[1]));
    const domain = hasRange(f.xDomain) ? f.xDomain : (hasRange(f.domain) ? f.domain : [null, null]);
    compiled.push({
      id: f.id, kind: f.kind, color: f.color, width: f.width, visible: f.visible,
      label, source: f.kind === 'polar' ? 'r=' + f.source : f.source,
      domain,
      yDomain: full(f.yDomain) || undefined,
      aspect: !!f.aspect,
      polar: f.kind === 'polar',
      param: f.kind === 'polar' ? (full(f.param) || [0, Math.PI * 2]) : undefined,
      fn
    });
  });
  /* 参数/极坐标：用参数采样 */
  compiled.forEach((c) => {
    if (c.kind === 'parametric' || c.kind === 'polar') {
      c.sampleFn = (n) => {
        const pts = [];
        const ta = c.param ? c.param[0] : 0;
        const tb = c.param ? c.param[1] : Math.PI * 2;
        for (let i = 0; i <= n; i++) {
          const tt = ta + ((tb - ta) * i) / n;
          if (c.polar) {
            const r = c.fn({ t: tt, theta: tt });
            pts.push({ x: r * Math.cos(tt), y: r * Math.sin(tt), ok: Number.isFinite(r) });
          } else {
            const x = c.fn({ t: tt, theta: tt });
            const y = c.fn2({ t: tt, theta: tt });
            pts.push({ x, y, ok: Number.isFinite(x) && Number.isFinite(y) });
          }
        }
        return pts;
      };
    }
  });
  engine.setFunctions(compiled);
  engine.buildPath = patchedBuildPath.bind(engine);
  afterCompile.forEach((fn) => { try { fn(); } catch (err) { void err; } });
  if (compiled.some((c) => c.aspect && c.visible !== false)) {
    applyAspect();
    engine.setOption({ ...state.view });
  }
  requestRender();
}

/* 参数/极坐标走统一的绘制管线 */
function patchedBuildPath(f, project) {
  if (f.kind === 'parametric' || f.kind === 'polar') {
    const pts = f.sampleFn(Math.min(state.options.samples, 3000));
    const segs = [];
    let cur = [];
    for (const p of pts) {
      if (!p.ok || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        if (cur.length > 1) segs.push(cur);
        cur = [];
        continue;
      }
      cur.push(project(p.x, p.y));
    }
    if (cur.length > 1) segs.push(cur);
    return segs;
  }
  return PlotEngine.prototype.buildPath.call(this, f, project);
}

/* ------------------------------- 函数列表 UI ------------------------------- */
const fnList = $('#fnList');

function modeLabel(kind) { return t('plot.mode.' + kind); }

function numberBox(value, ph, onChange) {
  const inp = el('input', {
    class: 'input input-sm mono', type: 'text', style: { width: '54px', padding: '2px 6px' },
    value: value === null || value === undefined ? '' : String(Number(value.toPrecision(6))),
    placeholder: ph
  });
  inp.addEventListener('change', () => {
    const raw = inp.value.trim();
    if (raw === '') { onChange(null); return; }
    onChange(evalConst(raw));
  });
  return inp;
}

function assign(f, key, index, value) {
  const arr = f[key] ? [...f[key]] : [null, null];
  arr[index] = value;
  if (arr[0] === null && arr[1] === null) delete f[key];
  else f[key] = arr;
  recompile();
  persist();
}

function evalConst(raw) {
  const res = tryCompile(raw);
  if (res.error) return null;
  const v = res.fn({ pi: Math.PI, e: Math.E, tau: Math.PI * 2, theta: 0, x: 0, t: 0, ...state.vars });
  return Number.isFinite(v) ? v : null;
}

function toHex(c) {
  if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) return c;
  return theme.toHex(c, '#3fb950');
}

function paramInputs(f, key, fallback, prefix) {
  const wrap = el('span', { class: 'fn-mini' });
  if (prefix) wrap.appendChild(el('span', { class: 'text-dim', text: prefix + ' ' }));
  const vals = f[key] || fallback;
  const mk = (i, ph) => {
    const inp = el('input', { type: 'text', value: vals[i] === null || vals[i] === undefined ? '' : String(vals[i]), placeholder: ph });
    inp.addEventListener('input', () => {
      const raw = inp.value.trim();
      const num = raw === '' ? null : Number(raw);
      const arr = f[key] ? [...f[key]] : [...fallback];
      arr[i] = Number.isFinite(num) ? num : (raw.includes('pi') ? evalConst(raw) : null);
      f[key] = arr;
      recompile();
      persist();
      queueUndo(700);
    });
    return inp;
  };
  wrap.appendChild(mk(0, 'min'));
  wrap.appendChild(el('span', { class: 'text-dim', text: '~' }));
  wrap.appendChild(mk(1, 'max'));
  return wrap;
}

/* 函数卡片：颜色 / 表达式 / 模式 / 线宽 / 单条范围 / 1:1 */
function renderFnList() {
  fnList.innerHTML = '';
  state.functions.forEach((f, index) => {
    const card = el('div', {
      class: 'fn-card' + (errors.has(f.id) ? ' invalid' : ''),
      dataset: { id: f.id, index: String(index) },
      draggable: 'true'
    });

    const top = el('div', { class: 'fn-top' });
    top.appendChild(el('span', { class: 'handle', html: icon('layers', { size: 14 }), title: 'drag' }));
    top.appendChild(el('input', {
      type: 'color', value: toHex(f.color), 'aria-label': t('common.color'),
      oninput: (e) => { f.color = e.target.value; recompile(); persist(); queueUndo(500); }
    }));
    const expr = el('input', {
      class: 'fn-expr', type: 'text', value: f.kind === 'points' ? (f.label || 'points') : (f.source || ''),
      placeholder: f.kind === 'points' ? 'x,y' : 'sin(x)', spellcheck: 'false',
      disabled: f.kind === 'points'
    });
    expr.addEventListener('input', () => { f.source = expr.value; recompile(); persist(); queueUndo(700); });
    expr.addEventListener('focus', () => pushUndo(false));
    top.appendChild(expr);
    top.appendChild(el('button', {
      class: 'btn-icon btn-sm', type: 'button', title: t('common.visible'),
      html: icon(f.visible === false ? 'eyeOff' : 'eye', { size: 15 }),
      onclick: (e) => {
        pushUndo(true);
        f.visible = f.visible === false;
        e.currentTarget.innerHTML = icon(f.visible === false ? 'eyeOff' : 'eye', { size: 15 });
        recompile(); persist();
      }
    }));
    top.appendChild(el('button', {
      class: 'btn-icon btn-sm', type: 'button', title: t('common.delete'), html: icon('trash', { size: 15 }),
      onclick: () => {
        pushUndo(true);
        state.functions = state.functions.filter((x) => x.id !== f.id);
        renderFnList(); recompile(); persist();
      }
    }));
    card.appendChild(top);

    const sub = el('div', { class: 'fn-sub' });
    const kindSel = el('select', { class: 'select input-sm', style: { width: 'auto', padding: '3px 26px 3px 8px', fontSize: 'var(--fs-xs)' } },
      ['cartesian', 'parametric', 'polar', 'points'].map((k) => el('option', { value: k, selected: f.kind === k, text: modeLabel(k) })));
    kindSel.addEventListener('change', () => {
      pushUndo(true);
      f.kind = kindSel.value;
      if (f.kind === 'parametric') { f.source = f.source && f.source.includes('t') ? f.source : 'cos(t)'; f.source2 = f.source2 || 'sin(t)'; }
      if (f.kind === 'polar') f.source = f.source && f.source.includes('t') ? f.source : '1+cos(t)';
      if (f.kind === 'points' && !f.points) f.points = [];
      renderFnList(); recompile(); persist();
    });
    sub.appendChild(kindSel);

    if (f.kind === 'parametric') {
      const e2 = el('input', { class: 'fn-expr', type: 'text', value: f.source2 || '', placeholder: 'y(t)', spellcheck: 'false', style: { maxWidth: '120px' } });
      e2.addEventListener('input', () => { f.source2 = e2.value; recompile(); persist(); queueUndo(700); });
      sub.appendChild(e2);
      sub.appendChild(paramInputs(f, 'param', [0, Math.PI * 2]));
    } else if (f.kind === 'polar') {
      sub.appendChild(paramInputs(f, 'param', [0, Math.PI * 2]));
    }

    const width = el('input', { type: 'range', min: '0.5', max: '6', step: '0.1', value: f.width || 2, style: { maxWidth: '74px' } });
    width.addEventListener('input', () => { f.width = Number(width.value); recompile(); persist(); queueUndo(700); });
    sub.appendChild(el('span', { class: 'fn-mini' }, [el('span', { text: t('common.width') }), width]));
    card.appendChild(sub);

    /* 单条曲线的显示范围 + 1:1 */
    const scope = el('div', { class: 'fn-scope' });
    const isCurve = f.kind === 'cartesian' || f.kind === 'parametric' || f.kind === 'polar';
    if (isCurve) {
      const xr = f.xDomain || [null, null];
      const yr = f.yDomain || [null, null];
      scope.appendChild(el('div', { class: 'scope-row' }, [
        el('span', { class: 'text-dim', text: 'x ∈' }),
        numberBox(xr[0], '', (v) => assign(f, 'xDomain', 0, v)),
        el('span', { class: 'text-dim', text: '~' }),
        numberBox(xr[1], '', (v) => assign(f, 'xDomain', 1, v))
      ]));
      if (f.kind === 'cartesian') {
        scope.appendChild(el('div', { class: 'scope-row' }, [
          el('span', { class: 'text-dim', text: 'y ∈' }),
          numberBox(yr[0], '', (v) => assign(f, 'yDomain', 0, v)),
          el('span', { class: 'text-dim', text: '~' }),
          numberBox(yr[1], '', (v) => assign(f, 'yDomain', 1, v))
        ]));
      }
      scope.appendChild(el('button', {
        class: 'btn-icon btn-sm hint', type: 'button',
        dataset: { hint: t('plot.fitThis') },
        html: icon('target', { size: 13 }),
        onclick: () => {
          pushUndo(true);
          delete f.xDomain;
          delete f.yDomain;
          if (f.kind === 'cartesian') {
            const fit = fitDomainFor(f);
            f.xDomain = fit.x;
            f.yDomain = fit.y;
          } else {
            const pts = f.sampleFn ? f.sampleFn(600) : [];
            const ok = pts.filter((p) => p.ok);
            if (ok.length) {
              const xs = ok.map((p) => p.x), ys = ok.map((p) => p.y);
              f.xDomain = [Math.min(...xs), Math.max(...xs)];
              f.yDomain = [Math.min(...ys), Math.max(...ys)];
            }
          }
          renderFnList(); recompile(); persist();
        }
      }));
    }
    card.appendChild(scope);

    const bottom = el('div', { class: 'fn-sub' });
    const aspectCb = el('input', {
      type: 'checkbox', checked: !!f.aspect,
      onchange: (e) => {
        pushUndo(true);
        f.aspect = !!e.target.checked;
        recompile(); renderFnList(); persist();
      }
    });
    bottom.appendChild(el('label', { class: 'checkbox fn-mini' }, [aspectCb, el('span', { text: t('plot.aspect11') })]));
    if (f.aspect) bottom.appendChild(el('span', { class: 'badge badge-accent', text: '1:1' }));
    card.appendChild(bottom);

    const err = errors.get(f.id);
    if (err) card.appendChild(el('div', { class: 'fn-err', text: err }));
    fnList.appendChild(card);
  });

  $('#fnCount').textContent = String(state.functions.length);
  if (!state.functions.length) {
    fnList.appendChild(el('div', { class: 'empty' }, [
      el('span', { html: icon('function', { size: 26 }) }),
      el('span', { text: t('plot.emptyTitle') }),
      el('span', { class: 'text-xs text-dim', text: t('plot.emptyHint') }),
      el('div', { class: 'row-inline' }, [
        el('button', { class: 'btn btn-sm btn-primary', type: 'button', text: t('plot.addFirst'), onclick: () => $('#btnAddFn').click() }),
        el('button', { class: 'btn btn-sm', type: 'button', text: t('plot.preset'), onclick: () => presetMenu() })
      ])
    ]));
  }

  /* 拖拽排序 + 选中 + 双击编辑 */
  fnList.querySelectorAll('.fn-card').forEach((card) => {
    card.addEventListener('click', () => {
      fnList.querySelectorAll('.fn-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
    });
    card.addEventListener('dblclick', (e) => {
      if (e.target.closest('input, select, button, label')) return;
      const box = card.querySelector('.fn-expr');
      box?.focus();
      box?.select?.();
    });
    card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', card.dataset.id); card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drop-target'); });
    card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drop-target');
      const fromId = e.dataTransfer.getData('text/plain');
      const fromIdx = state.functions.findIndex((x) => x.id === fromId);
      const toIdx = state.functions.findIndex((x) => x.id === card.dataset.id);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
      pushUndo(true);
      const [moved] = state.functions.splice(fromIdx, 1);
      state.functions.splice(toIdx, 0, moved);
      const prevTop = card.getBoundingClientRect().top;
      renderFnList(); recompile(); persist();
      /* 轻微动效：让被拖动的那张卡片闪一下，确认排序生效 */
      const moved2 = fnList.querySelector('[data-id="' + moved.id + '"]');
      if (moved2) {
        moved2.animate?.(
          [{ transform: 'translateY(-6px)', opacity: 0.6 }, { transform: 'none', opacity: 1 }],
          { duration: 240, easing: 'cubic-bezier(0.22,1,0.36,1)' }
        );
        void prevTop;
      }
    });
  });
}

/* 某条曲线自适应范围 */
function fitDomainFor(f) {
  const pts = engine.sampleCurve(f, 1200).filter((p) => p.ok);
  if (!pts.length) return { x: [null, null], y: [null, null] };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const padX = (Math.max(...xs) - Math.min(...xs)) * 0.06 || 1;
  const padY = (Math.max(...ys) - Math.min(...ys)) * 0.12 || 1;
  return { x: [Math.min(...xs) - padX, Math.max(...xs) + padX], y: [Math.min(...ys) - padY, Math.max(...ys) + padY] };
}

/* 1:1 等比例：按勾选的曲线撑开视图 */
/* 比例自适应：让 x/y 单位长度一致（否则竖屏上圆会变椭圆、曲线看着"被拉长"）。
   策略：以"想要的视图"为基准，只向外扩展（绝不收缩，避免反复重置吃掉用户的缩放），
   用户一旦手动改范围或点了"适应内容"就交由用户接管。 */
const DEFAULT_HALF = { x: 10, y: 6.5 };

/* 从任意 view 里算半个宽/高（默认值兜底） */
function halfOfView(v) {
  const x = (v.xMax - v.xMin) / 2;
  const y = (v.yMax - v.yMin) / 2;
  if (Number.isFinite(x) && x > 0 && Number.isFinite(y) && y > 0) {
    return { x: x, y: y, cx: (v.xMin + v.xMax) / 2, cy: (v.yMin + v.yMax) / 2 };
  }
  return { x: 10, y: 6.5, cx: 0, cy: 0 };
}

function baseHalf() {
  if (state.view.baseHalfX) return { x: state.view.baseHalfX, y: state.view.baseHalfY };
  /* 没记过基准：用当前视图范围当基准（用户可能是从分享链接进来的） */
  const h = halfOfView(state.view);
  return { x: h.x, y: h.y };
}

function applyDefaultAspect() {
  if (state.view.userRange) return;
  if (state.options.equalAspect) return;
  const ratio = engine.width / Math.max(1, engine.height);
  if (!Number.isFinite(ratio) || ratio <= 0) return;
  const fitted = state.view.fittedFor;
  if (fitted && Math.abs(fitted.ratio - ratio) / ratio < 0.03) return;
  const base = baseHalf();
  /* 完全按"想要的范围"重算（不要拿当前已放大的范围再去放大，否则会指数级膨胀） */
  const halfX = Math.max(base.x, base.y * ratio);
  const halfY = halfX / ratio;
  const cx = (state.view.xMin + state.view.xMax) / 2;
  const cy = (state.view.yMin + state.view.yMax) / 2;
  state.view = {
    xMin: cx - halfX, xMax: cx + halfX,
    yMin: cy - halfY, yMax: cy + halfY,
    baseHalfX: base.x, baseHalfY: base.y,
    fittedFor: { ratio }
  };
  engine.setOption({ ...state.view });
  fitting = true;
  syncViewInputs();
  fitting = false;
}

function applyAspect() {
  const list = compiled.filter((c) => c.aspect && c.visible !== false);
  if (!list.length) return;
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const f of list) {
    const fd = deriveAspectDomain(f);
    const full = (v) => (Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? v : null);
    const vx = full(f.xDomain) || [state.view.xMin, state.view.xMax];
    const vy = full(f.yDomain) || [fd.y0, fd.y1];
    xMin = Math.min(xMin, vx[0]); xMax = Math.max(xMax, vx[1]);
    yMin = Math.min(yMin, vy[0]); yMax = Math.max(yMax, vy[1]);
  }
  if (!Number.isFinite(xMin)) return;
  const ratio = engine.width / Math.max(1, engine.height);
  const cx = (xMin + xMax) / 2, cy = (yMin + yMax) / 2;
  const halfX = Math.max((xMax - xMin) / 2, ((yMax - yMin) / 2) * ratio) * 1.04;
  state.view = { xMin: cx - halfX, xMax: cx + halfX, yMin: cy - halfX / ratio, yMax: cy + halfX / ratio };
  syncViewInputs();
}

function deriveAspectDomain(f) {
  const x0 = Array.isArray(f.xDomain) && Number.isFinite(f.xDomain[0]) ? f.xDomain[0] : engine.o.xMin;
  const x1 = Array.isArray(f.xDomain) && Number.isFinite(f.xDomain[1]) ? f.xDomain[1] : engine.o.xMax;
  const pts = engine.sampleCurve({ ...f, domain: [x0, x1] }, 600).filter((p) => p.ok);
  if (!pts.length) return { y0: -5, y1: 5 };
  const ys = pts.map((p) => p.y);
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.1 || 1;
  return { y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad };
}
/* ------------------------------- 变量滑杆 ------------------------------- */
function usedVars() {
  const used = new Set();
  state.functions.forEach((f) => {
    [f.source, f.source2].forEach((src) => {
      if (!src) return;
      const res = tryCompile(src);
      if (!res.error) res.vars.forEach((v) => {
        if (!['x', 'y', 't', 'theta', 'r'].includes(v) && !(v in VAR_DEFAULTS)) used.add(v);
        if (v in VAR_DEFAULTS) used.add(v);
      });
    });
  });
  return [...used].sort();
}

function renderVarPanel() {
  const host = $('#varPanel');
  if (!host) return;
  const vars = usedVars();
  host.innerHTML = '';
  if (!vars.length) {
    host.appendChild(el('p', { class: 'text-xs text-dim', text: getLang() === 'zh' ? '在表达式中使用 a、b、k 等字母即可出现滑杆' : 'Use letters like a, b, k in expressions to get sliders' }));
    return;
  }
  vars.forEach((name) => {
    const val = state.vars[name] ?? 1;
    const row = el('div', { class: 'var-row' }, [
      el('span', { class: 'vname', text: name }),
      el('input', {
        type: 'range', min: '-5', max: '5', step: '0.01', value: String(val),
        oninput: (e) => {
          state.vars[name] = Number(e.target.value);
          row.querySelector('.vval').textContent = fmt(state.vars[name], 3);
          recompile(); persist(); queueUndo(800);
        }
      }),
      el('span', { class: 'vval', text: fmt(val, 3) })
    ]);
    host.appendChild(row);
  });
}

/* ------------------------------- 交互 ------------------------------- */
let dragging = false;
let lastPt = null;
let traceX = null;
let pinned = false;

on(canvas, 'wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  engine.zoomAt(e.clientX - rect.left, e.clientY - rect.top, clamp(Math.pow(1.0016, e.deltaY), 0.2, 5));
  syncViewInputs();
  persist();
  requestRender();
}, { passive: false });

/* 触屏双指：捏合缩放 + 双指拖动平移 */
const touchPts = new Map();
let pinch = null;

function touchInfo() {
  const pts = [...touchPts.values()];
  let dist = 0;
  let cx = 0;
  let cy = 0;
  if (pts.length >= 2) {
    dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    cx = (pts[0].x + pts[1].x) / 2;
    cy = (pts[0].y + pts[1].y) / 2;
  }
  return { count: pts.length, dist, cx, cy };
}

on(canvas, 'pointerdown', (e) => {
  if (e.pointerType === 'touch') {
    const rect = canvas.getBoundingClientRect();
    touchPts.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    const info = touchInfo();
    if (info.count >= 2) {
      pinch = { dist: info.dist, cx: info.cx, cy: info.cy };
      dragging = false;
      canvas.style.cursor = 'grabbing';
      return;
    }
  }
  if (e.button !== 0) return;
  dragging = true;
  lastPt = { x: e.clientX, y: e.clientY };
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { void err; }
  canvas.style.cursor = 'grabbing';
});

on(canvas, 'pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  if (e.pointerType === 'touch' && touchPts.has(e.pointerId)) {
    touchPts.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    const info = touchInfo();
    if (pinch && info.count >= 2 && info.dist > 0) {
      engine.zoomAt(info.cx, info.cy, clamp(pinch.dist / info.dist, 0.4, 2.5));
      engine.panByPx(info.cx - pinch.cx, info.cy - pinch.cy);
      pinch = { dist: info.dist, cx: info.cx, cy: info.cy };
      syncViewInputs();
      persist();
      requestRender();
      return;
    }
  }
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const x = engine.pxToX(px);
  const y = engine.pxToY(py);
  const cur = $('#hudCursor');
  if (cur) cur.innerHTML = 'x <b>' + fmt(x, 4) + '</b> , y <b>' + fmt(y, 4) + '</b>';
  const pos = $('#statusPos');
  if (pos) pos.textContent = 'x=' + fmt(x, 4) + '  y=' + fmt(y, 4);

  if (dragging && lastPt) {
    engine.panByPx(e.clientX - lastPt.x, e.clientY - lastPt.y);
    lastPt = { x: e.clientX, y: e.clientY };
    syncViewInputs();
    persist();
    requestRender();
    return;
  }
  if (state.options.traceEnabled && !pinned) {
    traceX = x;
    updateTrace();
  }
});

on(window, 'pointerup', (e) => {
  if (e && e.pointerType === 'touch') {
    touchPts.delete(e.pointerId);
    if (touchPts.size < 2) pinch = null;
  }
  dragging = false;
  lastPt = null;
  canvas.style.cursor = state.options.traceEnabled ? 'crosshair' : 'grab';
});
on(window, 'pointercancel', (e) => {
  if (e && e.pointerType === 'touch') { touchPts.delete(e.pointerId); pinch = null; }
});

on(canvas, 'pointerleave', () => {
  if (!pinned) { traceX = null; updateTrace(); }
});

on(canvas, 'click', (e) => {
  if (!state.options.traceEnabled) return;
  pinned = !pinned;
  toast(pinned ? t('plot.pinned') : t('plot.unpinned'), { type: 'info', timeout: 1400 });
  if (pinned) {
    const rect = canvas.getBoundingClientRect();
    traceX = engine.pxToX(e.clientX - rect.left);
  }
  updateTrace();
});

on(canvas, 'dblclick', () => resetView());

function activeFnId() {
  const sel = fnList.querySelector('.fn-card.selected');
  if (sel) return sel.dataset.id;
  const first = state.functions.find((f) => f.visible !== false);
  return first ? first.id : (state.functions[0] ? state.functions[0].id : null);
}

function updateTrace() {
  engine.o.trace = { enabled: !!state.options.traceEnabled, x: traceX, pinned, fnId: activeFnId() };
  engine.o.tangent = { enabled: !!state.options.tangent };
  const hud = $('#hudFn');
  if (hud) {
    if (traceX !== null && Number.isFinite(traceX)) {
      const f = compiled.find((c) => c.id === activeFnId()) || compiled.find((c) => c.visible !== false);
      if (f && f.kind === 'cartesian') {
        const y = engine.evalFn(f, traceX);
        const d = engine.derivatives(f, traceX);
        hud.innerHTML = 'f(x) <b>' + fmt(y, 5) + '</b>' + (state.options.tangent ? "  f'(x) <b>" + fmt(d.d1, 5) + '</b>' : '');
      } else if (f) {
        hud.innerHTML = '<b>' + (f.label || '') + '</b>';
      }
    } else {
      hud.innerHTML = '';
    }
  }
  requestRender();
}

/* ------------------------------- 视图同步 ------------------------------- */
function round(v) { return Number(v.toPrecision(6)); }

function syncViewInputs() {
  if (fitting) {
    updateStatus();
    return;
  }
  const ratio = engine.width / Math.max(1, engine.height);
  /* 如果是比例自适应刚刚设定的范围（fittedFor.ratio 与当前一致），
     不要把放大的范围当成新的"基准"，否则每次重算都会越放越大 */
  const wasAutoFit = state.view.fittedFor && Math.abs(state.view.fittedFor.ratio - ratio) / ratio < 0.03;
  /* 把引擎里的实际范围写回 state.view（否则 render() 会用旧范围把它覆盖掉） */
  state.view = {
    xMin: engine.o.xMin, xMax: engine.o.xMax, yMin: engine.o.yMin, yMax: engine.o.yMax,
    userRange: state.view.userRange,
    baseHalfX: wasAutoFit ? state.view.baseHalfX : (engine.o.xMax - engine.o.xMin) / 2,
    baseHalfY: wasAutoFit ? state.view.baseHalfY : (engine.o.yMax - engine.o.yMin) / 2,
    fittedFor: state.view.fittedFor
  };
  updateStatus();
  const xi = $('#xMin');
  if (xi && document.activeElement !== xi) xi.value = String(round(engine.o.xMin));
  if (document.activeElement !== $('#xMax')) $('#xMax').value = String(round(engine.o.xMax));
  if (document.activeElement !== $('#yMin')) $('#yMin').value = String(round(engine.o.yMin));
  if (document.activeElement !== $('#yMax')) $('#yMax').value = String(round(engine.o.yMax));
}

function readViewInputs() {
  const v = {
    xMin: Number($('#xMin').value), xMax: Number($('#xMax').value),
    yMin: Number($('#yMin').value), yMax: Number($('#yMax').value)
  };
  if (!Number.isFinite(v.xMin) || !Number.isFinite(v.xMax) || v.xMax <= v.xMin) return false;
  if (!Number.isFinite(v.yMin) || !Number.isFinite(v.yMax) || v.yMax <= v.yMin) return false;
  pushUndo(true);
  state.view = {
    ...v, userRange: true, fittedFor: null,
    baseHalfX: (v.xMax - v.xMin) / 2,
    baseHalfY: (v.yMax - v.yMin) / 2
  };
  requestRender(); persist();
  return true;
}

function resetView() {
  pushUndo(true);
  state.view = { xMin: -10, xMax: 10, yMin: -6.5, yMax: 6.5, baseHalfX: 10, baseHalfY: 6.5, fittedFor: null };
  applyDefaultAspect();
  if (state.options.equalAspect) engine.fitAspect();
  syncViewInputs(); requestRender(); persist();
  toast(t('plot.resetView'), { type: 'info', timeout: 1200 });
}

function fitView() {
  const fns = compiled.filter((f) => f.visible !== false);
  if (!fns.length) { resetView(); return; }
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  const project = (x, y) => {
    if (Number.isFinite(x)) { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); }
    if (Number.isFinite(y)) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
  };
  for (const f of fns) {
    if (f.kind === 'points') {
      (f.points || []).forEach((p) => project(p.x, p.y));
    } else if (f.kind === 'parametric' || f.kind === 'polar') {
      f.sampleFn(800).forEach((p) => { if (p.ok) project(p.x, p.y); });
    } else {
      engine.sampleCurve(f, 1200).forEach((p) => { if (p.ok) project(p.x, p.y); });
    }
  }
  if (!Number.isFinite(xMin) || xMin === xMax) { resetView(); return; }
  pushUndo(true);
  const padX = (xMax - xMin) * 0.08 || 1;
  const padY = (yMax - yMin) * 0.12 || 1;
  state.view = {
    xMin: xMin - padX, xMax: xMax + padX, yMin: yMin - padY, yMax: yMax + padY,
    baseHalfX: (xMax - xMin) / 2 + padX, baseHalfY: (yMax - yMin) / 2 + padY,
    fittedFor: null
  };
  if (state.options.equalAspect) engine.fitAspect();
  syncViewInputs(); requestRender(); persist();
  toast(t('plot.zoomed'), { type: 'info', timeout: 1200 });
}

/* HTM 图例 */
function renderLegend() {
  let host = $('#canvasLegend');
  if (!host) {
    host = el('div', { class: 'canvas-legend', id: 'canvasLegend' });
    stage.appendChild(host);
  }
  const show = !!state.options.showLegend;
  host.hidden = !show;
  if (!show) return;
  const items = state.functions.filter((f) => f.visible !== false);
  host.innerHTML = '';
  if (!items.length) { host.innerHTML = '<div class="lg-empty">' + t('plot.emptyTitle') + '</div>'; return; }
  items.forEach((f) => {
    host.appendChild(el('div', { class: 'lg-row' }, [
      el('i', { style: { background: toHex(f.color) } }),
      el('span', { class: 'mono', text: f.kind === 'polar' ? 'r=' + (f.source || '') : (f.source || '') })
    ]));
  });
}

function updateStatus() {
  const o = engine.o;
  const view = $('#statusView');
  if (view) view.textContent = 'x ∈ [' + round(o.xMin) + ', ' + round(o.xMax) + ']  y ∈ [' + round(o.yMin) + ', ' + round(o.yMax) + ']';
  const fn = $('#statusFn');
  if (fn) {
    const bad = errors.size;
    fn.textContent = bad ? t('plot.invalid') + ' ×' + bad : state.functions.length + ' ' + t('plot.functions');
  }
  const zoom = $('#hudZoom');
  if (zoom) zoom.textContent = '1 : ' + fmt((o.xMax - o.xMin) / engine.width, 3);
  renderLegend();
}
/* ------------------------------- 示例与语法帮助 ------------------------------- */
const PRESETS = [
  { zh: '正弦与余弦', en: 'Sine & cosine', fns: [{ k: 'cartesian', s: 'sin(x)' }, { k: 'cartesian', s: 'cos(x)' }], view: { xMin: -6.5, xMax: 6.5, yMin: -2, yMax: 2 } },
  { zh: '阻尼振动', en: 'Damped wave', fns: [{ k: 'cartesian', s: 'e^(-x/4)*sin(3x)' }], view: { xMin: -0.5, xMax: 12, yMin: -1.2, yMax: 1.2 } },
  { zh: '心形线（极坐标）', en: 'Cardioid (polar)', fns: [{ k: 'polar', s: '1-cos(t)' }], view: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 } },
  { zh: '玫瑰线', en: 'Rose curve', fns: [{ k: 'polar', s: '3*cos(4t)' }], view: { xMin: -3.5, xMax: 3.5, yMin: -3.5, yMax: 3.5 } },
  { zh: '利萨如曲线', en: 'Lissajous', fns: [{ k: 'parametric', s: '3sin(3t)', s2: '3sin(4t)' }], view: { xMin: -4, xMax: 4, yMin: -4, yMax: 4 } },
  { zh: '正态分布', en: 'Gaussian', fns: [{ k: 'cartesian', s: 'e^(-x^2/2)/sqrt(2pi)' }], view: { xMin: -4, xMax: 4, yMin: -0.1, yMax: 0.5 } },
  { zh: '双曲与对数', en: 'Hyperbola & log', fns: [{ k: 'cartesian', s: '1/x' }, { k: 'cartesian', s: 'ln(abs(x))' }], view: { xMin: -8, xMax: 8, yMin: -6, yMax: 6 } }
];

function loadProject(data) {
  if (!data || !Array.isArray(data.functions)) { toast(t('settings.importFailed'), { type: 'err' }); return; }
  state.functions = data.functions.map((f, i) => ({
    id: nextId(), kind: f.kind || 'cartesian', source: f.source || '',
    source2: f.source2, color: f.color || theme.curveColor(i), width: f.width || 2,
    visible: f.visible !== false, domain: f.domain || [null, null], points: f.points,
    label: f.label, param: f.param, xDomain: f.xDomain, yDomain: f.yDomain, aspect: f.aspect
  }));
  if (data.view) state.view = { ...state.view, ...data.view };
  renderFnList(); recompile(); syncViewInputs(); requestRender(); persist();
  toast(t('common.load') + ': ' + data.functions.length, { type: 'ok' });
}

function sharePayload() {
  return {
    v: 1,
    view: state.view,
    options: {
      showGrid: state.options.showGrid, showMinorGrid: state.options.showMinorGrid,
      showAxes: state.options.showAxes, showLabels: state.options.showLabels,
      showLegend: state.options.showLegend, equalAspect: state.options.equalAspect,
      samples: state.options.samples
    },
    vars: state.vars,
    functions: state.functions
  };
}

function applyPayload(data) {
  if (!data || !Array.isArray(data.functions)) return false;
  state.view = { ...state.view, ...(data.view || {}) };
  Object.assign(state.options, data.options || {});
  state.vars = { ...state.vars, ...(data.vars || {}) };
  state.functions = data.functions.map((f) => ({ ...f, id: f.id || nextId() }));
  return true;
}function presetMenu() {
  const body = el('div', { class: 'list' });
  PRESETS.forEach((p) => {
    body.appendChild(el('button', {
      class: 'btn btn-sm', type: 'button', style: { justifyContent: 'flex-start' },
      text: getLang() === 'zh' ? p.zh : p.en,
      onclick: () => {
        pushUndo(true);
        state.functions = p.fns.map((f, i) => ({
          id: nextId(), kind: f.k, source: f.s, source2: f.s2, color: theme.curveColor(i),
          width: 2.2, visible: true, domain: [null, null],
          param: (f.k === 'polar' || f.k === 'parametric') ? [0, Math.PI * 2] : undefined
        }));
        state.view = { ...state.view, ...p.view };
        if (state.options.equalAspect) engine.fitAspect();
        renderFnList(); recompile(); syncViewInputs(); requestRender(); persist();
        m.close();
      }
    }));
  });
  const m = modal({ title: t('plot.preset'), body });
}

function syntaxModal() {
  const fnNames = Object.keys(FUNCTIONS).sort();
  const examples = SAMPLES[getLang()] || SAMPLES.en;
  const body =
    '<div><h4>' + t('help.functions') + '</h4><div class="syntax-grid" style="margin-top:8px">' +
    fnNames.map((n) => '<code data-copy="' + n + '">' + n + '</code>').join('') + '</div></div>' +
    '<div class="mt-4"><h4>' + t('common.example') + '</h4><div class="syntax-grid" style="margin-top:8px">' +
    examples.map((e) => '<code data-copy="' + e.replace(/"/g, '&quot;') + '">' + e + '</code>').join('') + '</div>' +
    '<p class="text-xs text-dim mt-2">' + t('help.clickToCopy') + '</p></div>';
  const m = modal({ title: t('help.syntax'), body, wide: true });
  m.body.addEventListener('click', async (e) => {
    const code = e.target.closest('code[data-copy]');
    if (!code) return;
    await copyText(code.dataset.copy);
    toast(t('common.copied') + ': ' + code.dataset.copy, { type: 'ok', timeout: 1400 });
  });
}

function initResizer() {
  const rz = $('#resizerLeft');
  const side = $('#sideLeft');
  if (!rz || !side) return;
  let active = false;
  rz.addEventListener('pointerdown', (e) => { active = true; rz.classList.add('dragging'); rz.setPointerCapture(e.pointerId); });
  rz.addEventListener('pointermove', (e) => {
    if (!active) return;
    const w = clamp(e.clientX, 240, 560);
    side.style.width = w + 'px';
    store.save('plotterSideW', w);
    resizeCanvas();
  });
  rz.addEventListener('pointerup', () => { active = false; rz.classList.remove('dragging'); });
  const savedW = store.load('plotterSideW', null);
  if (savedW) side.style.width = clamp(Number(savedW), 240, 560) + 'px';
}/* ------------------------------- 启动 ------------------------------- */
const history = { undo: [], redo: [] };
let plotTools = null;
const afterCompile = [];
/* ------------------------------- 启动 ------------------------------- */
function boot() {
  initChrome('plotter');
  applyOptions();
  plotTools = createTools({
    engine: engine,
    state: state,
    getCompiled: () => compiled,
    activeFnId: activeFnId,
    requestRender: requestRender,
    pushUndo: pushUndo,
    toHex: toHex
  });

  const shared = readShared();
  if (shared) {
    if (applyPayload(shared)) setTimeout(() => toast(t('share.loaded'), { type: 'ok', timeout: 2600 }), 400);
    else toast(t('share.failed'), { type: 'warn' });
  }

  renderFnList();
  renderVarPanel();
  recompile();
  bindPanels({
    state: state, engine: engine, canvas: canvas, tools: plotTools,
    pushUndo: pushUndo, renderFnList: renderFnList, recompile: recompile, persist: persist,
    applyOptions: applyOptions, requestRender: requestRender, renderLegend: renderLegend,
    updateTrace: updateTrace, loadProject: loadProject, sharePayload: sharePayload,
    copyShareLink: copyShareLink, encodeShare: encodeShare, presetMenu: presetMenu,
    syntaxModal: syntaxModal, syncViewInputs: syncViewInputs, resizeCanvas: resizeCanvas,
    readViewInputs: readViewInputs, fitView: fitView, resetView: resetView,
    nextId: nextId, curveColor: theme.curveColor, setTraceX: setTraceX,
    getCompiled: () => compiled,
    onCompiled: (fn) => { afterCompile.push(fn); }
  });
  syncViewInputs();

  engine.o.trace = { enabled: !!state.options.traceEnabled, x: null, pinned: false };
  engine.o.tangent = { enabled: !!state.options.tangent };
  canvas.style.cursor = state.options.traceEnabled ? 'crosshair' : 'grab';
  if ($('#hudHint')) $('#hudHint').style.display = state.options.traceEnabled ? '' : 'none';

  scheduleResize();
  requestRender();
  initReveal();
  window.addEventListener('resize', debounce(scheduleResize, 120));
  window.addEventListener('bzm:themechange', () => { applyOptions(); requestRender(); });
  theme.subscribe(() => { applyOptions(); requestRender(); });

  /* 列表头：撤销 / 重做 / 示例 / 语法 */
  const head = $('#fnList').closest('.app-side').querySelector('.plot-side-head');
  if (head && !$('#btnUndo')) {
    const row = head.querySelector('.row');
    const undoBtn = el('button', { class: 'btn-icon btn-sm hint', type: 'button', id: 'btnUndo', dataset: { hint: t('geo.undo') + ' Ctrl+Z' }, html: icon('undo', { size: 15 }), onclick: undo });
    const redoBtn = el('button', { class: 'btn-icon btn-sm hint', type: 'button', id: 'btnRedo', dataset: { hint: t('geo.redo') + ' Ctrl+Shift+Z' }, html: icon('redo', { size: 15 }), onclick: redo });
    if (row) { row.insertBefore(redoBtn, row.firstChild); row.insertBefore(undoBtn, redoBtn); }
    head.appendChild(el('button', { class: 'btn-icon btn-sm hint', type: 'button', dataset: { hint: t('plot.preset') }, html: icon('sparkle', { size: 15 }), onclick: presetMenu }));
    head.appendChild(el('button', { class: 'btn-icon btn-sm hint', type: 'button', dataset: { hint: t('help.syntax') }, html: icon('help', { size: 15 }), onclick: syntaxModal }));
    /* 按点拟合：主入口（另一个在"分析工具"面板里，编号 btnFitPoints）
       侧栏标题栏很窄，这里只放图标 + 悬浮提示，避免被裁切 */
    head.appendChild(el('button', {
      class: 'btn-icon btn-sm hint accent-ico', type: 'button', id: 'btnFitPointsTop',
      dataset: { hint: t('ana.fitPoints') + ' (P)' },
      html: icon('trending', { size: 15 }),
      onclick: () => { const b = document.getElementById('btnFitPoints'); if (b) b.click(); }
    }));
  }
  updateHistoryButtons();

  bindPlotterKeys({
    undo: undo, redo: redo, resetView: resetView, fitView: fitView,
    syntaxModal: syntaxModal, exportPdf: () => plotTools.exportPdf(),
    fitPoints: () => { const b = document.getElementById('btnFitPoints'); if (b) b.click(); }
  });

  pushUndo(true);

  /* 手机上侧栏默认收起，顶栏留一颗展开按钮 */
  mountMobilePanelToggle('#sideLeft', 'sliders', () => t('plot.functions'), scheduleResize);
}

boot();
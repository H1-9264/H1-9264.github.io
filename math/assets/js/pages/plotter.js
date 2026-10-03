/* plotter.js — 函数绘图器页面逻辑（多曲线 / 参数 / 极坐标 / 数据点 / 分析与导出） */
import { el, $, $$, on, fmt, clamp, copyText, debounce, downloadText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, getLang } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import * as store from '../core/storage.js';
import { toast, modal, initChrome, initReveal, registerCommand, settingsPanel } from '../core/ui.js';
import { tryCompile, FUNCTIONS, SAMPLES } from '../plot/expr.js';
import { PlotEngine } from '../plot/engine.js';
import { exportPNG, exportSVG, exportCSV, exportJSON, readJSONFile, stamp } from '../plot/exporter.js';

const VAR_DEFAULTS = { a: 1, b: 1, c: 1, k: 1, m: 1, n: 2, s: 1, u: 1, v: 1, w: 1, h: 1, p: 1, q: 1 };

let state = loadState();
let uid = 1;
const nextId = () => 'f' + (uid++);

function defaultState() {
  return {
    view: { xMin: -10, xMax: 10, yMin: -6.5, yMax: 6.5 },
    options: {
      showGrid: true, showMinorGrid: true, showAxes: true, showLabels: true, showLegend: false,
      equalAspect: false, samples: 1600, exportScale: 2, exportBg: 'theme'
    },
    vars: { ...VAR_DEFAULTS },
    /* 默认空白画板：从零开始，用户可用工具栏的 ✨ 载入示例 */
    functions: []
  };
}

function loadState() {
  const saved = store.load('plotter', null);
  if (!saved || !saved.functions) return defaultState();
  const base = defaultState();
  return {
    view: { ...base.view, ...(saved.view || {}) },
    options: { ...base.options, ...(saved.options || {}) },
    vars: { ...base.vars, ...(saved.vars || {}) },
    functions: saved.functions.map((f) => ({ ...f, id: f.id || nextId() }))
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
      functions: state.functions.map((f) => ({
        id: f.id, kind: f.kind, source: f.source, source2: f.source2, color: f.color,
        width: f.width, visible: f.visible, domain: f.domain, points: f.points, label: f.label,
        param: f.param, xDomain: f.xDomain, yDomain: f.yDomain, aspect: f.aspect
      }))
    });
  }, 400);
}

/* ------------------------------- 引擎与画布 ------------------------------- */
const canvas = $('#plotCanvas');
const stage = $('#stage');
const ctx = canvas.getContext('2d');
const engine = new PlotEngine({ ...state.view, samples: state.options.samples });
engine.setFunctions([]);

function applyOptions() {
  const o = state.options;
  engine.setOption({
    ...state.view,
    showGrid: o.showGrid, showMinorGrid: o.showMinorGrid, showAxes: o.showAxes,
    showLabels: o.showLabels, showLegend: o.showLegend, equalAspect: o.equalAspect, samples: o.samples,
    bg: cssVar('--canvas-bg', '#080a13'),
    gridMinor: cssVar('--grid-minor', 'rgba(255,255,255,0.055)'),
    gridMajor: cssVar('--grid-major', 'rgba(255,255,255,0.11)'),
    axis: cssVar('--axis', 'rgba(255,255,255,0.45)'),
    label: cssVar('--axis-label', '#8e97b8'),
    glow: theme.getKey('glow')
  });
}

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
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
  const w = Math.max(200, Math.round(rect.width));
  const h = Math.max(160, Math.round(rect.height));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  engine.setSize(w, h, dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (state.options.equalAspect) engine.fitAspect();
  requestRender();
}

function render() {
  applyOptions();
  engine.setOption({ ...state.view });
  engine.setFunctions(compiled);
  engine.render(ctx);
  updateStatus();
}

/* HTML 图例（比画布绘制更清晰，也不会和工具按钮重叠） */
function renderLegend() {
  let host = $('#canvasLegend');
  if (!host) {
    host = el('div', { class: 'canvas-legend', id: 'canvasLegend' });
    $('#stage').appendChild(host);
  }
  const show = !!state.options.showLegend;
  host.hidden = !show;
  if (!show) return;
  const items = state.functions.filter((f) => f.visible !== false);
  host.innerHTML = '';
  if (!items.length) {
    host.innerHTML = '<div class="lg-empty">' + t('plot.emptyTitle') + '</div>';
    return;
  }
  items.forEach((f) => {
    host.appendChild(el('div', { class: 'lg-row' }, [
      el('i', { style: { background: toHex(f.color) } }),
      el('span', { class: 'mono', text: f.kind === 'polar' ? 'r=' + (f.source || '') : (f.kind === 'points' ? (f.label || 'points') : (f.source || '')) })
    ]));
  });
}

/* 状态栏信息 */
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

/* ------------------------------- 函数编译 ------------------------------- */
let compiled = [];
const errors = new Map();

function recompile() {
  compiled = [];
  errors.clear();
  state.functions.forEach((f, i) => {
    const label = f.label || f.source || t('plot.functions');
    if (f.kind === 'points') {
      compiled.push({ id: f.id, kind: 'points', color: f.color, width: f.width, visible: f.visible, points: f.points || [], label, source: label });
      return;
    }
    const res = tryCompile(f.source || '');
    if (res.error) {
      errors.set(f.id, res.error);
      return;
    }
    const scope = { ...state.vars };
    const fn = (scopeObj) => res.fn({ ...scope, ...scopeObj });
    if (f.kind === 'parametric') {
      const res2 = tryCompile(f.source2 || '');
      if (res2.error) { errors.set(f.id, res2.error); return; }
      const fn2 = (scopeObj) => res2.fn({ ...scope, ...scopeObj });
      compiled.push({
        id: f.id, kind: 'parametric', color: f.color, width: f.width, visible: f.visible, label,
        source: f.source + ' ; ' + f.source2,
        param: Array.isArray(f.param) && Number.isFinite(f.param[0]) ? f.param : [0, Math.PI * 2],
        aspect: !!f.aspect,
        xDomain: f.xDomain, yDomain: f.yDomain,
        fn: fn, fn2: fn2
      });
      return;
    }
    const hasRange = (v) => Array.isArray(v) && (Number.isFinite(v[0]) || Number.isFinite(v[1]));
    const full = (v) => (Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? v : null);
    const domain = hasRange(f.xDomain) ? f.xDomain : (hasRange(f.domain) ? f.domain : [null, null]);
    compiled.push({
      id: f.id, kind: f.kind, color: f.color, width: f.width, visible: f.visible,
      label, source: f.kind === 'polar' ? 'r=' + f.source : f.source,
      domain,
      yDomain: full(f.yDomain) || undefined,
      aspect: !!f.aspect,
      fn: fn,
      polar: f.kind === 'polar', param: f.kind === 'polar' ? (isLocal(f.param) ? f.param : [0, Math.PI * 2]) : undefined
    });
  });
  // 参数/极坐标：用参数采样替换 x 采样
  compiled.forEach((c) => {
    if (c.kind === 'parametric' || c.kind === 'polar') {
      c.sampleFn = (n) => {
        const pts = [];
        const [ta, tb] = c.param || [0, Math.PI * 2];
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
  renderFnListMeta();
  /* 有曲线勾选了 1:1 时，自动按内容调整显示范围 */
  if (compiled.some((c) => c.aspect && c.visible !== false)) {
    applyAspect();
    engine.setOption({ ...state.view });
  }
  requestRender();
}

/* 让参数/极坐标也能走统一的绘制管线 */
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

function modeLabel(kind) {
  return t('plot.mode.' + kind);
}

function renderFnList() {
  fnList.innerHTML = '';
  state.functions.forEach((f, index) => {
    const card = el('div', {
      class: 'fn-card' + (errors.has(f.id) ? ' invalid' : ''),
      dataset: { id: f.id, index: String(index) },
      draggable: 'true'
    });

    /* ---- 第一行：颜色 / 表达式 / 显示 / 删除 ---- */
    const top = el('div', { class: 'fn-top' });
    top.appendChild(el('span', { class: 'handle', html: icon('layers', { size: 14 }), title: 'drag' }));
    top.appendChild(el('input', {
      type: 'color', value: toHex(f.color), 'aria-label': t('common.color'),
      oninput: (e) => { f.color = e.target.value; recompile(); persist(); }
    }));
    const expr = el('input', {
      class: 'fn-expr', type: 'text', value: f.kind === 'points' ? (f.label || 'points') : (f.source || ''),
      placeholder: f.kind === 'points' ? 'x,y' : 'sin(x)', spellcheck: 'false',
      disabled: f.kind === 'points'
    });
    expr.addEventListener('input', () => { f.source = expr.value; recompile(); persist(); });
    top.appendChild(expr);
    top.appendChild(el('button', {
      class: 'btn-icon btn-sm', type: 'button', title: t('common.visible'),
      html: icon(f.visible === false ? 'eyeOff' : 'eye', { size: 15 }),
      onclick: (e) => {
        f.visible = f.visible === false;
        e.currentTarget.innerHTML = icon(f.visible === false ? 'eyeOff' : 'eye', { size: 15 });
        recompile(); persist();
      }
    }));
    top.appendChild(el('button', {
      class: 'btn-icon btn-sm', type: 'button', title: t('common.delete'), html: icon('trash', { size: 15 }),
      onclick: () => { state.functions = state.functions.filter((x) => x.id !== f.id); renderFnList(); recompile(); persist(); }
    }));
    card.appendChild(top);

    /* ---- 第二行：模式 / 参数 / 线宽 ---- */
    const sub = el('div', { class: 'fn-sub' });
    const kindSel = el('select', { class: 'select input-sm', style: { width: 'auto', padding: '3px 26px 3px 8px', fontSize: 'var(--fs-xs)' } },
      ['cartesian', 'parametric', 'polar', 'points'].map((k) => el('option', { value: k, selected: f.kind === k, text: modeLabel(k) })));
    kindSel.addEventListener('change', () => {
      f.kind = kindSel.value;
      if (f.kind === 'parametric') { f.source = f.source?.includes('t') ? f.source : 'cos(t)'; f.source2 = f.source2 || 'sin(t)'; }
      if (f.kind === 'polar') f.source = f.source?.includes('t') ? f.source : '1+cos(t)';
      if (f.kind === 'points' && !f.points) f.points = [];
      renderFnList(); recompile(); persist();
    });
    sub.appendChild(kindSel);

    if (f.kind === 'parametric') {
      const e2 = el('input', { class: 'fn-expr', type: 'text', value: f.source2 || '', placeholder: 'y(t)', spellcheck: 'false', style: { maxWidth: '120px' } });
      e2.addEventListener('input', () => { f.source2 = e2.value; recompile(); persist(); });
      sub.appendChild(e2);
      sub.appendChild(paramInputs(f, 'param', [0, Math.PI * 2]));
    } else if (f.kind === 'polar') {
      sub.appendChild(paramInputs(f, 'param', [0, Math.PI * 2]));
    }

    const width = el('input', { type: 'range', min: '0.5', max: '6', step: '0.1', value: f.width || 2, style: { maxWidth: '74px' } });
    width.addEventListener('input', () => { f.width = Number(width.value); recompile(); persist(); });
    sub.appendChild(el('span', { class: 'fn-mini' }, [el('span', { text: t('common.width') }), width]));
    card.appendChild(sub);

    /* ---- 第三行：显示范围 x ∈ [ ] , y ∈ [ ] ---- */
    const scope = el('div', { class: 'fn-scope' });
    const isCurve = f.kind === 'cartesian' || f.kind === 'parametric' || f.kind === 'polar';
    if (isCurve) {
      const xr = f.xDomain || [null, null];
      const yr = f.yDomain || [null, null];
      const xRow = el('div', { class: 'scope-row' }, [
        el('span', { class: 'text-dim', text: 'x ∈' }),
        numberBox(xr[0], '', (v) => assign(f, 'xDomain', 0, v)),
        el('span', { class: 'text-dim', text: '~' }),
        numberBox(xr[1], '', (v) => assign(f, 'xDomain', 1, v))
      ]);
      scope.appendChild(xRow);
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
          delete f.xDomain; delete f.yDomain;
          const saved = engine.o;
          if (f.kind === 'cartesian') {
            const fit = fitDomainFor(f);
            f.xDomain = fit.x;
            f.yDomain = fit.y;
          } else {
            const pts = f.sampleFn ? f.sampleFn(600) : [];
            const xs = pts.filter((p) => p.ok).map((p) => p.x);
            const ys = pts.filter((p) => p.ok).map((p) => p.y);
            if (xs.length) f.xDomain = [Math.min(...xs), Math.max(...xs)];
            if (ys.length) f.yDomain = [Math.min(...ys), Math.max(...ys)];
          }
          void saved;
          renderFnList(); recompile(); persist();
        }
      }));
    }
    card.appendChild(scope);

    /* ---- 第四行：等比例 1:1 ---- */
    const bottom = el('div', { class: 'fn-sub' });
    const aspectCb = el('input', {
      type: 'checkbox', checked: !!f.aspect,
      onchange: (e) => {
        f.aspect = !!e.target.checked;
        recompile();
        renderFnList();
        persist();
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

  /* 拖拽排序与选中 */
  fnList.querySelectorAll('.fn-card').forEach((card) => {
    card.addEventListener('click', () => {
      fnList.querySelectorAll('.fn-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
    });
    /* 双击卡片空白处 → 直接编辑表达式，省一次点击 */
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
      const [moved] = state.functions.splice(fromIdx, 1);
      state.functions.splice(toIdx, 0, moved);
      renderFnList(); recompile(); persist();
    });
  });
}

/* 参数 / 定义域的一对输入框 */
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
      recompile(); persist();
    });
    return inp;
  };
  wrap.appendChild(mk(0, 'min'));
  wrap.appendChild(el('span', { class: 'text-dim', text: '~' }));
  wrap.appendChild(mk(1, 'max'));
  return wrap;
}

/* 常量表达式求值（支持 pi、e 等） */
function evalConst(raw) {
  const res = tryCompile(raw);
  if (res.error) return null;
  const v = res.fn({ pi: Math.PI, e: Math.E, tau: Math.PI * 2, theta: 0, x: 0, t: 0, ...state.vars });
  return Number.isFinite(v) ? v : null;
}

/* 颜色归一化为 #rrggbb */
function toHex(c) {
  if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) return c;
  return theme.toHex(c, '#3fb950');
}

/* 状态栏里的函数计数 / 错误提示 */
function renderFnListMeta() {
  const node = $('#statusFn');
  if (!node) return;
  const bad = errors.size;
  node.textContent = bad ? t('plot.invalid') + ' ×' + bad : state.functions.length + ' ' + t('plot.functions');
}

/* 单个数值输入框（空 = 自动/跟随全局） */
function numberBox(value, ph, onChange) {
  const inp = el('input', {
    class: 'input input-sm mono', type: 'text', style: { width: '54px', padding: '2px 6px' },
    value: value === null || value === undefined ? '' : String(Number(value.toPrecision(6))),
    placeholder: ph
  });
  inp.addEventListener('change', () => {
    const raw = inp.value.trim();
    if (raw === '') { onChange(null); return; }
    const v = evalConst(raw);
    onChange(v);
  });
  return inp;
}

/* 写入函数的自定义范围 */
function assign(f, key, index, value) {
  const arr = f[key] ? [...f[key]] : [null, null];
  arr[index] = value;
  if (arr[0] === null && arr[1] === null) delete f[key];
  else f[key] = arr;
  recompile(); persist();
}

/* 计算某条曲线"自适应"的范围 */
function fitDomainFor(f) {
  const pts = engine.sampleCurve(f, 1200).filter((p) => p.ok);
  if (!pts.length) return { x: [null, null], y: [null, null] };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const padX = (Math.max(...xs) - Math.min(...xs)) * 0.06 || 1;
  const padY = (Math.max(...ys) - Math.min(...ys)) * 0.12 || 1;
  return { x: [Math.min(...xs) - padX, Math.max(...xs) + padX], y: [Math.min(...ys) - padY, Math.max(...ys) + padY] };
}

/* 应用所有曲线的 1:1 等比例设置 */
function applyAspect() {
  const list = compiled.filter((c) => c.aspect && c.visible !== false);
  if (!list.length) { state.view.userAspect = false; engine.o.equalAspect = !!state.options.equalAspect; return; }
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const f of list) {
    const fd = f.fd || deriveAspectDomain(f);
    if (!fd) continue;
    const isLocal = (v) => Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1]);
    const vx = isLocal(f.xDomain) ? f.xDomain : [Number.isFinite(f.xDomain?.[0]) ? f.xDomain[0] : state.view.xMin, Number.isFinite(f.xDomain?.[1]) ? f.xDomain[1] : state.view.xMax];
    const vy = isLocal(f.yDomain) ? f.yDomain : [fd.y0, fd.y1];
    xMin = Math.min(xMin, vx[0]); xMax = Math.max(xMax, vx[1]);
    yMin = Math.min(yMin, vy[0]); yMax = Math.max(yMax, vy[1]);
  }
  if (!Number.isFinite(xMin)) return;
  const ratio = engine.width / Math.max(1, engine.height);
  const cx = (xMin + xMax) / 2, cy = (yMin + yMax) / 2;
  const halfX = Math.max((xMax - xMin) / 2, ((yMax - yMin) / 2) * ratio) * 1.04;
  state.view = { xMin: cx - halfX, xMax: cx + halfX, yMin: cy - halfX / ratio, yMax: cy + halfX / ratio };
  state.view.userAspect = true;
  syncViewInputs();
}

/* 依据函数在当前 x 范围内的取值推导 y 范围 */
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
          recompile(); persist();
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
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const factor = Math.pow(1.0016, e.deltaY);
  engine.zoomAt(px, py, clamp(factor, 0.2, 5));
  syncViewInputs();
  persist();
  requestRender();
}, { passive: false });

on(canvas, 'pointerdown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  lastPt = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
});

on(canvas, 'pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const x = engine.pxToX(px);
  const y = engine.pxToY(py);
  $('#hudCursor').innerHTML = 'x <b>' + fmt(x, 4) + '</b> , y <b>' + fmt(y, 4) + '</b>';
  $('#statusPos').textContent = 'x=' + fmt(x, 4) + '  y=' + fmt(y, 4);

  if (dragging && lastPt) {
    const dx = e.clientX - lastPt.x;
    const dy = e.clientY - lastPt.y;
    engine.panByPx(dx, dy);
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

on(window, 'pointerup', () => {
  dragging = false;
  lastPt = null;
  canvas.style.cursor = state.options.traceEnabled ? 'crosshair' : 'grab';
});

on(canvas, 'pointerleave', () => {
  if (!pinned) {
    traceX = null;
    updateTrace();
  }
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

on(canvas, 'dblclick', () => { resetView(); });

function updateTrace() {
  const o = engine.o;
  o.trace = {
    enabled: !!state.options.traceEnabled,
    x: traceX,
    pinned,
    fnId: activeFnId()
  };
  o.tangent = { enabled: !!state.options.tangent };
  if (traceX !== null && Number.isFinite(traceX)) {
    const f = compiled.find((c) => c.id === activeFnId()) || compiled.find((c) => c.visible !== false);
    if (f && f.kind === 'cartesian') {
      const y = engine.evalFn(f, traceX);
      const d = engine.derivatives(f, traceX);
      $('#hudFn').innerHTML = 'f(x) <b>' + fmt(y, 5) + '</b>' + (state.options.tangent ? "  f'(x) <b>" + fmt(d.d1, 5) + '</b>' : '');
    } else if (f) {
      $('#hudFn').innerHTML = '<b>' + (f.label || '') + '</b>';
    }
  } else {
    $('#hudFn').innerHTML = '';
  }
  requestRender();
}

function activeFnId() {
  const sel = fnList.querySelector('.fn-card.selected');
  if (sel) return sel.dataset.id;
  const first = state.functions.find((f) => f.visible !== false);
  return first ? first.id : (state.functions[0]?.id || null);
}

/* ------------------------------- 视图同步 ------------------------------- */
function syncViewInputs() {
  if (document.activeElement !== $('#xMin')) $('#xMin').value = String(round(engine.o.xMin));
  $('#xMax').value = String(round(engine.o.xMax));
  $('#yMin').value = String(round(engine.o.yMin));
  $('#yMax').value = String(round(engine.o.yMax));
  $('#statusView').textContent = 'x ∈ [' + round(engine.o.xMin) + ', ' + round(engine.o.xMax) + ']  y ∈ [' + round(engine.o.yMin) + ', ' + round(engine.o.yMax) + ']';
  $('#hudZoom').textContent = '1:' + fmt((engine.o.xMax - engine.o.xMin) / engine.width, 3);
}
function round(v) { return Number(v.toPrecision(6)); }

function readViewInputs() {
  const v = {
    xMin: Number($('#xMin').value), xMax: Number($('#xMax').value),
    yMin: Number($('#yMin').value), yMax: Number($('#yMax').value)
  };
  if (!Number.isFinite(v.xMin) || !Number.isFinite(v.xMax) || v.xMax <= v.xMin) return false;
  if (!Number.isFinite(v.yMin) || !Number.isFinite(v.yMax) || v.yMax <= v.yMin) return false;
  state.view = v;
  requestRender(); persist();
  return true;
}

function resetView() {
  state.view = { xMin: -10, xMax: 10, yMin: -6.5, yMax: 6.5 };
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
      continue;
    }
    if (f.kind === 'parametric' || f.kind === 'polar') {
      const pts = f.sampleFn(800);
      pts.forEach((p) => { if (p.ok) project(p.x, p.y); });
      continue;
    }
    const pts = engine.sampleCurve(f, 1200);
    pts.forEach((p) => { if (p.ok) project(p.x, p.y); });
  }
  if (!Number.isFinite(xMin) || xMin === xMax) { resetView(); toast(t('plot.zoomed'), { type: 'info', timeout: 1200 }); return; }
  const padX = (xMax - xMin) * 0.08 || 1;
  const padY = (yMax - yMin) * 0.12 || 1;
  state.view = { xMin: xMin - padX, xMax: xMax + padX, yMin: yMin - padY, yMax: yMax + padY };
  if (state.options.equalAspect) {
    const ratio = engine.width / engine.height;
    const cx = (state.view.xMin + state.view.xMax) / 2, cy = (state.view.yMin + state.view.yMax) / 2;
    const halfX = Math.max((state.view.xMax - state.view.xMin) / 2, ((state.view.yMax - state.view.yMin) / 2) * ratio);
    state.view = { xMin: cx - halfX, xMax: cx + halfX, yMin: cy - halfX / ratio, yMax: cy + halfX / ratio };
  }
  syncViewInputs(); requestRender(); persist();
  toast(t('plot.zoomed'), { type: 'info', timeout: 1200 });
}

/* ------------------------------- 分析 ------------------------------- */
function clearMarks() { engine.o.marks = []; }

function findRoots() {
  const f = compiled.find((c) => c.id === activeFnId() && c.kind === 'cartesian');
  if (!f) { toast(t('geo.needObject'), { type: 'warn' }); return; }
  const roots = engine.findRoots(f);
  clearMarks();
  roots.forEach((r) => engine.o.marks.push({ x: r.x, y: 0, color: '#3fb950', label: 'x=' + fmt(r.x, 3) }));
  $('#analysisOut').innerHTML = roots.length
    ? roots.slice(0, 12).map((r) => '<div>x = ' + fmt(r.x, 5) + '</div>').join('')
    : t('plot.noRoots');
  toast(roots.length ? t('plot.rootsFound', { n: roots.length }) : t('plot.noRoots'), { type: roots.length ? 'ok' : 'warn' });
  requestRender();
}

function findIntersections() {
  const fns = compiled.filter((c) => c.kind === 'cartesian' && c.visible !== false);
  if (fns.length < 2) { toast(t('plot.intercepts') + ': ≥2', { type: 'warn' }); return; }
  clearMarks();
  const out = [];
  for (let i = 0; i < fns.length; i++) {
    for (let j = i + 1; j < fns.length; j++) {
      engine.findIntersections(fns[i], fns[j]).forEach((p) => out.push({ ...p, pair: [fns[i], fns[j]] }));
    }
  }
  out.forEach((p) => engine.o.marks.push({ x: p.x, y: p.y, color: '#fbbf24', label: '(' + fmt(p.x, 3) + ', ' + fmt(p.y, 3) + ')' }));
  $('#analysisOut').innerHTML = out.length
    ? out.slice(0, 12).map((p) => '<div>(' + fmt(p.x, 5) + ', ' + fmt(p.y, 5) + ')</div>').join('')
    : t('plot.noIntersections');
  toast(out.length ? t('plot.intersectionsFound', { n: out.length }) : t('plot.noIntersections'), { type: out.length ? 'ok' : 'warn' });
  requestRender();
}

function findExtrema() {
  const f = compiled.find((c) => c.id === activeFnId() && c.kind === 'cartesian');
  if (!f) { toast(t('geo.needObject'), { type: 'warn' }); return; }
  const pts = engine.findExtrema(f);
  clearMarks();
  pts.forEach((p) => engine.o.marks.push({ x: p.x, y: p.y, color: p.type === 'max' ? '#fb7185' : '#56d364', label: (p.type === 'max' ? 'max ' : 'min ') + fmt(p.x, 3) }));
  $('#analysisOut').innerHTML = pts.length
    ? pts.slice(0, 12).map((p) => '<div>' + p.type + ' (' + fmt(p.x, 4) + ', ' + fmt(p.y, 4) + ')</div>').join('')
    : t('plot.noRoots');
  toast(pts.length ? t('plot.extremaFound', { n: pts.length }) : t('plot.noRoots'), { type: pts.length ? 'ok' : 'warn' });
  requestRender();
}

function updateIntegral() {
  const a = Number($('#intA').value), b = Number($('#intB').value);
  const f = compiled.find((c) => c.id === activeFnId() && c.kind === 'cartesian') || compiled.find((c) => c.kind === 'cartesian');
  engine.o.integral = { enabled: !!$('#optIntegral').checked, a, b, fnId: f?.id };
  if (engine.o.integral.enabled && f && Number.isFinite(a) && Number.isFinite(b)) {
    const area = engine.integral(f, a, b);
    $('#analysisOut').innerHTML = '<div>∫<sub>' + fmt(a, 3) + '</sub><sup>' + fmt(b, 3) + '</sup> f(x) dx = <b style="color:var(--accent-2)">' + fmt(area, 6) + '</b></div>';
  }
  requestRender();
}

function showTable() {
  const f = compiled.find((c) => c.id === activeFnId() && c.kind === 'cartesian');
  if (!f) { toast(t('geo.needObject'), { type: 'warn' }); return; }
  const rows = [];
  const n = 21;
  for (let i = 0; i < n; i++) {
    const x = engine.o.xMin + ((engine.o.xMax - engine.o.xMin) * i) / (n - 1);
    const y = engine.evalFn(f, x);
    rows.push('<tr><td class="num">' + fmt(x, 4) + '</td><td class="num">' + (Number.isFinite(y) ? fmt(y, 6) : '—') + '</td></tr>');
  }
  modal({
    title: (f.label || f.source) + ' — ' + t('plot.table'),
    wide: false,
    body: '<table class="table"><thead><tr><th class="num">x</th><th class="num">f(x)</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>',
    footer: [
      el('button', { class: 'btn btn-sm', type: 'button', text: t('plot.exportCsv'), onclick: () => { exportCSV(engine, { filename: stamp('table') + '.csv' }); } }),
      el('button', { class: 'btn btn-sm btn-primary', type: 'button', text: t('common.close'), onclick: (e) => e.target.closest('.modal-backdrop').remove() })
    ]
  });
}

/* ------------------------------- 事件绑定 ------------------------------- */
function bindUI() {
  const o = state.options;
  $('#optGrid').checked = o.showGrid;
  $('#optMinor').checked = o.showMinorGrid;
  $('#optAxes').checked = o.showAxes;
  $('#optLabels').checked = o.showLabels;
  $('#optLegend').checked = o.showLegend;
  $('#optAspect').checked = o.equalAspect;
  $('#optSamples').value = String(o.samples);
  $('#expScale').value = String(o.exportScale);
  $('#expBg').value = o.exportBg;
  state.options.traceEnabled = !!state.options.traceEnabled;
  $('#optTrace').checked = !!state.options.traceEnabled;
  $('#optTangent').checked = !!state.options.tangent;
  $('#optIntegral').checked = !!(engine.o.integral && engine.o.integral.enabled);

  const bindSwitch = (sel, key, after) => {
    $(sel).addEventListener('change', (e) => {
      state.options[key] = e.target.checked;
      after?.(e.target.checked);
      applyOptions(); requestRender(); persist();
    });
  };
  bindSwitch('#optGrid', 'showGrid');
  bindSwitch('#optMinor', 'showMinorGrid');
  bindSwitch('#optAxes', 'showAxes');
  bindSwitch('#optLabels', 'showLabels');
  bindSwitch('#optLegend', 'showLegend', () => renderLegend());
  bindSwitch('#optAspect', 'equalAspect', (v) => { if (v) engine.fitAspect(); });
  bindSwitch('#optTrace', 'traceEnabled', (v) => {
    canvas.style.cursor = v ? 'crosshair' : 'grab';
    $('#hudHint').style.display = v ? '' : 'none';
    if (!v) { traceX = null; pinned = false; }
    updateTrace();
  });
  bindSwitch('#optTangent', 'tangent', () => updateTrace());

  $('#optSamples').addEventListener('change', (e) => {
    state.options.samples = clamp(Number(e.target.value) || 1600, 200, 8000);
    e.target.value = String(state.options.samples);
    recompile(); persist();
  });

  ['#xMin', '#xMax', '#yMin', '#yMax'].forEach((sel) => $(sel).addEventListener('change', readViewInputs));
  $('#btnFit').addEventListener('click', fitView);
  $('#btnResetView').addEventListener('click', resetView);
  $('#zoomIn').addEventListener('click', () => { engine.zoomAt(engine.width / 2, engine.height / 2, 0.75); syncViewInputs(); requestRender(); persist(); });
  $('#zoomOut').addEventListener('click', () => { engine.zoomAt(engine.width / 2, engine.height / 2, 1.33); syncViewInputs(); requestRender(); persist(); });
  $('#zoomReset').addEventListener('click', resetView);

  $('#btnAddFn').addEventListener('click', () => {
    const idx = state.functions.length;
    state.functions.push({
      id: nextId(), kind: 'cartesian', source: '', color: theme.curveColor(idx),
      width: 2.2, visible: true, domain: [null, null]
    });
    renderFnList(); recompile(); persist();
    const inputs = fnList.querySelectorAll('.fn-expr');
    inputs[inputs.length - 1]?.focus();
  });
  $('#btnClearFn').addEventListener('click', () => {
    modal({
      title: t('plot.clearAll'),
      body: '<p>' + t('plot.confirmClear') + '</p>',
      footer: [
        el('button', { class: 'btn btn-sm', type: 'button', text: t('common.cancel'), onclick: (e) => e.target.closest('.modal-backdrop').remove() }),
        el('button', {
          class: 'btn btn-sm btn-danger', type: 'button', text: t('common.confirm'), onclick: (e) => {
            e.target.closest('.modal-backdrop').remove();
            state.functions = [];
            clearMarks(); renderFnList(); recompile(); persist();
          }
        })
      ]
    });
  });

  $('#btnRoots').addEventListener('click', findRoots);
  $('#btnInter').addEventListener('click', findIntersections);
  $('#btnExtrema').addEventListener('click', findExtrema);
  $('#btnTable').addEventListener('click', showTable);
  $('#optIntegral').addEventListener('change', updateIntegral);
  $('#intA').addEventListener('change', updateIntegral);
  $('#intB').addEventListener('change', updateIntegral);

  /* 导出 */
  $('#expPng').addEventListener('click', async () => {
    try {
      await exportPNG(engine, {
        scale: Number($('#expScale').value) || 2,
        background: $('#expBg').value,
        filename: stamp('plot') + '.png'
      });
      toast(t('plot.saved'), { type: 'ok' });
    } catch (err) { toast(String(err.message || err), { type: 'err' }); }
  });
  $('#expSvg').addEventListener('click', () => {
    exportSVG(engine, { background: $('#expBg').value, filename: stamp('plot') + '.svg', scale: Number($('#expScale').value) || 1 });
    toast(t('plot.exported', { name: 'SVG' }), { type: 'ok' });
  });
  $('#expCsv').addEventListener('click', () => {
    exportCSV(engine, { filename: stamp('data') + '.csv' });
    toast(t('plot.exported', { name: 'CSV' }), { type: 'ok' });
  });
  $('#expJson').addEventListener('click', () => {
    exportJSON(engine, { filename: stamp('project') + '.json' });
    toast(t('plot.exported', { name: 'JSON' }), { type: 'ok' });
  });
  $('#copySvg').addEventListener('click', async () => {
    await copyText(engine.toSVG({ background: $('#expBg').value }));
    toast(t('plot.copiedSvg'), { type: 'ok' });
  });
  $('#impJson').addEventListener('click', async () => {
    const res = await readJSONFile();
    if (!res) return;
    if (res.error) { toast(t('settings.importFailed'), { type: 'err' }); return; }
    loadProject(res.data);
  });
}

function loadProject(data) {
  if (!data || !Array.isArray(data.functions)) { toast(t('settings.importFailed'), { type: 'err' }); return; }
  state.functions = data.functions.map((f, i) => ({
    id: nextId(), kind: f.kind || 'cartesian', source: f.source || '',
    source2: f.source2, color: f.color || theme.curveColor(i), width: f.width || 2,
    visible: f.visible !== false, domain: f.domain || [null, null], points: f.points, label: f.label,
    param: f.param, xDomain: f.xDomain, yDomain: f.yDomain, aspect: f.aspect
  }));
  if (data.view) state.view = { ...state.view, ...data.view };
  renderFnList(); recompile(); syncViewInputs(); requestRender(); persist();
  toast(t('common.load') + ': ' + (data.functions.length), { type: 'ok' });
}

/* 预设示例 */
const PRESETS = [
  { zh: '正弦波', en: 'Sine wave', fns: [{ k: 'cartesian', s: 'sin(x)' }, { k: 'cartesian', s: 'cos(x)' }], view: { xMin: -6.5, xMax: 6.5, yMin: -2, yMax: 2 } },
  { zh: '阻尼振动', en: 'Damped wave', fns: [{ k: 'cartesian', s: 'e^(-x/4)*sin(3x)' }], view: { xMin: -0.5, xMax: 12, yMin: -1.2, yMax: 1.2 } },
  { zh: '心形线（极坐标）', en: 'Cardioid (polar)', fns: [{ k: 'polar', s: '1-cos(t)' }], view: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 } },
  { zh: '玫瑰线', en: 'Rose curve', fns: [{ k: 'polar', s: '3*cos(4t)' }], view: { xMin: -3.5, xMax: 3.5, yMin: -3.5, yMax: 3.5 } },
  { zh: '利萨如曲线', en: 'Lissajous', fns: [{ k: 'parametric', s: '3sin(3t)', s2: '3sin(4t)' }], view: { xMin: -4, xMax: 4, yMin: -4, yMax: 4 } },
  { zh: '正态分布', en: 'Gaussian', fns: [{ k: 'cartesian', s: 'e^(-x^2/2)/sqrt(2pi)' }], view: { xMin: -4, xMax: 4, yMin: -0.1, yMax: 0.5 } },
  { zh: '双曲与渐近线', en: 'Hyperbola', fns: [{ k: 'cartesian', s: '1/x' }, { k: 'cartesian', s: 'ln(abs(x))' }], view: { xMin: -8, xMax: 8, yMin: -6, yMax: 6 } }
];

function presetMenu() {
  const body = el('div', { class: 'list' });
  PRESETS.forEach((p) => {
    body.appendChild(el('button', {
      class: 'btn btn-sm', type: 'button', style: { justifyContent: 'flex-start' },
      text: (p.zh && getLang() === 'zh') ? p.zh : p.en,
      onclick: () => {
        state.functions = p.fns.map((f, i) => ({
          id: nextId(), kind: f.k, source: f.s, source2: f.s2, color: theme.curveColor(i),
          width: 2.2, visible: true, domain: [null, null], param: f.k === 'polar' || f.k === 'parametric' ? [0, Math.PI * 2] : undefined
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

/* 语法帮助 */
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

/* 侧栏拖动调整宽度 */
function initResizer() {
  const rz = $('#resizerLeft');
  const side = $('#sideLeft');
  let active = false;
  rz.addEventListener('pointerdown', (e) => {
    active = true;
    rz.classList.add('dragging');
    rz.setPointerCapture(e.pointerId);
  });
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
}

/* ------------------------------- 启动 ------------------------------- */
function boot() {
  initChrome('plotter');
  applyOptions();
  renderFnList();
  renderVarPanel();
  recompile();
  bindUI();
  initResizer();
  syncViewInputs();
  engine.o.trace = { enabled: !!state.options.traceEnabled, x: null, pinned: false };
  engine.o.tangent = { enabled: !!state.options.tangent };
  canvas.style.cursor = state.options.traceEnabled ? 'crosshair' : 'grab';
  $('#hudHint').style.display = state.options.traceEnabled ? '' : 'none';
  resizeCanvas();
  requestRender();
  initReveal();
  window.addEventListener('resize', debounce(resizeCanvas, 120));
  window.addEventListener('bzm:themechange', () => { applyOptions(); requestRender(); });
  theme.subscribe(() => { applyOptions(); requestRender(); });

  // 工具栏按钮（示例预设 + 语法帮助）
  const head = $('#fnList').closest('.app-side').querySelector('.plot-side-head');
  if (head) {
    head.appendChild(el('button', { class: 'btn-icon btn-sm hint', dataset: { hint: t('plot.preset') }, html: icon('sparkle', { size: 15 }), onclick: presetMenu }));
    head.appendChild(el('button', { class: 'btn-icon btn-sm hint', dataset: { hint: t('help.syntax') }, html: icon('help', { size: 15 }), onclick: syntaxModal }));
  }

  // 快捷键
  registerCommand({ label: t('plot.resetView'), hint: 'R', ico: 'reset', run: resetView });
  registerCommand({ label: t('plot.fitView'), hint: 'F', ico: 'target', run: fitView });
  registerCommand({ label: t('help.syntax'), hint: '', ico: 'code', run: syntaxModal });
  registerCommand({ label: t('plot.exportPng'), hint: 'Ctrl S', ico: 'download', run: () => $('#expPng').click() });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#expPng').click(); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'g') { $('#optGrid').checked = !$('#optGrid').checked; $('#optGrid').dispatchEvent(new Event('change')); }
    else if (k === 'r') resetView();
    else if (k === 'f') fitView();
    else if (k === 't') { $('#optTrace').checked = !$('#optTrace').checked; $('#optTrace').dispatchEvent(new Event('change')); }
    else if (k === 'a') { $('#btnAddFn').click(); }
  });
}

boot();
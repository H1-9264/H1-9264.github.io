/* geometry.js — 几何画板页面：工具栏、交互状态机、对象列表、属性面板、导入导出 */
import { el, $, $$, on, fmt, clamp, debounce, downloadBlob, downloadText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, getLang } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import * as store from '../core/storage.js';
import { toast, modal, initChrome, initReveal, registerCommand } from '../core/ui.js';
import { GeoBoard, TYPES, mid, sub, norm, add, mul, len, distToSegment, polygonCentroid, arcParams } from '../geo/engine.js';
import { renderBoard, readTheme, rgbaStr, linearDir } from '../geo/render.js';
import { tryCompile } from '../plot/expr.js';
import { readJSONFile } from '../plot/exporter.js';

const { PT, SEG, LINE, RAY, VEC, CIRCLE, ARC, POLY, MEASURE, TEXT, FN, REGION } = TYPES;

/* ============================ 画板实例 ============================ */
const canvas = $('#geoCanvas');
const stage = $('#geoStage');
const ctx = canvas.getContext('2d');

const board = new GeoBoard({
  origin: { x: 0, y: 0 },
  scale: 46,
  gridSize: 1
});

let viewState = { grid: true, axes: true, labels: true, snap: true, gridSize: 1 };

/* ============================ 工具定义 ============================ */
const TOOL_GROUPS = [
  {
    id: 'basic',
    tools: [
      { key: 'select', ico: 'select', label: 'geo.tool.select', needs: 0, hotkey: 'v' },
      { key: 'point', ico: 'point', label: 'geo.tool.point', needs: 1, hotkey: 'p' },
      { key: 'trace', ico: 'trace', label: 'geo.tool.trace', needs: 1 },
      { key: 'locus', ico: 'curve', label: 'geo.tool.locus', needs: '*' }
    ]
  },
  {
    id: 'lines',
    tools: [
      { key: 'segment', ico: 'segment', label: 'geo.tool.segment', needs: 2, hotkey: 's' },
      { key: 'line', ico: 'line', label: 'geo.tool.line', needs: 2 },
      { key: 'ray', ico: 'ray', label: 'geo.tool.ray', needs: 2 },
      { key: 'vector', ico: 'segment', label: 'geo.tool.vector', needs: 2 }
    ]
  },
  {
    id: 'circles',
    tools: [
      { key: 'circle', ico: 'circle', label: 'geo.tool.circle', needs: 2, hotkey: 'c' },
      { key: 'circle3', ico: 'circle', label: 'geo.tool.circle3', needs: 3 },
      { key: 'compass', ico: 'compass', label: 'geo.tool.compass', needs: 1 },
      { key: 'arc', ico: 'arc', label: 'geo.tool.arc', needs: 3 }
    ]
  },
  {
    id: 'construct',
    tools: [
      { key: 'midpoint', ico: 'distance', label: 'geo.tool.midpoint', needs: 2, hotkey: 'm' },
      { key: 'perp', ico: 'perpendicular', label: 'geo.tool.perp', needs: 'line+point' },
      { key: 'parallel', ico: 'parallel', label: 'geo.tool.parallel', needs: 'line+point' },
      { key: 'perpbisector', ico: 'perpendicular', label: 'geo.tool.perpBisector', needs: 2 },
      { key: 'anglebisector', ico: 'angle', label: 'geo.tool.angleBisector', needs: 3 },
      { key: 'intersect', ico: 'target', label: 'geo.tool.intersect', needs: 'object+object', hotkey: 'i' },
      { key: 'polygon', ico: 'polygon', label: 'geo.tool.polygon', needs: '*', min: 3 },
      { key: 'region', ico: 'area', label: 'geo.tool.region', needs: '*', min: 3 }
    ]
  },
  {
    id: 'measure',
    tools: [
      { key: 'mLength', ico: 'ruler', label: 'geo.tool.measureLength', needs: 2 },
      { key: 'mAngle', ico: 'angle', label: 'geo.tool.measureAngle', needs: 3 },
      { key: 'mArea', ico: 'area', label: 'geo.tool.measureArea', needs: 'polygon' },
      { key: 'mSlope', ico: 'chart', label: 'geo.tool.measureSlope', needs: 2 },
      { key: 'mRadius', ico: 'circle', label: 'geo.tool.measureLength', needs: 'circle' },
      { key: 'mCoord', ico: 'target', label: 'geo.tool.measureCoord', needs: 1 }
    ]
  },
  {
    id: 'transform',
    tools: [
      { key: 'translate', ico: 'transform', label: 'geo.tool.translate', needs: 'objects+2points' },
      { key: 'rotate', ico: 'rotate', label: 'geo.tool.rotate', needs: 'objects+center' },
      { key: 'reflect', ico: 'reflect', label: 'geo.tool.reflect', needs: 'objects+2points' },
      { key: 'dilate', ico: 'scale', label: 'geo.tool.dilate', needs: 'objects+center' }
    ]
  },
  {
    id: 'misc',
    tools: [
      { key: 'text', ico: 'text', label: 'geo.tool.text', needs: 1 },
      { key: 'errase', ico: 'trash', label: 'geo.tool.delete', needs: 1 }
    ]
  }
];

const TOOLS = TOOL_GROUPS.flatMap((g) => g.tools.map((x) => ({ ...x, group: g.id })));
let tool = TOOLS[0];
let pending = [];          // 已点击的点
let pendingObjects = [];   // 已点击的对象（用于交点/测量/变换）
let pendingAction = null;  // 变换类工具的后续阶段

/* ============================ 快照 / 撤销 ============================ */
const history = { undo: [], redo: [] };
function snapshot() {
  const data = JSON.stringify(board.toJSON());
  history.undo.push(data);
  if (history.undo.length > 60) history.undo.shift();
  history.redo.length = 0;
  updateHistoryButtons();
}
function restore(json) {
  try { board.loadJSON(JSON.parse(json)); } catch { /* ignore */ }
  board.selection = [];
  renderObjList();
  renderInspector();
  renderMeasures();
  requestRender();
  persist();
}
function doUndo() {
  if (!history.undo.length) return;
  const cur = JSON.stringify(board.toJSON());
  history.redo.push(cur);
  restore(history.undo.pop());
  updateHistoryButtons();
}
function doRedo() {
  if (!history.redo.length) return;
  history.undo.push(JSON.stringify(board.toJSON()));
  restore(history.redo.pop());
  updateHistoryButtons();
}
function updateHistoryButtons() {
  $('#btnUndo').disabled = !history.undo.length;
  $('#btnRedo').disabled = !history.redo.length;
}

/* ============================ 渲染 ============================ */
let frame = 0;
function requestRender() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    renderBoard(ctx, board, {
      theme: readTheme(),
      dpr: board.dpr || 1,
      grid: viewState.grid,
      axes: viewState.axes,
      labels: viewState.labels,
      gridSize: viewState.gridSize
    });
    updateStatus();
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
  board.width = w;
  board.height = h;
  board.dpr = dpr;
  if (!board.origin.x && !board.origin.y) {
    board.origin.x = w / 2;
    board.origin.y = h / 2;
  }
  requestRender();
}

function updateStatus() {
  $('#objCount').textContent = String(board.all().length);
  $('#statusObjects').textContent = board.all().length + ' ' + t('geo.objects');
  $('#statusTool').textContent = t(tool.label);
  $('#statusSel').textContent = board.selection.length ? board.selection.map((id) => board.get(id)?.name).filter(Boolean).join(', ') : '';
  const hint = $('#geoHint');
  if (hint) hint.textContent = hintText();
}

function hintText() {
  if (pendingAction) return pendingAction.hint || '';
  const need = tool.needs;
  if (need === 1) return t(tool.label) + ': 1';
  if (typeof need === 'number') return t(tool.label) + ' · ' + pending.length + '/' + need;
  if (need === '*') return t(tool.label) + ' · ' + pending.length + (tool.min ? ' (≥' + tool.min + ', 双击结束)' : '');
  if (need === 'line+point') return t(tool.label) + ' · ' + pendingObjects.length + '/1 + ' + pending.length + '/1';
  if (need === 'object+object') return t(tool.label) + ' · ' + pendingObjects.length + '/2';
  if (need === 'polygon') return t(tool.label) + ' · ' + pendingObjects.length + '/1';
  if (need === 'circle') return t(tool.label) + ' · ' + pendingObjects.length + '/1';
  if (typeof need === 'string' && need.startsWith('objects+')) return t(tool.label) + ' · ' + pendingObjects.length + ' obj + ' + pending.length + ' pt';
  return '';
}

/* ============================ 点/对象获取 ============================ */
function screenOf(ev) {
  const rect = canvas.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

function resolvePoint(screen, { create = true } = {}) {
  const world = board.toWorld(screen.x, screen.y);
  const snap = viewState.snap ? board.snap(world, screen, { gridOn: true, gridSize: viewState.gridSize }) : { kind: 'free', world };
  if (snap.kind === 'point') return snap.point;
  if (!create) return null;
  if (snap.kind === 'onLine' || snap.kind === 'onCircle') {
    return board.addPointOn(snap.object.id, snap.world);
  }
  return board.addFreePoint(snap.world);
}

/* ============================ 工具执行 ============================ */
function applyTool() {
  const need = tool.needs;
  const pts = pending;
  const before = board.all().length;

  const finish = () => { pending = []; pendingObjects = []; pendingAction = null; };

  switch (tool.key) {
    case 'point': {
      board.addFreePoint(board.toWorld(0, 0));
      finish();
      break;
    }
    case 'segment': if (pts.length >= 2) { board.addSegment(pts[0].id, pts[1].id); finish(); } break;
    case 'line': if (pts.length >= 2) { board.addLine(pts[0].id, pts[1].id); finish(); } break;
    case 'ray': if (pts.length >= 2) { board.addRay(pts[0].id, pts[1].id); finish(); } break;
    case 'vector': if (pts.length >= 2) { board.addVector(pts[0].id, pts[1].id); finish(); } break;
    case 'circle': if (pts.length >= 2) { board.addCircle(pts[0].id, pts[1].id); finish(); } break;
    case 'circle3': if (pts.length >= 3) { board.addCircle3(pts[0].id, pts[1].id, pts[2].id); finish(); } break;
    case 'arc': if (pts.length >= 3) { board.addArc(pts[0].id, pts[1].id, pts[2].id); finish(); } break;
    case 'compass': {
      if (pts.length >= 1) {
        const center = pts[0];
        finish();
        promptNum(t('geo.askRadius'), 2, t('geo.askRadiusHint')).then((r) => {
          if (r !== null) {
            board.addCircleR(center.id, r);
            renderObjList(); updateStatus(); requestRender(); persist();
          }
        });
      }
      break;
    }
    case 'midpoint': if (pts.length >= 2) { board.addMidpoint(pts[0].id, pts[1].id); finish(); } break;
    case 'perpbisector': if (pts.length >= 2) { board.addPerpBisector(pts[0].id, pts[1].id); finish(); } break;
    case 'anglebisector': if (pts.length >= 3) { board.addAngleBisector(pts[0].id, pts[1].id, pts[2].id); finish(); } break;
    case 'perp': case 'parallel': {
      if (pendingObjects.length >= 1 && pts.length >= 1) {
        const lineObj = pendingObjects[0], pt = pts[0];
        if (tool.key === 'perp') board.addPerpendicular(lineObj.id, pt.id);
        else board.addParallel(lineObj.id, pt.id);
        finish();
      }
      break;
    }
    case 'intersect': {
      if (pendingObjects.length >= 2) {
        const [a, b] = pendingObjects;
        const count = intersectCount(a, b);
        if (count === 0) toast(t('plot.noIntersections'), { type: 'warn' });
        for (let i = 0; i < Math.max(1, count); i++) board.addIntersection(a.id, b.id, i);
        finish();
      }
      break;
    }
    case 'polygon': case 'region': {
      if (pts.length >= (tool.min || 3)) {
        if (tool.key === 'polygon') board.addPolygon(pts.map((p) => p.id));
        else board.addRegion(pts.map((p) => p.id));
        finish();
      }
      break;
    }
    case 'mLength': if (pts.length >= 2) { board.addMeasure('length', [pts[0].id, pts[1].id]); finish(); } break;
    case 'mAngle': if (pts.length >= 3) { board.addMeasure('angle', [pts[0].id, pts[1].id, pts[2].id]); finish(); } break;
    case 'mSlope': if (pts.length >= 2) { board.addMeasure('slope', [pts[0].id, pts[1].id]); finish(); } break;
    case 'mCoord': if (pts.length >= 1) { board.addMeasure('coord', [pts[0].id]); finish(); } break;
    case 'mArea': {
      if (pendingObjects.length >= 1 && pendingObjects[0].type === POLY) {
        board.addMeasure('area', [pendingObjects[0].id]);
        finish();
      }
      break;
    }
    case 'mRadius': {
      if (pendingObjects.length >= 1 && pendingObjects[0].type === CIRCLE) {
        board.addMeasure('radius', [pendingObjects[0].id]);
        finish();
      }
      break;
    }
    case 'text': {
      if (pts.length >= 1) {
        const at = pts[0];
        finish();
        promptText(t('geo.askText'), 'A').then((text) => {
          if (text) {
            board.addText({ x: at.x, y: at.y }, text);
            renderObjList(); updateStatus(); requestRender(); persist();
          }
        });
      }
      break;
    }
    case 'errase': {
      if (pendingObjects.length) { pendingObjects.forEach((o) => board.remove(o.id)); }
      finish();
      break;
    }
    case 'locus': {
      if (pts.length >= 2) {
        const driver = pts[0], traced = pts[1];
        if (driver.type !== PT || traced.type !== PT) {
          toast(t('geo.locusNeed'), { type: 'warn' });
          finish();
          updateStatus();
          return;
        }
        const created = board.addLocus(driver.id, traced.id, 120);
        if (created) {
          toast(t('geo.locusDone') + ' · ' + t('geo.locusOn'), { type: 'ok', timeout: 3000 });
          refreshSelection();
          persist();
        } else {
          toast(t('geo.locusNeed'), { type: 'warn' });
        }
        finish();
      }
      break;
    }
    case 'trace': {
      if (pts.length >= 1) {
        const p = pts[0];
        const existing = board.traceOf(p.id);
        if (existing) { board.traces = board.traces.filter((x) => x.id !== p.id); toast(t('geo.traceOff'), { type: 'info' }); }
        else { board.pushTrace(p.id, p); toast(t('geo.traceOn'), { type: 'ok' }); }
        finish();
      }
      break;
    }
    default: break;
  }
  board.recompute();
  /* 只有在真的产生了变化时才记录撤销快照 */
  if (board.all().length !== before) snapshot();
  renderObjList();
  renderMeasures();
  renderInspector();
  requestRender();
  persist();
  updateStatus();
}

/* 试探两个对象有几个交点（不改变画板状态） */
function intersectCount(a, b) {
  let n = 0;
  for (let i = 0; i < 2; i++) {
    const p = board.addIntersection(a.id, b.id, i);
    const valid = p.valid !== false;
    board.remove(p.id);
    if (!valid) break;
    n++;
  }
  return n;
}

/* 变换：收集对象后进入第二阶段 */
function startTransform(kind) {
  if (!board.selection.length) { toast(t('geo.needObject'), { type: 'warn' }); return; }
  const objs = board.selection.map((id) => board.get(id)).filter(Boolean);
  let hint = '';
  if (kind === 'translate') hint = '选择定义平移向量的两个点 / pick 2 points';
  else if (kind === 'rotate') hint = '选择旋转中心与方向点 / pick center + direction';
  else if (kind === 'reflect') hint = '选择对称轴上的两个点 / pick 2 points on the mirror';
  else if (kind === 'dilate') hint = '选择位似中心 / pick center';
  pendingAction = { kind, objs, hint, points: [] };
  pending = [];
  pendingObjects = [];
  updateStatus();
}

function commitTransform(explicitAct) {
  const act = explicitAct || pendingAction;
  if (!act) return;
  const { kind, objs } = act;
  snapshot();
  const byId = new Map();
  const ensurePoint = (p, extra = {}) => {
    if (byId.has(p.id)) return byId.get(p.id);
    const obj = board.create(PT, {
      parents: [p.id, ...(extra.parents || [])],
      free: false, derived: 'transform',
      attrs: extra.attrs || { kind, args: [], baseA: extra.baseA, k: extra.k },
      ...extra
    });
    byId.set(p.id, obj);
    return obj;
  };
  const opts = {};
  for (const o of objs) {
    if (o.type === PT) {
      ensurePoint(o, { attrs: transformAttrs(kind, act) });
    } else if (o.type === SEG || o.type === LINE || o.type === RAY || o.type === VEC) {
      const a = board.get(o.parents[0]), b = board.get(o.parents[1]);
      if (!a || !b) continue;
      const pa = ensurePoint(a, { attrs: transformAttrs(kind, act) });
      const pb = ensurePoint(b, { attrs: transformAttrs(kind, act) });
      if (o.type === SEG) board.addSegment(pa.id, pb.id);
      else if (o.type === LINE) board.addLine(pa.id, pb.id);
      else if (o.type === RAY) board.addRay(pa.id, pb.id);
      else board.addVector(pa.id, pb.id);
    } else if (o.type === CIRCLE) {
      const c = board.get(o.parents[0]);
      if (!c) continue;
      const pc = ensurePoint(c, { attrs: transformAttrs(kind, act) });
      if (o.fixedR) board.addCircleR(pc.id, o.fixedR * (kind === 'dilate' ? (act.k || 2) : 1));
      else {
        const tp = board.get(o.parents[1]);
        const pt = tp ? ensurePoint(tp, { attrs: transformAttrs(kind, act) }) : null;
        if (pt) board.addCircle(pc.id, pt.id);
      }
    } else if (o.type === POLY || o.type === REGION) {
      const ids = o.parents.map((id) => board.get(id)).filter(Boolean).map((p) => ensurePoint(p, { attrs: transformAttrs(kind, act) }).id);
      if (ids.length >= 3) { if (o.type === POLY) board.addPolygon(ids); else board.addRegion(ids); }
    }
  }
  void opts;
  pendingAction = null;
  pending = [];
  refreshSelection(); requestRender(); persist();
  updateStatus();
}

function transformAttrs(kind, act) {
  const pts = act.points;
  const attrs = { kind, args: [] };
  if (kind === 'translate' && pts.length >= 2) { attrs.baseA = pts[0].id; }
  if (kind === 'dilate') { attrs.k = act.k || 2; }
  return attrs;
}

/* ============================ 对象列表 ============================ */
const TYPE_LABEL_KEY = {
  [PT]: 'geo.point', [SEG]: 'geo.segment', [LINE]: 'geo.line', [RAY]: 'geo.ray', [VEC]: 'geo.vector',
  [CIRCLE]: 'geo.circle', [ARC]: 'geo.arc', [POLY]: 'geo.polygon', [REGION]: 'geo.region',
  [MEASURE]: 'geo.measures', [TEXT]: 'geo.label', [FN]: 'geo.tool.function'
};

const TYPE_ICON = {
  [PT]: 'point', [SEG]: 'segment', [LINE]: 'line', [RAY]: 'ray', [VEC]: 'segment',
  [CIRCLE]: 'circle', [ARC]: 'arc', [POLY]: 'polygon', [REGION]: 'area',
  [MEASURE]: 'ruler', [TEXT]: 'text', [FN]: 'function'
};

/* 选择变化后的统一刷新 */
function refreshSelection() {
  renderObjList();
  renderInspector();
  renderMeasures();
  updateStatus();
  requestRender();
}

function renderObjList() {
  const host = $('#objList');
  const objs = board.all();
  host.innerHTML = '';
  if (!objs.length) {
    const empty = el('div', { class: 'empty' }, [
      el('span', { html: icon('shapes', { size: 26 }) }),
      el('span', { text: t('geo.emptyTitle') }),
      el('span', { class: 'text-xs text-dim', text: t('geo.emptyHint') }),
      el('div', { class: 'row-inline', style: { justifyContent: 'center', marginTop: '4px' } }, [
        el('button', { class: 'btn btn-sm btn-primary', type: 'button', text: t('geo.sampleGsp'), onclick: () => buildSample() }),
        el('button', { class: 'btn btn-sm', type: 'button', text: t('geo.tool.point'), onclick: () => selectTool('point') })
      ])
    ]);
    host.appendChild(empty);
    return;
  }
  objs.forEach((o) => {
    const row = el('div', {
      class: 'geo-obj' + (board.selection.includes(o.id) ? ' selected' : '') + (o.visible ? '' : ' is-hidden'),
      title: t(TYPE_LABEL_KEY[o.type] || 'geo.objects'),
      onclick: (e) => {
        if (e.shiftKey) {
          board.selection = board.selection.includes(o.id) ? board.selection.filter((x) => x !== o.id) : [...board.selection, o.id];
        } else {
          board.selection = [o.id];
        }
        refreshSelection();
      }
    }, [
      el('span', { class: 'glyph', html: icon(TYPE_ICON[o.type] || 'dot', { size: 14 }) }),
      el('span', { class: 'name', text: o.name + (o.type === PT ? '  (' + fmt(o.x, 2) + ', ' + fmt(o.y, 2) + ')' : o.type === MEASURE ? '  ' + (o.label || '') : o.type === FN ? '  y=' + o.source : '') }),
      el('button', {
        class: 'btn-icon btn-sm', type: 'button', html: icon(o.visible ? 'eye' : 'eyeOff', { size: 13 }),
        onclick: (e) => { e.stopPropagation(); o.visible = !o.visible; renderObjList(); requestRender(); persist(); }
      })
    ]);
    host.appendChild(row);
  });
}

function renderMeasures() {
  const host = $('#measureList');
  const ms = board.all().filter((o) => o.type === MEASURE);
  host.innerHTML = '';
  if (!ms.length) {
    host.innerHTML = '<div class="text-xs text-dim">' + t('geo.measures') + '</div>';
    return;
  }
  ms.forEach((m) => {
    host.appendChild(el('div', { class: 'geo-measure' }, [
      el('span', { text: m.name }),
      el('b', { text: m.label || board.measureText(m) })
    ]));
  });
}

/* ============================ 属性面板 ============================ */
function renderInspector() {
  const host = $('#inspector');
  host.innerHTML = '';
  const sel = board.selection.map((id) => board.get(id)).filter(Boolean);
  if (!sel.length) {
    host.innerHTML = '<p class="text-sm text-dim">' + t('geo.noSelection') + '</p>';
    return;
  }
  const o = sel[0];
  host.appendChild(el('div', { class: 'field' }, [
    el('label', { text: t('common.name') }),
    el('input', { class: 'input input-sm', value: o.name, oninput: (e) => { o.name = e.target.value; renderObjList(); updateStatus(); requestRender(); persist(); } })
  ]));
  if (o.type !== MEASURE && o.type !== TEXT) {
    host.appendChild(el('div', { class: 'field' }, [
      el('label', { text: t('common.color') }),
      el('input', {
        type: 'color', value: theme.toHex(o.style?.color || defaultColor(o), '#3fb950'),
        oninput: (e) => { o.style = { ...(o.style || {}), color: e.target.value }; requestRender(); persist(); }
      })
    ]));
    const widthInput = el('input', { type: 'range', min: '0.6', max: '5', step: '0.1', value: String(o.style?.width || board.style.lineWidth) });
    widthInput.addEventListener('input', () => { o.style = { ...(o.style || {}), width: Number(widthInput.value) }; requestRender(); persist(); });
    host.appendChild(el('div', { class: 'field' }, [el('label', { text: t('common.width') }), widthInput]));
  }
  if (o.type === FN) {
    const inp = el('input', { class: 'input input-sm mono', value: o.source || '' });
    inp.addEventListener('change', () => {
      const res = tryCompile(inp.value);
      if (res.error) { toast(res.error, { type: 'err' }); return; }
      o.source = inp.value;
      o.compiled = { fn: (scope) => res.fn(scope) };
      renderObjList(); requestRender(); persist();
    });
    host.appendChild(el('div', { class: 'field' }, [el('label', { text: t('plot.expr') }), inp]));
  }
  if (o.type === PT) {
    host.appendChild(el('div', { class: 'row-inline' }, [
      el('label', { class: 'checkbox' }, [el('input', { type: 'checkbox', checked: board.traceOf(o.id) ? true : false, onchange: (e) => {
        if (e.target.checked) board.pushTrace(o.id, o);
        else board.traces = board.traces.filter((x) => x.id !== o.id);
        requestRender();
      } }), el('span', { text: t('geo.tool.trace') })]),
      el('button', { class: 'btn btn-sm', type: 'button', text: t('common.clear'), onclick: () => { board.traces = board.traces.filter((x) => x.id !== o.id); requestRender(); } })
    ]));
  }
  host.appendChild(el('div', { class: 'row-inline mt-3' }, [
    el('button', {
      class: 'btn btn-sm', type: 'button', text: t('common.visible'),
      onclick: () => { o.visible = !o.visible; renderObjList(); requestRender(); persist(); }
    }),
    el('button', {
      class: 'btn btn-sm btn-danger', type: 'button', text: t('common.delete'),
      onclick: () => { snapshot(); board.remove(o.id); refreshSelection(); requestRender(); persist(); }
    })
  ]));
}

/* 以画布中心为基准缩放 */
function zoomBy(factor) {
  const cx = board.width / 2, cy = board.height / 2;
  const before = board.toWorld(cx, cy);
  board.scale = clamp(board.scale * factor, 4, 400);
  const after = board.toWorld(cx, cy);
  board.origin.x += (after.x - before.x) * board.scale;
  board.origin.y -= (after.y - before.y) * board.scale;
  board.recompute();
  requestRender();
  persist();
}

function defaultColor(o) {
  if (o.type === PT) return board.style.pointColor;
  if (o.type === CIRCLE || o.type === ARC || o.type === FN) return board.style.curveColor;
  return board.style.ink;
}

/* ============================ 画布交互 ============================ */
let dragging = null;      // { id, offX, offY }
let panning = null;       // { x, y }
let spaceDown = false;
let dragMoved = false;

on(canvas, 'pointerdown', (e) => {
  const screen = screenOf(e);
  canvas.setPointerCapture(e.pointerId);
  dragMoved = false;
  const hit = board.hitTest(screen);
  board.hover = hit ? hit.id : null;

  if (e.button === 1 || spaceDown) {
    panning = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (e.button !== 0) return;

  if (tool.key === 'select' || tool.key === 'trace') {
    if (hit && hit.type === PT && hit.free) {
      snapshot();
      dragging = { id: hit.id, screen };
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (hit) {
      if (e.shiftKey) board.selection = board.selection.includes(hit.id) ? board.selection.filter((x) => x !== hit.id) : [...board.selection, hit.id];
      else board.selection = [hit.id];
      refreshSelection();
      return;
    }
    panning = { x: e.clientX, y: e.clientY };
    if (!e.shiftKey) { board.selection = []; refreshSelection(); }
  }
});

on(canvas, 'pointermove', (e) => {
  const screen = screenOf(e);
  const world = board.toWorld(screen.x, screen.y);
  $('#geoCursor').textContent = 'x ' + fmt(world.x, 3) + ' , y ' + fmt(world.y, 3);

  if (panning) {
    const dx = e.clientX - panning.x, dy = e.clientY - panning.y;
    board.origin.x += dx;
    board.origin.y += dy;
    panning = { x: e.clientX, y: e.clientY };
    dragMoved = true;
    requestRender();
    return;
  }
  if (dragging) {
    const p = board.get(dragging.id);
    if (p && p.free) {
      const snap = viewState.snap ? board.snap(world, screen, { gridOn: true, gridSize: viewState.gridSize, exclude: [p.id] }) : { kind: 'free', world };
      const target = snap.world || world;
      board.movePoint(p.id, target);
      if (board.traceOf(p.id)) board.pushTrace(p.id, { x: p.x, y: p.y });
      dragMoved = true;
      renderMeasures();
      requestRender();
    }
    return;
  }
  const hit = board.hitTest(screen);
  const newHover = hit ? hit.id : null;
  if (newHover !== board.hover) {
    board.hover = newHover;
    canvas.style.cursor = hit ? (tool.key === 'select' && hit.type === PT && hit.free ? 'grab' : 'pointer') : 'crosshair';
    requestRender();
  }
});

on(window, 'pointerup', () => {
  if (dragging && dragMoved) persist();
  dragging = null;
  panning = null;
  canvas.style.cursor = 'crosshair';
});

on(canvas, 'pointerleave', () => {
  board.hover = null;
  requestRender();
});

on(canvas, 'click', (e) => {
  if (dragMoved) { dragMoved = false; return; }
  const screen = screenOf(e);
  const hit = board.hitTest(screen);

  /* 变换的第二阶段：收集点 */
  if (pendingAction) {
    const p = resolvePoint(screen);
    if (p) pendingAction.points.push(p);
    const need = pendingAction.kind === 'dilate' ? 1 : 2;
    if (pendingAction.points.length >= need) {
      if (pendingAction.kind === 'dilate') {
        const act = pendingAction;
        pendingAction = null;
        promptNum(t('geo.askScale'), 2, t('geo.askScaleHint')).then((k) => {
          if (k !== null) { act.k = k; commitTransform(act); }
          else updateStatus();
        });
      } else {
        commitTransform(pendingAction);
      }
    }
    updateStatus();
    requestRender();
    return;
  }

  if (tool.key === 'select' || tool.key === 'trace') return;

  /* 需要对象的工具 */
  const need = tool.needs;
  if (need === 'object+object' || need === 'polygon' || need === 'circle' || need === 'line+point') {
    const obj = hit && hit.type !== PT ? hit : (hit || null);
    if (obj) pendingObjects.push(obj);
    if (need === 'line+point' && pendingObjects.length && pending.length) applyTool();
    else if (need === 'object+object' && pendingObjects.length >= 2) applyTool();
    else if ((need === 'polygon' || need === 'circle') && pendingObjects.length >= 1) applyTool();
    updateStatus();
    requestRender();
    return;
  }
  if (typeof need === 'string' && need.startsWith('objects+')) return;

  /* 点类工具 */
  const p = resolvePoint(screen);
  if (!p) return;
  if (tool.key === 'point' || tool.key === 'text' || need === 1) {
    pending.push(p);
    if (tool.key === 'text') { applyTool(); return; }
    if (tool.key === 'point') { pending = []; board.selection = [p.id]; }
    else applyTool();
    refreshSelection();
    return;
  }
  pending.push(p);
  if (typeof need === 'number' && pending.length >= need) applyTool();
  else { renderObjList(); updateStatus(); requestRender(); }
});

on(canvas, 'dblclick', () => {
  if (tool.needs === '*' && pending.length >= (tool.min || 3)) applyTool();
});

on(canvas, 'wheel', (e) => {
  e.preventDefault();
  const screen = screenOf(e);
  const before = board.toWorld(screen.x, screen.y);
  const factor = Math.pow(1.0015, -e.deltaY);
  board.scale = clamp(board.scale * factor, 4, 400);
  const after = board.toWorld(screen.x, screen.y);
  board.origin.x += (after.x - before.x) * board.scale;
  board.origin.y -= (after.y - before.y) * board.scale;
  board.recompute();
  requestRender();
  persist();
}, { passive: false });

on(canvas, 'contextmenu', (e) => {
  e.preventDefault();
  pending = [];
  pendingObjects = [];
  pendingAction = null;
  board.selection = [];
  refreshSelection();
  updateStatus();
});

/* ============================ 工具栏 ============================ */
function renderTools() {
  const host = $('#geoTools');
  host.innerHTML = '';
  TOOL_GROUPS.forEach((group) => {
    const wrap = el('div', { class: 'geo-tool-group' });
    group.tools.forEach((tl) => {
      const btn = el('button', {
        class: 'btn-icon btn-sm hint' + (tool.key === tl.key ? ' active' : ''),
        type: 'button',
        dataset: { hint: t(tl.label) + (tl.hotkey ? ' · ' + tl.hotkey.toUpperCase() : '') },
        html: icon(tl.ico, { size: 16 }),
        onclick: () => selectTool(tl.key)
      });
      wrap.appendChild(btn);
    });
    host.appendChild(wrap);
  });
}

function selectTool(key) {
  const tl = TOOLS.find((x) => x.key === key);
  if (!tl) return;
  pendingAction = null;
  /* 变换类工具：先选中对象，再进入"选取参考点"的第二阶段 */
  if (typeof tl.needs === 'string' && tl.needs.startsWith('objects+')) {
    tool = tl;
    pending = [];
    pendingObjects = [];
    renderTools();
    canvas.style.cursor = 'crosshair';
    startTransform(tl.key);
    updateStatus();
    return;
  }
  tool = tl;
  pending = [];
  pendingObjects = [];
  renderTools();
  canvas.style.cursor = key === 'select' ? 'default' : 'crosshair';
  updateStatus();
}

/* 自定义输入弹窗（比 window.prompt 更友好，且不会阻塞无头环境/被浏览器拦截） */
function askValue({ title, label = '', value = '', hint = '', type = 'text', okText }) {
  return new Promise((resolve) => {
    const input = el('input', { class: 'input mono', type, value: String(value), style: { fontSize: 'var(--fs-lg)' } });
    const body = el('div', { class: 'col' }, [
      label ? el('label', { class: 'label', text: label }) : null,
      input,
      hint ? el('p', { class: 'text-xs text-dim', text: hint }) : null
    ].filter(Boolean));
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const m = modal({
      title,
      body,
      footer: [
        el('button', { class: 'btn btn-sm', type: 'button', text: t('common.cancel'), onclick: () => { finish(null); m.close(); } }),
        el('button', {
          class: 'btn btn-sm btn-primary', type: 'button', text: okText || t('common.confirm'),
          onclick: () => { const v = input.value.trim(); finish(v === '' ? null : v); m.close(); }
        })
      ],
      onClose: () => finish(null)
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const v = input.value.trim(); finish(v === '' ? null : v); m.close(); }
    });
    setTimeout(() => { input.focus(); input.select?.(); }, 40);
  });
}

async function promptNum(title, def, hint = '') {
  const raw = await askValue({ title, value: def, type: 'number', hint });
  if (raw === null) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) { toast(t('geo.badNumber'), { type: 'warn' }); return null; }
  return num;
}

async function promptText(title, def) {
  const raw = await askValue({ title, value: def, type: 'text' });
  return raw;
}

/* ============================ 示例构造 ============================ */
function buildSample() {
  snapshot();
  const A = board.addFreePoint({ x: -3, y: -1.8 }, { name: 'A' });
  const B = board.addFreePoint({ x: 3.4, y: -1.2 }, { name: 'B' });
  const C = board.addFreePoint({ x: 0.4, y: 2.6 }, { name: 'C' });
  const sAB = board.addSegment(A.id, B.id);
  const sBC = board.addSegment(B.id, C.id);
  const sCA = board.addSegment(C.id, A.id);
  // 三条高
  const fA = board.addLine(B.id, C.id);
  const fB = board.addLine(C.id, A.id);
  const fC = board.addLine(A.id, B.id);
  const hA = board.addPerpendicular(fA.id, A.id);
  const hB = board.addPerpendicular(fB.id, B.id);
  const hC = board.addPerpendicular(fC.id, C.id);
  const O1 = board.addIntersection(hA.id, hB.id, 0);
  O1.name = 'H';
  // 中线与外心（中垂线交点）
  const mAB = board.addMidpoint(A.id, B.id);
  const pbAB = board.addPerpBisector(A.id, B.id);
  const pbBC = board.addPerpBisector(B.id, C.id);
  const O2 = board.addIntersection(pbAB.id, pbBC.id, 0);
  O2.name = 'O';
  const circle = board.addCircle(O2.id, A.id);
  circle.name = 'c₁';
  board.addMeasure('angle', [A.id, B.id, C.id]);
  board.addMeasure('length', [A.id, B.id]);
  board.addMeasure('area', [board.addPolygon([A.id, B.id, C.id]).id]);
  void sAB; void sBC; void sCA; void hC; void mAB;
  board.selection = [];
  refreshSelection(); requestRender(); persist();
  toast(t('geo.sampleGsp'), { type: 'ok' });
}

/* ============================ 导出 ============================ */
function boardToSVG() {
  const W = board.width, H = board.height;
  const th = readTheme();
  const S = (p) => board.toScreen(p);
  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">');
  parts.push('<rect width="' + W + '" height="' + H + '" fill="' + th.canvas + '"/>');
  if (viewState.grid) {
    const px = viewState.gridSize * board.scale;
    if (px > 6) {
      let d = '';
      for (let x = board.origin.x % px; x < W; x += px) d += 'M' + x.toFixed(1) + ' 0V' + H;
      for (let y = board.origin.y % px; y < H; y += px) d += 'M0 ' + y.toFixed(1) + 'H' + W;
      parts.push('<path d="' + d + '" stroke="' + th['--grid-minor'] + '" stroke-width="1" fill="none"/>');
    }
  }
  if (viewState.axes) {
    const O = board.toScreen({ x: 0, y: 0 });
    parts.push('<path d="M0 ' + O.y.toFixed(1) + 'H' + W + 'M' + O.x.toFixed(1) + ' 0V' + H + '" stroke="' + th['--axis'] + '" stroke-width="1.3" fill="none"/>');
  }
  for (const o of board.all()) {
    if (!o.visible) continue;
    const color = theme.toHex(o.style?.color || defaultColor(o), '#3fb950');
    const wdt = o.style?.width || board.style.lineWidth;
    if (o.type === SEG || o.type === LINE || o.type === RAY || o.type === VEC) {
      const info = linearDir(board, o);
      if (!info || !info.p) continue;
      const L = len(info.d);
      if (L < 1e-9) continue;
      const u = { x: info.d.x / L, y: info.d.y / L };
      const big = (W + H) / board.scale;
      let a, b;
      if (o.type === SEG || o.type === VEC) {
        a = S(info.p); b = S(board.get(o.parents[1]));
      } else if (o.type === RAY) {
        a = S(info.p); b = S({ x: info.p.x + u.x * big, y: info.p.y + u.y * big });
      } else {
        a = S({ x: info.p.x - u.x * big, y: info.p.y - u.y * big });
        b = S({ x: info.p.x + u.x * big, y: info.p.y + u.y * big });
      }
      parts.push('<path d="M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + 'L' + b.x.toFixed(1) + ' ' + b.y.toFixed(1) + '" stroke="' + color + '" stroke-width="' + wdt + '" fill="none" stroke-linecap="round"/>');
    } else if (o.type === CIRCLE && o.center) {
      const C = S(o.center);
      parts.push('<circle cx="' + C.x.toFixed(1) + '" cy="' + C.y.toFixed(1) + '" r="' + (o.r * board.scale).toFixed(1) + '" stroke="' + color + '" stroke-width="' + wdt + '" fill="none"/>');
    } else if (o.type === POLY || o.type === REGION) {
      const pts = o.parents.map((id) => board.get(id)).filter(Boolean).map(S);
      if (pts.length < 2) continue;
      parts.push('<path d="M' + pts.map((p) => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join('L') + 'Z" fill="' + rgbaStr(color, 0.14) + '" stroke="' + color + '" stroke-width="' + wdt + '"/>');
    } else if (o.type === PT) {
      const P = S(o);
      parts.push('<circle cx="' + P.x.toFixed(1) + '" cy="' + P.y.toFixed(1) + '" r="4" fill="' + color + '"/>');
    } else if (o.type === TEXT) {
      const P = S(o);
      parts.push('<text x="' + P.x.toFixed(1) + '" y="' + P.y.toFixed(1) + '" fill="' + th.ink + '" font-size="13" font-family="sans-serif">' + String(o.text || '').replace(/[<>&]/g, '') + '</text>');
    }
  }
  if (viewState.labels) {
    for (const o of board.all()) {
      if (!o.visible || !o.name || o.type === TEXT) continue;
      let anchor = null;
      if (o.type === PT) { const P = S(o); anchor = { x: P.x + 9, y: P.y - 9 }; }
      else if (o.type === CIRCLE && o.center) { const P = S({ x: o.center.x + o.r * 0.707, y: o.center.y + o.r * 0.707 }); anchor = { x: P.x + 6, y: P.y }; }
      if (anchor) parts.push('<text x="' + anchor.x.toFixed(1) + '" y="' + anchor.y.toFixed(1) + '" fill="' + th.ink + '" font-size="12" font-family="monospace">' + o.name + '</text>');
    }
  }
  parts.push('</svg>');
  return parts.join('\n');
}

async function exportPNG(scale = 2) {
  const W = board.width, H = board.height, sc = board.scale, ox = board.origin.x, oy = board.origin.y;
  const tmp = document.createElement('canvas');
  tmp.width = Math.round(W * scale);
  tmp.height = Math.round(H * scale);
  const tctx = tmp.getContext('2d');
  board.width = W * scale;
  board.height = H * scale;
  board.scale = sc * scale;
  board.origin = { x: ox * scale, y: oy * scale };
  renderBoard(tctx, board, {
    theme: readTheme(), dpr: 1, grid: viewState.grid, axes: viewState.axes, labels: viewState.labels, gridSize: viewState.gridSize
  });
  board.width = W; board.height = H; board.scale = sc; board.origin = { x: ox, y: oy };
  const blob = await new Promise((res) => tmp.toBlob(res, 'image/png'));
  if (blob) downloadBlob(blob, 'geometry-' + Date.now() + '.png');
  toast(t('geo.saved'), { type: 'ok' });
}

/* ============================ 持久化 ============================ */
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.save('geometry', { board: board.toJSON(), view: viewState, viewport: { origin: board.origin, scale: board.scale } });
  }, 500);
}

function restoreState() {
  const saved = store.load('geometry', null);
  if (saved && saved.board && saved.board.objects && saved.board.objects.length) {
    try {
      board.loadJSON(saved.board);
      if (saved.viewport) {
        board.origin = { ...board.origin, ...saved.viewport.origin };
        board.scale = saved.viewport.scale || board.scale;
      }
      if (saved.view) viewState = { ...viewState, ...saved.view };
      return true;
    } catch { /* fallthrough */ }
  }
  return false;
}

/* ============================ 启动 ============================ */
function boot() {
  initChrome('geometry');
  renderTools();

  $('#btnUndo').innerHTML = icon('undo', { size: 16 });
  $('#btnRedo').innerHTML = icon('redo', { size: 16 });
  $('#btnSample').innerHTML = icon('sparkle', { size: 16 });
  $('#btnClearBoard').innerHTML = icon('trash', { size: 16 });

  $('#btnUndo').addEventListener('click', doUndo);
  $('#btnRedo').addEventListener('click', doRedo);
  $('#btnSample').addEventListener('click', buildSample);
  $('#btnClearBoard').addEventListener('click', () => {
    modal({
      title: t('common.clear'),
      body: '<p>' + t('geo.cleared') + '?</p>',
      footer: [
        el('button', { class: 'btn btn-sm', type: 'button', text: t('common.cancel'), onclick: (e) => e.target.closest('.modal-backdrop').remove() }),
        el('button', {
          class: 'btn btn-sm btn-danger', type: 'button', text: t('common.confirm'),
          onclick: (e) => {
            e.target.closest('.modal-backdrop').remove();
            snapshot(); board.clear(); refreshSelection(); requestRender(); persist();
          }
        })
      ]
    });
  });

  const restored = restoreState();
  resizeCanvas();
  void restored;
  renderObjList();
  renderMeasures();
  renderInspector();
  updateHistoryButtons();
  requestRender();

  $('#optGrid').checked = viewState.grid;
  $('#optAxes').checked = viewState.axes;
  $('#optLabels').checked = viewState.labels;
  $('#optSnap').checked = viewState.snap;
  $('#optGridSize').value = String(viewState.gridSize);
  $('#optGrid').addEventListener('change', (e) => { viewState.grid = e.target.checked; requestRender(); persist(); });
  $('#optAxes').addEventListener('change', (e) => { viewState.axes = e.target.checked; requestRender(); persist(); });
  $('#optLabels').addEventListener('change', (e) => { viewState.labels = e.target.checked; board.labels = e.target.checked; requestRender(); persist(); });
  $('#optSnap').addEventListener('change', (e) => { viewState.snap = e.target.checked; persist(); });
  $('#optGridSize').addEventListener('change', (e) => { viewState.gridSize = Math.max(0.1, Number(e.target.value) || 1); requestRender(); persist(); });
  $('#btnZoomIn').addEventListener('click', () => { zoomBy(1.25); });
  $('#btnZoomOut').addEventListener('click', () => { zoomBy(0.8); });
  $('#btnHome').addEventListener('click', () => {
    board.origin = { x: board.width / 2, y: board.height / 2 };
    board.scale = 46;
    requestRender(); persist();
  });
  $('#zoomInBtn')?.addEventListener('click', () => zoomBy(1.25));
  $('#zoomOutBtn')?.addEventListener('click', () => zoomBy(0.8));

  $('#expPng').addEventListener('click', () => exportPNG(2));
  $('#expSvg').addEventListener('click', () => {
    downloadText(boardToSVG(), 'geometry-' + Date.now() + '.svg', 'image/svg+xml;charset=utf-8');
    toast(t('geo.exportSvg'), { type: 'ok' });
  });
  $('#expJson').addEventListener('click', () => {
    downloadText(JSON.stringify(board.toJSON(), null, 2), 'geometry-' + Date.now() + '.json', 'application/json');
    toast(t('geo.exportJson'), { type: 'ok' });
  });
  $('#impJson').addEventListener('click', async () => {
    const res = await readJSONFile();
    if (!res) return;
    if (res.error) { toast(t('settings.importFailed'), { type: 'err' }); return; }
    snapshot();
    try {
      board.loadJSON(res.data);
      refreshSelection(); requestRender(); persist();
      toast(t('common.load'), { type: 'ok' });
    } catch { toast(t('settings.importFailed'), { type: 'err' }); }
  });

  /* 函数图像工具 */
  $('#fnAdd').addEventListener('click', () => {
    const src = $('#fnInput').value.trim();
    if (!src) return;
    const res = tryCompile(src);
    if (res.error) { toast(res.error, { type: 'err' }); return; }
    snapshot();
    board.create(FN, { source: src, compiled: { fn: (scope) => res.fn(scope) }, style: { color: theme.toHex(theme.tokens()['--accent-2'] || '#d29922') } });
    refreshSelection(); persist();
  });

  /* 快捷键 */
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) doRedo(); else doUndo();
      return;
    }
    if (e.key === 'Escape') {
      pending = []; pendingObjects = []; pendingAction = null;
      board.selection = [];
      refreshSelection(); updateStatus();
      return;
    }
    if (typing) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (board.selection.length) {
        snapshot();
        board.selection.forEach((id) => board.remove(id));
        board.selection = [];
        refreshSelection(); requestRender(); persist();
      }
      return;
    }
    if (e.code === 'Space') { spaceDown = true; canvas.style.cursor = 'grab'; }
    const k = e.key.toLowerCase();
    const tl = TOOLS.find((x) => x.hotkey === k);
    if (tl) selectTool(tl.key);
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceDown = false; canvas.style.cursor = 'crosshair'; }
  });

  window.addEventListener('resize', debounce(resizeCanvas, 120));
  window.addEventListener('bzm:modechange', () => requestRender());
  theme.subscribe(() => requestRender());
  initReveal();

  registerCommand({ label: t('geo.sampleGsp'), hint: '', ico: 'sparkle', run: buildSample });
  registerCommand({ label: t('geo.undo'), hint: 'Ctrl Z', ico: 'undo', run: doUndo });
  registerCommand({ label: t('geo.exportPng'), hint: '', ico: 'download', run: () => exportPNG(2) });

  board.onChange(() => requestRender());
  selectTool('point');
  updateStatus();
  void viewState; void arcParams; void add; void mul; void norm; void mid; void sub; void distToSegment; void polygonCentroid;
}

boot();
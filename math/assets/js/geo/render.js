/* geo-render.js — 几何画板渲染层（Canvas 2D）
   绘制网格、坐标轴、点/线/圆/弧/多边形、函数图像、测量标签、轨迹与选中效果。 */
import { TYPES, norm, sub, add, mul, mid, len, polygonCentroid } from './engine.js';
import { parseColor } from '../plot/engine.js';

const { PT, SEG, LINE, RAY, VEC, CIRCLE, ARC, POLY, MEASURE, TEXT, FN, LOCUS, TRACE, REGION } = TYPES;

export const THEME_KEYS = ['--canvas-bg', '--grid-minor', '--grid-major', '--axis', '--axis-label', '--geo-ink', '--geo-helper', '--accent', '--accent-2'];

export function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  THEME_KEYS.forEach((k) => { out[k] = cs.getPropertyValue(k).trim(); });
  out.ink = out['--geo-ink'] || '#e8ecff';
  out.helper = out['--geo-helper'] || '#7f8ab0';
  out.accent = out['--accent'] || '#3fb950';
  out.accent2 = out['--accent-2'] || '#d29922';
  out.canvas = out['--canvas-bg'] || '#080a13';
  return out;
}

export function rgbaStr(c, a) {
  const [r, g, b, alpha = 1] = parseColor(c, [128, 128, 128, 1]);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a * alpha + ')';
}

/* 回放模式：只显示 createdAt <= replayIndex 的对象 */
function visibleList(board, opts) {
  const all = board.all();
  const idx = opts.replayIndex;
  if (idx === undefined || idx === null) return all;
  return all.filter((o) => (o.createdAt === undefined ? true : o.createdAt <= idx));
}

export function renderBoard(ctx, board, opts = {}) {
  const theme = opts.theme || readTheme();
  const W = board.width, H = board.height;
  const S = (p) => board.toScreen(p);
  const dpr = opts.dpr || 1;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = theme.canvas;
  ctx.fillRect(0, 0, W, H);

  if (opts.grid !== false) drawGrid(ctx, board, theme, opts);
  if (opts.axes !== false) drawAxes(ctx, board, theme, opts);

  // 动态轨迹（由驱动点扫描生成，随拖动实时更新）
  for (const locus of board.locuses || []) {
    if (!locus.points || locus.points.length < 2) continue;
    ctx.save();
    ctx.strokeStyle = rgbaStr(theme.accent, 0.95);
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    locus.points.forEach((p, i) => {
      const s = S(p);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // 手动轨迹
  for (const tr of board.traces) {
    if (!tr.pts || tr.pts.length < 2) continue;
    ctx.save();
    ctx.strokeStyle = rgbaStr(theme.accent2, 0.55);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    tr.pts.forEach((p, i) => {
      const s = S(p);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  const objects = visibleList(board, opts);
  // 填充类先画
  for (const o of objects) {
    if (!o.visible) continue;
    if (o.type === POLY || o.type === REGION) drawPolygon(ctx, board, o, theme, opts);
  }
  for (const o of objects) {
    if (!o.visible) continue;
    switch (o.type) {
      case CIRCLE: drawCircle(ctx, board, o, theme, opts); break;
      case ARC: drawArc(ctx, board, o, theme, opts); break;
      case LINE: case RAY: case SEG: case VEC: drawLinear(ctx, board, o, theme, opts); break;
      case FN: drawFunction(ctx, board, o, theme, opts); break;
      default: break;
    }
  }
  // 点与标签最后画
  for (const o of objects) {
    if (!o.visible) continue;
    if (o.type === PT) drawPoint(ctx, board, o, theme, opts);
  }
  if (opts.labels !== false && board.labels) {
    for (const o of objects) {
      if (!o.visible) continue;
      drawLabel(ctx, board, o, theme, opts);
    }
  }
  for (const o of objects) {
    if (!o.visible) continue;
    if (o.type === MEASURE) drawMeasure(ctx, board, o, theme, opts);
    if (o.type === TEXT) drawText(ctx, board, o, theme, opts);
  }
  ctx.restore();
}

function drawGrid(ctx, board, theme, opts) {
  const stepW = opts.gridSize || 1;
  const px = stepW * board.scale;
  if (px < 8) return;
  const W = board.width, H = board.height;
  const o = board.origin;
  ctx.save();
  ctx.fillStyle = theme['--grid-minor'] || 'rgba(255,255,255,0.055)';
  ctx.beginPath();
  const startX = o.x % px;
  for (let x = startX; x < W; x += px) { const X = Math.round(x) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, H); }
  const startY = o.y % px;
  for (let y = startY; y < H; y += px) { const Y = Math.round(y) + 0.5; ctx.moveTo(0, Y); ctx.lineTo(W, Y); }
  ctx.strokeStyle = theme['--grid-minor'] || 'rgba(255,255,255,0.055)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawAxes(ctx, board, theme, opts) {
  const W = board.width, H = board.height;
  const O = board.toScreen({ x: 0, y: 0 });
  ctx.save();
  ctx.strokeStyle = theme['--axis'] || 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  if (O.y >= 0 && O.y <= H) { ctx.moveTo(0, Math.round(O.y) + 0.5); ctx.lineTo(W, Math.round(O.y) + 0.5); }
  if (O.x >= 0 && O.x <= W) { ctx.moveTo(Math.round(O.x) + 0.5, 0); ctx.lineTo(Math.round(O.x) + 0.5, H); }
  ctx.stroke();
  if (opts.ticks !== false) {
    ctx.fillStyle = theme['--axis-label'] || '#8e97b8';
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const step = opts.gridSize || 1;
    const y0 = Math.max(0, Math.min(H, O.y));
    const x0 = Math.max(0, Math.min(W, O.x));
    for (let v = Math.ceil(board.toWorld(0, 0).x / step) * step; v * board.scale + board.origin.x < W; v += step) {
      if (Math.abs(v) < 1e-9) continue;
      const X = board.toScreen({ x: v, y: 0 }).x;
      if (X < 14 || X > W - 14) continue;
      ctx.fillText(String(Number(v.toFixed(4))), X, Math.min(H - 14, y0 + 5));
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = Math.ceil(board.toWorld(0, H).y / step) * step; board.toScreen({ x: 0, y: v }).y > 0; v += step) {
      if (Math.abs(v) < 1e-9) continue;
      const Y = board.toScreen({ x: 0, y: v }).y;
      if (Y < 10 || Y > H - 10) continue;
      ctx.fillText(String(Number(v.toFixed(4))), Math.max(20, x0 - 6), Y);
    }
  }
  ctx.restore();
}

function styleOf(o, theme, kind) {
  const s = o.style || {};
  if (kind === 'aux') return s.color || theme.helper;
  if (kind === 'curve') return s.color || theme.accent2;
  if (kind === 'point') return s.color || theme.accent;
  return s.color || theme.ink;
}

function isSelected(board, o) { return board.selection.includes(o.id); }
function isHover(board, o) { return board.hover === o.id; }

function drawPoint(ctx, board, o, theme, opts) {
  const S = board.toScreen(o);
  const sel = isSelected(board, o);
  const hov = isHover(board, o);
  const r = (o.style?.size || board.style.pointSize || 5) * (sel || hov ? 1.25 : 1);
  const color = sel ? (theme['--geo-select'] || '#fbbf24') : styleOf(o, theme, 'point');
  ctx.save();
  ctx.beginPath();
  ctx.arc(S.x, S.y, r + 1.6, 0, Math.PI * 2);
  ctx.fillStyle = rgbaStr(theme.canvas, 0.9);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(S.x, S.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (o.glue || o.derived) {
    ctx.beginPath();
    ctx.arc(S.x, S.y, r + 3.4, 0, Math.PI * 2);
    ctx.strokeStyle = rgbaStr(color, 0.5);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  if (board.traces.some((t) => t.id === o.id)) {
    ctx.beginPath();
    ctx.arc(S.x, S.y, r + 6.4, 0, Math.PI * 2);
    ctx.strokeStyle = rgbaStr(theme.accent2, 0.65);
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/* 计算线性对象的方向（含派生线） */
export function linearDir(board, o) {
  if (o.derived === 'perpendicular') {
    const base = board.get(o.parents[1]);
    const la = board.get(base?.parents?.[0]), lb = board.get(base?.parents?.[1]);
    if (!la || !lb) return null;
    const d = sub(lb, la);
    return { p: board.get(o.parents[0]), d: { x: -d.y, y: d.x } };
  }
  if (o.derived === 'parallel') {
    const base = board.get(o.parents[1]);
    const la = board.get(base?.parents?.[0]), lb = board.get(base?.parents?.[1]);
    if (!la || !lb) return null;
    return { p: board.get(o.parents[0]), d: sub(lb, la) };
  }
  if (o.derived === 'perpbisector') {
    const la = board.get(o.parents[0]), lb = board.get(o.parents[1]);
    if (!la || !lb) return null;
    const d = sub(lb, la);
    return { p: mid(la, lb), d: { x: -d.y, y: d.x } };
  }
  if (o.derived === 'anglebisector') {
    const a = board.get(o.parents[0]), b = board.get(o.parents[1]), c = board.get(o.parents[2]);
    if (!a || !b || !c) return null;
    const d1 = norm(sub(a, b)), d2 = norm(sub(c, b));
    const d = add(d1, d2);
    if (len(d) < 1e-9) return null;
    return { p: b, d: norm(d) };
  }
  const a = board.get(o.parents[0]), b = board.get(o.parents[1]);
  if (!a || !b) return null;
  return { p: a, d: sub(b, a), a, b };
}

function drawLinear(ctx, board, o, theme, opts) {
  const info = linearDir(board, o);
  if (!info || !info.p) return;
  const S = board.toScreen(info.p);
  const dir = info.d;
  const L = Math.hypot(dir.x, dir.y);
  if (L < 1e-9) return;
  const u = { x: dir.x / L, y: dir.y / L };
  const sel = isSelected(board, o), hov = isHover(board, o);
  const color = sel ? (theme['--geo-select'] || '#fbbf24') : styleOf(o, theme, o.derived ? 'aux' : '');
  const W = board.width, H = board.height;
  const big = (W + H) / board.scale * 2;
  let x1, y1, x2, y2;
  if (o.type === SEG) {
    const b = board.get(o.parents[1]);
    const S2 = board.toScreen(b);
    x1 = S.x; y1 = S.y; x2 = S2.x; y2 = S2.y;
  } else if (o.type === VEC) {
    const b = board.get(o.parents[1]);
    const S2 = board.toScreen(b);
    x1 = S.x; y1 = S.y; x2 = S2.x; y2 = S2.y;
  } else if (o.type === RAY) {
    const p2 = { x: info.p.x + u.x * big, y: info.p.y + u.y * big };
    const S2 = board.toScreen(p2);
    x1 = S.x; y1 = S.y; x2 = S2.x; y2 = S2.y;
  } else {
    const p1 = { x: info.p.x - u.x * big, y: info.p.y - u.y * big };
    const S1 = board.toScreen(p1);
    x1 = S1.x; y1 = S1.y; x2 = S.x + (S.x - S1.x); y2 = S.y + (S.y - S1.y);
  }
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = (o.style?.width || board.style.lineWidth) * (sel || hov ? 1.5 : 1);
  if (o.style?.dash) ctx.setLineDash(o.style.dash);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (o.type === VEC) {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const size = 9;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(ang - 0.42), y2 - size * Math.sin(ang - 0.42));
    ctx.lineTo(x2 - size * Math.cos(ang + 0.42), y2 - size * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

function drawCircle(ctx, board, o, theme, opts) {
  if (o.valid === false || !o.center) return;
  const C = board.toScreen(o.center);
  const r = o.r * board.scale;
  if (!Number.isFinite(r) || r <= 0.2) return;
  const sel = isSelected(board, o), hov = isHover(board, o);
  const color = sel ? (theme['--geo-select'] || '#fbbf24') : styleOf(o, theme, 'curve');
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = (o.style?.width || board.style.lineWidth) * (sel || hov ? 1.5 : 1);
  if (o.style?.dash) ctx.setLineDash(o.style.dash);
  ctx.beginPath();
  ctx.arc(C.x, C.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (o.fill) {
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  ctx.restore();
}

function drawArc(ctx, board, o, theme, opts) {
  if (o.valid === false || !o.center) return;
  const C = board.toScreen(o.center);
  const r = o.r * board.scale;
  if (!Number.isFinite(r) || r <= 0.2) return;
  // 屏幕 y 轴向下，角度取反
  const a0 = -o.a0, a1 = -o.a1;
  const sel = isSelected(board, o), hov = isHover(board, o);
  const color = sel ? (theme['--geo-select'] || '#fbbf24') : styleOf(o, theme, 'curve');
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = (o.style?.width || board.style.lineWidth) * (sel || hov ? 1.5 : 1);
  ctx.beginPath();
  ctx.arc(C.x, C.y, r, a0, a1, !o.ccw);
  ctx.stroke();
  ctx.restore();
}

function drawPolygon(ctx, board, o, theme, opts) {
  const pts = o.parents.map((id) => board.get(id)).filter(Boolean);
  if (pts.length < 2) return;
  const sel = isSelected(board, o), hov = isHover(board, o);
  const color = sel ? (theme['--geo-select'] || '#fbbf24') : styleOf(o, theme, o.type === REGION ? 'aux' : '');
  ctx.save();
  ctx.beginPath();
  pts.forEach((p, i) => {
    const S = board.toScreen(p);
    if (i === 0) ctx.moveTo(S.x, S.y); else ctx.lineTo(S.x, S.y);
  });
  ctx.closePath();
  ctx.fillStyle = o.fill || rgbaStr(color, o.type === REGION ? 0.18 : 0.12);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = (o.style?.width || board.style.lineWidth) * (sel || hov ? 1.5 : 1);
  ctx.stroke();
  ctx.restore();
}

function drawFunction(ctx, board, o, theme, opts) {
  if (!o.compiled || !o.compiled.fn) return;
  const sel = isSelected(board, o);
  const color = sel ? (theme['--geo-select'] || '#fbbf24') : styleOf(o, theme, 'curve');
  const x0 = board.toWorld(0, board.height).x - 2;
  const x1 = board.toWorld(board.width, 0).x + 2;
  const y0 = board.toWorld(0, board.height).y - 2;
  const y1 = board.toWorld(0, 0).y + 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = o.style?.width || 2;
  ctx.beginPath();
  const N = Math.max(400, Math.round(board.width * 1.5));
  let started = false;
  let prevY = null;
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    let y;
    try { y = o.compiled.fn({ x, ...(o.scope || {}) }); } catch { y = NaN; }
    if (!Number.isFinite(y) || y < y0 - 50 || y > y1 + 50) { started = false; prevY = null; continue; }
    const S = board.toScreen({ x, y });
    if (prevY !== null && Math.abs(y - prevY) > (y1 - y0) * 1.5) started = false;
    if (!started) { ctx.moveTo(S.x, S.y); started = true; } else ctx.lineTo(S.x, S.y);
    prevY = y;
  }
  ctx.stroke();
  ctx.restore();
}

function drawLabel(ctx, board, o, theme, opts) {
  const name = o.showName === false ? '' : o.name;
  if (!name) return;
  let pos = null;
  switch (o.type) {
    case PT: pos = board.toScreen(o); pos = { x: pos.x + 9, y: pos.y - 9 }; break;
    case SEG: case LINE: case RAY: case VEC: {
      const info = linearDir(board, o);
      if (info && info.p) {
        const b = o.type === SEG || o.type === VEC || o.type === RAY ? board.get(o.parents[1]) : null;
        const anchor = b ? mid(info.p, b) : info.p;
        const S = board.toScreen(anchor);
        pos = { x: S.x + 8, y: S.y - 8 };
      }
      break;
    }
    case CIRCLE: case ARC: {
      if (o.center) {
        const S = board.toScreen({ x: o.center.x + o.r * 0.7071, y: o.center.y + o.r * 0.7071 });
        pos = { x: S.x + 6, y: S.y - 6 };
      }
      break;
    }
    case POLY: case REGION: {
      /* 放在形心偏右上，避免与测量标签、顶点标签重叠 */
      const pts = o.parents.map((id) => board.get(id)).filter(Boolean);
      if (pts.length > 1) {
        const c = polygonCentroid(pts);
        const maxY = Math.max(...pts.map((p) => p.y));
        const S = board.toScreen({ x: c.x, y: maxY });
        pos = { x: S.x + 10, y: S.y + 16 };
      }
      break;
    }
    case FN: {
      pos = { x: 18, y: board.height - 18 - 16 * (board.all().filter((x) => x.type === FN).indexOf(o)) };
      break;
    }
    default: break;
  }
  if (!pos) return;
  ctx.save();
  ctx.font = '12px ui-monospace, Consolas, monospace';
  ctx.fillStyle = theme.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (o.type === FN) {
    ctx.fillStyle = styleOf(o, theme, 'curve');
    ctx.fillText(o.source || name, pos.x, pos.y);
  } else {
    ctx.fillText(name, pos.x, pos.y);
  }
  ctx.restore();
}

function drawMeasure(ctx, board, o, theme, opts) {
  const pts = o.parents.map((id) => board.get(id));
  if (!pts.length || pts.some((p) => !p)) return;
  const anchor = () => {
    switch (o.derived) {
      case 'length': return board.toScreen(mid(pts[0], pts[1]));
      case 'angle': return board.toScreen(pts[1]);
      case 'area': case 'perimeter': {
        const poly = pts[0];
        if (poly && poly.parents) {
          const vs = poly.parents.map((id) => board.get(id)).filter(Boolean);
          if (vs.length) return board.toScreen(polygonCentroid(vs));
        }
        return board.toScreen(pts[0]);
      }
      case 'slope': return board.toScreen(mid(pts[0], pts[1] || pts[0]));
      case 'radius': {
        const c = pts[0];
        return board.toScreen({ x: (c.center?.x || 0) + (c.r || 0) * 0.7, y: (c.center?.y || 0) + (c.r || 0) * 0.7 });
      }
      default: return board.toScreen(pts[0]);
    }
  };
  const S = anchor();
  const text = o.label || board.measureText(o);
  ctx.save();
  ctx.font = '12px ui-monospace, Consolas, monospace';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = rgbaStr(theme.canvas, 0.72);
  ctx.strokeStyle = rgbaStr(theme.accent2, 0.35);
  ctx.lineWidth = 1;
  /* 多个测量标签错开排列，避免互相压盖 */
  const stack = board.all().filter((x) => x.type === 'measure' && x.visible !== false);
  const stackIndex = Math.max(0, stack.indexOf(o));
  const radius = 30 + (stackIndex % 3) * 30;
  const ang = -0.55 + stackIndex * 0.72;
  const x = S.x + Math.cos(ang) * radius * 0.6 + 12;
  const y = S.y + Math.sin(ang) * radius * 0.5 - 24;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, 20, 6);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x, y, w, 20);
    ctx.strokeRect(x, y, w, 20);
  }
  ctx.fillStyle = theme.accent2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 6, y + 10);
  // 角度弧线
  if (o.derived === 'angle') {
    const [a, b, c] = pts;
    const r = Math.min(38, len(sub(a, b)) * board.scale * 0.4, len(sub(c, b)) * board.scale * 0.4);
    const B = board.toScreen(b);
    const a0 = Math.atan2(-(a.y - b.y), a.x - b.x);
    const a1 = Math.atan2(-(c.y - b.y), c.x - b.x);
    ctx.beginPath();
    ctx.strokeStyle = rgbaStr(theme.accent2, 0.85);
    ctx.lineWidth = 1.6;
    ctx.arc(B.x, B.y, Math.max(14, r), a0, a1, ((a1 - a0 + Math.PI * 3) % (Math.PI * 2)) > Math.PI);
    ctx.stroke();
  }
  // 长度标记
  if (o.derived === 'length') {
    const A = board.toScreen(pts[0]), Bp = board.toScreen(pts[1]);
    ctx.beginPath();
    ctx.strokeStyle = rgbaStr(theme.accent2, 0.6);
    ctx.lineWidth = 2.4;
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(Bp.x, Bp.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawText(ctx, board, o, theme, opts) {
  const S = board.toScreen(o);
  ctx.save();
  ctx.font = '13px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
  ctx.fillStyle = o.style?.color || theme.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const lines = String(o.text || '').split('\n');
  lines.forEach((line, i) => ctx.fillText(line, S.x, S.y + i * 18));
  if (isSelected(board, o)) {
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 8;
    ctx.strokeStyle = rgbaStr(theme['--geo-select'] || '#fbbf24', 0.8);
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(S.x - 5, S.y - 11, w, lines.length * 18 + 4);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

export { TYPES };
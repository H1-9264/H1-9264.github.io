/* engine.js — 绘图引擎：坐标变换、网格、采样、曲线渲染、数值分析、SVG 导出
   不依赖 DOM，可在浏览器与 Node 中运行（颜色通过 options 传入）。 */

export const DEFAULTS = {
  xMin: -10, xMax: 10, yMin: -6.5, yMax: 6.5,
  showGrid: true, showMinorGrid: true, showAxes: true, showLabels: true, showLegend: false,
  equalAspect: false,
  samples: 1600,
  bg: '#080a13', gridMinor: 'rgba(255,255,255,0.055)', gridMajor: 'rgba(255,255,255,0.11)',
  axis: 'rgba(255,255,255,0.45)', label: '#8e97b8',
  glow: true,
  trace: { enabled: false, x: null, pinned: false, fnId: null },
  tangent: { enabled: false },
  integral: { enabled: false, a: -1, b: 1, fnId: null, fill: true },
  marks: []
};

/* radius*2 → [#rrggbb, alpha] */
export function parseColor(c, fallback = [128, 128, 128, 1]) {
  if (typeof c !== 'string') return fallback;
  const s = c.trim();
  let m = s.match(/^#([0-9a-fA-F]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length >= 3) return [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? p[3] : 1];
  }
  return fallback;
}

export function rgba(c, alpha) {
  const [r, g, b, a = 1] = parseColor(c);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha * a + ')';
}
export function hex(c) {
  const [r, g, b] = parseColor(c);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}

export function niceStep(rawStep) {
  const exp = Math.floor(Math.log10(rawStep));
  const base = rawStep / Math.pow(10, exp);
  let mult;
  if (base < 1.5) mult = 1;
  else if (base < 3) mult = 2;
  else if (base < 7) mult = 5;
  else mult = 10;
  return mult * Math.pow(10, exp);
}

export function ticks(min, max, count) {
  const step = niceStep((max - min) / Math.max(1, count));
  const start = Math.ceil(min / step) * step;
  const out = [];
  for (let v = start; v <= max + step * 1e-6; v += step) {
    const rounded = Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12));
    out.push({ v: rounded, major: true });
  }
  return { step, values: out };
}

export function formatTick(v, step) {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e5 || abs < 1e-4) return v.toExponential(1).replace('e+', 'e');
  const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(step)) + 1));
  let s = v.toFixed(decimals);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class PlotEngine {
  constructor(options = {}) {
    this.o = { ...DEFAULTS, ...options };
    this.width = 800;
    this.height = 500;
    this.dpr = 1;
    this.functions = [];
    this.listeners = new Set();
  }

  setOption(patch) { Object.assign(this.o, patch); }
  setSize(w, h, dpr = 1) { this.width = w; this.height = h; this.dpr = dpr; }
  setFunctions(list) { this.functions = list || []; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }

  /* ---------------- 坐标变换 ---------------- */
  xToPx(x) { const o = this.o; return ((x - o.xMin) / (o.xMax - o.xMin)) * this.width; }
  yToPx(y) { const o = this.o; return this.height - ((y - o.yMin) / (o.yMax - o.yMin)) * this.height; }
  pxToX(px) { const o = this.o; return o.xMin + (px / this.width) * (o.xMax - o.xMin); }
  pxToY(py) { const o = this.o; return o.yMin + ((this.height - py) / this.height) * (o.yMax - o.yMin); }
  xPerPx() { return (this.o.xMax - this.o.xMin) / this.width; }
  yPerPx() { return (this.o.yMax - this.o.yMin) / this.height; }

  fitAspect() {
    const o = this.o;
    const ratio = this.width / Math.max(1, this.height);
    const cx = (o.xMin + o.xMax) / 2, cy = (o.yMin + o.yMax) / 2;
    const halfX = (o.xMax - o.xMin) / 2;
    const halfY = Math.max(halfX / ratio, ((o.yMax - o.yMin) / 2) * 0.0001);
    o.yMin = cy - halfX / ratio;
    o.yMax = cy + halfX / ratio;
    return this;
  }

  /* 以像素点为中心缩放 */
  zoomAt(px, py, factor) {
    const o = this.o;
    const x = this.pxToX(px), y = this.pxToY(py);
    const nxMin = x + (o.xMin - x) * factor;
    const nxMax = x + (o.xMax - x) * factor;
    const nyMin = y + (o.yMin - y) * factor;
    const nyMax = y + (o.yMax - y) * factor;
    o.xMin = nxMin; o.xMax = nxMax; o.yMin = nyMin; o.yMax = nyMax;
    if (o.equalAspect) this.fitAspect();
    this.emit();
  }

  panByPx(dx, dy) {
    const o = this.o;
    const sx = dx * this.xPerPx();
    const sy = dy * this.yPerPx();
    o.xMin -= sx; o.xMax -= sx; o.yMin += sy; o.yMax += sy;
    this.emit();
  }

  /* ---------------- 求值 ---------------- */
  evalFn(f, x, scope = {}) {
    try {
      const v = f.fn({ x, ...(f.scope || {}), ...scope });
      return typeof v === 'number' ? v : NaN;
    } catch {
      return NaN;
    }
  }

  sampleCurve(f, n = this.o.samples) {
    const o = this.o;
    const a = f.domain && Number.isFinite(f.domain[0]) ? f.domain[0] : o.xMin;
    const b = f.domain && Number.isFinite(f.domain[1]) ? f.domain[1] : o.xMax;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const pts = [];
    const yMaxAbs = Math.max(Math.abs(o.yMin), Math.abs(o.yMax)) + (o.yMax - o.yMin) * 4;
    for (let i = 0; i <= n; i++) {
      const x = lo + ((hi - lo) * i) / n;
      const y = this.evalFn(f, x);
      pts.push({ x, y, ok: Number.isFinite(y) && Math.abs(y) < yMaxAbs * 1000 });
    }
    return pts;
  }

  /* 生成可用于绘制/SVG 的分段折线（自动断点） */
  buildPath(f, project) {
    const o = this.o;
    const pts = this.sampleCurve(f);
    const segments = [];
    let cur = [];
    const jumpLimit = (o.yMax - o.yMin) * 1.6;
    let prev = null;
    for (const p of pts) {
      if (!p.ok) {
        if (cur.length > 1) segments.push(cur);
        cur = [];
        prev = null;
        continue;
      }
      if (prev && Math.abs(p.y - prev.y) > jumpLimit && f.kind !== 'points') {
        if (cur.length > 1) segments.push(cur);
        cur = [];
      }
      cur.push(project(p.x, p.y));
      prev = p;
    }
    if (cur.length > 1) segments.push(cur);
    return segments;
  }

  /* ---------------- 绘制 ---------------- */
  render(ctx) {
    const o = this.o;
    const { width: W, height: H } = this;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (o.bg && o.bg !== 'transparent') {
      ctx.fillStyle = o.bg;
      ctx.fillRect(0, 0, W, H);
    }
    if (o.showMinorGrid && o.showGrid) this.drawGrid(ctx, true);
    if (o.showGrid) this.drawGrid(ctx, false);
    if (o.showAxes) this.drawAxes(ctx);
    this.drawCurves(ctx);
    this.drawMarks(ctx);
    this.drawIntegral(ctx);
    this.drawTraceAndTangent(ctx);
    if (o.showLegend) this.drawLegend(ctx);
    ctx.restore();
  }

  drawGrid(ctx, minor) {
    const o = this.o;
    const targetPx = minor ? 26 : 74;
    const stepX = niceStep((o.xMax - o.xMin) * (targetPx / this.width));
    const stepY = niceStep((o.yMax - o.yMin) * (targetPx / this.height));
    ctx.save();
    ctx.fillStyle = minor ? o.gridMinor : o.gridMajor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startX = Math.ceil(o.xMin / stepX) * stepX;
    for (let x = startX; x <= o.xMax + stepX * 1e-6; x += stepX) {
      const px = Math.round(this.xToPx(x)) + 0.5;
      if (px < -1 || px > this.width + 1) continue;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, this.height);
    }
    const startY = Math.ceil(o.yMin / stepY) * stepY;
    for (let y = startY; y <= o.yMax + stepY * 1e-6; y += stepY) {
      const py = Math.round(this.yToPx(y)) + 0.5;
      if (py < -1 || py > this.height + 1) continue;
      ctx.moveTo(0, py);
      ctx.lineTo(this.width, py);
    }
    ctx.strokeStyle = minor ? o.gridMinor : o.gridMajor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  drawAxes(ctx) {
    const o = this.o;
    const { width: W, height: H } = this;
    const y0 = clamp(this.yToPx(0), 0, H);
    const x0 = clamp(this.xToPx(0), 0, W);
    ctx.save();
    ctx.strokeStyle = o.axis;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y0) + 0.5);
    ctx.lineTo(W, Math.round(y0) + 0.5);
    ctx.moveTo(Math.round(x0) + 0.5, 0);
    ctx.lineTo(Math.round(x0) + 0.5, H);
    ctx.stroke();

    // 箭头
    const arrow = 5;
    ctx.fillStyle = o.axis;
    ctx.beginPath();
    ctx.moveTo(W - 1, y0); ctx.lineTo(W - 10, y0 - arrow); ctx.lineTo(W - 10, y0 + arrow); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x0, 1); ctx.lineTo(x0 - arrow, 10); ctx.lineTo(x0 + arrow, 10); ctx.closePath(); ctx.fill();

    if (o.showLabels) {
      ctx.fillStyle = o.label;
      ctx.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const { step, values } = ticks(o.xMin, o.xMax, Math.max(2, Math.floor(W / 110)));
      for (const t of values) {
        if (t.v === 0) continue;
        const px = this.xToPx(t.v);
        if (px < 18 || px > W - 18) continue;
        ctx.fillText(formatTick(t.v, step), px, clamp(y0 + 6, 2, H - 14));
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const yt = ticks(o.yMin, o.yMax, Math.max(2, Math.floor(H / 80)));
      for (const t of yt.values) {
        if (t.v === 0) continue;
        const py = this.yToPx(t.v);
        if (py < 12 || py > H - 12) continue;
        ctx.fillText(formatTick(t.v, yt.step), clamp(x0 - 7, 24, W - 4), py);
      }
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText('0', clamp(x0 - 6, 12, W - 4), clamp(y0 + 14, 14, H - 2));
    }
    ctx.restore();
  }

  drawCurves(ctx) {
    const o = this.o;
    const project = (x, y) => ({ px: this.xToPx(x), py: this.yToPx(y) });
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const f of this.functions) {
      if (f.visible === false) continue;
      const segments = this.buildPath(f, project);
      const color = f.color || '#6c8cff';
      const lineWidth = f.width || 2;
      if (o.glow && f.glow !== false && lineWidth >= 1.6) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth + 5;
        ctx.filter = 'blur(4px)';
        ctx.beginPath();
        for (const seg of segments) {
          seg.forEach((p, i) => (i ? ctx.lineTo(p.px, p.py) : ctx.moveTo(p.px, p.py)));
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = f.opacity === undefined ? 1 : f.opacity;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      if (f.dash) ctx.setLineDash(f.dash);
      ctx.beginPath();
      for (const seg of segments) {
        seg.forEach((p, i) => (i ? ctx.lineTo(p.px, p.py) : ctx.moveTo(p.px, p.py)));
      }
      ctx.stroke();
      if (f.kind === 'points') {
        ctx.fillStyle = color;
        for (const seg of segments) {
          for (const p of seg) {
            ctx.beginPath();
            ctx.arc(p.px, p.py, (f.pointSize || 3.2), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  drawMarks(ctx) {
    const o = this.o;
    if (!o.marks || !o.marks.length) return;
    ctx.save();
    ctx.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
    for (const m of o.marks) {
      const px = this.xToPx(m.x), py = this.yToPx(m.y);
      if (px < -20 || px > this.width + 20 || py < -20 || py > this.height + 20) continue;
      const color = m.color || '#fbbf24';
      ctx.fillStyle = color;
      ctx.strokeStyle = rgba(o.bg && o.bg !== 'transparent' ? o.bg : '#000', 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (m.label) {
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(m.label, px + 8, py - 6);
      }
    }
    ctx.restore();
  }

  drawIntegral(ctx) {
    const o = this.o;
    if (!o.integral || !o.integral.enabled) return;
    const f = this.functions.find((k) => k.id === o.integral.fnId) || this.functions.find((k) => k.visible !== false);
    if (!f) return;
    const a = Math.min(o.integral.a, o.integral.b);
    const b = Math.max(o.integral.a, o.integral.b);
    const n = 240;
    ctx.save();
    ctx.beginPath();
    const y0 = clamp(this.yToPx(0), 0, this.height);
    ctx.moveTo(this.xToPx(a), y0);
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      const y = this.evalFn(f, x);
      if (!Number.isFinite(y)) continue;
      ctx.lineTo(this.xToPx(x), clamp(this.yToPx(y), -1e5, 1e5));
    }
    ctx.lineTo(this.xToPx(b), y0);
    ctx.closePath();
    const c = f.color || '#6c8cff';
    ctx.fillStyle = rgba(c, 0.22);
    ctx.fill();
    ctx.strokeStyle = rgba(c, 0.7);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(this.xToPx(a), 0); ctx.lineTo(this.xToPx(a), this.height);
    ctx.moveTo(this.xToPx(b), 0); ctx.lineTo(this.xToPx(b), this.height);
    ctx.stroke();
    ctx.restore();
  }

  drawTraceAndTangent(ctx) {
    const o = this.o;
    const t = o.trace;
    if (!t || !t.enabled || !Number.isFinite(t.x)) return;
    const f = this.functions.find((k) => k.id === t.fnId) || this.functions.find((k) => k.visible !== false && k.kind !== 'points');
    ctx.save();
    const px = this.xToPx(t.x);
    ctx.strokeStyle = rgba(o.axis, 0.45);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, 0); ctx.lineTo(px, this.height);
    ctx.stroke();
    ctx.setLineDash([]);

    let fy = NaN;
    if (f) {
      fy = this.evalFn(f, t.x);
      if (o.tangent && o.tangent.enabled && Number.isFinite(fy)) {
        const h = Math.max(1e-6, this.xPerPx() * 0.5);
        const slope = (this.evalFn(f, t.x + h) - this.evalFn(f, t.x - h)) / (2 * h);
        if (Number.isFinite(slope)) {
          const x1 = o.xMin, x2 = o.xMax;
          const y1 = fy + slope * (x1 - t.x);
          const y2 = fy + slope * (x2 - t.x);
          ctx.strokeStyle = rgba(f.color || '#6c8cff', 0.75);
          ctx.lineWidth = 1.6;
          ctx.setLineDash([7, 5]);
          ctx.beginPath();
          ctx.moveTo(this.xToPx(x1), this.yToPx(y1));
          ctx.lineTo(this.xToPx(x2), this.yToPx(y2));
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
    const py = this.yToPx(fy);
    const color = f?.color || '#22d3ee';
    ctx.fillStyle = color;
    ctx.strokeStyle = rgba(o.bg && o.bg !== 'transparent' ? o.bg : '#000', 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, clamp(py, -50, this.height + 50), 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawLegend(ctx) {
    const items = this.functions.filter((f) => f.visible !== false && (f.label || f.source));
    if (!items.length) return;
    ctx.save();
    ctx.font = '12px ui-monospace, SFMono-Regular, Consolas, monospace';
    const pad = 10, lh = 18;
    let w = 0;
    for (const it of items) w = Math.max(w, ctx.measureText(it.label || it.source).width);
    const boxW = w + 44, boxH = items.length * lh + pad * 1.4;
    const bx = this.width - boxW - 12, by = 12;
    ctx.fillStyle = rgba(this.o.bg && this.o.bg !== 'transparent' ? this.o.bg : '#000000', 0.55);
    ctx.strokeStyle = rgba(this.o.axis, 0.35);
    ctx.lineWidth = 1;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 8);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeRect(bx, by, boxW, boxH);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    items.forEach((it, i) => {
      const cy = by + pad * 0.7 + lh * i + lh / 2;
      ctx.strokeStyle = it.color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(bx + 12, cy);
      ctx.lineTo(bx + 30, cy);
      ctx.stroke();
      ctx.fillStyle = this.o.label;
      ctx.fillText(it.label || it.source, bx + 38, cy);
    });
    ctx.restore();
  }

  /* ---------------- 数值分析 ---------------- */
  derivatives(f, x) {
    const h = Math.max(1e-7, Math.abs(x) * 1e-6, this.xPerPx() * 1e-4);
    const y = this.evalFn(f, x);
    const y1 = this.evalFn(f, x + h), y0 = this.evalFn(f, x - h);
    const d1 = Number.isFinite(y1) && Number.isFinite(y0) ? (y1 - y0) / (2 * h) : NaN;
    const y2 = this.evalFn(f, x + 2 * h), ym2 = this.evalFn(f, x - 2 * h);
    const d2 = Number.isFinite(y2) && Number.isFinite(ym2) ? (y2 - 2 * y + ym2) / (4 * h * h) : NaN;
    return { y, d1, d2 };
  }

  findRoots(f, maxRoots = 60) {
    const o = this.o;
    const a = f.domain ? Math.max(o.xMin, Math.min(f.domain[0], f.domain[1])) : o.xMin;
    const b = f.domain ? Math.min(o.xMax, Math.max(f.domain[0], f.domain[1])) : o.xMax;
    const n = Math.min(6000, Math.max(600, Math.round((b - a) / this.xPerPx() / 2)));
    const roots = [];
    let prevX = a, prevY = this.evalFn(f, a);
    for (let i = 1; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      const y = this.evalFn(f, x);
      if (Number.isFinite(prevY) && Number.isFinite(y)) {
        if (y === 0) { roots.push({ x, y: 0 }); }
        else if (prevY === 0) { roots.push({ x: prevX, y: 0 }); }
        else if (prevY * y < 0) {
          let lo = prevX, hi = x, flo = prevY;
          for (let k = 0; k < 60; k++) {
            const mid = (lo + hi) / 2;
            const fm = this.evalFn(f, mid);
            if (!Number.isFinite(fm)) break;
            if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
          }
          const rx = (lo + hi) / 2;
          if (!roots.some((r) => Math.abs(r.x - rx) < this.xPerPx() * 1.5)) roots.push({ x: rx, y: this.evalFn(f, rx) });
        }
      }
      prevX = x; prevY = y;
      if (roots.length >= maxRoots) break;
    }
    return roots;
  }

  findIntersections(f1, f2, maxPoints = 40) {
    const o = this.o;
    const diff = (x) => this.evalFn(f1, x) - this.evalFn(f2, x);
    const n = Math.min(6000, Math.max(600, Math.round((o.xMax - o.xMin) / this.xPerPx() / 2)));
    const out = [];
    let px = o.xMin, py = diff(o.xMin);
    for (let i = 1; i <= n; i++) {
      const x = o.xMin + ((o.xMax - o.xMin) * i) / n;
      const y = diff(x);
      if (Number.isFinite(py) && Number.isFinite(y) && py * y < 0) {
        let lo = px, hi = x, flo = py;
        for (let k = 0; k < 60; k++) {
          const mid = (lo + hi) / 2;
          const fm = diff(mid);
          if (!Number.isFinite(fm)) break;
          if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
        }
        const rx = (lo + hi) / 2;
        if (!out.some((p) => Math.abs(p.x - rx) < this.xPerPx() * 2)) out.push({ x: rx, y: this.evalFn(f1, rx) });
      }
      px = x; py = y;
      if (out.length >= maxPoints) break;
    }
    return out;
  }

  findExtrema(f, maxPoints = 40) {
    const o = this.o;
    const h = this.xPerPx() * 1.2;
    const out = [];
    const n = Math.min(4000, Math.max(500, Math.round((o.xMax - o.xMin) / (this.xPerPx() * 4))));
    let prev = this.derivatives(f, o.xMin).d1;
    for (let i = 1; i <= n; i++) {
      const x = o.xMin + ((o.xMax - o.xMin) * i) / n;
      const d = this.derivatives(f, x).d1;
      if (Number.isFinite(prev) && Number.isFinite(d) && prev * d < 0) {
        // 黄金分割细化
        let lo = x - (o.xMax - o.xMin) / n, hi = x, gr = (Math.sqrt(5) - 1) / 2;
        let c = hi - gr * (hi - lo), dd = lo + gr * (hi - lo);
        let fc = this.derivatives(f, c).d1, fd = this.derivatives(f, dd).d1;
        for (let k = 0; k < 40; k++) {
          if (!Number.isFinite(fc) || !Number.isFinite(fd)) break;
          if (Math.abs(fc) < 1e-10) { lo = hi = c; break; }
          if (fc * fd < 0) { lo = c; c = dd; fc = fd; dd = lo + gr * (hi - lo); fd = this.derivatives(f, dd).d1; }
          else { hi = dd; dd = c; fd = fc; c = hi - gr * (hi - lo); fc = this.derivatives(f, c).d1; }
        }
        const rx = (lo + hi) / 2;
        const ry = this.evalFn(f, rx);
        const d2 = this.derivatives(f, rx).d2;
        if (Number.isFinite(ry) && !out.some((p) => Math.abs(p.x - rx) < h * 3)) {
          out.push({ x: rx, y: ry, type: d2 > 0 ? 'min' : 'max' });
        }
      }
      prev = d;
      if (out.length >= maxPoints) break;
    }
    return out;
  }

  integral(f, a, b) {
    const n = 1000;
    let sum = 0;
    const h = (b - a) / n;
    let ok = true;
    for (let i = 0; i < n; i++) {
      const x0 = a + i * h, x1 = x0 + h;
      const f0 = this.evalFn(f, x0), f1 = this.evalFn(f, x1);
      const fm = this.evalFn(f, (x0 + x1) / 2);
      if (!Number.isFinite(f0 + f1 + fm)) { ok = false; continue; }
      sum += (h / 6) * (f0 + 4 * fm + f1);
    }
    return ok ? sum : NaN;
  }

  /* ---------------- SVG 导出 ---------------- */
  toSVG({ scale = 1, background = 'theme' } = {}) {
    const o = this.o;
    const W = this.width, H = this.height;
    const bg = background === 'transparent' ? null
      : background === 'white' ? '#ffffff'
      : background === 'dark' ? '#0b0d16'
      : (o.bg && o.bg !== 'transparent' ? o.bg : '#0b0d16');
    const parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>');
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(W * scale) + '" height="' + Math.round(H * scale) +
      '" viewBox="0 0 ' + W + ' ' + H + '">');
    if (bg) parts.push('<rect width="' + W + '" height="' + H + '" fill="' + bg + '"/>');
    parts.push('<g stroke-linecap="round" stroke-linejoin="round">');

    const stepFor = (major) => {
      const targetPx = major ? 74 : 26;
      return { sx: niceStep((o.xMax - o.xMin) * (targetPx / W)), sy: niceStep((o.yMax - o.yMin) * (targetPx / H)) };
    };
    if (o.showGrid) {
      for (const major of o.showMinorGrid ? [false, true] : [true]) {
        const { sx, sy } = stepFor(major);
        const color = major ? o.gridMajor : o.gridMinor;
        let d = '';
        for (let x = Math.ceil(o.xMin / sx) * sx; x <= o.xMax + sx * 1e-6; x += sx) {
          const px = this.xToPx(x).toFixed(2);
          d += 'M' + px + ' 0V' + H;
        }
        for (let y = Math.ceil(o.yMin / sy) * sy; y <= o.yMax + sy * 1e-6; y += sy) {
          const py = this.yToPx(y).toFixed(2);
          d += 'M0 ' + py + 'H' + W;
        }
        if (d) parts.push('<path d="' + d + '" stroke="' + color + '" stroke-width="1" fill="none"/>');
      }
    }
    if (o.showAxes) {
      const y0 = clamp(this.yToPx(0), 0, H), x0 = clamp(this.xToPx(0), 0, W);
      parts.push('<path d="M0 ' + y0.toFixed(2) + 'H' + W + 'M' + x0.toFixed(2) + ' 0V' + H + '" stroke="' + o.axis + '" stroke-width="1.4" fill="none"/>');
      if (o.showLabels) {
        const { sx } = stepFor(true);
        const { sy } = stepFor(true);
        const xt = ticks(o.xMin, o.xMax, Math.max(2, Math.floor(W / 110)));
        const yt = ticks(o.yMin, o.yMax, Math.max(2, Math.floor(H / 80)));
        let labels = '';
        for (const t of xt.values) {
          if (t.v === 0) continue;
          const px = this.xToPx(t.v);
          if (px < 18 || px > W - 18) continue;
          labels += '<text x="' + px.toFixed(1) + '" y="' + clamp(y0 + 14, 12, H - 3).toFixed(1) +
            '" fill="' + o.label + '" font-size="11" font-family="monospace" text-anchor="middle">' + formatTick(t.v, xt.step) + '</text>';
        }
        for (const t of yt.values) {
          if (t.v === 0) continue;
          const py = this.yToPx(t.v);
          if (py < 12 || py > H - 12) continue;
          labels += '<text x="' + clamp(x0 - 7, 4, W - 4).toFixed(1) + '" y="' + (py + 4).toFixed(1) +
            '" fill="' + o.label + '" font-size="11" font-family="monospace" text-anchor="end">' + formatTick(t.v, yt.step) + '</text>';
        }
        void sx; void sy;
        parts.push(labels);
      }
    }
    const project = (x, y) => ({ px: this.xToPx(x), py: this.yToPx(y) });
    for (const f of this.functions) {
      if (f.visible === false) continue;
      const segs = this.buildPath(f, project);
      let d = '';
      for (const seg of segs) {
        seg.forEach((p, i) => { d += (i ? 'L' : 'M') + p.px.toFixed(2) + ' ' + p.py.toFixed(2); });
      }
      if (d) {
        parts.push('<path d="' + d + '" fill="none" stroke="' + hex(f.color || '#6c8cff') + '" stroke-width="' + (f.width || 2) +
          '" opacity="' + (f.opacity === undefined ? 1 : f.opacity) + '"' + (f.dash ? ' stroke-dasharray="' + f.dash.join(' ') + '"' : '') + '/>');
      }
    }
    if (o.marks && o.marks.length) {
      for (const m of o.marks) {
        parts.push('<circle cx="' + this.xToPx(m.x).toFixed(2) + '" cy="' + this.yToPx(m.y).toFixed(2) + '" r="4.2" fill="' + hex(m.color || '#fbbf24') + '"/>');
        if (m.label) parts.push('<text x="' + (this.xToPx(m.x) + 8).toFixed(1) + '" y="' + (this.yToPx(m.y) - 6).toFixed(1) +
          '" fill="' + hex(m.color || '#fbbf24') + '" font-size="11" font-family="monospace">' + escapeXml(m.label) + '</text>');
      }
    }
    parts.push('</g></svg>');
    return parts.join('\n');
  }
}

export function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

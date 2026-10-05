/* geo-engine.js — 几何画板内核：依赖图、动态重算、绘制与命中测试
   设计参考几何画板：所有对象都由"自由对象"通过构造命令派生，
   拖动自由点 → 拓扑序重算所有后代对象 → 图形随之联动。
   不依赖 DOM，可在浏览器与 Node 中运行。 */

const PT = 'point', SEG = 'segment', LINE = 'line', RAY = 'ray', VEC = 'vector',
  CIRCLE = 'circle', ARC = 'arc', POLY = 'polygon', MEASURE = 'measure', TEXT = 'text',
  FN = 'func', LOCUS = 'locus', TRACE = 'trace', REGION = 'region';

export const TYPES = { PT, SEG, LINE, RAY, VEC, CIRCLE, ARC, POLY, MEASURE, TEXT, FN, LOCUS, TRACE, REGION };

export const DEFAULT_STYLE = {
  pointColor: '#3fb950', curveColor: '#d29922', auxColor: '#7d8590',
  selectColor: '#fbbf24', measureColor: '#3fb950',
  pointSize: 5, lineWidth: 1.8
};

let seq = 0;
const nid = (p) => p + (++seq).toString(36) + Math.floor(Math.random() * 1296).toString(36);

/* ---------------- 向量与几何工具 ---------------- */
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const len = (a) => Math.hypot(a.x, a.y);
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export function norm(a) {
  const l = len(a);
  return l < 1e-12 ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l };
}
export function distToSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return len(sub(p, a));
  let t = dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  return len(sub(p, add(a, mul(ab, t))));
}
export function angleAt(a, b, c) {
  const v1 = sub(a, b), v2 = sub(c, b);
  const d = dot(v1, v2), l = len(v1) * len(v2);
  if (l < 1e-12) return 0;
  return Math.acos(Math.max(-1, Math.min(1, d / l)));
}
export function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}
export function polygonCentroid(pts) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-12) {
    return pts.reduce((s, p) => ({ x: s.x + p.x / pts.length, y: s.y + p.y / pts.length }), { x: 0, y: 0 });
  }
  a *= 3;
  return { x: cx / a, y: cy / a };
}

/* 两条直线求交（无限长） */
export function lineLineIntersect(p1, d1, p2, d2) {
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(p2, p1), d2) / den;
  return add(p1, mul(d1, t));
}

/* 直线与圆求交 */
export function lineCircleIntersect(p, d, c, r) {
  const dm = sub(p, c);
  const a = dot(d, d);
  const b = 2 * dot(dm, d);
  const cc = dot(dm, dm) - r * r;
  const disc = b * b - 4 * a * cc;
  if (disc < -1e-9) return [];
  const sq = Math.sqrt(Math.max(0, disc));
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  const out = [add(p, mul(d, t1))];
  if (Math.abs(t2 - t1) > 1e-9) out.push(add(p, mul(d, t2)));
  return out;
}

/* 两圆求交 */
export function circleCircleIntersect(c1, r1, c2, r2) {
  const d = len(sub(c2, c1));
  if (d < 1e-12 || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = Math.sqrt(Math.max(0, h2));
  const base = add(c1, mul(norm(sub(c2, c1)), a));
  const perp = { x: -norm(sub(c2, c1)).y, y: norm(sub(c2, c1)).x };
  const p1 = add(base, mul(perp, h));
  if (h < 1e-9) return [p1];
  return [p1, add(base, mul(perp, -h))];
}

/* 圆外一点到圆的切点 */
export function tangentPoints(c, r, p) {
  const d = len(sub(p, c));
  if (d < r - 1e-9) return [];
  const a = (r * r) / d;
  const h = Math.sqrt(Math.max(0, r * r - a * a));
  const dir = norm(sub(p, c));
  const base = add(c, mul(dir, a));
  const perp = { x: -dir.y, y: dir.x };
  if (h < 1e-9) return [base];
  return [add(base, mul(perp, h)), add(base, mul(perp, -h))];
}

/* 三点定圆 */
export function circleFrom3(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const ux = ((a.x * a.x + a.y * a.y) * (b.y - c.y) + (b.x * b.x + b.y * b.y) * (c.y - a.y) + (c.x * c.x + c.y * c.y) * (a.y - b.y)) / d;
  const uy = ((a.x * a.x + a.y * a.y) * (c.x - b.x) + (b.x * b.x + b.y * b.y) * (a.x - c.x) + (c.x * c.x + c.y * c.y) * (b.x - a.x)) / d;
  const center = { x: ux, y: uy };
  return { center, r: len(sub(a, center)) };
}

/* 弧的参数（起点、终点、逆时针方向） */
export function arcParams(a, b, c) {
  const circle = circleFrom3(a, b, c);
  if (!circle) return null;
  const angOf = (p) => Math.atan2(p.y - circle.center.y, p.x - circle.center.x);
  const a0 = angOf(a), a1 = angOf(c);
  const ccw = cross(sub(b, a), sub(c, b)) > 0;
  return { ...circle, a0, a1, ccw, start: a, end: c, through: b };
}

/* 角度归一化 */
export function normalizeAngle(a) {
  while (a < 0) a += Math.PI * 2;
  while (a >= Math.PI * 2) a -= Math.PI * 2;
  return a;
}

/* ---------------- 画板 ---------------- */
export class GeoBoard {
  constructor(opts = {}) {
    this.objects = new Map();
    this.order = [];
    this.style = { ...DEFAULT_STYLE, ...(opts.style || {}) };
    this.origin = opts.origin || { x: 0, y: 0 };
    this.scale = opts.scale || 46;
    this.width = opts.width || 900;
    this.height = opts.height || 600;
    this.selection = [];
    this.hover = null;
    this.labels = true;
    this.listeners = new Set();
    this.traces = [];
    this.locuses = [];   // 动态轨迹：{ id, driver, traced, points, samples }
    this.counter = 0;
  }

  /* ---------- 坐标变换 ---------- */
  toScreen(p) { return { x: this.origin.x + p.x * this.scale, y: this.origin.y - p.y * this.scale }; }
  toWorld(sx, sy) { return { x: (sx - this.origin.x) / this.scale, y: (this.origin.y - sy) / this.scale }; }
  get pixelSize() { return 1 / this.scale; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }

  /* ---------- 添加对象 ---------- */
  genName(type) {
    const map = { [PT]: 'P', [SEG]: 's', [LINE]: 'l', [RAY]: 'r', [VEC]: 'v', [CIRCLE]: 'c', [ARC]: 'a', [POLY]: 'poly', [MEASURE]: 'm', [TEXT]: 'T', [FN]: 'f', [LOCUS]: 'loc', [TRACE]: 'tr', [REGION]: 'R' };
    const prefix = map[type] || 'o';
    this.counter++;
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (type === PT) {
      const idx = [...this.objects.values()].filter((o) => o.type === PT).length;
      return letters[idx % 26] + (idx >= 26 ? Math.floor(idx / 26) : '');
    }
    const idx = [...this.objects.values()].filter((o) => o.type === type).length + 1;
    return prefix + idx;
  }

  create(type, props = {}, { silent = false } = {}) {
    const obj = {
      id: nid('o'),
      /* createdAt：作图顺序（用于"作图回放"） */
      createdAt: ++this.counter,
      type,
      name: props.name !== undefined ? props.name : this.genName(type),
      parents: props.parents || [],
      deps: props.deps || [],
      visible: props.visible !== false,
      style: { color: props.color, width: props.width, fill: props.fill, dash: props.dash },
      ...props
    };
    this.objects.set(obj.id, obj);
    this.order.push(obj.id);
    this.compute(obj);
    if (!silent) { this.recompute(); this.emit(); }
    return obj;
  }

  remove(id) {
    const obj = this.objects.get(id);
    if (!obj) return;
    const doomed = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const o of this.objects.values()) {
        if (doomed.has(o.id)) continue;
        if (o.parents.some((p) => doomed.has(p)) || o.deps.some((d) => doomed.has(d))) {
          doomed.add(o.id);
          changed = true;
        }
      }
    }
    for (const did of doomed) {
      this.objects.delete(did);
      this.order = this.order.filter((x) => x !== did);
      this.selection = this.selection.filter((x) => x !== did);
      this.traces = this.traces.filter((t) => t.id !== did);
    }
    this.recompute();
    this.emit();
  }

  clear() {
    this.objects.clear();
    this.order = [];
    this.selection = [];
    this.traces = [];
    this.counter = 0;
    this.emit();
  }

  get(id) { return this.objects.get(id); }
  byName(name) { return [...this.objects.values()].find((o) => o.name === name); }
  all() { return this.order.map((id) => this.objects.get(id)).filter(Boolean); }
  points() { return this.all().filter((o) => o.type === PT); }

  /* ---------- 依赖与重算 ---------- */
  topoOrder() {
    const visited = new Set();
    const temp = new Set();
    const out = [];
    const visit = (id) => {
      if (visited.has(id) || temp.has(id)) return;
      temp.add(id);
      const obj = this.objects.get(id);
      if (obj) {
        for (const p of [...(obj.parents || []), ...(obj.deps || [])]) visit(p);
        out.push(id);
      }
      temp.delete(id);
      visited.add(id);
    };
    for (const id of this.order) visit(id);
    return out;
  }

  /* 只做一次拓扑序计算，不碰动态轨迹 */
  computeAll() {
    const order = this.topoOrder();
    for (const id of order) {
      const obj = this.objects.get(id);
      if (!obj) continue;
      const fn = COMPUTE[obj.type];
      if (fn) {
        try { fn(obj, this); } catch { /* 忽略退化情形（如三点共线） */ }
      }
    }
    return order;
  }

  recompute() {
    this.computeAll();
    /* 动态轨迹随拖动实时重算 */
    if (this.locuses.length && !this._inLocus) this.updateLocuses();
  }

  /* ---------- 动态轨迹 ---------- */
  addLocus(driverId, tracedId, samples = 110) {
    const driver = this.get(driverId);
    const traced = this.get(tracedId);
    if (!driver || !traced || driver.type !== PT || traced.type !== PT) return null;
    const entry = { id: nid('loc'), driver: driverId, traced: tracedId, samples, points: [] };
    this.locuses.push(entry);
    this.updateLocuses();
    this.emit();
    return entry;
  }

  removeLocus(id) {
    this.locuses = this.locuses.filter((l) => l.id !== id);
    this.emit();
  }

  /* 驱动路径采样：附着在圆/线上的点沿该对象走一圈，自由点走一个小圆周 */
  driverSamples(driver, n) {
    const out = [];
    const glue = driver.glue ? this.get(driver.glue.object) : null;
    if (glue && glue.type === CIRCLE && glue.center) {
      for (let i = 0; i <= n; i++) {
        const a = (Math.PI * 2 * i) / n;
        out.push({ x: glue.center.x + glue.r * Math.cos(a), y: glue.center.y + glue.r * Math.sin(a) });
      }
    } else if (glue && (glue.type === LINE || glue.type === SEG || glue.type === RAY || glue.type === VEC)) {
      const a = this.get(glue.parents[0]), b = this.get(glue.parents[1]);
      if (a && b) {
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
    } else if (glue && glue.type === CIRCLE) {
      /* 三点圆等：用圆心 + 半径 */
      const c = glue.center || (glue.parents[0] ? this.get(glue.parents[0]) : null);
      if (c && glue.r) {
        for (let i = 0; i <= n; i++) {
          const a = (Math.PI * 2 * i) / n;
          out.push({ x: c.x + glue.r * Math.cos(a), y: c.y + glue.r * Math.sin(a) });
        }
      }
    } else {
      const r = 2.6 / Math.max(0.4, Math.min(3, this.scale / 46));
      for (let i = 0; i <= n; i++) {
        const a = (Math.PI * 2 * i) / n;
        out.push({ x: driver.x + r * Math.cos(a), y: driver.y + r * Math.sin(a) });
      }
    }
    return out;
  }

  updateLocuses() {
    if (this._inLocus) return;
    this._inLocus = true;
    const order = this.topoOrder();
    const step = (id) => {
      const obj = this.objects.get(id);
      if (!obj) return;
      const fn = COMPUTE[obj.type];
      if (fn) { try { fn(obj, this); } catch { /* ignore */ } }
    };
    for (const locus of this.locuses) {
      const driver = this.get(locus.driver);
      const traced = this.get(locus.traced);
      if (!driver || !traced) { locus.points = []; continue; }
      const saved = { x: driver.x, y: driver.y };
      const pts = [];
      const samples = this.driverSamples(driver, locus.samples || 110);
      for (const p of samples) {
        driver.x = p.x;
        driver.y = p.y;
        for (const id of order) step(id);
        if (Number.isFinite(traced.x) && Number.isFinite(traced.y)) pts.push({ x: traced.x, y: traced.y });
      }
      driver.x = saved.x;
      driver.y = saved.y;
      locus.points = pts;
    }
    /* 恢复原状，保证驱动点回到原位、所有派生对象一致 */
    for (const id of order) step(id);
    this._inLocus = false;
  }

  compute(obj) {
    const fn = COMPUTE[obj.type];
    if (fn) fn(obj, this);
  }

  /* 拖动自由点时调用：只重算其后代（拓扑序全体重算，规模小可接受） */
  movePoint(id, world) {
    const obj = this.objects.get(id);
    if (!obj || obj.type !== PT || !obj.free) return;
    obj.x = world.x;
    obj.y = world.y;
    this.recompute();
    this.emit();
  }

  /* ---------- 命中测试 ---------- */
  hitTest(screen, { tolerance = 11 } = {}) {
    const items = this.all().slice().reverse();
    let best = null, bestD = Infinity;
    for (const o of items) {
      if (!o.visible) continue;
      const d = this.distanceTo(o, screen);
      if (d !== null && d < tolerance && d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  distanceTo(obj, screen) {
    const S = (p) => this.toScreen(p);
    const d2p = (p) => Math.hypot(S(p).x - screen.x, S(p).y - screen.y);
    switch (obj.type) {
      case PT: return d2p(obj);
      case SEG: {
        const a = this.get(obj.parents[0]), b = this.get(obj.parents[1]);
        if (!a || !b) return null;
        return distToSegment(screen, S(a), S(b));
      }
      case LINE:
      case RAY:
      case VEC: {
        const a = this.get(obj.parents[0]), b = this.get(obj.parents[1]);
        if (!a || !b) return null;
        if (obj.type === SEG) return distToSegment(screen, S(a), S(b));
        const A = S(a), B = S(b);
        const d = norm(sub(B, A));
        const t = dot(sub(screen, A), d);
        if (obj.type === RAY && t < 0) return Math.hypot(screen.x - A.x, screen.y - A.y);
        if (obj.type === VEC && (t < 0 || t > len(sub(B, A)))) {
          return Math.min(Math.hypot(screen.x - A.x, screen.y - A.y), Math.hypot(screen.x - B.x, screen.y - B.y));
        }
        const proj = add(A, mul(d, t));
        return Math.hypot(screen.x - proj.x, screen.y - proj.y);
      }
      case CIRCLE: {
        const c = this.get(obj.parents[0]);
        if (!c) return null;
        const C = S(c);
        return Math.abs(Math.hypot(screen.x - C.x, screen.y - C.y) - obj.r * this.scale);
      }
      case ARC: {
        const a = this.get(obj.parents[0]), b = this.get(obj.parents[1]), c = this.get(obj.parents[2]);
        if (!a || !b || !c) return null;
        const arc = arcParams(a, b, c);
        if (!arc) return null;
        const C = S(arc.center);
        return Math.abs(Math.hypot(screen.x - C.x, screen.y - C.y) - arc.r * this.scale) * 1.2;
      }
      case POLY:
      case REGION: {
        const pts = obj.parents.map((id) => this.get(id)).filter(Boolean);
        let best = null;
        for (let i = 0; i < pts.length; i++) {
          const a = S(pts[i]), b = S(pts[(i + 1) % pts.length]);
          const d = distToSegment(screen, a, b);
          if (best === null || d < best) best = d;
        }
        return best;
      }
      default:
        return null;
    }
  }

  /* ---------- 吸附 ---------- */
  snap(world, screen, { gridOn = false, gridSize = 1, exclude = [] } = {}) {
    const tolW = 12 / this.scale;
    let best = null, bestD = tolW;
    for (const p of this.points()) {
      if (!p.visible || exclude.includes(p.id)) continue;
      const d = len(sub(p, world));
      if (d < bestD) { best = { kind: 'point', point: p }; bestD = d; }
    }
    if (best) return best;
    // 附着到线/圆上
    for (const o of this.all()) {
      if (!o.visible || exclude.includes(o.id)) continue;
      if (o.type === LINE) {
        const a = this.get(o.parents[0]), b = this.get(o.parents[1]);
        if (!a || !b) continue;
        const d = norm(sub(b, a));
        const t = dot(sub(world, a), d);
        const proj = add(a, mul(d, t));
        const dist = len(sub(proj, world));
        if (dist < bestD) { best = { kind: 'onLine', object: o, world: proj }; bestD = dist; }
      } else if (o.type === SEG || o.type === RAY || o.type === VEC) {
        const a = this.get(o.parents[0]), b = this.get(o.parents[1]);
        if (!a || !b) continue;
        const d = norm(sub(b, a));
        const t = dot(sub(world, a), d);
        const maxT = o.type === SEG || o.type === VEC ? len(sub(b, a)) : Infinity;
        const tc = Math.max(0, Math.min(maxT, t));
        const proj = add(a, mul(d, tc));
        const dist = len(sub(proj, world));
        if (dist < bestD) { best = { kind: 'onLine', object: o, world: proj }; bestD = dist; }
      } else if (o.type === CIRCLE) {
        const c = this.get(o.parents[0]);
        if (!c) continue;
        const dir = norm(sub(world, c));
        const proj = add(c, mul(dir, o.r));
        const dist = len(sub(proj, world));
        if (dist < bestD) { best = { kind: 'onCircle', object: o, world: proj }; bestD = dist; }
      }
    }
    if (best) return best;
    if (gridOn && gridSize > 0) {
      const gx = Math.round(world.x / gridSize) * gridSize;
      const gy = Math.round(world.y / gridSize) * gridSize;
      if (Math.abs(world.x - gx) < tolW && Math.abs(world.y - gy) < tolW) return { kind: 'grid', world: { x: gx, y: gy } };
    }
    return { kind: 'free', world };
  }

  /* ---------- 派生构造 ---------- */
  addFreePoint(world, extra = {}) {
    return this.create(PT, { x: world.x, y: world.y, free: true, ...extra });
  }

  addPointOn(objectId, world) {
    const obj = this.get(objectId);
    if (!obj) return this.addFreePoint(world);
    return this.create(PT, {
      x: world.x, y: world.y, free: true,
      glue: { object: objectId },
      parents: [objectId]
    });
  }

  addMidpoint(aId, bId) {
    return this.create(PT, { parents: [aId, bId], free: false, derived: 'midpoint' });
  }

  addIntersection(idA, idB, index = 0) {
    return this.create(PT, { parents: [idA, idB], free: false, derived: 'intersection', index });
  }

  addSegment(aId, bId, opts = {}) { return this.create(SEG, { parents: [aId, bId], ...opts }); }
  addLine(aId, bId, opts = {}) { return this.create(LINE, { parents: [aId, bId], ...opts }); }
  addRay(aId, bId, opts = {}) { return this.create(RAY, { parents: [aId, bId], ...opts }); }
  addVector(aId, bId, opts = {}) { return this.create(VEC, { parents: [aId, bId], ...opts }); }
  addCircle(centerId, throughId, opts = {}) { return this.create(CIRCLE, { parents: [centerId, throughId], ...opts }); }
  addCircleR(centerId, r, opts = {}) { return this.create(CIRCLE, { parents: [centerId], fixedR: r, ...opts }); }
  addCircle3(a, b, c, opts = {}) { return this.create(CIRCLE, { parents: [a, b, c], derived: 'circle3', ...opts }); }
  addArc(a, b, c, opts = {}) { return this.create(ARC, { parents: [a, b, c], ...opts }); }
  addPolygon(ids, opts = {}) { return this.create(POLY, { parents: ids, ...opts }); }
  addRegion(ids, opts = {}) { return this.create(REGION, { parents: ids, fill: opts.fill || 'rgba(108,140,255,0.16)', ...opts }); }
  addPerpendicular(lineId, pointId, opts = {}) {
    return this.create(LINE, { parents: [pointId, lineId], derived: 'perpendicular', ...opts });
  }
  addParallel(lineId, pointId, opts = {}) {
    return this.create(LINE, { parents: [pointId, lineId], derived: 'parallel', ...opts });
  }
  addPerpBisector(aId, bId, opts = {}) { return this.create(LINE, { parents: [aId, bId], derived: 'perpbisector', ...opts }); }
  addAngleBisector(aId, bId, cId, opts = {}) { return this.create(RAY, { parents: [aId, bId, cId], derived: 'anglebisector', ...opts }); }
  addMeasure(kind, ids, opts = {}) { return this.create(MEASURE, { parents: ids, derived: kind, ...opts }); }
  addText(world, text, opts = {}) { return this.create(TEXT, { x: world.x, y: world.y, text, free: true, ...opts }); }
  addFunction(expr, compiled, opts = {}) { return this.create(FN, { source: expr, compiled, ...opts }); }
  addTransform(kind, parents, opts = {}) { return this.create(kind, { parents, ...opts }); }

  /* ---------- 变换 ---------- */
  transformPoint(kind, p, ...args) {
    switch (kind) {
      case 'translate': {
        const v = args[0];
        return { x: p.x + v.x, y: p.y + v.y };
      }
      case 'rotate': {
        const [center, angle] = args;
        const c = Math.cos(angle), s = Math.sin(angle);
        const dx = p.x - center.x, dy = p.y - center.y;
        return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
      }
      case 'reflect': {
        const [a, b] = args;
        const d = sub(b, a);
        const t = dot(sub(p, a), d) / dot(d, d);
        const proj = add(a, mul(d, t));
        return { x: 2 * proj.x - p.x, y: 2 * proj.y - p.y };
      }
      case 'dilate': {
        const [center, k] = args;
        return { x: center.x + (p.x - center.x) * k, y: center.y + (p.y - center.y) * k };
      }
      default:
        return p;
    }
  }

  /* ---------- 轨迹 ---------- */
  traceOf(pointId) { return this.traces.find((t) => t.id === pointId); }
  pushTrace(pointId, world, max = 2000) {
    let t = this.traceOf(pointId);
    if (!t) { t = { id: pointId, pts: [] }; this.traces.push(t); }
    const last = t.pts[t.pts.length - 1];
    if (!last || len(sub(last, world)) > 2 / this.scale) {
      t.pts.push(world);
      if (t.pts.length > max) t.pts.shift();
    }
  }

  /* ---------- 测量 ---------- */
  measureValue(m) {
    const P = (i) => this.get(m.parents[i]);
    switch (m.derived) {
      case 'length': {
        const a = P(0), b = P(1);
        return a && b ? len(sub(b, a)) : NaN;
      }
      case 'angle': {
        const a = P(0), b = P(1), c = P(2);
        return a && b && c ? angleAt(a, b, c) : NaN;
      }
      case 'area': {
        const poly = P(0);
        if (!poly) return NaN;
        const pts = poly.parents.map((id) => this.get(id)).filter(Boolean);
        return Math.abs(polygonArea(pts));
      }
      case 'slope': {
        const a = P(0), b = P(1);
        if (!a || !b) return NaN;
        return Math.abs(b.x - a.x) < 1e-12 ? Infinity : (b.y - a.y) / (b.x - a.x);
      }
      case 'coord': {
        const a = P(0);
        return a ? a.x : NaN;
      }
      case 'radius': {
        const c = P(0);
        return c ? c.r : NaN;
      }
      case 'perimeter': {
        const poly = P(0);
        if (!poly) return NaN;
        const pts = poly.parents.map((id) => this.get(id)).filter(Boolean);
        let s = 0;
        for (let i = 0; i < pts.length; i++) s += len(sub(pts[(i + 1) % pts.length], pts[i]));
        return s;
      }
      default:
        return NaN;
    }
  }

  measureText(m) {
    const v = this.measureValue(m);
    switch (m.derived) {
      case 'length': return '|' + (this.get(m.parents[0])?.name || '?') + (this.get(m.parents[1])?.name || '?') + '| = ' + fmtNum(v);
      case 'angle': return '∠' + (this.get(m.parents[0])?.name || '') + (this.get(m.parents[1])?.name || '') + (this.get(m.parents[2])?.name || '') + ' = ' + (v * 180 / Math.PI).toFixed(1) + '°';
      case 'area': return 'S = ' + fmtNum(v);
      case 'slope': return 'k = ' + (Number.isFinite(v) ? fmtNum(v) : '∞');
      case 'coord': return '(' + fmtNum(this.get(m.parents[0])?.x) + ', ' + fmtNum(this.get(m.parents[0])?.y) + ')';
      case 'radius': return 'r = ' + fmtNum(v);
      case 'perimeter': return 'L = ' + fmtNum(v);
      default: return fmtNum(v);
    }
  }

  /* ---------- 序列化 ---------- */
  toJSON() {
    return {
      app: 'Buzhidao Math',
      kind: 'geometry',
      version: 1,
      view: { origin: this.origin, scale: this.scale, labels: this.labels },
      objects: this.all().map((o) => ({
        id: o.id, type: o.type, name: o.name, parents: o.parents, deps: o.deps,
        x: o.x, y: o.y, r: o.r, free: o.free, derived: o.derived, index: o.index,
        glue: o.glue, text: o.text, source: o.source, fixedR: o.fixedR,
        visible: o.visible, style: o.style, fill: o.fill, attrs: o.attrs
      })),
      traces: this.traces,
      locuses: this.locuses.map((l) => ({ id: l.id, driver: l.driver, traced: l.traced, samples: l.samples }))
    };
  }

  loadJSON(data) {
    if (!data || !Array.isArray(data.objects)) throw new Error('无效的画板数据');
    this.clear();
    if (data.view) {
      this.origin = data.view.origin || this.origin;
      this.scale = data.view.scale || this.scale;
      this.labels = data.view.labels !== false;
    }
    const idMap = new Map();
    // 按原始顺序创建，保证父对象先存在
    for (const raw of data.objects) {
      const obj = { ...raw, id: nid('o') };
      idMap.set(raw.id, obj.id);
      obj.parents = (raw.parents || []).map((p) => idMap.get(p) || p);
      obj.deps = (raw.deps || []).map((p) => idMap.get(p) || p);
      if (raw.type === FN && raw.source) {
        obj.compiled = null;
        obj.source = raw.source;
      }
      this.objects.set(obj.id, obj);
      this.order.push(obj.id);
      this.compute(obj);
    }
    this.traces = data.traces || [];
    this.locuses = (data.locuses || []).map((l) => ({ ...l, points: [] }));
    this.recompute();
    this.emit();
    return this;
  }
}

function fmtNum(v) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-4 || a >= 1e6)) return v.toExponential(3);
  return String(Number(v.toFixed(4)));
}

/* ---------------- 各类型对象的计算（重算核心） ---------------- */
export const COMPUTE = {
  [PT](o, board) {
    if (o.derived === 'midpoint') {
      const a = board.get(o.parents[0]), b = board.get(o.parents[1]);
      if (a && b) { const m = mid(a, b); o.x = m.x; o.y = m.y; }
      return;
    }
    if (o.derived === 'intersection') {
      const A = board.get(o.parents[0]), B = board.get(o.parents[1]);
      const pts = intersectObjects(board, A, B);
      const idx = Math.min(o.index || 0, Math.max(0, pts.length - 1));
      if (pts[idx]) { o.x = pts[idx].x; o.y = pts[idx].y; o.valid = true; }
      else o.valid = false;
      return;
    }
    if (o.derived === 'transform') {
      const src = board.get(o.parents[0]);
      const rest = o.parents.slice(1).map((id) => board.get(id));
      if (src) {
        const args = o.attrs?.args || [];
        const numeric = rest.length ? rest.map((r) => (r ? { x: r.x, y: r.y } : null)) : [];
        let p;
        switch (o.attrs?.kind) {
          case 'translate': {
            const ref = numeric[0];
            const dx = ref ? ref.x - (board.get(o.attrs.baseA)?.x || 0) : args[0] || 0;
            const dy = ref ? ref.y - (board.get(o.attrs.baseA)?.y || 0) : args[1] || 0;
            p = { x: src.x + dx, y: src.y + dy };
            break;
          }
          case 'rotate': {
            const center = numeric[0] || { x: 0, y: 0 };
            const ang = numeric[1] ? Math.atan2(numeric[1].y - center.y, numeric[1].x - center.x) : (Math.PI / 2);
            p = board.transformPoint('rotate', src, center, ang);
            break;
          }
          case 'reflect': {
            const a = numeric[0], b = numeric[1];
            p = a && b ? board.transformPoint('reflect', src, a, b) : src;
            break;
          }
          case 'dilate': {
            const center = numeric[0] || { x: 0, y: 0 };
            const k = o.attrs.k || 2;
            p = board.transformPoint('dilate', src, center, k);
            break;
          }
          default:
            p = src;
        }
        o.x = p.x; o.y = p.y;
      }
      return;
    }
    if (o.glue) {
      const target = board.get(o.glue.object);
      if (target) {
        if (target.type === CIRCLE) {
          const c = board.get(target.parents[0]);
          if (c) {
            const d = norm(sub(o, c));
            o.x = c.x + d.x * target.r;
            o.y = c.y + d.y * target.r;
          }
        } else if (target.type === LINE || target.type === SEG || target.type === RAY || target.type === VEC) {
          const a = board.get(target.parents[0]), b = board.get(target.parents[1]);
          if (a && b) {
            const d = sub(b, a);
            const t = dot(sub(o, a), d) / Math.max(1e-12, dot(d, d));
            const tc = target.type === SEG ? Math.max(0, Math.min(1, t)) : t;
            o.x = a.x + d.x * tc;
            o.y = a.y + d.y * tc;
          }
        }
      }
      return;
    }
    // 自由点：坐标即为真值
  },

  [SEG]() {},
  /* 直线/射线/向量：方向在渲染与交点求解阶段由父对象动态推导 */
  [LINE]() {},
  [RAY]() {}, [VEC]() {},

  [CIRCLE](o, board) {
    if (o.derived === 'circle3') {
      const a = board.get(o.parents[0]), b = board.get(o.parents[1]), c = board.get(o.parents[2]);
      if (!a || !b || !c) return;
      const circle = circleFrom3(a, b, c);
      if (!circle) { o.valid = false; return; }
      o.valid = true;
      o.center = circle.center;
      o.r = circle.r;
      return;
    }
    const c = board.get(o.parents[0]);
    if (!c) return;
    o.center = { x: c.x, y: c.y };
    if (o.fixedR !== undefined && o.fixedR !== null) {
      o.r = o.fixedR;
    } else {
      const t = board.get(o.parents[1]);
      if (t) o.r = len(sub(t, c));
    }
  },

  [ARC](o, board) {
    const a = board.get(o.parents[0]), b = board.get(o.parents[1]), c = board.get(o.parents[2]);
    if (!a || !b || !c) return;
    const arc = arcParams(a, b, c);
    o.valid = !!arc;
    if (arc) { o.center = arc.center; o.r = arc.r; o.a0 = arc.a0; o.a1 = arc.a1; o.ccw = arc.ccw; }
  },

  [POLY]() {}, [REGION]() {}, [TEXT]() {}, [TRACE]() {},

  [MEASURE](o, board) {
    o.value = board.measureValue(o);
    o.label = board.measureText(o);
  },

  [FN](o) {
    if (!o.compiled && o.source && o.compileFn) o.compiled = o.compileFn(o.source);
  },

  [LOCUS](o, board) {
    const drv = board.get(o.parents[0]);
    const traced = board.get(o.parents[1]);
    void drv; void traced;
  }
};

/* 两个对象的交点集合 */
export function intersectObjects(board, A, B) {
  if (!A || !B) return [];
  const lineOf = (o) => {
    if (o.type === LINE || o.type === SEG || o.type === RAY || o.type === VEC) {
      const a = board.get(o.parents[0]), b = board.get(o.parents[1]);
      if (!a || !b) return null;
      if (o.derived === 'perpendicular') {
        const base = board.get(o.parents[1]);
        const la = board.get(base?.parents?.[0]), lb = board.get(base?.parents?.[1]);
        if (!la || !lb) return null;
        const d = sub(lb, la);
        return { p: { x: a.x, y: a.y }, d: { x: -d.y, y: d.x }, kind: o.type };
      }
      if (o.derived === 'parallel') {
        const base = board.get(o.parents[1]);
        const la = board.get(base?.parents?.[0]), lb = board.get(base?.parents?.[1]);
        if (!la || !lb) return null;
        return { p: { x: a.x, y: a.y }, d: sub(lb, la), kind: o.type };
      }
      if (o.derived === 'perpbisector') {
        const la = board.get(o.parents[0]), lb = board.get(o.parents[1]);
        if (!la || !lb) return null;
        const d = sub(lb, la);
        return { p: mid(la, lb), d: { x: -d.y, y: d.x }, kind: o.type };
      }
      return { p: { x: a.x, y: a.y }, d: sub(b, a), kind: o.type };
    }
    return null;
  };
  const circleOf = (o) => (o.type === CIRCLE ? { c: o.center, r: o.r } : null);
  const filterKind = (pts, o) => {
    if (o.type === SEG) {
      const a = board.get(o.parents[0]), b = board.get(o.parents[1]);
      return pts.filter((p) => {
        const d = sub(b, a);
        const t = dot(sub(p, a), d) / Math.max(1e-12, dot(d, d));
        return t >= -1e-9 && t <= 1 + 1e-9;
      });
    }
    if (o.type === RAY) {
      const a = board.get(o.parents[0]), b = board.get(o.parents[1]);
      return pts.filter((p) => dot(sub(p, a), sub(b, a)) >= -1e-9);
    }
    return pts;
  };

  const lA = lineOf(A), lB = lineOf(B), cA = circleOf(A), cB = circleOf(B);
  if (lA && lB) {
    const p = lineLineIntersect(lA.p, lA.d, lB.p, lB.d);
    return p ? filterKind(filterKind([p], A), B) : [];
  }
  if (lA && cB) return filterKind(lineCircleIntersect(lA.p, lA.d, cB.c, cB.r), A);
  if (lB && cA) return filterKind(lineCircleIntersect(lB.p, lB.d, cA.c, cA.r), B);
  if (cA && cB) return circleCircleIntersect(cA.c, cA.r, cB.c, cB.r);
  return [];
}
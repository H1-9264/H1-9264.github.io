/* analyze.js — 函数分析器：零点 / 极值 / 拐点 / 单调区间 / 凹凸 / 交点 / 积分 / 弧长 / 曲率
   全部基于数值方法（自适应网格 + 二分/黄金分割细化），也适用于没有解析导数的表达式。 */

const fmt = (v, d = 6) => {
  if (!Number.isFinite(v)) return '—';
  const r = Number(v.toFixed(d));
  return String(r);
};

const finite = (v) => Number.isFinite(v);

/* 在 [a,b] 上加密采样：返回 { xs, ys, breaks } —— breaks 是不连续或不可导的区间 */
export function sampleProfile(evalFn, a, b, n = 2400) {
  const xs = new Array(n + 1);
  const ys = new Array(n + 1);
  const h = (b - a) / n;
  for (let i = 0; i <= n; i++) {
    const x = a + h * i;
    xs[i] = x;
    let y = NaN;
    try { y = evalFn(x); } catch { y = NaN; }
    ys[i] = finite(y) ? y : NaN;
  }
  const breaks = [];
  for (let i = 1; i <= n; i++) {
    const p0 = ys[i - 1], p1 = ys[i];
    if (!finite(p0) || !finite(p1)) { breaks.push(xs[i]); continue; }
    const scale = Math.max(1, Math.abs(p0), Math.abs(p1));
    if (Math.abs(p1 - p0) > scale * 8) breaks.push(xs[i]);       // 跳变（例如 1/x）
  }
  return { xs, ys, breaks, h, n };
}

function signChange(p0, p1) {
  if (!finite(p0) || !finite(p1)) return false;
  return (p0 === 0) || (p0 < 0) !== (p1 < 0);
}

/* 二分细化零点 */
function refineRoot(evalFn, x0, x1, iters = 80) {
  let lo = x0, hi = x1;
  let flo = evalFn(lo);
  if (!finite(flo)) return null;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    const fmid = evalFn(mid);
    if (!finite(fmid)) { hi = mid; continue; }
    if ((flo < 0) !== (fmid < 0)) hi = mid;
    else { lo = mid; flo = fmid; }
    if (Math.abs(hi - lo) < 1e-12 * Math.max(1, Math.abs(lo))) break;
  }
  const x = (lo + hi) / 2;
  return { x, y: evalFn(x) };
}

/* 零点：网格扫符号变化 + 二分。注意端点本身是零点、或零点正好落在网格点上的情况。 */
export function findRoots(evalFn, a, b, n = 2400) {
  const { xs, ys } = sampleProfile(evalFn, a, b, n);
  const out = [];
  const atol = 1e-9;
  /* 端点：例如 sin 在 [0, π] 的两端都是零点 */
  [a, b].forEach((x) => {
    const y = evalFn(x);
    if (finite(y) && Math.abs(y) <= atol * Math.max(1, Math.abs(y) || 1) && Math.abs(y) < 1e-9) out.push({ x, y: 0 });
  });
  for (let i = 1; i <= n; i++) {
    const p0 = ys[i - 1], p1 = ys[i];
    if (!finite(p0) || !finite(p1)) continue;
    if (p0 === 0) { out.push({ x: xs[i - 1], y: 0 }); continue; }
    if (signChange(p0, p1)) {
      const r = refineRoot(evalFn, xs[i - 1], xs[i]);
      if (r && finite(r.y) && Math.abs(r.y) < 1e-6) out.push({ x: r.x, y: 0 });
    }
  }
  /* 去掉重复（同一根被相邻区间各扫到一次） */
  const uniq = [];
  for (const r of out) if (!uniq.some((u) => Math.abs(u.x - r.x) < 1e-7)) uniq.push(r);
  return uniq;
}

/* 极值：一阶差分变号 + 黄金分割细化 */
export function findExtrema(evalFn, a, b, n = 2400) {
  const { xs, ys, breaks } = sampleProfile(evalFn, a, b, n);
  const isBreak = (x) => breaks.some((bx) => Math.abs(bx - x) < (b - a) / n * 1.5);
  const out = [];
  for (let i = 1; i < n; i++) {
    const y0 = ys[i - 1], y1 = ys[i], y2 = ys[i + 1];
    if (!finite(y0) || !finite(y1) || !finite(y2)) continue;
    if (isBreak(xs[i])) continue;
    const d1 = y1 - y0, d2 = y2 - y1;
    let type = null;
    if (d1 > 0 && d2 < 0) type = 'max';
    else if (d1 < 0 && d2 > 0) type = 'min';
    else if (d1 === 0 && d2 < 0) type = 'max';
    else if (d1 === 0 && d2 > 0) type = 'min';
    if (!type) continue;
    /* 在 [xs[i-1], xs[i+1]] 上细化 */
    const lo = xs[i - 1], hi = xs[i + 1];
    const g = (Math.sqrt(5) - 1) / 2;
    let l = lo, r = hi;
    let c = r - g * (r - l), d = l + g * (r - l);
    let fc = evalFn(c), fd = evalFn(d);
    for (let k = 0; k < 60; k++) {
      if (!finite(fc) || !finite(fd)) break;
      if (type === 'min' ? fc < fd : fc > fd) { r = d; d = c; fd = fc; c = r - g * (r - l); fc = evalFn(c); }
      else { l = c; c = d; fc = fd; d = l + g * (r - l); fd = evalFn(d); }
    }
    const x = (l + r) / 2;
    const y = evalFn(x);
    if (!finite(y)) continue;
    if (out.some((o) => Math.abs(o.x - x) < 1e-6)) continue;
    out.push({ x, y, type });
  }
  return out;
}

/* 拐点：二阶差分变号 */
export function findInflections(evalFn, a, b, n = 2400) {
  const { xs, ys, h } = sampleProfile(evalFn, a, b, n);
  const out = [];
  const d2 = (i) => {
    const y0 = ys[i - 1], y1 = ys[i], y2 = ys[i + 1];
    if (!finite(y0) || !finite(y1) || !finite(y2)) return NaN;
    return (y2 - 2 * y1 + y0) / (h * h);
  };
  for (let i = 2; i < n - 1; i++) {
    const d0 = d2(i - 1), d1 = d2(i);
    if (!finite(d0) || !finite(d1)) continue;
    const scale = Math.max(1e-9, Math.abs(d0), Math.abs(d1));
    if (Math.abs(d1 - d0) < scale * 0.5) continue;
    if ((d0 < 0) !== (d1 < 0)) {
      /* 二分找 d2 = 0 */
      let lo = xs[i - 1], hi = xs[i + 1];
      const f2 = (x) => {
        const e = Math.max(1e-6, h / 4);
        const yl = evalFn(x - e), yr = evalFn(x + e), ym = evalFn(x);
        if (!finite(yl) || !finite(yr) || !finite(ym)) return NaN;
        return (yr - 2 * ym + yl) / (e * e);
      };
      let flo = f2(lo);
      for (let k = 0; k < 70; k++) {
        const mid = (lo + hi) / 2;
        const fmid = f2(mid);
        if (!finite(fmid)) { hi = mid; continue; }
        if ((flo < 0) !== (fmid < 0)) hi = mid;
        else { lo = mid; flo = fmid; }
      }
      const x = (lo + hi) / 2;
      const y = evalFn(x);
      if (!finite(y)) continue;
      if (out.some((o) => Math.abs(o.x - x) < 1e-5)) continue;
      out.push({ x, y });
    }
  }
  return out;
}

/* 单调性与凹凸区间：把定义域切成若干段（只在性质真的变化时切段） */
export function findIntervals(evalFn, a, b, n = 1200) {
  const { xs, ys, breaks } = sampleProfile(evalFn, a, b, n);
  const h = (b - a) / n;
  const segs = [];
  let cur = null;
  let prevDir = null;
  let prevConc = null;

  const flush = () => {
    if (!cur) return;
    cur.x0 = Math.round(cur.x0 * 1e6) / 1e6;
    cur.x1 = Math.round(cur.x1 * 1e6) / 1e6;
    if (cur.x1 - cur.x0 >= h * 2) segs.push(cur);
    cur = null;
    prevDir = null;
    prevConc = null;
  };

  for (let i = 1; i < n - 1; i++) {
    const y0 = ys[i - 1], y1 = ys[i], y2 = ys[i + 1];
    const broken = !finite(y0) || !finite(y1) || !finite(y2) ||
      breaks.some((bx) => Math.abs(bx - xs[i]) < h * 1.5);
    if (broken) { flush(); continue; }
    const d = y1 - y0;
    const dir = Math.abs(d) < 1e-12 ? 'flat' : (d > 0 ? 'up' : 'down');
    const d2 = y2 - 2 * y1 + y0;
    const conc = Math.abs(d2) < 1e-9 ? 'flat' : (d2 > 0 ? 'concave-up' : 'concave-down');
    if (!cur) {
      cur = { x0: xs[i - 1], x1: xs[i], dir, conc };
      prevDir = dir;
      prevConc = conc;
      continue;
    }
    if (dir !== prevDir || conc !== prevConc) {
      flush();
      cur = { x0: xs[i - 1], x1: xs[i], dir, conc };
      prevDir = dir;
      prevConc = conc;
      continue;
    }
    cur.x1 = xs[i];
  }
  flush();

  const out = [];
  for (const sg of segs) {
    const last = out[out.length - 1];
    if (last && last.dir === sg.dir && last.conc === sg.conc && Math.abs(last.x1 - sg.x0) < h * 4) {
      last.x1 = sg.x1;
      continue;
    }
    out.push({ x0: sg.x0, x1: sg.x1, dir: sg.dir, conc: sg.conc });
  }
  return out;
}

/* 两个函数的交点：解 f - g = 0 */
export function findCrossings(evalA, evalB, a, b, n = 3000) {
  const diff = (x) => {
    const y = evalA(x) - evalB(x);
    return finite(y) ? y : NaN;
  };
  const roots = findRoots(diff, a, b, n);
  return roots.map((r) => ({ x: r.x, y: evalA(r.x) })).filter((p) => finite(p.y));
}

/* 定积分：Simpson 复合公式（n 必须为偶数） */
export function integrate(evalFn, a, b, n = 2000) {
  if (!finite(a) || !finite(b) || a === b) return 0;
  const sign = a > b ? -1 : 1;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const m = Math.max(2, n % 2 === 0 ? n : n + 1);
  const h = (hi - lo) / m;
  let s = 0;
  let ok = 0;
  for (let i = 0; i <= m; i++) {
    const y = evalFn(lo + h * i);
    if (!finite(y)) continue;
    const w = (i === 0 || i === m) ? 1 : (i % 2 ? 4 : 2);
    s += w * y;
    ok++;
  }
  if (!ok) return NaN;
  return sign * (s * h) / 3;
}

/* 左/右矩形法（用来对比黎曼和） */
export function riemann(evalFn, a, b, n = 50, mode = 'left') {
  const h = (b - a) / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x = mode === 'left' ? a + i * h : (mode === 'right' ? a + (i + 1) * h : a + (i + 0.5) * h);
    const y = evalFn(x);
    if (finite(y)) s += y * h;
  }
  return s;
}

/* 弧长：∫√(1 + f'(x)²) dx */
export function arcLength(evalFn, a, b, n = 1200) {
  const h = (b - a) / n;
  const d = (x) => {
    const e = Math.max(1e-7, Math.abs(x) * 1e-7 + 1e-7);
    const f1 = evalFn(x + e), f0 = evalFn(x - e);
    return finite(f1) && finite(f0) ? (f1 - f0) / (2 * e) : NaN;
  };
  return integrate((x) => {
    const k = d(x);
    return finite(k) ? Math.sqrt(1 + k * k) : 0;
  }, a, b, n);
}

/* 曲率半径 ρ = (1+f'²)^(3/2) / |f''| */
export function curvature(evalFn, x) {
  const e = Math.max(1e-5, Math.abs(x) * 1e-5 + 1e-5);
  const y0 = evalFn(x - e), y1 = evalFn(x), y2 = evalFn(x + e);
  if (!finite(y0) || !finite(y1) || !finite(y2)) return null;
  const d1 = (y2 - y0) / (2 * e);
  const d2 = (y2 - 2 * y1 + y0) / (e * e);
  if (Math.abs(d2) < 1e-12) return { d1, d2, kappa: 0, radius: Infinity };
  const kappa = Math.abs(d2) / Math.pow(1 + d1 * d1, 1.5);
  return { d1, d2, kappa, radius: 1 / kappa, angle: (Math.atan(d1) * 180) / Math.PI };
}

/* 综合摘要：一次把常用指标算齐（界面上"概览"用） */
export function summarize(evalFn, a, b, opts = {}) {
  const n = opts.samples || 2400;
  const { ys } = sampleProfile(evalFn, a, b, n);
  const good = ys.filter(finite);
  const roots = findRoots(evalFn, a, b, n);
  const extrema = findExtrema(evalFn, a, b, n);
  const inflections = findInflections(evalFn, a, b, n);
  const zero = (() => { try { const v = evalFn(0); return finite(v) ? v : null; } catch { return null; } })();
  const integral = integrate(evalFn, a, b, 2000);
  const length = arcLength(evalFn, a, b, 800);
  return {
    range: { x0: a, x1: b },
    yMin: good.length ? Math.min(...good) : null,
    yMax: good.length ? Math.max(...good) : null,
    yAvg: good.length ? good.reduce((s, v) => s + v, 0) / good.length : null,
    avgValue: finite(integral) ? integral / (b - a) : NaN,
    zero,
    roots, extrema, inflections,
    integral, length,
    continuum: good.length ? 1 - (sampleProfile(evalFn, a, b, n).breaks.length / n) : 0
  };
}

export { fmt as formatNumber };
/* fit.js — 用一组点拟合函数（最小二乘 + 数值优化）
   支持：线性 / 二次 / 三次 / 幂函数 / 指数 / 对数 / 自定义多项式次数。
   所有模型都返回 { key, label, expr, params, r2, rmse, fn }，fn 可直接拿去画图。 */

/* ------------------------------ 线性代数 ------------------------------ */
/* 解正规方程 A·x = b（A 为 n×n），高斯消元 + 部分主元 */
function solve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (!f) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

/* 最小二乘：基函数数组 basis（x => number） */
function leastSquares(pts, basis) {
  const n = basis.length;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  for (const p of pts) {
    const v = basis.map((f) => f(p.x));
    for (let i = 0; i < n; i++) {
      b[i] += v[i] * p.y;
      for (let j = 0; j < n; j++) A[i][j] += v[i] * v[j];
    }
  }
  return solve(A, b);
}

/* 一维搜索：让 f(t) 最小的 t（黄金分割，t ∈ [lo, hi]） */
function minimize1d(f, lo, hi, iters = 90) {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi;
  let c = b - g * (b - a), d = a + g * (b - a);
  let fc = f(c), fd = f(d);
  for (let i = 0; i < iters; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

/* ------------------------------ 统计量 ------------------------------ */
export function statsOf(pts, predict) {
  const n = pts.length;
  if (!n) return { r2: 0, rmse: 0, mae: 0, n: 0 };
  let sse = 0, sae = 0;
  const ys = pts.map((p) => p.y);
  const mean = ys.reduce((a, b) => a + b, 0) / n;
  let sst = 0;
  for (const p of pts) {
    const e = p.y - predict(p.x);
    if (!Number.isFinite(e)) { sse += 1e9; sae += 1e6; continue; }
    sse += e * e;
    sae += Math.abs(e);
    sst += (p.y - mean) ** 2;
  }
  return {
    n,
    r2: sst > 0 ? Math.max(-1, 1 - sse / sst) : (sse < 1e-9 ? 1 : 0),
    rmse: Math.sqrt(sse / n),
    mae: sae / n
  };
}

const fmt = (v, d = 4) => (Number.isFinite(v) ? Number(v.toFixed(d)).toString() : '—');

/* ------------------------------ 各模型 ------------------------------ */
/* 幂函数 y = a·x^b：对 ln 变换后线性拟合（要求 x>0, y>0） */
function fitPower(pts) {
  const pos = pts.filter((p) => p.x > 0 && p.y > 0);
  if (pos.length < 2) return null;
  const coef = leastSquares(pos.map((p) => ({ x: Math.log(p.x), y: Math.log(p.y) })), [(x) => 1, (x) => x]);
  if (!coef) return null;
  const a = Math.exp(coef[0]);
  const b = coef[1];
  return { a, b, fn: (x) => (x > 0 ? a * Math.pow(x, b) : NaN), expr: fmt(a) + '·x^' + fmt(b) };
}

/* 指数 y = a·e^(b·x) */
function fitExp(pts) {
  const pos = pts.filter((p) => p.y > 0);
  if (pos.length < 2) return null;
  const coef = leastSquares(pos, [(x) => 1, (x) => x]);
  const lnY = pos.map((p) => ({ x: p.x, y: Math.log(p.y) }));
  const c = leastSquares(lnY, [(x) => 1, (x) => x]);
  if (!c) return null;
  const a = Math.exp(c[0]);
  const b = c[1];
  void coef;
  return { a, b, fn: (x) => a * Math.exp(b * x), expr: fmt(a) + '·e^(' + fmt(b) + 'x)' };
}

/* 对数 y = a + b·ln(x) */
function fitLog(pts) {
  const pos = pts.filter((p) => p.x > 0);
  if (pos.length < 2) return null;
  const c = leastSquares(pos.map((p) => ({ x: Math.log(p.x), y: p.y })), [(x) => 1, (x) => x]);
  if (!c) return null;
  return { a: c[0], b: c[1], fn: (x) => (x > 0 ? c[0] + c[1] * Math.log(x) : NaN), expr: fmt(c[0]) + ' + ' + fmt(c[1]) + '·ln(x)' };
}

/* 多项式：次数 1..6（次数越高越容易过拟合，界面上会提示） */
function fitPoly(pts, degree) {
  if (pts.length < degree + 1) return null;
  const basis = [];
  for (let k = 0; k <= degree; k++) basis.push((x) => Math.pow(x, k));
  const c = leastSquares(pts, basis);
  if (!c) return null;
  const fn = (x) => c.reduce((s, v, k) => s + v * Math.pow(x, k), 0);
  /* 生成好看的表达式：从高次到常数，系数为 0 的项省略 */
  const parts = [];
  for (let k = degree; k >= 0; k--) {
    const v = c[k];
    if (Math.abs(v) < 1e-12) continue;
    const sign = v < 0 ? '−' : (parts.length ? '+' : '');
    const abs = Math.abs(v);
    const num = k === 0 ? fmt(abs) : (Math.abs(abs - 1) < 1e-9 ? '' : fmt(abs) + '·');
    const pow = k === 0 ? '' : (k === 1 ? 'x' : 'x^' + k);
    parts.push((parts.length ? ' ' + sign + ' ' : (sign === '−' ? '−' : '')) + num + pow);
  }
  return { c, fn, expr: parts.join('') || '0' };
}

/* 自定义：y = a·f(x) + b（f 由调用方给，用于"套用某个已知函数形状"） */
export function fitScaled(pts, f) {
  const mapped = pts.map((p) => ({ x: p.x, y: p.y }));
  const c = leastSquares(mapped, [(x) => f(x), () => 1]);
  if (!c) return null;
  const fn = (x) => c[0] * f(x) + c[1];
  return { a: c[0], b: c[1], fn, expr: fmt(c[0]) + '·f(x) + ' + fmt(c[1]) };
}

/* ------------------------------ 主入口 ------------------------------ */
/* models: 'auto' | 'linear' | 'quad' | 'cubic' | 'poly4..6' | 'power' | 'exp' | 'log' */
export function fitModels(points, model = 'auto') {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return { error: 'need-2-points', pts };
  const out = [];
  const push = (key, label, res) => {
    if (!res) return;
    const st = statsOf(pts, res.fn);
    /* 注意：fn 必须一起带上，界面上"用这条曲线画图"和残差表都要用 */
    out.push({ key, label, expr: res.expr, fn: res.fn, a: res.a, b: res.b, c: res.c, ...st });
  };

  const want = (m) => model === 'auto' || model === m;
  if (want('linear')) push('linear', 'linear', fitPoly(pts, 1));
  if (want('quad')) push('quad', 'quadratic', fitPoly(pts, 2));
  if (want('cubic')) push('cubic', 'cubic', fitPoly(pts, 3));
  if (want('poly4')) push('poly4', 'poly4', fitPoly(pts, 4));
  if (want('poly5')) push('poly5', 'poly5', fitPoly(pts, 5));
  if (want('poly6')) push('poly6', 'poly6', fitPoly(pts, 6));
  if (want('power')) push('power', 'power', fitPower(pts));
  if (want('exp')) push('exp', 'exponential', fitExp(pts));
  if (want('log')) push('log', 'logarithmic', fitLog(pts));

  /* 自动模式：按 R² 排序，优先选更简单的模型（R² 差距 < 0.01 时取低次） */
  out.sort((a, b) => {
    const d = b.r2 - a.r2;
    if (Math.abs(d) > 0.01) return d;
    return a.key.length - b.key.length;
  });
  return { models: out, best: out[0] || null, pts };
}

/* 从文本解析点：支持 "1,2  2,4" / "1 2
3 4" / "(1, 2)" / "x=1 y=2" 混写 */
export function parsePoints(text) {
  const pts = [];
  const src = String(text || '').replace(/[（(]/g, ' ').replace(/[）)]/g, ' ').replace(/[，、;；]/g, ',');
  const lines = src.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  const push = (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
  };
  for (const line of lines) {
    /* 一行一对：优先按逗号/空白切 */
    const nums = line.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g);
    if (nums && nums.length >= 2) {
      for (let i = 0; i + 1 < nums.length; i += 2) push(Number(nums[i]), Number(nums[i + 1]));
      continue;
    }
    /* x=1 y=2 形式 */
    const mx = /x\s*=\s*(-?[\d.]+(?:e[-+]?\d+)?)/i.exec(line);
    const my = /y\s*=\s*(-?[\d.]+(?:e[-+]?\d+)?)/i.exec(line);
    if (mx && my) push(Number(mx[1]), Number(my[1]));
  }
  /* 去重 + 按 x 排序 */
  const seen = new Map();
  pts.forEach((p) => seen.set(p.x, p));
  return [...seen.values()].sort((a, b) => a.x - b.x);
}

export { minimize1d, leastSquares, solve };
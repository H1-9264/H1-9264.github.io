import { findIntervals, findRoots, findExtrema, findInflections, findCrossings, integrate, arcLength, curvature, summarize } from '../assets/js/plot/analyze.js';
import { fitModels, parsePoints } from '../assets/js/plot/fit.js';
let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
const ok = (name, cond, extra) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name + (extra ? '  ' + extra : '')); } };

// 零点：sin 在 [-10,10] 有 -3π,-2π,-π,0,π,2π,3π
const roots = findRoots(Math.sin, -10, 10);
ok('sin 零点个数=7', roots.length === 7, 'got ' + roots.length);
ok('sin 零点含 0', roots.some((r) => near(r.x, 0, 1e-6)));
ok('sin 零点含 π', roots.some((r) => near(r.x, Math.PI, 1e-6)));

// 二次零点
const r2 = findRoots((x) => x * x - 4, -5, 5);
ok('x²-4 零点=2', r2.length === 2);
ok('x²-4 根 ≈ ±2', r2.some((r) => near(r.x, 2, 1e-6)) && r2.some((r) => near(r.x, -2, 1e-6)));

// 极值：x³-3x 在 [-3,3] → max(-1,2), min(1,-2)
const ex = findExtrema((x) => x ** 3 - 3 * x, -3, 3);
ok('x³-3x 极值=2', ex.length === 2, JSON.stringify(ex.map((e) => [e.type, e.x.toFixed(4)])));
ok('x³-3x 极大值在 -1', ex.some((e) => e.type === 'max' && near(e.x, -1, 1e-4)));
ok('x³-3x 极小值在 1', ex.some((e) => e.type === 'min' && near(e.x, 1, 1e-4)));

// 拐点：x³ 在 0
const inf = findInflections((x) => x ** 3, -2, 2);
ok('x³ 拐点含 0', inf.some((p) => near(p.x, 0, 1e-3)), JSON.stringify(inf.map((p) => p.x.toFixed(4))));

// 交点：x² 与 x → 0, 1
const cx = findCrossings((x) => x * x, (x) => x, -2, 3);
ok('x² 与 x 交点=2', cx.length === 2, JSON.stringify(cx.map((p) => p.x.toFixed(4))));
ok('交点含 1', cx.some((p) => near(p.x, 1, 1e-6)));

// 积分
ok('∫sin 0..π = 2', near(integrate(Math.sin, 0, Math.PI, 2000), 2, 1e-8), integrate(Math.sin, 0, Math.PI, 2000));
ok('∫x² 0..3 = 9', near(integrate((x) => x * x, 0, 3, 2000), 9, 1e-8));
ok('∫ 反向取负', near(integrate((x) => x, 1, 0, 100), -0.5, 1e-9));

// 弧长：y=x 从 0 到 3 → 3√2
ok('y=x 弧长 0..3 = 3√2', near(arcLength((x) => x, 0, 3, 400), 3 * Math.SQRT2, 1e-4), arcLength((x) => x, 0, 3, 400));

// 曲率：直线曲率为 0；半径 1 的圆在顶点曲率半径 1
const c1 = curvature((x) => 2 * x + 1, 0);
ok('直线曲率=0', near(c1.kappa, 0, 1e-6));
const c2 = curvature((x) => Math.sqrt(Math.max(0, 1 - x * x)), 0);
ok('单位圆顶点曲率半径≈1', near(c2.radius, 1, 1e-3), c2.radius);

// 不连续：1/x 不该出现假零点
const r3 = findRoots((x) => 1 / x, -2, 2);
ok('1/x 无零点', r3.length === 0, JSON.stringify(r3));

// 拟合
const pts = parsePoints('1,1  2,4  3,9  4,16');
ok('parsePoints 4 点', pts.length === 4);
const fit = fitModels(pts, 'auto');
ok('拟合返回模型', !!fit.best);
ok('二次拟合 R²≈1', fit.best.r2 > 0.9999, 'r2=' + fit.best.r2);
ok('线性拟合存在但 R² 较低', fit.models.some((m) => m.key === 'linear' && m.r2 < 0.99));
const lin = fitModels(parsePoints('0,1 1,3 2,5 3,7'), 'linear');
ok('线性数据最佳=R² 1', lin.best.r2 > 0.999999, 'r2=' + lin.best.r2);
const pow = fitModels(parsePoints('1,2 2,8 3,18 4,32'), 'power');
ok('幂函数拟合 R²>0.999', pow.best.r2 > 0.999, 'r2=' + (pow.best ? pow.best.r2 : 'n/a'));
const expFit = fitModels(parsePoints('0,2 1,6 2,18 3,54'), 'exp');
ok('指数拟合 R²>0.999', expFit.best.r2 > 0.999, 'r2=' + (expFit.best ? expFit.best.r2 : 'n/a'));
ok('点太少报错', !!fitModels([{ x: 1, y: 1 }], 'auto').error);

// 摘要
const s = summarize(Math.sin, 0, Math.PI);
ok('摘要 yMax≈1', near(s.yMax, 1, 1e-3));
ok('摘要积分≈2', near(s.integral, 2, 1e-6));
ok('摘要零点=2', s.roots.length === 2, JSON.stringify(s.roots.map((r) => r.x.toFixed(3))));

// 单调 / 凹凸区间：x³-3x 在 [-3,3] 应为 4 段
const segs = findIntervals((x) => x ** 3 - 3 * x, -3, 3, 1200);
ok('x³-3x 单调区间=4', segs.length === 4, JSON.stringify(segs.map((g) => [g.x0.toFixed(2), g.x1.toFixed(2), g.dir, g.conc])));
ok('存在递减区间 [-1,0]', segs.some((g) => g.dir === 'down' && g.x0 <= -0.99 && g.x1 >= -0.01), JSON.stringify(segs.map((g) => [g.x0, g.x1, g.dir])));
ok('凹凸转折在 0', segs.some((g) => g.conc === 'concave-down' && g.x1 <= 0.01) && segs.some((g) => g.conc === 'concave-up' && g.x0 >= -0.01));
const hyper = findIntervals((x) => 1 / x, -2, 2, 800);
ok('1/x 被断点分成 2 段', hyper.length === 2, JSON.stringify(hyper.length));

console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
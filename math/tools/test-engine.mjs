/* test-engine.mjs — 纯逻辑单元测试（Node 运行，无需浏览器）
   用法: node tools/test-engine.mjs */
import { GeoBoard, TYPES, circleFrom3, intersectObjects, mid, len } from '../assets/js/geo/engine.js';
import { compile, evaluate, tryCompile, integrate, derivative, collectVars } from '../assets/js/plot/expr.js';
import { PlotEngine, niceStep, ticks } from '../assets/js/plot/engine.js';
import { parseCSV, statsOf, linearRegression } from '../assets/js/tools/dataplot.js';
import { harmony, shadeScale, contrast, hexToHsl, hslToHex } from '../assets/js/tools/colors.js';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + label); } };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const section = (name) => console.log('\n== ' + name + ' ==');

/* ---------------- 表达式引擎 ---------------- */
section('表达式引擎');
ok(near(evaluate('2x+1', { x: 3 }), 7), '隐式乘法 2x+1');
ok(near(evaluate('2(x+1)(x-1)', { x: 3 }), 16), '隐式乘法括号');
ok(near(evaluate('sin(pi/2)', {}), 1), 'sin(pi/2)');
ok(near(evaluate('2pi', {}), Math.PI * 2), '常数 2pi');
ok(near(evaluate('x^2^3', { x: 2 }), 256), '幂右结合');
ok(near(evaluate('-x^2', { x: 3 }), -9), '负号优先级');
ok(near(evaluate('x<=2?x:2', { x: 5 }), 2), '条件表达式');
ok(near(evaluate('3!', {}), 6), '后缀阶乘');
ok(near(evaluate('log(2,8)', {}), 3), 'log(base, x)');
ok(near(evaluate('mod(7,3)', {}), 1), 'mod');
ok(near(derivative(Math.sin, 0), 1, 1e-6), '数值导数 sin 在 0 处为 1');
ok(near(integrate((x) => x * x, 0, 3), 9, 1e-6), '数值积分 ∫x²=9');
ok(typeof tryCompile('sin(').error === 'string', '括号错误提示');
ok(typeof tryCompile('foo(x)').error === 'string', '未知函数提示');
ok([...collectVars(compile('a*sin(x)+b').ast)].sort().join() === 'a,b,x', '变量收集');

/* ---------------- 绘图引擎 ---------------- */
section('绘图引擎');
ok(near(niceStep(0.9), 1), 'niceStep 0.9→1');
ok(near(niceStep(23), 20) || near(niceStep(23), 25), 'niceStep 23');
const eng = new PlotEngine({ xMin: -5, xMax: 5, yMin: -3, yMax: 3 });
eng.setSize(500, 300, 1);
ok(near(eng.xToPx(0), 250), 'xToPx 原点居中');
ok(near(eng.pxToX(250), 0), 'pxToX 反变换');
ok(near(eng.yToPx(0), 150), 'yToPx 原点居中');
const res = compile('sin(x)');
const f1 = { id: 'f', kind: 'cartesian', color: '#fff', fn: (s) => res.fn(s), source: 'sin(x)' };
eng.setFunctions([f1]);
const segs = eng.buildPath(f1, (x, y) => ({ px: eng.xToPx(x), py: eng.yToPx(y) }));
ok(segs.length >= 1 && segs[0].length > 100, '曲线分段非空');
const roots = eng.findRoots(f1);
ok(roots.length >= 2 && near(roots[0].x, -Math.PI, 1e-3), '求零点 ≈ -π');
const f2 = { id: 'g', kind: 'cartesian', color: '#fff', fn: (s) => res.fn(s) * 0 + 0.5, source: '0.5' };
const inter = eng.findIntersections(f1, f2);
ok(inter.length >= 2, '求交点数量 ≥ 2');
const ext = eng.findExtrema(f1);
ok(ext.length >= 2, '极值点数量 ≥ 2');
ok(near(eng.integral(f1, 0, Math.PI), 2, 1e-4), '定积分 ∫sin = 2');
const svg = eng.toSVG({ background: 'white' });
ok(svg.startsWith('<?xml') && svg.includes('<svg') && svg.includes('</svg>') && svg.includes('<path'), 'SVG 导出结构');

/* ---------------- 几何内核 ---------------- */
section('几何内核');
const b = new GeoBoard({ origin: { x: 0, y: 0 }, scale: 40, width: 800, height: 600 });
const A = b.addFreePoint({ x: 0, y: 0 });
const B = b.addFreePoint({ x: 4, y: 0 });
const C = b.addFreePoint({ x: 1, y: 3 });
const M = b.addMidpoint(A.id, B.id);
ok(near(M.x, 2) && near(M.y, 0), '中点构造');
const sAB = b.addSegment(A.id, B.id);
const lAC = b.addLine(A.id, C.id);
const X = b.addIntersection(sAB.id, lAC.id, 0);
ok(X.valid !== false && near(X.x, 0, 1e-9) && near(X.y, 0, 1e-9), '线段与直线交点 = A');
const perp = b.addPerpendicular(sAB.id, C.id);
const info = intersectObjects(b, perp, b.addLine(B.id, C.id));
ok(info.length >= 1, '垂线与直线求交');
const circ = b.addCircle(A.id, B.id);
ok(near(circ.r, 4), '圆心+点半径');
const circ3 = b.addCircle3(A.id, B.id, C.id);
const c3 = circleFrom3(A, B, C);
ok(circ3.valid !== false && near(circ3.r, c3.r, 1e-9), '三点定圆');
const poly = b.addPolygon([A.id, B.id, C.id]);
const area = Math.abs(poly.parents.reduce((acc, id, i, arr) => {
  const p = b.get(id), q = b.get(arr[(i + 1) % arr.length]);
  return acc + (p.x * q.y - q.x * p.y);
}, 0) / 2);
ok(near(area, 6), '三角形面积 = 6');
const meas = b.addMeasure('length', [A.id, B.id]);
ok(near(b.measureValue(meas), 4), '测量长度');
/* 角的顶点是第二个点 */
const angA = b.addMeasure('angle', [B.id, A.id, C.id]);
ok(near(b.measureValue(angA) * 180 / Math.PI, Math.atan2(3, 1) * 180 / Math.PI, 1e-6), '测量角度 ∠BAC');
/* 三个内角：∠BAC≈71.565°、∠ABC=45°、∠ACB≈63.435°，三角之和应为 180° */
const angA2 = b.addMeasure('angle', [B.id, A.id, C.id]);
const angB = b.addMeasure('angle', [A.id, B.id, C.id]);
const angC = b.addMeasure('angle', [A.id, C.id, B.id]);
ok(near(b.measureValue(angB) * 180 / Math.PI, 45, 1e-6), '测量角度 ∠ABC = 45°');
const sumDeg = [angA2, angB, angC].reduce((s, m) => s + (b.measureValue(m) * 180) / Math.PI, 0);
ok(near(sumDeg, 180, 1e-6), '三角形内角和 = 180°');
/* 动态性：拖动 A，检查派生对象是否跟随 */
b.movePoint(B.id, { x: 6, y: 0 });
ok(near(M.x, 3), '拖动后中点跟随');
ok(near(circ.r, 6), '拖动后半径跟随');
ok(near(b.measureValue(meas), 6), '拖动后测量值跟随');
/* 序列化往返 */
const json = b.toJSON();
const b2 = new GeoBoard({ origin: { x: 0, y: 0 }, scale: 40 });
b2.loadJSON(JSON.parse(JSON.stringify(json)));
ok(b2.all().length === b.all().length, 'JSON 往返对象数量一致');
const cp = b2.points()[0];
const mv = b2.movePoint(cp.id, { x: cp.x + 1, y: cp.y + 1 });
ok(mv === undefined && b2.all().length === b.all().length, '载入后仍可拖动');
/* 删除级联 */
const beforeDel = b.all().length;
b.remove(A.id);
ok(b.all().length < beforeDel, '删除对象会级联删除后代');
/* 吸附 */
const snapBoard = new GeoBoard({ origin: { x: 0, y: 0 }, scale: 40 });
const P1 = snapBoard.addFreePoint({ x: 1, y: 1 });
const snap = snapBoard.snap({ x: 1.05, y: 1.05 }, { x: 42, y: -42 });
ok(snap.kind === 'point' && snap.point.id === P1.id, '吸附到已有点');
const L1 = snapBoard.addLine(P1.id, snapBoard.addFreePoint({ x: 5, y: 1 }).id);
const snap2 = snapBoard.snap({ x: 3, y: 1.05 }, { x: 120, y: -42 });
ok(snap2.kind === 'onLine' && snap2.object.id === L1.id, '吸附到直线上');

/* ---------------- 工具模块 ---------------- */
section('小工具');
const rows = parseCSV('x,y\n0,1\n1,2\n2,3');
ok(rows.length === 3 && rows[1].y === 2, 'CSV 解析 x,y');
const single = parseCSV('5\n6\n7');
ok(single.length === 3 && single[0].y === 5 && single[0].x === 0, 'CSV 单列解析');
const st = statsOf([1, 2, 3, 4]);
ok(near(st.mean, 2.5) && near(st.median, 2.5) && near(st.min, 1) && near(st.max, 4), '统计量');
const reg = linearRegression([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }]);
ok(near(reg.slope, 2) && near(reg.intercept, 1) && near(reg.r2, 1, 1e-9), '线性回归');
const pal = harmony('#6c8cff', 'triadic', 3);
ok(pal.length === 3 && pal.every((c) => /^#[0-9a-f]{6}$/i.test(c.hex)), '三角配色');
ok(shadeScale('#6c8cff', 11).length === 11, '明暗阶');
ok(contrast('#000000', '#ffffff') > 20, '对比度计算');
const hsl = hexToHsl('#ff0000');
ok(near(hsl.h, 0, 1e-6) && near(hsl.s, 1, 1e-6), 'HEX→HSL');
ok(hslToHex(120, 1, 0.5) === '#00ff00', 'HSL→HEX');

/* ---------------- 结果 ---------------- */
console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
void TYPES; void mid; void len; void ticks;

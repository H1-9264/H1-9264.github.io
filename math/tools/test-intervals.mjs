import { findIntervals } from '../assets/js/plot/analyze.js';
const segs = findIntervals((x) => x ** 3 - 3 * x, -3, 3, 1200);
console.log(JSON.stringify(segs, null, 1));
const cubic = findIntervals((x) => x ** 3, -2, 2, 800);
console.log('x^3:', JSON.stringify(cubic));
const hyper = findIntervals((x) => 1 / x, -2, 2, 800);
console.log('1/x 段数:', hyper.length, JSON.stringify(hyper.map((s) => [s.x0.toFixed(2), s.x1.toFixed(2), s.dir, s.conc])));

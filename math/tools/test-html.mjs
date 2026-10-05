/* test-html.mjs — 静态检查：重复 id、i18n 键完整性、JS 里引用的元素是否存在
   这些检查能提前抓住"按钮点了没反应"这类问题（例如 id 重名导致 querySelector 选错元素）。 */
import { readFileSync, readdirSync } from 'node:fs';
import { zh } from '../assets/js/core/lang-zh.js';
import { en } from '../assets/js/core/lang-en.js';
import { ja } from '../assets/js/core/lang-ja.js';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  \u2717 ' + name + (extra ? '  ' + extra : ''));
};

const htmlFiles = readdirSync('.').filter((f) => f.endsWith('.html')).sort();
const idMap = new Map();

/* ---------- 1. 重复 id ---------- */
console.log('\n[1] 重复 id 检查');
for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8');
  const ids = [...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Map();
  ids.forEach((id) => seen.set(id, (seen.get(id) || 0) + 1));
  const dups = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => id + '×' + n);
  ok(file + ' 无重复 id', dups.length === 0, dups.join(', '));
  idMap.set(file, new Set(ids));
}

/* ---------- 2. i18n 键完整性 ---------- */
console.log('\n[2] 多语言键检查');
const dicts = { zh, en, ja };
const zhKeys = new Set(Object.keys(zh));
ok('zh/en 键数量一致', Object.keys(en).length === zhKeys.size, 'zh=' + zhKeys.size + ' en=' + Object.keys(en).length);
ok('zh/ja 键数量一致', Object.keys(ja).length === zhKeys.size, 'zh=' + zhKeys.size + ' ja=' + Object.keys(ja).length);

const missing = { en: [], ja: [] };
for (const key of zhKeys) {
  if (!(key in en)) missing.en.push(key);
  if (!(key in ja)) missing.ja.push(key);
}
ok('英文没有缺失键', missing.en.length === 0, missing.en.slice(0, 8).join(', '));
ok('日文没有缺失键', missing.ja.length === 0, missing.ja.slice(0, 8).join(', '));

/* HTML 里用的 data-i18n* 键必须存在 */
const usedKeys = new Set();
for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/data-i18n(?:-placeholder|-title|-hint)?="([^"]+)"/g)) usedKeys.add(m[1]);
}
const unknown = [...usedKeys].filter((k) => !zhKeys.has(k));
ok('HTML 里引用的文案键都存在', unknown.length === 0, unknown.slice(0, 8).join(', '));

/* JS 里 t('xxx') 用到的键也必须存在（排除动态拼接的） */
const jsFiles = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) jsFiles.push(p);
  }
};
walk('assets/js');
const jsKeys = new Set();
for (const file of jsFiles) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) jsKeys.add(m[1]);
}
const unknownJs = [...jsKeys].filter((k) => !zhKeys.has(k) && !k.endsWith('.'));
ok('JS 里引用的文案键都存在', unknownJs.length === 0, unknownJs.slice(0, 10).join(', '));

/* ---------- 3. JS 引用的元素 id 是否真的存在 ---------- */
console.log('\n[3] 元素引用检查');
const pageMap = {
  'assets/js/pages/plotter.js': 'plotter.html',
  'assets/js/pages/plotter-panel.js': 'plotter.html',
  'assets/js/pages/plotter-keys.js': 'plotter.html',
  'assets/js/pages/plotter-tools.js': 'plotter.html',
  'assets/js/pages/geometry.js': 'geometry.html'
};
/* 这些 id 是页面脚本动态创建后再查询的，HTML 里本来就没有 */
const DYNAMIC_IDS = new Set([
  'btnUndo', 'btnRedo',      // 绘图器列表头的撤销/重做按钮
  'canvasLegend',            // 画布图例（首次需要时创建）
  'heroReadout',             // 首页读数条（index.html 里有，宽松起见保留）
  'btnFitPointsTop'          // 绘图器工具栏上的"按点拟合"入口（动态创建）
]);
for (const [js, html] of Object.entries(pageMap)) {
  const src = readFileSync(js, 'utf8');
  const ids = idMap.get(html) || new Set();
  const refs = new Set();
  for (const m of src.matchAll(/\$\('#([\w-]+)'\)/g)) refs.add(m[1]);
  for (const m of src.matchAll(/getElementById\('([\w-]+)'\)/g)) refs.add(m[1]);
  const ghosts = [...refs].filter((id) => !ids.has(id) && !DYNAMIC_IDS.has(id));
  ok(js.replace('assets/js/pages/', '') + ' → ' + html + ' 的 id 都存在', ghosts.length === 0, ghosts.join(', '));
}
/* 反向检查：分析面板里要绑定的关键按钮必须真的在 HTML 里（防止再出现"按钮没入口"） */
const plotterHtml = readFileSync('plotter.html', 'utf8');
['btnFitPoints', 'btnAnalyze', 'btnRoots', 'btnExtrema', 'btnInflect', 'btnMono', 'btnInter', 'anaFn', 'anaPairA', 'anaPairB']
  .forEach((id) => ok('plotter.html 有 #' + id, plotterHtml.includes('id="' + id + '"')));

/* ---------- 4. 每个 HTML 都有 favicon / manifest ---------- */
console.log('\n[4] 页面基础资源检查');
for (const file of htmlFiles) {
  const src = readFileSync(file, 'utf8');
  ok(file + ' 有图标', /rel="icon"/.test(src));
  ok(file + ' 有 manifest', /manifest\.webmanifest/.test(src));
}

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
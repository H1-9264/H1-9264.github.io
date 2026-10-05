/* exporter.js — 图像与数据导出：PNG(任意倍率) / SVG / CSV / JSON 工程 */
import { downloadBlob, downloadText } from '../core/dom.js';

/* 把引擎当前状态渲染成指定倍率的离屏画布 */
export function renderCanvas(engine, { scale = 2, background = 'theme' } = {}) {
  const W = Math.max(1, Math.round(engine.width * scale));
  const H = Math.max(1, Math.round(engine.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const saved = {
    width: engine.width, height: engine.height, dpr: engine.dpr,
    bg: engine.o.bg, glow: engine.o.glow
  };
  engine.width = W;
  engine.height = H;
  engine.dpr = 1;
  engine.o.bg = background === 'transparent' ? 'transparent'
    : background === 'white' ? '#ffffff'
    : background === 'dark' ? '#0b0d16'
    : saved.bg;
  engine.render(ctx);
  engine.width = saved.width;
  engine.height = saved.height;
  engine.dpr = saved.dpr;
  engine.o.bg = saved.bg;
  engine.o.glow = saved.glow;
  return canvas;
}

export function canvasToBlob(canvas, type = 'image/png', quality = 0.95) {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob((b) => resolve(b), type, quality);
    else {
      const data = canvas.toDataURL(type, quality);
      const bin = atob(data.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      resolve(new Blob([arr], { type }));
    }
  });
}

export async function exportPNG(engine, { scale = 2, background = 'theme', filename = 'plot.png', type = 'image/png' } = {}) {
  const canvas = renderCanvas(engine, { scale, background });
  const blob = await canvasToBlob(canvas, type);
  if (!blob) throw new Error('无法生成图片');
  downloadBlob(blob, filename);
  return { blob, canvas };
}

export function exportSVG(engine, { background = 'theme', filename = 'plot.svg', scale = 1 } = {}) {
  const svg = engine.toSVG({ scale, background });
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  if (filename) downloadBlob(blob, filename);
  return { svg, blob };
}

/* CSV：对每个函数在同一组 x 上采样 */
export function exportCSV(engine, { samples = 401, filename = 'plot.csv' } = {}) {
  const o = engine.o;
  const fns = engine.functions.filter((f) => f.visible !== false && f.kind !== 'points');
  const pts = engine.functions.filter((f) => f.kind === 'points' && f.points?.length);
  const header = ['x', ...fns.map((f) => f.label || f.source || f.id)];
  const lines = [header.join(',')];
  for (let i = 0; i < samples; i++) {
    const x = o.xMin + ((o.xMax - o.xMin) * i) / (samples - 1);
    const row = [fmtNum(x)];
    for (const f of fns) row.push(fmtNum(engine.evalFn(f, x)));
    lines.push(row.join(','));
  }
  for (const f of pts) {
    lines.push('');
    lines.push('# ' + (f.label || f.source || 'points'));
    lines.push('x,y');
    f.points.forEach((p) => lines.push(fmtNum(p.x) + ',' + fmtNum(p.y)));
  }
  const text = lines.join('\n');
  if (filename) downloadText(text, filename, 'text/csv;charset=utf-8');
  return text;
}

function fmtNum(v) {
  if (!Number.isFinite(v)) return '';
  return String(Number(v.toPrecision(10)));
}

/* JSON 工程：函数 + 视图 + 选项 */
export function projectData(engine, extra = {}) {
  return {
    app: 'Buzhidao Math',
    version: 1,
    savedAt: new Date().toISOString(),
    view: { xMin: engine.o.xMin, xMax: engine.o.xMax, yMin: engine.o.yMin, yMax: engine.o.yMax },
    options: {
      showGrid: engine.o.showGrid, showMinorGrid: engine.o.showMinorGrid, showAxes: engine.o.showAxes,
      showLabels: engine.o.showLabels, showLegend: engine.o.showLegend, samples: engine.o.samples,
      integral: engine.o.integral, tangent: engine.o.tangent
    },
    functions: engine.functions.map((f) => ({
      id: f.id, kind: f.kind, source: f.source, source2: f.source2, color: f.color,
      width: f.width, dash: f.dash, visible: f.visible !== false, label: f.label,
      domain: f.domain, points: f.points, param: f.param
    })),
    ...extra
  };
}

export function exportJSON(engine, { filename = 'plot.json', extra } = {}) {
  const data = projectData(engine, extra);
  const text = JSON.stringify(data, null, 2);
  if (filename) downloadText(text, filename, 'application/json');
  return data;
}

export function pickFile({ accept = '.json,application/json' } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        resolve({ name: file.name, text });
      } catch {
        resolve(null);
      }
    });
    document.body.appendChild(input);
    input.click();
  });
}

export async function readJSONFile(opts) {
  const file = await pickFile(opts);
  if (!file) return null;
  try {
    return { name: file.name, data: JSON.parse(file.text) };
  } catch {
    return { name: file.name, error: 'JSON 解析失败' };
  }
}

/* 文件名时间戳 */
export function stamp(prefix = 'buzhidao-math') {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return prefix + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

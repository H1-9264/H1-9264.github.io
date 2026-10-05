/* worksheet.js — 把图表与表达式清单合成一张"讲义图"，方便贴进作业/课件 */
import { downloadBlob } from '../core/dom.js';
import { renderCanvas } from './exporter.js';

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* 把颜色转成带透明度的 rgba 字符串 */
function rgba(color, alpha) {
  const c = String(color).replace('#', '');
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const n = parseInt(full.slice(0, 6), 16);
  return 'rgba(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + alpha + ')';
}

/**
 * 生成讲义 PNG
 * @param {object} engine 绘图引擎（提供 renderCanvas 所需的 width/height/functions/o）
 * @param {object} opts   { title, subtitle, footer, tokens, rows, scale }
 */
export function buildWorksheet(engine, opts = {}) {
  const scale = opts.scale || 2;
  const tokens = opts.tokens || {};
  const rows = opts.rows || [];
  const title = opts.title || '';
  const subtitle = opts.subtitle || '';
  const footer = opts.footer || '';  /* 默认不写应用名，避免出现在别人的作业里 */

  const pad = 28;
  const rowH = 26;
  const hasTitle = !!(title && String(title).trim());
  /* 没有标题时不留白 */
  const headH = hasTitle ? 76 + (subtitle ? 22 : 0) : (subtitle ? 44 : 16);
  const sideW = 300;
  const plot = renderCanvas(engine, { scale, background: opts.background || 'white' });

  const rowsH = rows.length * rowH * scale + pad * scale * 2;
  const W = Math.round(plot.width + sideW * scale + pad * scale * 2);
  const H = Math.round(Math.max(plot.height + headH * scale + pad * scale, rowsH));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const S = scale;

  const bg = opts.background === 'dark' ? '#0d1117' : opts.background === 'transparent' ? null : '#ffffff';
  const ink = opts.background === 'dark' ? (tokens['--text-0'] || '#e6edf3') : (tokens['--geo-ink'] && opts.background === 'transparent' ? tokens['--text-0'] : '#1f2328');
  const muted = opts.background === 'dark' ? '#8b949e' : '#57606a';

  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
  else { ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, W, H); }

  // 标题（可选：留空则不画）
  ctx.textBaseline = 'top';
  if (hasTitle) {
    ctx.fillStyle = ink;
    ctx.font = '700 ' + Math.round(22 * S) + 'px system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText(String(title), pad * S, pad * S);
  }
  if (subtitle) {
    ctx.fillStyle = muted;
    ctx.font = Math.round(13 * S) + 'px system-ui, sans-serif';
    ctx.fillText(subtitle, pad * S, (hasTitle ? pad + 30 : pad - 8) * S);
  }
  if (hasTitle) {
    ctx.strokeStyle = rgba(ink, 0.16);
    ctx.lineWidth = 1 * S;
    ctx.beginPath();
    ctx.moveTo(pad * S, (pad + (subtitle ? 52 : 34)) * S);
    ctx.lineTo(W - pad * S, (pad + (subtitle ? 52 : 34)) * S);
    ctx.stroke();
  }

  // 图表
  const plotX = pad * S;
  const plotY = headH * S;
  ctx.drawImage(plot, plotX, plotY, plot.width, plot.height);

  // 右侧清单
  const listX = plotX + plot.width + 24 * S;
  let y = headH * S;
  ctx.fillStyle = muted;
  ctx.font = '600 ' + Math.round(11 * S) + 'px system-ui, sans-serif';
  ctx.fillText((opts.listTitle || '表达式').toUpperCase(), listX, y);
  y += 22 * S;
  rows.forEach((row, i) => {
    if (y + rowH * S > H - pad * S) return;
    if (row.color) {
      ctx.fillStyle = row.color;
      roundRect(ctx, listX, y + 7 * S, 18 * S, 4 * S, 2 * S);
      ctx.fill();
    }
    ctx.fillStyle = ink;
    ctx.font = Math.round(13 * S) + 'px ui-monospace, Consolas, monospace';
    ctx.fillText(String(row.label ?? ''), listX + 26 * S, y);
    if (row.value !== undefined) {
      ctx.fillStyle = muted;
      ctx.font = Math.round(12 * S) + 'px ui-monospace, Consolas, monospace';
      ctx.fillText(String(row.value), listX + 26 * S, y + 16 * S);
      y += 16 * S;
    }
    y += rowH * S;
    void i;
  });

  // 页脚
  if (footer) {
    ctx.fillStyle = muted;
    ctx.font = Math.round(11 * S) + 'px system-ui, sans-serif';
    ctx.fillText(footer, pad * S, H - (pad + 2) * S);
  }
  return canvas;
}

export async function downloadWorksheet(engine, opts = {}) {
  const canvas = buildWorksheet(engine, opts);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (blob) downloadBlob(blob, (opts.filename || 'worksheet') + '.png');
  return blob;
}
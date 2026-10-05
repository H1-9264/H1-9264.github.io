/* plotter-tools.js — 绘图器：分析工具 + 导出（PNG/讲义/PDF） */
import { el, $, fmt, copyText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import { toast, modal } from '../core/ui.js';
import { exportPNG, exportCSV, exportSVG, exportJSON, stamp } from '../plot/exporter.js';
import { downloadWorksheet } from '../plot/worksheet.js';
import { PdfDoc } from '../plot/pdf.js';

export function createTools(ctx) {
  const { engine, state, getCompiled, activeFnId, requestRender, pushUndo, fsWrap } = ctx;
  const root = {};

  const clearMarks = () => { engine.o.marks = []; };
  const round = (v) => Number(v.toPrecision(6));

  root.findRoots = () => {
    const f = getCompiled().find((c) => c.id === activeFnId() && c.kind === 'cartesian');
    if (!f) { toast(t('geo.needObject'), { type: 'warn' }); return; }
    const roots = engine.findRoots(f);
    clearMarks();
    roots.forEach((r) => engine.o.marks.push({ x: r.x, y: 0, color: '#34d399', label: 'x=' + fmt(r.x, 3) }));
    $('#analysisOut').innerHTML = roots.length ? roots.slice(0, 12).map((r) => '<div>x = ' + fmt(r.x, 5) + '</div>').join('') : t('plot.noRoots');
    toast(roots.length ? t('plot.rootsFound', { n: roots.length }) : t('plot.noRoots'), { type: roots.length ? 'ok' : 'warn' });
    requestRender();
  };

  root.findIntersections = () => {
    const fns = getCompiled().filter((c) => c.kind === 'cartesian' && c.visible !== false);
    if (fns.length < 2) { toast(t('plot.intercepts') + ' ≥ 2', { type: 'warn' }); return; }
    clearMarks();
    const out = [];
    for (let i = 0; i < fns.length; i++) {
      for (let j = i + 1; j < fns.length; j++) engine.findIntersections(fns[i], fns[j]).forEach((p) => out.push(p));
    }
    out.forEach((p) => engine.o.marks.push({ x: p.x, y: p.y, color: '#fbbf24', label: '(' + fmt(p.x, 3) + ', ' + fmt(p.y, 3) + ')' }));
    $('#analysisOut').innerHTML = out.length ? out.slice(0, 12).map((p) => '<div>(' + fmt(p.x, 5) + ', ' + fmt(p.y, 5) + ')</div>').join('') : t('plot.noIntersections');
    toast(out.length ? t('plot.intersectionsFound', { n: out.length }) : t('plot.noIntersections'), { type: out.length ? 'ok' : 'warn' });
    requestRender();
  };

  root.findExtrema = () => {
    const f = getCompiled().find((c) => c.id === activeFnId() && c.kind === 'cartesian');
    if (!f) { toast(t('geo.needObject'), { type: 'warn' }); return; }
    const pts = engine.findExtrema(f);
    clearMarks();
    pts.forEach((p) => engine.o.marks.push({ x: p.x, y: p.y, color: p.type === 'max' ? '#fb7185' : '#60a5fa', label: (p.type === 'max' ? 'max ' : 'min ') + fmt(p.x, 3) }));
    $('#analysisOut').innerHTML = pts.length ? pts.slice(0, 12).map((p) => '<div>' + p.type + ' (' + fmt(p.x, 4) + ', ' + fmt(p.y, 4) + ')</div>').join('') : t('plot.noRoots');
    toast(pts.length ? t('plot.extremaFound', { n: pts.length }) : t('plot.noRoots'), { type: pts.length ? 'ok' : 'warn' });
    requestRender();
  };

  root.updateIntegral = () => {
    const a = Number($('#intA').value);
    const b = Number($('#intB').value);
    const list = getCompiled();
    const f = list.find((c) => c.id === activeFnId() && c.kind === 'cartesian') || list.find((c) => c.kind === 'cartesian');
    engine.o.integral = { enabled: !!$('#optIntegral').checked, a, b, fnId: f ? f.id : null };
    if (engine.o.integral.enabled && f && Number.isFinite(a) && Number.isFinite(b)) {
      const area = engine.integral(f, a, b);
      $('#analysisOut').innerHTML = '<div>∫<sub>' + fmt(a, 3) + '</sub><sup>' + fmt(b, 3) + '</sup> f(x) dx = <b style="color:var(--accent-2)">' + fmt(area, 6) + '</b></div>';
    }
    requestRender();
  };

  root.showTable = () => {
    const f = getCompiled().find((c) => c.id === activeFnId() && c.kind === 'cartesian');
    if (!f) { toast(t('geo.needObject'), { type: 'warn' }); return; }
    const rows = [];
    for (let i = 0; i < 21; i++) {
      const x = engine.o.xMin + ((engine.o.xMax - engine.o.xMin) * i) / 20;
      const y = engine.evalFn(f, x);
      rows.push('<tr><td class="num">' + fmt(x, 4) + '</td><td class="num">' + (Number.isFinite(y) ? fmt(y, 6) : '—') + '</td></tr>');
    }
    modal({
      title: (f.label || f.source) + ' — ' + t('plot.table'),
      body: '<table class="table"><thead><tr><th class="num">x</th><th class="num">f(x)</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>',
      footer: [
        el('button', { class: 'btn btn-sm', type: 'button', text: t('plot.exportCsv'), onclick: () => exportCSV(engine, { filename: stamp('table') + '.csv' }) }),
        el('button', { class: 'btn btn-sm btn-primary', type: 'button', text: t('common.close'), onclick: (e) => e.target.closest('.modal-backdrop').remove() })
      ]
    });
  };

  /* ---- 导出设置 ---- */
  const safeName = (s) => String(s).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);

  root.exportSettings = () => {
    const titleEl = $('#expTitle');
    const raw = titleEl ? titleEl.value.trim() : '';
    const scaleRaw = $('#expScale').value;
    const presets = {
      'preset-square': { w: 1080, h: 1080 },
      'preset-wide': { w: 1920, h: 1080 },
      'preset-slide': { w: 1600, h: 900 }
    };
    return {
      title: raw,
      scale: presets[scaleRaw] ? 2 : Number(scaleRaw) || 2,
      preset: presets[scaleRaw] || null,
      background: $('#expBg').value
    };
  };

  const viewForAspect = (tw, th) => {
    const o = engine.o;
    const cx = (o.xMin + o.xMax) / 2;
    const cy = (o.yMin + o.yMax) / 2;
    const halfX = (o.xMax - o.xMin) / 2;
    const halfY = (o.yMax - o.yMin) / 2;
    const ratio = tw / th;
    const needHalfX = Math.max(halfX, halfY * ratio);
    const needHalfY = needHalfX / ratio;
    return { xMin: cx - needHalfX, xMax: cx + needHalfX, yMin: cy - needHalfY, yMax: cy + needHalfY };
  };

  root.exportRows = () => state.functions.filter((f) => f.visible !== false).map((f) => ({
    color: ctx.toHex(f.color),
    label: f.kind === 'polar' ? 'r = ' + (f.source || '')
      : f.kind === 'parametric' ? 'x=' + (f.source || '') + '  y=' + (f.source2 || '')
        : (f.source || ''),
    value: (f.xDomain || f.yDomain) ? 'x ∈ [' + fmt(f.xDomain && f.xDomain[0] !== null ? f.xDomain[0] : engine.o.xMin, 4) + ', ' +
      fmt(f.xDomain && f.xDomain[1] !== null ? f.xDomain[1] : engine.o.xMax, 4) + ']' : undefined
  }));

  const filename = (cfg, ext) => (cfg.title ? safeName(cfg.title) : stamp('plot')) + '.' + ext;

  /* ---- PNG ---- */
  root.exportPng = async () => {
    const cfg = root.exportSettings();
    const saved = { ...state.view };
    try {
      let scale = cfg.scale;
      if (cfg.preset) {
        Object.assign(engine.o, viewForAspect(cfg.preset.w, cfg.preset.h));
        scale = cfg.preset.w / 960;
      }
      await exportPNG(engine, { scale, background: cfg.background, filename: filename(cfg, 'png') });
      toast(t('plot.saved'), { type: 'ok' });
    } catch (err) {
      toast(String(err && err.message ? err.message : err), { type: 'err' });
    } finally {
      Object.assign(state.view, saved);
      requestRender();
    }
  };

  /* ---- 讲义图 ---- */
  root.exportSheet = async () => {
    const cfg = root.exportSettings();
    try {
      await downloadWorksheet(engine, {
        title: cfg.title,
        subtitle: t('sheet.subtitle', { x0: round(engine.o.xMin), x1: round(engine.o.xMax), y0: round(engine.o.yMin), y1: round(engine.o.yMax) }),
        listTitle: t('sheet.list'),
        footer: new Date().toLocaleDateString(),
        tokens: theme.tokens(),
        rows: root.exportRows(),
        scale: 2,
        background: cfg.background === 'transparent' ? 'white' : (cfg.background === 'dark' ? 'dark' : 'white'),
        filename: cfg.title ? safeName(cfg.title) : stamp('worksheet')
      });
      toast(t('plot.saved'), { type: 'ok' });
    } catch (err) {
      toast(String(err && err.message ? err.message : err), { type: 'err' });
    }
  };

  /* ---- PDF（第 1 页讲义图，后面是数据表） ---- */
  root.exportPdf = () => {
    const cfg = root.exportSettings();
    const o = { ...engine.o };
    try {
      const doc = new PdfDoc({ size: 'a4', landscape: false, margin: 36 });
      const fns = getCompiled().filter((f) => f.visible !== false && f.kind !== 'points');

      const page1 = doc.addPage();
      let y = doc.margin;
      if (cfg.title) { doc.drawText(page1, cfg.title, doc.margin, y, { size: 16, bold: true }); y += 24; }
      doc.drawText(page1, t('sheet.subtitle', { x0: round(o.xMin), x1: round(o.xMax), y0: round(o.yMin), y1: round(o.yMax) }), doc.margin, y, { size: 9, color: [0.42, 0.45, 0.5] });
      y += 18;

      const plotH = Math.min(doc.contentHeight * 0.5, 320);
      const shot = document.createElement('canvas');
      const savedView = { ...state.view };
      Object.assign(engine.o, viewForAspect(doc.contentWidth, plotH));
      const scale = 2;
      shot.width = Math.round(doc.contentWidth * scale);
      shot.height = Math.round(plotH * scale);
      const sctx = shot.getContext('2d');
      const oldW = engine.width;
      const oldH = engine.height;
      const oldBg = engine.o.bg;
      engine.width = shot.width;
      engine.height = shot.height;
      engine.o.bg = '#ffffff';
      engine.render(sctx);
      engine.width = oldW;
      engine.height = oldH;
      engine.o.bg = oldBg;
      Object.assign(engine.o, { xMin: o.xMin, xMax: o.xMax, yMin: o.yMin, yMax: o.yMax });
      Object.assign(state.view, savedView);
      doc.fitImage(page1, shot, { x: doc.margin, y, w: doc.contentWidth, h: plotH }, { quality: 0.92 });
      y += plotH + 18;
      doc.drawLine(page1, doc.margin, y - 10, doc.page.w - doc.margin, y - 10);
      doc.drawText(page1, t('sheet.list'), doc.margin, y, { size: 11, bold: true });
      y += 16;
      root.exportRows().forEach((row) => {
        doc.drawText(page1, '- ' + row.label, doc.margin + 4, y, { size: 10 });
        y += 14;
      });

      if (fns.length) {
        const perPage = 34;
        const total = perPage * 2;
        let page = doc.addPage();
        let py = doc.margin;
        const header = () => {
          doc.drawText(page, t('plot.table'), doc.margin, py, { size: 12, bold: true });
          py += 18;
          doc.drawText(page, 'x', doc.margin, py, { size: 9, color: [0.42, 0.45, 0.5] });
          fns.forEach((f, i) => doc.drawText(page, (f.label || f.source || ('f' + (i + 1))).slice(0, 16), doc.margin + 80 + i * 110, py, { size: 9, color: [0.42, 0.45, 0.5] }));
          py += 6;
          doc.drawLine(page, doc.margin, py, doc.page.w - doc.margin, py);
          py += 12;
        };
        header();
        for (let i = 0; i < total; i++) {
          if (py > doc.page.h - doc.margin - 18) { page = doc.addPage(); py = doc.margin; header(); }
          const x = o.xMin + ((o.xMax - o.xMin) * i) / (total - 1);
          doc.drawText(page, fmt(x, 4), doc.margin, py, { size: 9 });
          fns.forEach((f, k) => {
            const v = engine.evalFn(f, x);
            doc.drawText(page, Number.isFinite(v) ? fmt(v, 5) : '-', doc.margin + 80 + k * 110, py, { size: 9 });
          });
          py += 12;
        }
      }

      const blob = doc.build();
      const name = (cfg.title ? safeName(cfg.title) : stamp('worksheet')) + '.pdf';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(t('plot.exported', { name: 'PDF' }), { type: 'ok' });
    } catch (err) {
      toast(String(err && err.message ? err.message : err), { type: 'err' });
    } finally {
      Object.assign(engine.o, { xMin: o.xMin, xMax: o.xMax, yMin: o.yMin, yMax: o.yMax });
      requestRender();
    }
  };

  /* ---- 其他导出 ---- */
  root.copySvg = async () => {
    await copyText(engine.toSVG({ background: $('#expBg').value }));
    toast(t('plot.copiedSvg'), { type: 'ok' });
  };
  root.svg = () => {
    exportSVG(engine, { background: $('#expBg').value, filename: stamp('plot') + '.svg', scale: 1 });
    toast(t('plot.exported', { name: 'SVG' }), { type: 'ok' });
  };
  root.csv = () => {
    exportCSV(engine, { filename: stamp('data') + '.csv' });
    toast(t('plot.exported', { name: 'CSV' }), { type: 'ok' });
  };
  root.json = () => {
    exportJSON(engine, { filename: stamp('project') + '.json' });
    toast(t('plot.exported', { name: 'JSON' }), { type: 'ok' });
  };

  void icon;
  void pushUndo;
  void fsWrap;
  return root;
}

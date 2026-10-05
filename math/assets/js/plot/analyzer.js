/* analyzer.js — 分析工具面板逻辑
   支持：任选一条函数分析、区间可调、零点/极值/拐点/单调凹凸/全面分析、
   两函数交点、定积分与黎曼和、按点拟合函数、结果复制与 CSV 导出。 */
import { el, $, fmt, copyText, downloadText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { toast, modal } from '../core/ui.js';
import * as analyze from '../plot/analyze.js';
import { fitModels, parsePoints } from '../plot/fit.js';

export function createAnalyzer(ctx) {
  const { engine, state, getCompiled, requestRender, pushUndo } = ctx;
  const root = {};
  let marks = [];

  /* ------------------------------ 选择与区间 ------------------------------ */
  const fnLabel = (f) => {
    const src = f.kind === 'polar' ? 'r=' + (f.source || '') : (f.source || f.label || f.id);
    return (f.color ? '' : '') + src + (f.kind === 'cartesian' ? '' : ' (' + t('plot.mode.' + f.kind) + ')');
  };

  root.refreshSelectors = () => {
    const list = getCompiled().filter((f) => f.kind !== 'points');
    const fill = (sel, withNone) => {
      const node = $(sel);
      if (!node) return;
      const keep = node.value;
      node.innerHTML = '';
      if (withNone) node.appendChild(el('option', { value: '', text: t('common.none') }));
      list.forEach((f, i) => node.appendChild(el('option', { value: f.id, text: (i + 1) + '. ' + fnLabel(f) })));
      if (list.some((f) => f.id === keep)) node.value = keep;
      else if (list.length) node.value = list[0].id;
    };
    fill('#anaFn', false);
    fill('#anaPairA', false);
    fill('#anaPairB', false);
    const a = $('#anaPairA');
    const b = $('#anaPairB');
    if (a && b && a.value === b.value && list.length > 1) b.value = list[1].id;

    /* 区间默认跟随当前视图 */
    const ra = $('#anaA');
    const rb = $('#anaB');
    if (ra && rb && !ra.dataset.touched) {
      ra.value = String(Number(engine.o.xMin.toPrecision(6)));
      rb.value = String(Number(engine.o.xMax.toPrecision(6)));
    }
  };

  const selectedFn = () => {
    const id = $('#anaFn') ? $('#anaFn').value : null;
    const list = getCompiled().filter((f) => f.kind !== 'points');
    const f = list.find((x) => x.id === id) || list[0];
    if (!f) { toast(t('ana.needFn'), { type: 'warn' }); return null; }
    return f;
  };

  const evalOf = (f) => (x) => {
    try {
      if (f.kind === 'polar') {
        const r = f.fn({ t: x, theta: x, x: x });
        return Number.isFinite(r) ? r : NaN;
      }
      const y = f.fn({ x: x });
      return Number.isFinite(y) ? y : NaN;
    } catch { return NaN; }
  };

  const range = () => {
    let a = Number($('#anaA') ? $('#anaA').value : engine.o.xMin);
    let b = Number($('#anaB') ? $('#anaB').value : engine.o.xMax);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) { a = engine.o.xMin; b = engine.o.xMax; }
    if (a > b) { const tmp = a; a = b; b = tmp; }
    return { a, b };
  };

  /* ------------------------------ 输出区 ------------------------------ */
  const out = () => $('#analysisOut');

  const clearOut = () => {
    const host = out();
    if (host) host.innerHTML = '';
    marks = [];
    engine.o.marks = [];
    requestRender();
  };

  const addMarks = (list) => {
    marks = marks.concat(list);
    engine.o.marks = marks.slice(0, 40);
    requestRender();
  };

  const section = (title, hint) => {
    const host = out();
    const box = el('div', { class: 'ana-section' });
    box.appendChild(el('div', { class: 'ana-title', text: title + (hint ? ' · ' + hint : '') }));
    host.appendChild(box);
    return box;
  };

  const emptyNote = (text) => {
    const host = out();
    host.appendChild(el('div', { class: 'ana-empty', text: text }));
  };

  const statGrid = (items) => {
    const grid = el('div', { class: 'ana-grid' });
    items.forEach(([k, v, strong]) => {
      grid.appendChild(el('div', { class: 'ana-cell' + (strong ? ' strong' : '') }, [
        el('div', { class: 'k', text: k }),
        el('div', { class: 'v mono', text: v })
      ]));
    });
    return grid;
  };

  const table = (cols, rows) => {
    const wrap = el('div', { class: 'ana-table-wrap' });
    const tab = el('table', { class: 'ana-table' });
    const thead = el('thead');
    const tr = el('tr');
    cols.forEach((c) => tr.appendChild(el('th', { class: c.num ? 'num' : '', text: c.label })));
    thead.appendChild(tr);
    tab.appendChild(thead);
    const tbody = el('tbody');
    rows.forEach((r) => {
      const row = el('tr');
      r.forEach((v, i) => row.appendChild(el('td', { class: cols[i] && cols[i].num ? 'num mono' : '', text: v })));
      tbody.appendChild(row);
    });
    tab.appendChild(tbody);
    wrap.appendChild(tab);
    return wrap;
  };

  root.getText = () => {
    const host = out();
    return host ? host.innerText.trim() : '';
  };

  root.copy = async () => {
    const text = root.getText();
    if (!text) { toast(t('ana.nothing'), { type: 'warn' }); return; }
    await copyText(text);
    toast(t('common.copied'), { type: 'ok' });
  };

  root.exportCsv = () => {
    const text = root.getText();
    if (!text) { toast(t('ana.nothing'), { type: 'warn' }); return; }
    downloadText('analysis.csv', '\ufeff' + text.replace(/[ \t]+/g, ',').replace(/\n{2,}/g, '\n'), 'text/csv;charset=utf-8');
    toast(t('plot.exported', { name: 'CSV' }), { type: 'ok' });
  };
  /* ------------------------------ 各类分析 ------------------------------ */
  root.roots = (silent) => {
    const f = selectedFn();
    if (!f) return null;
    const { a, b } = range();
    const ev = evalOf(f);
    const roots = analyze.findRoots(ev, a, b);
    if (!silent) {
      const box = section(t('plot.roots'), fnLabel(f) + '   x ∈ [' + fmt(a, 4) + ', ' + fmt(b, 4) + ']');
      if (!roots.length) emptyNote(t('plot.noRoots'));
      else {
        box.appendChild(table(
          [{ label: 'x', num: true }, { label: 'y', num: true }, { label: t('ana.note'), num: false }],
          roots.slice(0, 30).map((r) => [fmt(r.x, 8), fmt(r.y, 8), Math.abs(r.y) < 1e-9 ? t('ana.exact') : ''])
        ));
        box.appendChild(el('div', { class: 'ana-hint', text: t('ana.rootsCount', { n: roots.length }) }));
      }
    }
    addMarks(roots.slice(0, 30).map((r) => ({ x: r.x, y: 0, color: '#34d399', label: 'x=' + fmt(r.x, 3) })));
    return roots;
  };

  root.extrema = (silent) => {
    const f = selectedFn();
    if (!f) return null;
    const { a, b } = range();
    const ev = evalOf(f);
    const pts = analyze.findExtrema(ev, a, b);
    if (!silent) {
      const box = section(t('plot.extrema'), fnLabel(f));
      if (!pts.length) emptyNote(t('ana.noExtrema'));
      else {
        box.appendChild(table(
          [{ label: t('ana.type') }, { label: 'x', num: true }, { label: 'y', num: true }, { label: 'f\'(x)', num: true }],
          pts.slice(0, 30).map((p) => [
            p.type === 'max' ? t('ana.max') : t('ana.min'),
            fmt(p.x, 8),
            fmt(p.y, 8),
            fmt(analyze.curvature(ev, p.x) ? analyze.curvature(ev, p.x).d1 : NaN, 6)
          ])
        ));
      }
    }
    addMarks(pts.slice(0, 30).map((p) => ({ x: p.x, y: p.y, color: p.type === 'max' ? '#fb7185' : '#60a5fa', label: (p.type === 'max' ? 'max ' : 'min ') + fmt(p.x, 3) })));
    return pts;
  };

  root.inflections = (silent) => {
    const f = selectedFn();
    if (!f) return null;
    const { a, b } = range();
    const ev = evalOf(f);
    const pts = analyze.findInflections(ev, a, b);
    if (!silent) {
      const box = section(t('ana.inflection'), fnLabel(f));
      if (!pts.length) emptyNote(t('ana.noInflection'));
      else {
        box.appendChild(table(
          [{ label: 'x', num: true }, { label: 'y', num: true }, { label: t('ana.concavity') }],
          pts.slice(0, 30).map((p) => [fmt(p.x, 8), fmt(p.y, 8), concavityAt(ev, p.x)])
        ));
      }
    }
    addMarks(pts.slice(0, 30).map((p) => ({ x: p.x, y: p.y, color: '#a78bfa', label: 'ipt ' + fmt(p.x, 3) })));
    return pts;
  };

  const concavityAt = (ev, x) => {
    const e = 1e-4;
    const y0 = ev(x - e), y1 = ev(x), y2 = ev(x + e);
    if (!Number.isFinite(y0) || !Number.isFinite(y1) || !Number.isFinite(y2)) return '—';
    const d2 = y2 - 2 * y1 + y0;
    return d2 > 0 ? t('ana.concaveUp') : (d2 < 0 ? t('ana.concaveDown') : '—');
  };

  root.monotonic = () => {
    const f = selectedFn();
    if (!f) return;
    const { a, b } = range();
    const segs = analyze.findIntervals(evalOf(f), a, b, 1200);
    const box = section(t('ana.monotonic'), fnLabel(f));
    if (!segs.length) { emptyNote(t('ana.noInterval')); return; }
    const dirText = { up: t('ana.increasing'), down: t('ana.decreasing'), flat: t('ana.flat') };
    const concText = { 'concave-up': t('ana.concaveUp'), 'concave-down': t('ana.concaveDown'), flat: '—' };
    box.appendChild(table(
      [{ label: t('ana.interval') }, { label: t('ana.trend') }, { label: t('ana.concavity') }],
      segs.slice(0, 40).map((s) => ['[' + fmt(s.x0, 5) + ', ' + fmt(s.x1, 5) + ']', dirText[s.dir] || s.dir, concText[s.conc] || '—'])
    ));
  };

  root.crossings = (silent) => {
    const list = getCompiled().filter((f) => f.kind !== 'points');
    const idA = $('#anaPairA') ? $('#anaPairA').value : null;
    const idB = $('#anaPairB') ? $('#anaPairB').value : null;
    const fa = list.find((f) => f.id === idA) || list[0];
    const fb = list.find((f) => f.id === idB) || list[1];
    if (!fa || !fb) { toast(t('ana.needTwo'), { type: 'warn' }); return null; }
    if (fa === fb) { toast(t('ana.sameFn'), { type: 'warn' }); return null; }
    const { a, b } = range();
    const evA = evalOf(fa);
    const evB = evalOf(fb);
    const pts = analyze.findCrossings(evA, evB, a, b);
    if (!silent) {
      const box = section(t('plot.intercepts'), fnLabel(fa) + '  ∩  ' + fnLabel(fb));
      if (!pts.length) emptyNote(t('plot.noIntersections'));
      else {
        box.appendChild(table(
          [{ label: 'x', num: true }, { label: 'y', num: true }, { label: fnLabel(fa) + ' − ' + fnLabel(fb), num: true }],
          pts.slice(0, 30).map((p) => [fmt(p.x, 8), fmt(p.y, 8), fmt(evA(p.x) - evB(p.x), 10)])
        ));
        box.appendChild(el('div', { class: 'ana-hint', text: t('ana.crossCount', { n: pts.length }) }));
      }
    }
    addMarks(pts.slice(0, 30).map((p) => ({ x: p.x, y: p.y, color: '#fbbf24', label: '(' + fmt(p.x, 3) + ', ' + fmt(p.y, 3) + ')' })));
    return pts;
  };
  /* 全面分析：一次给出概览 + 零点 + 极值 + 拐点 + 积分 + 弧长 */
  root.full = () => {
    const f = selectedFn();
    if (!f) return;
    const { a, b } = range();
    const ev = evalOf(f);
    clearOut();
    const s = analyze.summarize(ev, a, b, { samples: 2400 });

    const box = section(t('ana.overview'), fnLabel(f) + '   x ∈ [' + fmt(a, 4) + ', ' + fmt(b, 4) + ']');
    box.appendChild(statGrid([
      [t('ana.yMin'), s.yMin === null ? '—' : fmt(s.yMin, 6)],
      [t('ana.yMax'), s.yMax === null ? '—' : fmt(s.yMax, 6)],
      [t('ana.yAvg'), s.yAvg === null ? '—' : fmt(s.yAvg, 6)],
      [t('ana.yAt0'), s.zero === null ? '—' : fmt(s.zero, 6)]
    ]));
    box.appendChild(statGrid([
      [t('ana.rootsCountLabel'), String(s.roots.length)],
      [t('ana.extremaCount'), String(s.extrema.length)],
      [t('ana.inflectCount'), String(s.inflections.length)],
      [t('ana.continuity'), (s.continuum * 100).toFixed(1) + '%']
    ]));
    box.appendChild(statGrid([
      [t('ana.integral'), Number.isFinite(s.integral) ? fmt(s.integral, 8) : '—', true],
      [t('ana.avgValue'), Number.isFinite(s.avgValue) ? fmt(s.avgValue, 8) : '—', true],
      [t('ana.arcLength'), Number.isFinite(s.length) ? fmt(s.length, 8) : '—', true]
    ]));

    /* 表格区 */
    if (s.roots.length) {
      const rb = section(t('plot.roots'));
      rb.appendChild(table([{ label: 'x', num: true }, { label: 'y', num: true }],
        s.roots.slice(0, 30).map((r) => [fmt(r.x, 8), fmt(r.y, 8)])));
    }
    if (s.extrema.length) {
      const eb = section(t('plot.extrema'));
      eb.appendChild(table([{ label: t('ana.type') }, { label: 'x', num: true }, { label: 'y', num: true }],
        s.extrema.slice(0, 30).map((p) => [p.type === 'max' ? t('ana.max') : t('ana.min'), fmt(p.x, 8), fmt(p.y, 8)])));
    }
    if (s.inflections.length) {
      const ib = section(t('ana.inflection'));
      ib.appendChild(table([{ label: 'x', num: true }, { label: 'y', num: true }, { label: t('ana.concavity') }],
        s.inflections.slice(0, 30).map((p) => [fmt(p.x, 8), fmt(p.y, 8), concavityAt(ev, p.x)])));
    }
    if (!s.roots.length && !s.extrema.length && !s.inflections.length) emptyNote(t('ana.noFeature'));

    addMarks([
      ...s.roots.slice(0, 20).map((r) => ({ x: r.x, y: 0, color: '#34d399', label: 'x=' + fmt(r.x, 3) })),
      ...s.extrema.slice(0, 20).map((p) => ({ x: p.x, y: p.y, color: p.type === 'max' ? '#fb7185' : '#60a5fa', label: (p.type === 'max' ? 'max ' : 'min ') + fmt(p.x, 3) }))
    ]);
    toast(t('ana.done'), { type: 'ok' });
  };

  /* 定积分 + 黎曼和对比 */
  root.updateIntegral = () => {
    const a = Number($('#intA').value);
    const b = Number($('#intB').value);
    const f = selectedFn() || getCompiled().find((c) => c.kind === 'cartesian');
    const enabled = !!($('#optIntegral') && $('#optIntegral').checked);
    engine.o.integral = { enabled, a, b, fnId: f ? f.id : null };
    if (!f) { requestRender(); return; }
    if (enabled && Number.isFinite(a) && Number.isFinite(b)) {
      const ev = evalOf(f);
      const exact = analyze.integrate(ev, a, b, 2000);
      const n = Math.max(2, Math.min(5000, Number($('#anaN') ? $('#anaN').value : 50) || 50));
      const mode = $('#anaMode') ? $('#anaMode').value : 'mid';
      const riem = analyze.riemann(ev, a, b, n, mode);
      const modeText = mode === 'left' ? t('ana.left') : (mode === 'right' ? t('ana.right') : t('ana.mid'));
      const box = el('div', { class: 'ana-section' });
      box.appendChild(el('div', { class: 'ana-title', text: t('plot.integral') + ' · ' + fnLabel(f) }));
      box.appendChild(statGrid([
        ['∫<sub>' + fmt(a, 4) + '</sub><sup>' + fmt(b, 4) + '</sup> f(x) dx', Number.isFinite(exact) ? fmt(exact, 10) : '—', true],
        [t('ana.riemann') + ' (' + modeText + ', n=' + n + ')', Number.isFinite(riem) ? fmt(riem, 10) : '—'],
        [t('ana.error'), Number.isFinite(exact) && Number.isFinite(riem) ? fmt(Math.abs(exact - riem), 8) : '—'],
        [t('ana.avgValue'), Number.isFinite(exact) ? fmt(exact / (b - a), 8) : '—']
      ]));
      const host = out();
      host.innerHTML = '';
      host.appendChild(box);
    }
    requestRender();
  };
  /* ------------------------------ 按点拟合函数 ------------------------------ */
  const MODELS = ['auto', 'linear', 'quad', 'cubic', 'poly4', 'poly5', 'poly6', 'power', 'exp', 'log'];

  root.fitDialog = () => {
    const ta = el('textarea', {
      class: 'input mono', rows: '6', spellcheck: 'false',
      placeholder: '1,1\n2,4\n3,9\n4,16',
      style: { width: '100%', resize: 'vertical' }
    });
    ta.value = state.fitPoints || '';
    const sel = el('select', { class: 'select input-sm' },
      MODELS.map((m) => el('option', { value: m, selected: m === (state.fitModel || 'auto'), text: t('ana.model.' + m) })));
    const result = el('div', { class: 'ana-out', style: { maxHeight: '320px', overflow: 'auto' } });
    const applyBtn = el('button', { class: 'btn btn-sm btn-primary', type: 'button', text: t('ana.fitRun') });
    const useBtn = el('button', { class: 'btn btn-sm', type: 'button', text: t('ana.fitUse'), disabled: true });
    let best = null;

    const run = () => {
      const pts = parsePoints(ta.value);
      result.innerHTML = '';
      if (pts.length < 2) {
        result.appendChild(el('div', { class: 'ana-empty', text: t('ana.needPoints') }));
        useBtn.disabled = true;
        best = null;
        return;
      }
      const res = fitModels(pts, sel.value);
      if (!res.models || !res.models.length) {
        result.appendChild(el('div', { class: 'ana-empty', text: t('ana.fitFailed') }));
        useBtn.disabled = true;
        best = null;
        return;
      }
      state.fitPoints = ta.value;
      state.fitModel = sel.value;
      best = res.best;
      useBtn.disabled = false;

      const info = el('div', { class: 'ana-section' });
      info.appendChild(el('div', { class: 'ana-title', text: t('ana.pointsParsed', { n: pts.length }) }));
      const grid = el('div', { class: 'ana-grid' });
      res.models.slice(0, 6).forEach((m, i) => {
        grid.appendChild(el('div', { class: 'ana-cell' + (i === 0 ? ' strong' : '') }, [
          el('div', { class: 'k', text: t('ana.model.' + m.key) + (i === 0 ? ' ★' : '') }),
          el('div', { class: 'v mono', text: 'y = ' + m.expr }),
          el('div', { class: 'sub mono', text: 'R² = ' + m.r2.toFixed(6) + '   RMSE = ' + fmt(m.rmse, 6) })
        ]));
      });
      info.appendChild(grid);
      result.appendChild(info);

      const tab = el('div', { class: 'ana-table-wrap' });
      const t2 = el('table', { class: 'ana-table' });
      t2.innerHTML = '<thead><tr><th class="num">x</th><th class="num">y</th><th class="num">' +
        t('ana.fitted') + '</th><th class="num">' + t('ana.residual') + '</th></tr></thead>';
      const tb = el('tbody');
      pts.forEach((p) => {
        const yh = best.fn(p.x);
        tb.appendChild(el('tr', {}, [
          el('td', { class: 'num mono', text: fmt(p.x, 6) }),
          el('td', { class: 'num mono', text: fmt(p.y, 6) }),
          el('td', { class: 'num mono', text: fmt(yh, 6) }),
          el('td', { class: 'num mono', text: fmt(p.y - yh, 6) })
        ]));
      });
      t2.appendChild(tb);
      tab.appendChild(t2);
      result.appendChild(tab);
    };

    applyBtn.addEventListener('click', run);
    sel.addEventListener('change', run);
    ta.addEventListener('input', () => { clearTimeout(run._t); run._t = setTimeout(run, 400); });

    useBtn.addEventListener('click', () => {
      if (!best) return;
      pushUndo(true);
      const f = getCompiled().find((x) => x.kind === 'cartesian');
      const expr = best.expr.replace(/·/g, '*').replace(/−/g, '-').replace(/\^/g, '^');
      const target = state.functions.find((x) => x.kind === 'cartesian');
      if (target) target.source = expr;
      else {
        state.functions.push({
          id: ctx.nextId(), kind: 'cartesian', source: expr,
          color: ctx.curveColor(state.functions.length), width: 2.2, visible: true, domain: [null, null]
        });
      }
      void f;
      ctx.renderFnList();
      ctx.recompile();
      ctx.persist();
      m.close();
      toast(t('ana.fitApplied', { model: t('ana.model.' + best.key) }), { type: 'ok' });
    });

    const m = modal({
      title: t('ana.fitTitle'),
      wide: true,
      body: el('div', { class: 'col' }, [
        el('p', { class: 'text-xs text-dim', text: t('ana.fitHint') }),
        el('label', { class: 'field' }, [el('span', { class: 'label', text: t('ana.modelPick') }), sel]),
        ta,
        el('div', { class: 'row-inline' }, [applyBtn, useBtn]),
        result
      ])
    });
    run();
  };

  /* ------------------------------ 数据表 ------------------------------ */
  root.showTable = (n) => {
    const f = selectedFn();
    if (!f) return;
    const { a, b } = range();
    const ev = evalOf(f);
    const count = n || 21;
    const rows = [];
    for (let i = 0; i < count; i++) {
      const x = a + ((b - a) * i) / (count - 1);
      const y = ev(x);
      const d = analyze.curvature(ev, x);
      rows.push([fmt(x, 6), Number.isFinite(y) ? fmt(y, 8) : '—',
        d && Number.isFinite(d.d1) ? fmt(d.d1, 6) : '—',
        d && Number.isFinite(d.d2) ? fmt(d.d2, 6) : '—']);
    }
    const box = section(t('plot.table'), fnLabel(f) + ' · ' + count + ' ' + t('ana.rows'));
    box.appendChild(table(
      [{ label: 'x', num: true }, { label: 'f(x)', num: true }, { label: "f'(x)", num: true }, { label: "f''(x)", num: true }],
      rows
    ));
  };
  /* ------------------------------ 绑定 ------------------------------ */
  root.bind = () => {
    root.refreshSelectors();
    const on = (sel, fn) => { const n = $(sel); if (n) n.addEventListener('click', fn); };
    on('#btnRoots', () => root.roots());
    on('#btnExtrema', () => root.extrema());
    on('#btnInflect', () => root.inflections());
    on('#btnMono', () => root.monotonic());
    on('#btnInter', () => root.crossings());
    on('#btnAnalyze', () => root.full());
    on('#btnTable', () => root.showTable(21));
    on('#btnFitPoints', () => root.fitDialog());
    on('#btnAnaCopy', () => root.copy());
    on('#btnAnaCsv', () => root.exportCsv());
    on('#btnAnaClear', () => clearOut());
    on('#btnAnaRange', () => {
      const ra = $('#anaA');
      const rb = $('#anaB');
      if (ra) { ra.removeAttribute('data-touched'); ra.value = String(Number(engine.o.xMin.toPrecision(6))); }
      if (rb) { rb.removeAttribute('data-touched'); rb.value = String(Number(engine.o.xMax.toPrecision(6))); }
      toast(t('ana.rangeSynced'), { type: 'ok', timeout: 1400 });
    });
    ['#anaA', '#anaB'].forEach((sel) => {
      const n = $(sel);
      if (n) n.addEventListener('input', () => { n.dataset.touched = '1'; });
    });
    ['#anaN', '#anaMode'].forEach((sel) => {
      const n = $(sel);
      if (n) n.addEventListener('change', () => { if ($('#optIntegral') && $('#optIntegral').checked) root.updateIntegral(); });
    });
    const gi = $('#optIntegral');
    if (gi) gi.addEventListener('change', () => root.updateIntegral());
    ['#intA', '#intB'].forEach((sel) => {
      const n = $(sel);
      if (n) n.addEventListener('change', () => root.updateIntegral());
    });
    /* 函数列表变化时刷新下拉框 */
    ['#anaFn', '#anaPairA', '#anaPairB'].forEach((sel) => {
      const n = $(sel);
      if (n) n.addEventListener('change', () => {
        if (sel !== '#anaFn') return;
        const id = n.value;
        const ra = $('#anaA');
        void id; void ra;
      });
    });
  };

  root.clearMarks = clearOut;
  void icon;

  return root;
}
/* plotter-panel.js — 绘图器右侧/左侧面板与工具栏按钮的绑定
   （单独成文件：主文件太长会被写入截断，拆开后每个文件都安全） */
import { el, $ } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as store from '../core/storage.js';
import { modal, toast } from '../core/ui.js';
import { readJSONFile } from '../plot/exporter.js';

export function bindPanels(ctx) {
  const { state, engine, canvas, pushUndo, renderFnList, recompile, persist, applyOptions,
    requestRender, renderLegend, updateTrace, loadProject, sharePayload, copyShareLink,
    encodeShare, tools, presetMenu, syntaxModal, syncViewInputs, setTraceX } = ctx;

  const o = state.options;
  const setChecked = (sel, val) => { const n = $(sel); if (n) n.checked = !!val; };
  setChecked('#optGrid', o.showGrid);
  setChecked('#optMinor', o.showMinorGrid);
  setChecked('#optAxes', o.showAxes);
  setChecked('#optLabels', o.showLabels);
  setChecked('#optLegend', o.showLegend);
  setChecked('#optAspect', o.equalAspect);
  setChecked('#optTrace', o.traceEnabled);
  setChecked('#optTangent', o.tangent);
  setChecked('#optIntegral', !!(engine.o.integral && engine.o.integral.enabled));
  if ($('#optSamples')) $('#optSamples').value = String(o.samples);
  if ($('#expScale')) $('#expScale').value = String(o.exportScale);
  if ($('#expBg')) $('#expBg').value = o.exportBg;
  if ($('#expTitle')) $('#expTitle').value = store.load('exportTitle', '') || '';

  const bindSwitch = (sel, key, after, undoable) => {
    const node = $(sel);
    if (!node) return;
    node.addEventListener('change', (e) => {
      if (undoable) pushUndo(true);
      state.options[key] = e.target.checked;
      if (after) after(e.target.checked);
      applyOptions();
      requestRender();
      persist();
    });
  };
  bindSwitch('#optGrid', 'showGrid', null, true);
  bindSwitch('#optMinor', 'showMinorGrid', null, true);
  bindSwitch('#optAxes', 'showAxes', null, true);
  bindSwitch('#optLabels', 'showLabels', null, true);
  bindSwitch('#optLegend', 'showLegend', () => renderLegend());
  bindSwitch('#optAspect', 'equalAspect', (v) => { if (v) engine.fitAspect(); }, true);
  bindSwitch('#optTrace', 'traceEnabled', (v) => {
    canvas.style.cursor = v ? 'crosshair' : 'grab';
    const hint = $('#hudHint');
    if (hint) hint.style.display = v ? '' : 'none';
    if (!v && setTraceX) setTraceX(null);
    updateTrace();
  });
  bindSwitch('#optTangent', 'tangent', () => updateTrace());

  const samples = $('#optSamples');
  if (samples) samples.addEventListener('change', (e) => {
    state.options.samples = Math.max(200, Math.min(8000, Number(e.target.value) || 1600));
    e.target.value = String(state.options.samples);
    recompile();
    persist();
  });

  ['#xMin', '#xMax', '#yMin', '#yMax'].forEach((sel) => {
    const n = $(sel);
    if (n) n.addEventListener('change', () => ctx.readViewInputs());
  });

  const bind = (sel, fn) => { const n = $(sel); if (n) n.addEventListener('click', fn); };
  bind('#btnFit', () => ctx.fitView());
  bind('#btnResetView', () => ctx.resetView());
  bind('#zoomIn', () => { engine.zoomAt(engine.width / 2, engine.height / 2, 0.75); syncViewInputs(); requestRender(); persist(); });
  bind('#zoomOut', () => { engine.zoomAt(engine.width / 2, engine.height / 2, 1.33); syncViewInputs(); requestRender(); persist(); });
  bind('#zoomReset', () => ctx.resetView());
  bind('#btnRoots', () => tools.findRoots());
  bind('#btnInter', () => tools.findIntersections());
  bind('#btnExtrema', () => tools.findExtrema());
  bind('#btnTable', () => tools.showTable());
  bind('#expPng', () => tools.exportPng());
  bind('#expSvg', () => tools.svg());
  bind('#expCsv', () => tools.csv());
  bind('#expJson', () => tools.json());
  bind('#expSheet', () => tools.exportSheet());
  bind('#expPdf', () => tools.exportPdf());
  bind('#copySvg', () => tools.copySvg());

  const addBtn = $('#btnAddFn');
  if (addBtn) addBtn.addEventListener('click', () => {
    pushUndo(true);
    state.functions.push({
      id: ctx.nextId(), kind: 'cartesian', source: '',
      color: ctx.curveColor(state.functions.length), width: 2.2, visible: true, domain: [null, null]
    });
    renderFnList();
    recompile();
    persist();
    const inputs = document.querySelectorAll('#fnList .fn-expr');
    const last = inputs[inputs.length - 1];
    if (last) { last.focus(); if (last.select) last.select(); }
  });

  const clearBtn = $('#btnClearFn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    modal({
      title: t('plot.clearAll'),
      body: '<p>' + t('plot.confirmClear') + '</p>',
      footer: [
        el('button', { class: 'btn btn-sm', type: 'button', text: t('common.cancel'), onclick: (e) => e.target.closest('.modal-backdrop').remove() }),
        el('button', {
          class: 'btn btn-sm btn-danger', type: 'button', text: t('common.confirm'),
          onclick: (e) => {
            e.target.closest('.modal-backdrop').remove();
            pushUndo(true);
            state.functions = [];
            engine.o.marks = [];
            renderFnList();
            recompile();
            persist();
          }
        })
      ]
    });
  });

  const intg = $('#optIntegral');
  if (intg) intg.addEventListener('change', () => tools.updateIntegral());
  ['#intA', '#intB'].forEach((sel) => {
    const n = $(sel);
    if (n) n.addEventListener('change', () => tools.updateIntegral());
  });

  const titleInput = $('#expTitle');
  if (titleInput) titleInput.addEventListener('input', () => store.save('exportTitle', titleInput.value));

  const impJson = $('#impJson');
  if (impJson) impJson.addEventListener('click', async () => {
    const res = await readJSONFile();
    if (!res) return;
    if (res.error) { toast(t('settings.importFailed'), { type: 'err' }); return; }
    pushUndo(true);
    loadProject(res.data);
  });

  /* 分享链接：内容变化时同步更新 */
  const shareBtn = $('#shareLink');
  if (shareBtn) {
    const sync = () => {
      try {
        const url = location.origin + location.pathname + '#s=' + encodeShare(sharePayload());
        shareBtn.dataset.share = url;
        shareBtn.setAttribute('title', url);
      } catch (err) { void err; }
    };
    sync();
    shareBtn.addEventListener('click', async () => { await copyShareLink(sharePayload()); sync(); });
    document.addEventListener('change', sync, true);
    setInterval(sync, 5000);
  }

  /* 左右侧栏宽度记忆 */
  const rz = $('#resizerLeft');
  const side = $('#sideLeft');
  if (rz && side) {
    let active = false;
    rz.addEventListener('pointerdown', (e) => {
      active = true;
      rz.classList.add('dragging');
      try { rz.setPointerCapture(e.pointerId); } catch (err) { void err; }
    });
    rz.addEventListener('pointermove', (e) => {
      if (!active) return;
      const w = Math.max(240, Math.min(560, e.clientX));
      side.style.width = w + 'px';
      store.save('plotterSideW', w);
      ctx.resizeCanvas();
    });
    rz.addEventListener('pointerup', () => { active = false; rz.classList.remove('dragging'); });
    const savedW = store.load('plotterSideW', null);
    if (savedW) side.style.width = Math.max(240, Math.min(560, Number(savedW))) + 'px';
  }

  void icon;
  void presetMenu;
  void syntaxModal;
  void syncViewInputs;
}

/* plotter-keys.js — 绘图器快捷键与命令面板注册（单独成文件，避免主文件过长被写入截断） */
import { $ } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { registerCommand } from '../core/ui.js';

export function bindPlotterKeys(ctx) {
  const { undo, redo, resetView, fitView, syntaxModal, exportPdf } = ctx;

  registerCommand({ label: t('plot.resetView'), hint: 'R', ico: 'reset', run: resetView });
  registerCommand({ label: t('plot.fitView'), hint: 'F', ico: 'target', run: fitView });
  registerCommand({ label: t('help.syntax'), hint: '', ico: 'code', run: syntaxModal });
  registerCommand({ label: t('plot.exportPng'), hint: 'Ctrl S', ico: 'download', run: () => $('#expPng').click() });
  registerCommand({ label: t('geo.undo'), hint: 'Ctrl Z', ico: 'undo', run: undo });
  registerCommand({ label: t('geo.redo'), hint: 'Ctrl Shift Z', ico: 'redo', run: redo });
  registerCommand({ label: t('sheet.export'), hint: '', ico: 'printer', run: () => $('#expSheet').click() });
  registerCommand({ label: t('pdf.export'), hint: '', ico: 'file', run: exportPdf });

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement ? document.activeElement.tagName : '');
    const key = e.key ? e.key.toLowerCase() : '';
    const mod = e.ctrlKey || e.metaKey;
    if (mod && key === 'z') {
      if (typing) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (mod && key === 'y') { if (typing) return; e.preventDefault(); redo(); return; }
    if (mod && key === 's') { e.preventDefault(); $('#expPng').click(); return; }
    if (typing || mod || e.altKey) return;
    if (key === 'g') { const n = $('#optGrid'); n.checked = !n.checked; n.dispatchEvent(new Event('change')); }
    else if (key === 'r') resetView();
    else if (key === 'f') fitView();
    else if (key === 't') { const n = $('#optTrace'); n.checked = !n.checked; n.dispatchEvent(new Event('change')); }
    else if (key === 'a') $('#btnAddFn').click();
  });
}

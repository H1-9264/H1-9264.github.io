/* about.js — 关于页：加载并渲染 Markdown，可编辑/复制/下载 */
import { $, copyText, downloadText } from '../core/dom.js';
import { t, getLang, applyTranslations } from '../core/i18n.js';
import { initChrome, initReveal, toast } from '../core/ui.js';
import { mountMarkdown } from '../core/markdown.js';

let source = '';

async function loadMarkdown() {
  const tryPaths = ['assets/content/about.md', 'assets/content/about.en.md'];
  for (const path of tryPaths) {
    try {
      const res = await fetch(path, { cache: 'no-cache' });
      if (res.ok) return await res.text();
    } catch { /* 继续尝试下一个 */ }
  }
  return '# 关于\n\n> 未能加载 assets/content/about.md\n\n请确认文件存在，并通过本地服务器访问本页。';
}

function paint(text) {
  mountMarkdown($('#aboutBody'), text);
}

function boot() {
  initChrome('about');
  initReveal();

  loadMarkdown().then((text) => {
    source = text;
    paint(source);
  });

  $('#btnCopyMd')?.addEventListener('click', async () => {
    await copyText(source);
    toast(t('common.copied'), { type: 'ok' });
  });

  $('#btnDownloadMd')?.addEventListener('click', () => {
    downloadText(source, 'about.md', 'text/markdown;charset=utf-8');
    toast(t('plot.exported', { name: 'about.md' }), { type: 'ok' });
  });

  const editor = $('#aboutEditor');
  const input = $('#mdInput');
  $('#btnEditMd')?.addEventListener('click', () => {
    editor.hidden = false;
    input.value = source;
    input.focus();
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#btnCancelMd')?.addEventListener('click', () => { editor.hidden = true; });
  $('#btnApplyMd')?.addEventListener('click', () => {
    source = input.value;
    paint(source);
    editor.hidden = true;
    toast(t('common.apply'), { type: 'ok' });
  });

  window.addEventListener('bzm:langchange', () => {
    applyTranslations(document);
    paint(source);
  });
  void getLang;
}

boot();

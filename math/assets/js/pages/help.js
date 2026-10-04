/* help.js — 帮助页：标签切换、函数与示例芯片、快捷键表 */
import { $, $$, el, copyText } from '../core/dom.js';
import { t, getLang, applyTranslations } from '../core/i18n.js';
import { initChrome, initReveal, SHORTCUTS } from '../core/ui.js';
import { toast } from '../core/ui.js';
import { FUNCTIONS, SAMPLES } from '../plot/expr.js';

function bindCopy(root) {
  root.addEventListener('click', async (e) => {
    const code = e.target.closest('code[data-copy]');
    if (!code) return;
    await copyText(code.dataset.copy);
    toast(t('common.copied') + ': ' + code.dataset.copy, { type: 'ok', timeout: 1400 });
  });
}

function fillChips() {
  const fnHost = $('#fnChips');
  if (fnHost) {
    fnHost.innerHTML = '';
    Object.keys(FUNCTIONS).sort().forEach((name) => {
      fnHost.appendChild(el('code', { dataset: { copy: name }, text: name }));
    });
  }
  const exHost = $('#exampleChips');
  if (exHost) {
    exHost.innerHTML = '';
    const list = SAMPLES[getLang() === 'zh' ? 'zh' : 'en'] || SAMPLES.en;
    list.forEach((s) => exHost.appendChild(el('code', { dataset: { copy: s }, text: s })));
    ['1-cos(t)', '3cos(4t)', '3sin(3t)', 'e^(-x^2/2)/sqrt(2pi)', 'abs(x)-2', 'floor(x)', 'sin(x)/x'].forEach((s) =>
      exHost.appendChild(el('code', { dataset: { copy: s }, text: s })));
  }
  const keyHost = $('#shortcutHost');
  if (keyHost) {
    keyHost.innerHTML = '';
    SHORTCUTS.forEach((s) => {
      keyHost.appendChild(el('div', { class: 'shortcut-row' }, [
        el('span', { text: s.label[getLang()] || s.label.en }),
        el('kbd', { text: s.keys })
      ]));
    });
  }
}

function boot() {
  initChrome('help');
  const tabs = $$('#helpTabs .tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.toggle('active', x === tab));
      $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab.dataset.tab));
      location.hash = tab.dataset.tab;
    });
  });
  const hash = location.hash.replace('#', '');
  const initial = tabs.find((x) => x.dataset.tab === hash);
  if (initial) initial.click();
  fillChips();
  bindCopy(document);
  initReveal();
  window.addEventListener('bzm:langchange', () => { applyTranslations(document); fillChips(); });
}

boot();

/* calc.js — 科学计算器工具 */
import { evaluate, tryCompile, FUNCTION_NAMES } from '../plot/expr.js';
import { el, $, copyText, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { toast } from '../core/ui.js';
import * as store from '../core/storage.js';

const KEYS = [
  ['7', '8', '9', '(', ')'],
  ['4', '5', '6', '^', 'sqrt('],
  ['1', '2', '3', '*', '/'],
  ['0', '.', 'pi', '+', '-'],
  ['sin(', 'cos(', 'tan(', 'ln(', 'log('],
  ['e', '^2', 'abs(', 'mod(', '!']
];

export function initCalc(host) {
  const history = store.load('calcHistory', []) || [];
  const input = el('input', { class: 'input mono', style: { fontSize: 'var(--fs-lg)', textAlign: 'right' }, placeholder: '2*sin(pi/4)+ln(e)', value: '' });
  const out = el('div', { class: 'out mono' });
  const display = el('div', { class: 'calc-display' }, [input, out]);
  const keys = el('div', { class: 'calc-keys' });
  const histList = el('div', { class: 'history-list' });

  const compute = () => {
    const src = input.value.trim();
    if (!src) { out.textContent = ''; return; }
    const res = tryCompile(src);
    if (res.error) { out.textContent = '—'; out.style.color = 'var(--danger)'; return; }
    const v = res.fn({});
    out.style.color = '';
    out.textContent = Number.isFinite(v) ? String(Number(v.toPrecision(12))) : '—';
  };
  input.addEventListener('input', debounce(compute, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const src = input.value.trim();
      if (!src) return;
      const res = tryCompile(src);
      if (res.error) { toast(res.error, { type: 'err' }); return; }
      const v = res.fn({});
      if (!Number.isFinite(v)) { toast('—', { type: 'warn' }); return; }
      history.unshift({ src, value: Number(v.toPrecision(12)) });
      if (history.length > 60) history.pop();
      store.save('calcHistory', history);
      renderHistory();
      out.textContent = String(history[0].value);
    }
  });

  KEYS.flat().forEach((k) => {
    keys.appendChild(el('button', {
      type: 'button',
      class: /[+\-*/^!]|sqrt|sin|cos|tan|ln|log|mod|abs/.test(k) ? 'op' : '',
      text: k,
      onclick: () => { input.value += k; compute(); input.focus(); }
    }));
  });
  keys.appendChild(el('button', { type: 'button', class: 'op', text: 'C', onclick: () => { input.value = ''; compute(); } }));
  keys.appendChild(el('button', { type: 'button', class: 'op', text: '⌫', onclick: () => { input.value = input.value.slice(0, -1); compute(); } }));
  keys.appendChild(el('button', { type: 'button', text: '=', onclick: () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })) }));
  keys.appendChild(el('button', { type: 'button', class: 'eq', text: '↵', onclick: () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })) }));
  keys.appendChild(el('button', {
    type: 'button', html: icon('copy', { size: 15 }), title: t('common.copy'),
    onclick: async () => { await copyText(out.textContent || ''); toast(t('common.copied'), { type: 'ok', timeout: 1400 }); }
  }));

  function renderHistory() {
    histList.innerHTML = '';
    if (!history.length) { histList.innerHTML = '<span class="text-dim">' + t('tools.calc.history') + '</span>'; return; }
    history.forEach((h) => {
      histList.appendChild(el('button', {
        type: 'button',
        html: h.src + ' <b style="color:var(--accent-2)">= ' + h.value + '</b>',
        onclick: () => { input.value = h.src; compute(); input.focus(); }
      }));
    });
  }
  renderHistory();

  host.appendChild(el('div', { class: 'tool-layout' }, [
    el('div', { class: 'col' }, [
      display,
      keys,
      el('p', { class: 'text-xs text-dim', text: 'sin cos tan ln log sqrt abs exp mod, pi e, 隐式乘法 2x，阶乘 5!' })
    ]),
    el('div', { class: 'card card-pad col' }, [
      el('div', { class: 'row-between' }, [
        el('strong', { text: t('tools.calc.history') }),
        el('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: t('tools.calc.clearHistory'), onclick: () => { history.length = 0; store.save('calcHistory', []); renderHistory(); } })
      ]),
      histList
    ])
  ]));
  void FUNCTION_NAMES; void evaluate; void $;
  input.focus();
}

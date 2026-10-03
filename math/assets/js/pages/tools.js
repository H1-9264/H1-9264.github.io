/* tools.js — 工具箱页面：卡片导航 + hash 路由 + 各工具挂载 */
import { el, $, $$, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, getLang } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import { initChrome, initReveal, registerCommand, toast } from '../core/ui.js';
import { initDerivative } from '../tools/derivative.js';
import { initDataPlot } from '../tools/dataplot.js';
import { initUnits } from '../tools/units.js';
import { initCalc } from '../tools/calc.js';
import { initPalette } from '../tools/palette.js';
import { initPomodoro } from '../tools/pomodoro.js';

const TOOLS = [
  { id: 'deriv', ico: 'curve', title: 'tools.deriv', desc: 'tools.deriv.desc', init: initDerivative },
  { id: 'data', ico: 'chart', title: 'tools.data', desc: 'tools.data.desc', init: initDataPlot },
  { id: 'convert', ico: 'swap', title: 'tools.convert', desc: 'tools.convert.desc', init: initUnits },
  { id: 'calc', ico: 'calculator', title: 'tools.calc', desc: 'tools.calc.desc', init: initCalc },
  { id: 'palette', ico: 'palette', title: 'tools.palette', desc: 'tools.palette.desc', init: initPalette },
  { id: 'timer', ico: 'timer', title: 'tools.timer', desc: 'tools.timer.desc', init: initPomodoro }
];

const mounted = new Set();

function renderGrid() {
  const grid = $('#toolGrid');
  grid.innerHTML = '';
  TOOLS.forEach((tool) => {
    const card = el('button', {
      class: 'tool-card', type: 'button', dataset: { tool: tool.id },
      onclick: () => { location.hash = tool.id; }
    }, [
      el('span', { class: 'tc-head' }, [
        el('span', { class: 'tc-ico', html: icon(tool.ico, { size: 18 }) }),
        el('h3', { text: t(tool.title) })
      ]),
      el('p', { text: t(tool.desc) }),
      el('span', { class: 'row', style: { gap: '8px' } }, [
        el('span', { class: 'badge badge-accent', text: t('tools.open') + ' →' })
      ])
    ]);
    grid.appendChild(card);
  });
}

function mount(id) {
  const tool = TOOLS.find((x) => x.id === id);
  if (!tool || mounted.has(id)) return;
  const pane = document.querySelector('[data-pane="' + id + '"]');
  if (!pane) return;
  pane.innerHTML = '';
  try {
    tool.init(pane, getLang());
    mounted.add(id);
  } catch (err) {
    pane.innerHTML = '<div class="empty">' + String(err && err.message ? err.message : err) + '</div>';
    console.error(err);
  }
}

function route() {
  const hash = (location.hash || '').replace('#', '');
  const tool = TOOLS.find((x) => x.id === hash);
  const panes = $$('.tool-pane');
  const grid = $('#toolGrid');
  const back = $('#btnBackTools');
  if (!tool) {
    panes.forEach((p) => p.classList.remove('active'));
    grid.hidden = false;
    back.hidden = true;
    $$('.tool-card').forEach((c) => c.classList.remove('active'));
    document.title = t('tools.title') + ' · Buzhidao Math';
    return;
  }
  mount(tool.id);
  panes.forEach((p) => p.classList.toggle('active', p.dataset.pane === tool.id));
  grid.hidden = true;
  back.hidden = false;
  $$('.tool-card').forEach((c) => c.classList.toggle('active', c.dataset.tool === tool.id));
  document.title = t(tool.title) + ' · Buzhidao Math';
  window.dispatchEvent(new Event('resize'));
}

function boot() {
  initChrome('tools');
  renderGrid();
  $('#btnBackTools').addEventListener('click', () => { location.hash = ''; });
  window.addEventListener('hashchange', route);
  route();
  initReveal();
  TOOLS.forEach((tool) => {
    registerCommand({
      label: t(tool.title), hint: 'tools.html#' + tool.id, ico: tool.ico,
      run: () => { location.hash = tool.id; }
    });
  });
  window.addEventListener('bzm:langchange', () => { renderGrid(); route(); });
  const onResize = debounce(() => window.dispatchEvent(new Event('resize')), 200);
  window.addEventListener('bzm:modechange', onResize);
  theme.subscribe(() => {});
  void toast;
}

boot();

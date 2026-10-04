/* ui.js — 通用 UI：Toast、Modal、抽屉、表单绑定、全站顶部导航、命令面板、设置面板 */
import { el, $, $$, on, copyText, downloadText, escapeHtml, clamp, debounce } from './dom.js';
import { icon } from './icons.js';
import { t, getLang, setLang, LANGS, applyTranslations, initI18n } from './i18n.js';
import * as theme from './theme.js';
import * as store from './storage.js';

/* ============================== Toast ============================== */
let toastHost = null;
export function toast(message, { type = 'info', timeout = 2600, action } = {}) {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  const node = el('div', { class: 'toast ' + type }, [
    el('i', { class: 'dot' }),
    el('span', { class: 'msg', text: message })
  ]);
  const close = () => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 220);
  };
  if (action) {
    node.appendChild(el('button', { type: 'button', text: action.label, onclick: () => { action.onClick?.(); close(); } }));
  }
  node.appendChild(el('button', { type: 'button', html: icon('close', { size: 14 }), 'aria-label': t('common.close'), onclick: close }));
  toastHost.appendChild(node);
  if (timeout) setTimeout(close, timeout);
  return close;
}

/* ============================== Modal ============================== */
export function modal({ title, body, footer, wide = false, onClose } = {}) {
  const bodyNode = el('div', { class: 'modal-body' });
  if (typeof body === 'string') bodyNode.innerHTML = body;
  else if (body) bodyNode.appendChild(body);

  const footNode = el('div', { class: 'modal-foot' });
  const close = () => {
    backdrop.classList.add('out');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { backdrop.remove(); onClose?.(); }, 160);
  };
  if (footer) {
    if (Array.isArray(footer)) footer.forEach((b) => footNode.appendChild(b));
    else footNode.innerHTML = footer;
  } else {
    footNode.appendChild(el('button', { class: 'btn btn-primary', type: 'button', text: t('common.close'), onclick: () => close() }));
  }

  const head = el('div', { class: 'modal-head' }, [
    el('h3', { class: 'grow', text: title || '' }),
    el('button', { class: 'btn-icon', type: 'button', html: icon('close'), 'aria-label': t('common.close'), onclick: () => close() })
  ]);
  const dialog = el('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' }, [head, bodyNode, footNode]);
  const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, [dialog]);
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  const focusable = dialog.querySelector('input, select, textarea, button');
  focusable?.focus?.();
  return { close, dialog, body: bodyNode, footer: footNode };
}

/* ============================== 侧边抽屉 ============================== */
export function drawer({ title, body, side = 'right', width = 420, footer } = {}) {
  const panel = el('aside', {
    class: 'drawer-panel',
    style: { width: 'min(' + width + 'px, 94vw)' },
    role: 'dialog',
    'aria-modal': 'true'
  });
  const close = () => {
    backdrop.classList.add('out');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { backdrop.remove(); onCloseCb?.(); }, 200);
  };
  let onCloseCb = null;
  const head = el('div', { class: 'modal-head' }, [
    el('h3', { class: 'grow', text: title || '' }),
    el('button', { class: 'btn-icon', type: 'button', html: icon('close'), 'aria-label': t('common.close'), onclick: () => close() })
  ]);
  const bodyNode = el('div', { class: 'drawer-body' });
  if (typeof body === 'string') bodyNode.innerHTML = body;
  else if (body) bodyNode.appendChild(body);
  panel.appendChild(head);
  panel.appendChild(bodyNode);
  if (footer) panel.appendChild(footer);

  const backdrop = el('div', { class: 'drawer-backdrop ' + side, onclick: (e) => { if (e.target === backdrop) close(); } }, [panel]);
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  return { close, panel, body: bodyNode };
}

/* ============================== 表单绑定 ============================== */
export function bindForm(root, state, onChange) {
  const get$ = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), state);
  const set$ = (path, value) => {
    const parts = path.split('.');
    const last = parts.pop();
    let obj = state;
    for (const p of parts) {
      if (obj[p] == null || typeof obj[p] !== 'object') obj[p] = {};
      obj = obj[p];
    }
    obj[last] = value;
  };
  const sync = (node) => {
    const val = get$(node.dataset.bind);
    if (node.type === 'checkbox') node.checked = !!val;
    else if (node.type === 'range' || node.type === 'number') node.value = val;
    else if (node.type === 'color') node.value = typeof val === 'string' && val.startsWith('#') ? val : '#000000';
    else node.value = val == null ? '' : val;
    paintRange(node);
  };
  const paintRange = (node) => {
    if (node.type !== 'range') return;
    const min = Number(node.min || 0), max = Number(node.max || 100);
    const pct = ((Number(node.value) - min) / (max - min)) * 100;
    node.style.setProperty('--pct', pct + '%');
    const out = node.parentElement?.querySelector('[data-out="' + node.dataset.bind + '"]');
    if (out) out.textContent = node.dataset.format === 'percent'
      ? Math.round(Number(node.value) * 100) + '%'
      : String(Number(node.value));
  };
  const handler = (e) => {
    const node = e.target;
    if (!node.dataset || !node.dataset.bind) return;
    let value;
    if (node.type === 'checkbox') value = node.checked;
    else if (node.type === 'range' || node.type === 'number') value = Number(node.value);
    else value = node.value;
    set$(node.dataset.bind, value);
    if (node.type === 'range') paintRange(node);
    onChange?.(node.dataset.bind, value, state);
  };
  root.addEventListener('input', handler);
  root.addEventListener('change', handler);
  const segHandler = (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-seg]') : null;
    if (!btn) return;
    const path = btn.dataset.seg;
    const value = btn.dataset.value;
    set$(path, isNaN(Number(value)) || value === '' ? value : (btn.dataset.raw === 'true' ? value : value));
    const group = btn.closest('.segmented');
    group?.querySelectorAll('[data-seg]').forEach((b) => b.classList.toggle('active', b === btn));
    onChange?.(path, get$(path), state);
  };
  root.addEventListener('click', segHandler);
  const syncAll = () => {
    root.querySelectorAll('[data-bind]').forEach(sync);
    root.querySelectorAll('.segmented').forEach((group) => {
      const anyBtn = group.querySelector('[data-seg]');
      if (!anyBtn) return;
      const path = anyBtn.dataset.seg;
      const current = String(get$(path));
      group.querySelectorAll('[data-seg]').forEach((b) => b.classList.toggle('active', b.dataset.value === current));
    });
  };
  syncAll();
  return { syncAll, get: get$, set: set$ };
}

export function segmentedHTML(path, options, { full = false } = {}) {
  return '<div class="segmented' + (full ? ' full' : '') + '">' + options.map((o) =>
    '<button type="button" data-seg="' + path + '" data-value="' + escapeHtml(o.value) + '"' +
    (o.title ? ' title="' + escapeHtml(o.title) + '"' : '') + '>' + escapeHtml(o.label) + '</button>').join('') + '</div>';
}

export function sliderHTML({ path, label, min, max, step = 1, format = '' }) {
  return '<div class="field"><div class="slider-row">' +
    '<span class="label" style="text-transform:none;letter-spacing:0;font-size:var(--fs-sm);color:var(--text-1)">' + escapeHtml(label) + '</span>' +
    '<span class="val" data-out="' + path + '"></span></div>' +
    '<input type="range" data-bind="' + path + '" min="' + min + '" max="' + max + '" step="' + step + '"' +
    (format ? ' data-format="' + format + '"' : '') + '></div>';
}

export function switchHTML({ path, label }) {
  return '<label class="switch"><input type="checkbox" data-bind="' + path + '"><span class="track"></span>' +
    '<span>' + escapeHtml(label) + '</span></label>';
}

export function fieldHTML({ path, label, type = 'text', min, max, step, placeholder = '', options = null }) {
  let control;
  if (type === 'select') {
    control = '<select class="select" data-bind="' + path + '">' + options.map((o) =>
      '<option value="' + escapeHtml(o.value) + '">' + escapeHtml(o.label) + '</option>').join('') + '</select>';
  } else if (type === 'color') {
    control = '<input type="color" data-bind="' + path + '">';
  } else {
    control = '<input class="input" type="' + type + '" data-bind="' + path + '"' +
      (min !== undefined ? ' min="' + min + '"' : '') + (max !== undefined ? ' max="' + max + '"' : '') +
      (step !== undefined ? ' step="' + step + '"' : '') +
      (placeholder ? ' placeholder="' + escapeHtml(placeholder) + '"' : '') + '>';
  }
  return '<div class="field"><label>' + escapeHtml(label) + '</label>' + control + '</div>';
}

/* ============================== 顶部导航 ============================== */
/* 联系邮箱 */
export const CONTACT_EMAIL = 'shenghao11@hotmail.com';

export const PAGES = [
  { id: 'home', href: 'index.html', icon: 'home', key: 'nav.home' },
  { id: 'plotter', href: 'plotter.html', icon: 'function', key: 'nav.plotter' },
  { id: 'geometry', href: 'geometry.html', icon: 'shapes', key: 'nav.geometry' },
  { id: 'tools', href: 'tools.html', icon: 'toolbox', key: 'nav.tools' },
  { id: 'help', href: 'help.html', icon: 'help', key: 'nav.help' },
  { id: 'about', href: 'about.html', icon: 'info', key: 'nav.about' }
];

export function currentPage() {
  const file = location.pathname.split('/').pop() || 'index.html';
  return file.replace(/\.html$/, '') || 'index';
}

export function mountNav(active) {
  const host = $('#site-nav');
  if (!host) return;
  const page = active || currentPage();
  host.className = 'nav';
  host.innerHTML =
    '<div class="container nav-inner">' +
      '<a class="brand" href="index.html">' +
        '<span class="brand-mark">' + icon('function', { size: 19 }) + '</span>' +
        '<span>' + t('app.name') + '<small>' + t('app.tagline') + '</small></span>' +
      '</a>' +
      '<nav class="nav-links" id="navLinks" aria-label="main">' +
        PAGES.map((p) => '<a class="nav-link' + (p.id === page ? ' active' : '') + '" href="' + p.href + '">' + t(p.key) + '</a>').join('') +
      '</nav>' +
      '<div class="nav-actions">' +
        '<button class="btn-icon hint" id="navCmd" data-hint="Ctrl K" aria-label="Command palette">' + icon('sparkle', { size: 17 }) + '</button>' +
        '<button class="btn-icon hint" id="navLang" data-hint="' + t('common.language') + '" aria-label="' + t('common.language') + '">' +
          '<span class="mono" style="font-size:11px;font-weight:700">' + (LANGS.find((l) => l.id === getLang())?.short || 'EN') + '</span>' +
        '</button>' +
        '<button class="btn-icon hint" id="navMode" data-hint="' + t('settings.mode') + '" aria-label="' + t('settings.mode') + '">' + modeIcon() + '</button>' +
        '<button class="btn-icon hint" id="navSettings" data-hint="' + t('nav.settings') + '" aria-label="' + t('nav.settings') + '">' + icon('settings', { size: 17 }) + '</button>' +
        '<button class="btn-icon nav-toggle" id="navToggle" aria-label="' + t('nav.menu') + '">' + icon('menu', { size: 18 }) + '</button>' +
      '</div>' +
    '</div>';

  $('#navToggle').addEventListener('click', () => $('#navLinks').classList.toggle('open'));
  $('#navCmd').addEventListener('click', () => commandPalette());
  $('#navSettings').addEventListener('click', () => settingsPanel());
  $('#navMode').addEventListener('click', () => {
    const cur = theme.resolvedMode();
    theme.set({ mode: cur === 'dark' ? 'light' : 'dark' });
    $('#navMode').innerHTML = modeIcon();
  });
  $('#navLang').addEventListener('click', (e) => {
    const list = LANGS;
    const next = list[(list.findIndex((l) => l.id === getLang()) + 1) % list.length];
    setLang(next.id);
    location.reload();
  });
  applyTranslations(host);
  window.addEventListener('bzm:modechange', () => { const b = $('#navMode'); if (b) b.innerHTML = modeIcon(); });
}

function modeIcon() {
  const mode = theme.getKey('mode');
  const name = mode === 'system' ? 'monitor' : mode === 'light' ? 'sun' : 'moon';
  return icon(name, { size: 17 });
}

/* ============================== 设置面板 ============================== */
export function settingsPanel() {
  const s = theme.get();
  const langs = LANGS.map((l) => ({ value: l.id, label: l.label }));
  const html =
    '<section class="card card-pad col">' +
      '<h4>' + t('settings.appearance') + '</h4>' +
      '<div class="field"><label>' + t('settings.mode') + '</label>' +
        segmentedHTML('mode', [
          { value: 'dark', label: t('settings.mode.dark') },
          { value: 'light', label: t('settings.mode.light') },
          { value: 'system', label: t('settings.mode.system') }
        ], { full: true }) +
      '</div>' +
      '<div class="field"><label>' + t('settings.theme') + '</label>' +
        '<div id="presetGrid" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px"></div>' +
      '</div>' +
      '<div class="field"><label>' + t('settings.accent') + '</label>' +
        '<div class="row-inline">' +
          '<input type="color" data-bind="custom.--accent" value="' + toHexSafe(s.custom?.['--accent'] || '#3fb950') + '">' +
          '<button class="btn btn-sm" id="accentAuto" type="button">' + icon('wand', { size: 14 }) + t('settings.accentAuto') + '</button>' +
          '<button class="btn btn-sm" id="accentReset" type="button">' + t('common.reset') + '</button>' +
        '</div>' +
        '<p class="text-xs text-dim">' + t('settings.accentHint') + '</p>' +
      '</div>' +
    '</section>' +
    '<section class="card card-pad col">' +
      '<h4>' + t('settings.typography') + '</h4>' +
      '<div class="field"><label>' + t('settings.font') + '</label>' +
        segmentedHTML('font', [
          { value: 'sans', label: t('settings.font.sans') },
          { value: 'serif', label: t('settings.font.serif') },
          { value: 'mono', label: t('settings.font.mono') }
        ], { full: true }) +
      '</div>' +
      sliderHTML({ path: 'fontScale', label: t('settings.fontScale'), min: 0.85, max: 1.25, step: 0.01, format: 'percent' }) +
      sliderHTML({ path: 'radius', label: t('settings.radius'), min: 0, max: 1.8, step: 0.05 }) +
      sliderHTML({ path: 'blur', label: t('settings.blur'), min: 0, max: 2, step: 0.1 }) +
      '<div class="field"><label>' + t('settings.motion') + '</label>' +
        segmentedHTML('motion', [
          { value: 'on', label: t('settings.motion.on') },
          { value: 'off', label: t('settings.motion.off') },
          { value: 'system', label: t('settings.motion.system') }
        ], { full: true }) +
      '</div>' +
      switchHTML({ path: 'glow', label: t('settings.glow') }) +
      switchHTML({ path: 'grid', label: t('settings.gridDefault') }) +
      '<div class="field"><label>' + t('common.language') + '</label>' +
        '<select class="select" id="langSelect">' + langs.map((l) => '<option value="' + l.value + '"' + (l.value === getLang() ? ' selected' : '') + '>' + l.label + '</option>').join('') + '</select>' +
      '</div>' +
    '</section>' +
    '<section class="card card-pad col">' +
      '<h4>' + t('settings.data') + '</h4>' +
      '<div class="row-inline">' +
        '<button class="btn btn-sm" id="setExport" type="button">' + icon('download', { size: 14 }) + t('settings.exportSettings') + '</button>' +
        '<button class="btn btn-sm" id="setImport" type="button">' + icon('upload', { size: 14 }) + t('settings.importSettings') + '</button>' +
        '<button class="btn btn-sm btn-danger" id="setReset" type="button">' + icon('refresh', { size: 14 }) + t('settings.resetAll') + '</button>' +
      '</div>' +
    '</section>';

  const d = drawer({ title: t('settings.title'), body: html, width: 440 });
  const body = d.body;

  /* 预设主题卡片（缩略预览） */
  const grid = body.querySelector('#presetGrid');
  Object.entries(theme.PRESETS).forEach(([id, preset]) => {
    const c = preset.colors;
    const card = el('button', {
      type: 'button',
      class: 'preset-card' + (s.preset === id ? ' active' : ''),
      style: { borderColor: s.preset === id ? 'var(--accent)' : '' },
      onclick: () => {
        theme.usePreset(id);
        grid.querySelectorAll('.preset-card').forEach((n) => n.classList.remove('active'));
        card.classList.add('active');
        bind.syncAll();
      }
    }, [
      el('span', {
        class: 'preset-preview',
        style: {
          background: 'linear-gradient(135deg,' + c['--bg-2'] + ' 0 55%,' + c['--bg-0'] + ' 55% 100%)',
          borderColor: c['--accent']
        }
      }, [
        el('i', { style: { background: c['--accent'], position: 'absolute', left: '8px', bottom: '8px', width: '14px', height: '14px', borderRadius: '50%' } }),
        el('i', { style: { background: c['--accent-2'], position: 'absolute', right: '8px', top: '8px', width: '10px', height: '10px', borderRadius: '50%' } })
      ]),
      el('span', { class: 'text-xs', text: preset.name[getLang()] || preset.name.en })
    ]);
    grid.appendChild(card);
  });

  const bind = bindForm(body, s, (path, value, state) => {
    theme.set({ [path.split('.')[0]]: path.startsWith('custom.') ? state.custom : value });
    if (path === 'mode') $('#navMode') && ($('#navMode').innerHTML = modeIcon());
  });

  /* 颜色绑定需要特殊处理：内置 -- 前缀字段由 theme.setColor 写入 */
  body.addEventListener('input', (e) => {
    const node = e.target;
    if (node.dataset?.bind === 'custom.--accent') theme.setColor('--accent', node.value);
  });

  body.querySelector('#accentAuto')?.addEventListener('click', () => {
    const base = body.querySelector('[data-bind="custom.--accent"]').value;
    const p = theme.paletteFrom(base);
    const surf = theme.surfacesFrom(base, theme.resolvedMode());
    theme.set({ custom: { ...theme.get().custom, '--accent': p.accent, '--accent-2': p.accent2, '--accent-3': p.accent3, ...surf } });
    toast(t('tools.palette.applied'), { type: 'ok' });
    bind.syncAll();
  });
  body.querySelector('#accentReset')?.addEventListener('click', () => {
    theme.resetCustom();
    bind.syncAll();
  });
  body.querySelector('#langSelect')?.addEventListener('change', (e) => { setLang(e.target.value); location.reload(); });
  body.querySelector('#setExport')?.addEventListener('click', () => {
    downloadText(JSON.stringify(store.exportAll(), null, 2), 'buzhidao-math-settings.json', 'application/json');
  });
  body.querySelector('#setImport')?.addEventListener('click', () => {
    const input = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        store.importAll(data);
        toast(t('settings.imported'), { type: 'ok' });
        setTimeout(() => location.reload(), 700);
      } catch {
        toast(t('settings.importFailed'), { type: 'err' });
      }
    });
    document.body.appendChild(input);
    input.click();
  });
  body.querySelector('#setReset')?.addEventListener('click', () => {
    theme.set({ ...theme.DEFAULTS });
    toast(t('settings.resetDone'), { type: 'ok' });
    bind.syncAll();
  });
  return d;
}

function toHexSafe(c) {
  if (typeof c === 'string' && c.startsWith('#')) return c.length === 4 ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c.slice(0, 7);
  return '#3fb950';
}

/* ============================== 命令面板 ============================== */
export const commandRegistry = [];
export function registerCommand(cmd) { commandRegistry.push(cmd); }

export function commandPalette() {
  const pages = PAGES.map((p) => ({ label: t(p.key), hint: p.href, ico: p.icon, run: () => { location.href = p.href; } }));
  const commands = [
    { label: t('settings.title'), hint: 'Ctrl ,', ico: 'settings', run: () => settingsPanel() },
    { label: t('settings.mode.dark') + ' / ' + t('settings.mode.light'), hint: '', ico: 'moon', run: () => theme.set({ mode: theme.resolvedMode() === 'dark' ? 'light' : 'dark' }) },
    { label: t('common.shortcuts'), hint: '?', ico: 'keyboard', run: () => shortcutsModal() },
    ...commandRegistry
  ];
  const tools = [
    { label: t('tools.deriv'), hint: 'tools.html#deriv', ico: 'curve', run: () => { location.href = 'tools.html#deriv'; } },
    { label: t('tools.data'), hint: 'tools.html#data', ico: 'chart', run: () => { location.href = 'tools.html#data'; } },
    { label: t('tools.convert'), hint: 'tools.html#convert', ico: 'swap', run: () => { location.href = 'tools.html#convert'; } },
    { label: t('tools.calc'), hint: 'tools.html#calc', ico: 'calculator', run: () => { location.href = 'tools.html#calc'; } },
    { label: t('tools.palette'), hint: 'tools.html#palette', ico: 'palette', run: () => { location.href = 'tools.html#palette'; } },
    { label: t('tools.timer'), hint: 'tools.html#timer', ico: 'timer', run: () => { location.href = 'tools.html#timer'; } }
  ];
  const all = [
    ...pages.map((p) => ({ ...p, group: t('cmdk.pages') })),
    ...tools.map((p) => ({ ...p, group: t('cmdk.toolsLabel') })),
    ...commands.map((p) => ({ ...p, group: t('cmdk.commands') }))
  ];

  const input = el('input', { class: 'input', placeholder: t('cmdk.placeholder'), 'aria-label': t('cmdk.placeholder') });
  const list = el('div', { class: 'cmdk-list' });
  const wrap = el('div', {}, [input, list]);
  const m = modal({ title: t('app.name'), body: wrap, wide: true });
  m.dialog.querySelector('.modal-foot')?.remove();

  let filtered = all;
  let active = 0;
  const render = () => {
    list.innerHTML = '';
    if (!filtered.length) {
      list.innerHTML = '<div class="empty">' + t('cmdk.empty') + '</div>';
      return;
    }
    let lastGroup = '';
    filtered.forEach((item, i) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        list.appendChild(el('div', { class: 'label', style: { padding: '10px 11px 4px' }, text: item.group }));
      }
      const row = el('div', { class: 'cmdk-item' + (i === active ? ' active' : ''), onclick: () => { m.close(); item.run(); } }, [
        el('span', { html: icon(item.ico || 'dot', { size: 16 }) }),
        el('span', { text: item.label }),
        el('span', { class: 'k', text: item.hint || '' })
      ]);
      row.addEventListener('mouseenter', () => { active = i; list.querySelectorAll('.cmdk-item').forEach((n, j) => n.classList.toggle('active', j === i)); });
      list.appendChild(row);
    });
  };
  const update = () => {
    const q = input.value.trim().toLowerCase();
    filtered = !q ? all : all.filter((c) => c.label.toLowerCase().includes(q) || (c.hint || '').toLowerCase().includes(q));
    active = 0;
    render();
  };
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, filtered.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); const item = filtered[active]; if (item) { m.close(); item.run(); } }
  });
  update();
  setTimeout(() => input.focus(), 30);
}

/* ============================== 快捷键说明 ============================== */
export const SHORTCUTS = [
  { keys: 'Ctrl + K', label: { zh: '命令面板 / 快速跳转', en: 'Command palette' } },
  { keys: 'Ctrl + ,', label: { zh: '打开设置', en: 'Open settings' } },
  { keys: 'Ctrl + S', label: { zh: '导出当前图像', en: 'Export image' } },
  { keys: 'G', label: { zh: '显示/隐藏网格', en: 'Toggle grid' } },
  { keys: 'R', label: { zh: '复位视图', en: 'Reset view' } },
  { keys: 'F', label: { zh: '适应内容', en: 'Fit to content' } },
  { keys: 'T', label: { zh: '切换跟踪模式', en: 'Toggle trace' } },
  { keys: 'Ctrl + Z / Ctrl + Shift + Z', label: { zh: '撤销 / 重做（画板）', en: 'Undo / redo (pad)' } },
  { keys: 'Delete', label: { zh: '删除选中对象', en: 'Delete selection' } },
  { keys: 'Esc', label: { zh: '取消当前操作', en: 'Cancel current action' } },
  { keys: '?', label: { zh: '显示快捷键', en: 'Show shortcuts' } }
];

export function shortcutsModal() {
  const rows = SHORTCUTS.map((s) => '<div class="shortcut-row"><span>' + (s.label[getLang()] || s.label.en) + '</span><kbd>' + s.keys + '</kbd></div>').join('');
  modal({ title: t('common.shortcuts'), body: '<div class="shortcut-grid">' + rows + '</div>', wide: true });
}

/* ============================== 页脚 ============================== */
export function mountFooter() {
  const host = $('#site-footer');
  if (!host) return;
  host.className = 'footer';
  host.innerHTML =
    '<div class="container">' +
      '<div class="footer-grid">' +
        '<div>' +
          '<a class="brand" href="index.html"><span class="brand-mark">' + icon('function', { size: 19 }) + '</span>' +
          '<span>' + t('app.name') + '<small>' + t('app.tagline') + '</small></span></a>' +
          '<p class="text-sm text-muted mt-3" style="max-width:32em">' + t('footer.builtWith') + '</p>' +
        '</div>' +
        '<div><h4>' + t('footer.links') + '</h4><ul>' +
          PAGES.map((p) => '<li><a href="' + p.href + '">' + t(p.key) + '</a></li>').join('') +
        '</ul></div>' +
        '<div><h4>' + t('nav.contact') + '</h4><ul>' +
          '<li><a href="#" id="footSettings">' + t('settings.title') + '</a></li>' +
          '<li><a href="#" id="footShortcuts">' + t('common.shortcuts') + '</a></li>' +
          '<li><a href="#" id="footLang">' + t('common.language') + '</a></li>' +
          '<li><a href="mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent('Buzhidao Math') + '">' + t('footer.contact') + '</a></li>' +
        '</ul></div>' +
      '</div>' +
      '<div class="footer-bottom">' +
        '<span>' + t('footer.rights') + '</span>' +
        '<span class="row" style="gap:10px">' +
          '<a href="mailto:' + CONTACT_EMAIL + '">' + CONTACT_EMAIL + '</a>' +
          '<span class="mono">' + t('app.name') + ' · ' + new Date().getFullYear() + '</span>' +
        '</span>' +
      '</div>' +
    '</div>';
  host.querySelector('#footSettings')?.addEventListener('click', (e) => { e.preventDefault(); settingsPanel(); });
  host.querySelector('#footShortcuts')?.addEventListener('click', (e) => { e.preventDefault(); shortcutsModal(); });
  host.querySelector('#footLang')?.addEventListener('click', (e) => { e.preventDefault(); const list = LANGS; const next = list[(list.findIndex((l) => l.id === getLang()) + 1) % list.length]; setLang(next.id); location.reload(); });
}

/* ============================== 全站初始化 ============================== */
/* 折叠面板展开时把标题滚入视野，避免内容被浏览器标签栏挡住 */
export function initPanels(root = document) {
  root.querySelectorAll('details.panel').forEach((panel) => {
    if (panel.dataset.boundPanel) return;
    panel.dataset.boundPanel = '1';
    panel.addEventListener('toggle', () => {
      if (!panel.open) return;
      const scroller = panel.closest('.app-side-scroll, .drawer-body, .card-body');
      /* 找到真正可滚动的容器；窗口本身可滚动时直接滚动页面 */
      let target = null;
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 4) target = scroller;
      if (target) {
        const top = panel.offsetTop - target.offsetTop - 8;
        const need = target.scrollTop > top || target.scrollTop + target.clientHeight < top + panel.offsetHeight;
        if (need) {
          try { target.scrollTo({ top: Math.max(0, top), behavior: theme.motionOn() ? 'smooth' : 'auto' }); }
          catch { target.scrollTop = Math.max(0, top); }
        }
      } else {
        const rect = panel.getBoundingClientRect();
        const h = Math.min(panel.offsetHeight, window.innerHeight * 0.7);
        if (rect.bottom > window.innerHeight - 12) {
          try { panel.scrollIntoView({ block: 'nearest', behavior: theme.motionOn() ? 'smooth' : 'auto' }); }
          catch { /* ignore */ }
        }
        void h;
      }
    });
  });
}

/* ---------- 跟随鼠标的提示气泡（自动上下翻转，不会被浏览器标签栏遮挡） ---------- */
let tipNode = null;
function showTip(target, text) {
  hideTip();
  if (!text) return;
  tipNode = el('div', { class: 'tooltip', role: 'tooltip', text });
  document.body.appendChild(tipNode);
  const r = target.getBoundingClientRect();
  const tr = tipNode.getBoundingClientRect();
  const below = r.top < tr.height + 16;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - tr.width / 2), window.innerWidth - tr.width - 8);
  const top = below ? r.bottom + 8 : r.top - tr.height - 8;
  tipNode.style.left = left + 'px';
  tipNode.style.top = top + 'px';
  requestAnimationFrame(() => tipNode && tipNode.classList.add('in'));
}
function hideTip() {
  if (tipNode) { tipNode.remove(); tipNode = null; }
}
export function initTooltips(root = document) {
  root.addEventListener('mouseover', (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-hint]') : null;
    if (t) showTip(t, t.getAttribute('data-hint'));
  });
  root.addEventListener('mouseout', (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-hint]') : null;
    if (t) hideTip();
  });
  root.addEventListener('focusin', (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-hint]') : null;
    if (t) showTip(t, t.getAttribute('data-hint'));
  });
  root.addEventListener('focusout', () => hideTip());
  window.addEventListener('scroll', hideTip, { passive: true });
}

export function initChrome(active) {
  /* 绘图器 / 几何画板 这类整屏工作区隐藏页脚，避免出现页面级滚动把侧栏顶出视口 */
  if (typeof document !== 'undefined' && ['plotter', 'geometry'].includes(active)) {
    document.body.classList.add('is-app');
  }
  mountNav(active);
  mountFooter();
  initPanels(document);
  initTooltips(document);
  /* 兜底：若 i18n 模块在 DOMContentLoaded 之后才加载，这里再翻译一次全页 */
  initI18n(document);
  applyTranslations(document);
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); commandPalette(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); settingsPanel(); return; }
    if (typing) return;
    if (e.key === '?') { e.preventDefault(); shortcutsModal(); }
  });
}

/* 页面滚动进入动画 */
export function initReveal() {
  const nodes = $$('.reveal');
  if (!nodes.length) return;
  if (!('IntersectionObserver' in window) || !theme.motionOn()) {
    nodes.forEach((n) => n.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '-8% 0px -8% 0px' });
  nodes.forEach((n) => io.observe(n));
}

export { debounce, clamp };
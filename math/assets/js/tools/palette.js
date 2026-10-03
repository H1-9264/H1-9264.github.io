/* palette.js — 调色板生成器：和谐配色、明暗阶、对比度、应用到主题 */
import { el, copyText, downloadText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import { toast } from '../core/ui.js';
import { harmony, shadeScale, fmtRgb, fmtHsl, contrast, randomHex, hexToHsl, hslToHex } from './colors.js';

const RULES = [
  { id: 'analogous', key: 'tools.palette.analogous' },
  { id: 'complementary', key: 'tools.palette.complementary' },
  { id: 'triadic', key: 'tools.palette.triadic' },
  { id: 'tetradic', key: 'tools.palette.tetradic' },
  { id: 'shades', key: 'tools.palette.shades' },
  { id: 'mono', key: 'common.all' }
];

export function initPalette(host) {
  let base = theme.toHex(theme.tokens()['--accent'] || '#6c8cff', '#6c8cff');
  let rule = 'analogous';
  let colors = harmony(base, rule, 5);

  const colorInput = el('input', { type: 'color', value: base, style: { width: '52px', height: '40px' } });
  const baseHex = el('input', { class: 'input mono', value: base, style: { maxWidth: '130px' } });
  const row = el('div', { class: 'palette-row' });
  const shadesRow = el('div', { class: 'palette-row' });
  const ruleSel = el('select', { class: 'select', style: { maxWidth: '190px' } });
  RULES.forEach((r) => ruleSel.appendChild(el('option', { value: r.id, text: t(r.key) })));

  const renderSwatch = (c, onCopy) => {
    const sw = el('div', { class: 'swatch', title: t('common.copy'), onclick: async () => { await copyText(c.hex); toast(t('common.copied') + ' ' + c.hex, { type: 'ok', timeout: 1300 }); onCopy?.(); } }, [
      el('div', { class: 'chip', style: { background: c.hex } }),
      el('div', { class: 'code', text: c.hex.toUpperCase() })
    ]);
    return sw;
  };

  const render = () => {
    colorInput.value = base;
    baseHex.value = base;
    colors = harmony(base, rule, 5);
    row.innerHTML = '';
    colors.forEach((c) => row.appendChild(renderSwatch(c)));
    shadesRow.innerHTML = '';
    shadeScale(base, 11).forEach((hex) => {
      const c = { hex, rgb: null, hsl: hexToHsl(hex) };
      shadesRow.appendChild(el('div', {
        class: 'swatch', style: { width: '56px' }, title: hex,
        onclick: async () => { await copyText(hex); toast(t('common.copied') + ' ' + hex, { type: 'ok', timeout: 1200 }); }
      }, [
        el('div', { class: 'chip', style: { background: hex, height: '40px' } }),
        el('div', { class: 'code', style: { fontSize: '9.5px' }, text: hex.replace('#', '') })
      ]));
    });
    // 明细表
    detail.innerHTML = '';
    colors.forEach((c) => {
      detail.appendChild(el('div', { class: 'geo-measure' }, [
        el('span', { class: 'mono', text: c.hex.toUpperCase() }),
        el('span', { class: 'mono text-xs', text: fmtRgb(c.hex) + '  ' + fmtHsl(c.hex) }),
        el('b', { class: 'mono', text: '↔ ' + contrast(c.hex, '#ffffff').toFixed(2) + ' / ' + contrast(c.hex, '#000000').toFixed(2) })
      ]));
    });
  };

  const detail = el('div', { class: 'geo-measures' });

  const setBase = (hex) => { base = hex; render(); };

  colorInput.addEventListener('input', (e) => setBase(e.target.value));
  baseHex.addEventListener('change', (e) => { const v = e.target.value.trim(); if (/^#?[0-9a-f]{6}$/i.test(v)) setBase(v.startsWith('#') ? v : '#' + v); else render(); });
  ruleSel.addEventListener('change', (e) => { rule = e.target.value; render(); });

  host.appendChild(el('div', { class: 'tool-layout' }, [
    el('div', { class: 'col' }, [
      el('div', { class: 'card card-pad col' }, [
        el('div', { class: 'row-inline' }, [
          colorInput,
          baseHex,
          el('button', { class: 'btn btn-sm', type: 'button', html: icon('shuffle', { size: 14 }), text: t('common.example'), onclick: () => setBase(randomHex()) }),
          ruleSel
        ]),
        row
      ]),
      el('div', { class: 'card card-pad col' }, [
        el('strong', { text: t('tools.palette.shades') }),
        shadesRow
      ])
    ]),
    el('div', { class: 'col' }, [
      el('div', { class: 'card card-pad col' }, [
        el('strong', { text: t('tools.palette.harmony') }),
        detail,
        el('div', { class: 'row-inline mt-3' }, [
          el('button', {
            class: 'btn btn-sm btn-primary', type: 'button', text: t('tools.palette.applyTheme'),
            onclick: () => {
              const p = theme.paletteFrom(base);
              const surf = theme.surfacesFrom(base, theme.resolvedMode());
              theme.set({ custom: { ...theme.get().custom, '--accent': p.accent, '--accent-2': p.accent2, '--accent-3': p.accent3, ...surf } });
              toast(t('tools.palette.applied'), { type: 'ok' });
            }
          }),
          el('button', {
            class: 'btn btn-sm', type: 'button', text: t('tools.palette.exportCss'),
            onclick: () => {
              const p = theme.paletteFrom(base);
              const css = ':root {\n  --accent: ' + p.accent + ';\n  --accent-2: ' + p.accent2 + ';\n  --accent-3: ' + p.accent3 + ';\n}\n' +
                shadeScale(base, 11).map((c, i) => '  --c-' + (i + 1) + ': ' + c + ';').join('\n');
              downloadText(css, 'palette.css', 'text/css;charset=utf-8');
              toast(t('plot.exported', { name: 'palette.css' }), { type: 'ok' });
            }
          })
        ])
      ]),
      el('div', { class: 'card card-pad col' }, [
        el('strong', { text: 'HSL' }),
        (() => {
          const wrap = el('div', { class: 'col' });
          const { h, s, l } = hexToHsl(base);
          [[ 'H', h, 0, 360, 1 ], [ 'S', s * 100, 0, 100, 1 ], [ 'L', l * 100, 0, 100, 1 ]].forEach(([label, val, min, max, step]) => {
            const r = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(val) });
            const out = el('span', { class: 'val mono', text: Math.round(Number(val)) });
            r.addEventListener('input', () => {
              const cur = hexToHsl(base);
              const hh = label === 'H' ? Number(r.value) : cur.h;
              const ss = label === 'S' ? Number(r.value) / 100 : cur.s;
              const ll = label === 'L' ? Number(r.value) / 100 : cur.l;
              base = hslToHex(hh, ss, ll);
              out.textContent = String(Math.round(Number(r.value)));
              render();
            });
            wrap.appendChild(el('div', { class: 'slider-row' }, [
              el('span', { class: 'label', text: label }), out, r
            ]));
          });
          return wrap;
        })()
      ])
    ])
  ]));
  render();
}

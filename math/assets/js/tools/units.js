/* units.js — 单位换算工具 */
import { el } from '../core/dom.js';

const CATS = [
  {
    id: 'length', zh: '长度', en: 'Length', base: 'm',
    units: { m: 1, km: 1000, cm: 0.01, mm: 0.001, um: 1e-6, nm: 1e-9, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852, 里: 500, 尺: 0.3333333, 寸: 0.0333333 }
  },
  {
    id: 'area', zh: '面积', en: 'Area', base: 'm²',
    units: { 'm²': 1, 'km²': 1e6, 'cm²': 1e-4, 'mm²': 1e-6, ha: 1e4, acre: 4046.8564224, 'ft²': 0.09290304, 'in²': 0.00064516, 'mi²': 2589988.110336, 亩: 666.6667 }
  },
  {
    id: 'volume', zh: '体积', en: 'Volume', base: 'L',
    units: { L: 1, mL: 0.001, 'm³': 1000, 'cm³': 0.001, 'ft³': 28.316846592, 'in³': 0.016387064, gal_us: 3.785411784, gal_uk: 4.54609, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365, floz: 0.0295735295625 }
  },
  {
    id: 'mass', zh: '质量', en: 'Mass', base: 'kg',
    units: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318, jin: 0.5, liang: 0.05, 担: 50 }
  },
  {
    id: 'temperature', zh: '温度', en: 'Temperature', special: 'temp',
    units: { '°C': 1, '°F': 1, K: 1, '°R': 1 }
  },
  {
    id: 'speed', zh: '速度', en: 'Speed', base: 'm/s',
    units: { 'm/s': 1, 'km/h': 0.277777778, mph: 0.44704, kn: 0.514444444, 'ft/s': 0.3048, mach: 340.29 }
  },
  {
    id: 'data', zh: '数据', en: 'Data', base: 'MB',
    units: { bit: 1.19209289550781e-7, B: 9.5367431640625e-7, KB: 0.0009765625, MB: 1, GB: 1024, TB: 1048576, PB: 1073741824 }
  },
  {
    id: 'angle', zh: '角度', en: 'Angle', base: 'deg',
    units: { deg: 1, rad: 57.2957795130823, grad: 0.9, turn: 360, arcmin: 1 / 60, arcsec: 1 / 3600 }
  },
  {
    id: 'time', zh: '时间', en: 'Time', base: 's',
    units: { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400, wk: 604800, yr: 31557600 }
  },
  {
    id: 'pressure', zh: '压强', en: 'Pressure', base: 'Pa',
    units: { Pa: 1, kPa: 1000, MPa: 1e6, bar: 1e5, mbar: 100, atm: 101325, mmHg: 133.322387415, psi: 6894.757293168 }
  },
  {
    id: 'energy', zh: '能量', en: 'Energy', base: 'J',
    units: { J: 1, kJ: 1000, cal: 4.184, kcal: 4184, Wh: 3600, kWh: 3.6e6, eV: 1.602176634e-19, BTU: 1055.05585262 }
  }
];

const tempToC = {
  '°C': (v) => v,
  '°F': (v) => (v - 32) / 1.8,
  K: (v) => v - 273.15,
  '°R': (v) => (v - 491.67) / 1.8
};
const cToTemp = {
  '°C': (c) => c,
  '°F': (c) => c * 1.8 + 32,
  K: (c) => c + 273.15,
  '°R': (c) => (c + 273.15) * 1.8
};

export function initUnits(host, lang = 'zh') {
  let cat = CATS[0];
  const catSel = el('select', { class: 'select' });
  CATS.forEach((c) => catSel.appendChild(el('option', { value: c.id, text: lang === 'zh' ? c.zh : c.en })));
  const fromSel = el('select', { class: 'select' });
  const toSel = el('select', { class: 'select' });
  const input = el('input', { class: 'input mono', type: 'number', step: 'any', value: '1' });
  const result = el('div', { class: 'conv-result mono' });
  const detail = el('div', { class: 'text-xs text-dim' });

  const fillUnits = () => {
    fromSel.innerHTML = '';
    toSel.innerHTML = '';
    Object.keys(cat.units).forEach((u) => {
      fromSel.appendChild(el('option', { value: u, text: u }));
      toSel.appendChild(el('option', { value: u, text: u }));
    });
    toSel.selectedIndex = Math.min(1, toSel.options.length - 1);
    convert();
  };

  const convert = () => {
    const v = Number(input.value);
    const from = fromSel.value, to = toSel.value;
    let out;
    if (cat.special === 'temp') out = cToTemp[to](tempToC[from](v));
    else out = (v * cat.units[from]) / cat.units[to];
    result.textContent = Number.isFinite(out) ? String(Number(out.toPrecision(12))) + ' ' + to : '—';
    detail.textContent = v + ' ' + from + ' = ' + result.textContent;
  };

  catSel.addEventListener('change', () => { cat = CATS.find((c) => c.id === catSel.value); fillUnits(); });
  [fromSel, toSel].forEach((s) => s.addEventListener('change', convert));
  input.addEventListener('input', convert);

  const swap = () => {
    const f = fromSel.value;
    fromSel.value = toSel.value;
    toSel.value = f;
    convert();
  };

  host.appendChild(el('div', { class: 'col' }, [
    el('div', { class: 'row-inline' }, [el('span', { class: 'label', text: '类别' }), catSel]),
    el('div', { class: 'conv-grid' }, [
      el('div', { class: 'field' }, [el('label', { text: '从' }), input, fromSel]),
      el('button', { class: 'btn btn-icon conv-swap', type: 'button', html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 5.5 3.5 9 7 12.5"/><path d="M3.5 9h12.5"/><path d="M17 11.5 20.5 15 17 18.5"/><path d="M20.5 15H8"/></svg>', onclick: swap }),
      el('div', { class: 'field' }, [el('label', { text: '到' }), el('div', { class: 'input', style: { minHeight: '36px' } }, [result]), toSel])
    ]),
    detail
  ]));
  fillUnits();
}

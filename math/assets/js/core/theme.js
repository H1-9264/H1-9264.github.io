/* theme.js — 主题系统：预设方案 + 用户自定义（主色/背景/画布/网格/字体/圆角/毛玻璃/动效） */
import { load, save } from './storage.js';

export const PRESETS = {
  midnight: {
    name: { zh: '午夜蓝', en: 'Midnight' },
    colors: {
      '--bg-0': '#06070f', '--bg-1': '#0a0c17', '--bg-2': '#10131f', '--bg-3': '#171b2b',
      '--accent': '#6c8cff', '--accent-2': '#22d3ee', '--accent-3': '#b07cff',
      '--canvas-bg': '#080a13', '--grid-minor': 'rgba(255,255,255,0.055)', '--grid-major': 'rgba(255,255,255,0.11)',
      '--axis': 'rgba(255,255,255,0.45)', '--axis-label': '#8e97b8', '--geo-ink': '#e8ecff'
    }
  },
  oled: {
    name: { zh: '纯黑 OLED', en: 'OLED Black' },
    variant: 'oled',
    colors: {
      '--bg-0': '#000000', '--bg-1': '#04060b', '--bg-2': '#080a11', '--bg-3': '#10131c',
      '--accent': '#5eead4', '--accent-2': '#38bdf8', '--accent-3': '#a78bfa',
      '--canvas-bg': '#000000', '--grid-minor': 'rgba(255,255,255,0.06)', '--grid-major': 'rgba(255,255,255,0.12)',
      '--axis': 'rgba(255,255,255,0.5)', '--axis-label': '#7c8aa5', '--geo-ink': '#e6fbff'
    }
  },
  nord: {
    name: { zh: '北境 Nord', en: 'Nord' },
    colors: {
      '--bg-0': '#242933', '--bg-1': '#2e3440', '--bg-2': '#343b49', '--bg-3': '#3b4252',
      '--accent': '#88c0d0', '--accent-2': '#8fbcbb', '--accent-3': '#b48ead',
      '--canvas-bg': '#2b313d', '--grid-minor': 'rgba(236,239,244,0.06)', '--grid-major': 'rgba(236,239,244,0.13)',
      '--axis': 'rgba(236,239,244,0.45)', '--axis-label': '#a9b3c4', '--geo-ink': '#eceff4'
    }
  },
  dracula: {
    name: { zh: '德古拉', en: 'Dracula' },
    colors: {
      '--bg-0': '#191a25', '--bg-1': '#21222c', '--bg-2': '#282a36', '--bg-3': '#343746',
      '--accent': '#bd93f9', '--accent-2': '#8be9fd', '--accent-3': '#ff79c6',
      '--canvas-bg': '#1e1f29', '--grid-minor': 'rgba(248,248,242,0.06)', '--grid-major': 'rgba(248,248,242,0.12)',
      '--axis': 'rgba(248,248,242,0.45)', '--axis-label': '#a6adc8', '--geo-ink': '#f8f8f2'
    }
  },
  rose: {
    name: { zh: '玫瑰松', en: 'Rosé Pine' },
    colors: {
      '--bg-0': '#16141f', '--bg-1': '#1c1a27', '--bg-2': '#232136', '--bg-3': '#2a273f',
      '--accent': '#ebbcba', '--accent-2': '#9ccfd8', '--accent-3': '#c4a7e7',
      '--canvas-bg': '#1b1928', '--grid-minor': 'rgba(224,222,244,0.06)', '--grid-major': 'rgba(224,222,244,0.12)',
      '--axis': 'rgba(224,222,244,0.45)', '--axis-label': '#a49fb8', '--geo-ink': '#e0def4'
    }
  },
  forest: {
    name: { zh: '深林', en: 'Deep Forest' },
    colors: {
      '--bg-0': '#0a1210', '--bg-1': '#0e1a16', '--bg-2': '#13241e', '--bg-3': '#1a2f27',
      '--accent': '#4ade80', '--accent-2': '#22d3ee', '--accent-3': '#a3e635',
      '--canvas-bg': '#0c1714', '--grid-minor': 'rgba(255,255,255,0.05)', '--grid-major': 'rgba(255,255,255,0.1)',
      '--axis': 'rgba(255,255,255,0.4)', '--axis-label': '#84a99a', '--geo-ink': '#e7fff5'
    }
  },
  ember: {
    name: { zh: '余烬', en: 'Ember' },
    colors: {
      '--bg-0': '#150f0d', '--bg-1': '#1d1512', '--bg-2': '#261b17', '--bg-3': '#33241e',
      '--accent': '#fb923c', '--accent-2': '#facc15', '--accent-3': '#f472b6',
      '--canvas-bg': '#180f0c', '--grid-minor': 'rgba(255,255,255,0.055)', '--grid-major': 'rgba(255,255,255,0.11)',
      '--axis': 'rgba(255,255,255,0.42)', '--axis-label': '#b39a8c', '--geo-ink': '#fff2e8'
    }
  },
  mono: {
    name: { zh: '石墨灰', en: 'Graphite' },
    colors: {
      '--bg-0': '#101114', '--bg-1': '#16181d', '--bg-2': '#1d2026', '--bg-3': '#262a32',
      '--accent': '#e5e7eb', '--accent-2': '#9ca3af', '--accent-3': '#6b7280',
      '--canvas-bg': '#131519', '--grid-minor': 'rgba(255,255,255,0.06)', '--grid-major': 'rgba(255,255,255,0.12)',
      '--axis': 'rgba(255,255,255,0.45)', '--axis-label': '#9ca3af', '--geo-ink': '#f3f4f6'
    }
  },
  daylight: {
    name: { zh: '白昼', en: 'Daylight' },
    mode: 'light',
    colors: {
      '--bg-0': '#f5f6fb', '--bg-1': '#ffffff', '--bg-2': '#ffffff', '--bg-3': '#eef1fa',
      '--accent': '#4b62e0', '--accent-2': '#0891b2', '--accent-3': '#8b5cf6',
      '--canvas-bg': '#ffffff', '--grid-minor': 'rgba(16,20,40,0.07)', '--grid-major': 'rgba(16,20,40,0.14)',
      '--axis': 'rgba(16,20,40,0.5)', '--axis-label': '#5d6684', '--geo-ink': '#1c2338'
    }
  }
};

export const CURVE_PALETTE = ['#6c8cff', '#22d3ee', '#b07cff', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#f472b6', '#a3e635', '#f97316'];

export const DEFAULTS = {
  mode: 'dark',              // dark | light | system
  preset: 'midnight',
  variant: '',
  custom: {},                // { '--accent': '#...' } 覆盖预设
  font: 'sans',              // sans | serif | mono
  fontScale: 1,
  radius: 1,
  blur: 1,
  motion: 'on',              // on | off | system
  glow: true,
  grid: true,
  lang: 'zh'
};

let state = { ...DEFAULTS, ...(load('theme', {}) || {}) };
const listeners = new Set();

/* ---------- 颜色工具 ---------- */
export function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (!/^[0-9a-fA-F]{3,8}$/.test(h)) return { r: 108, g: 140, b: 255 };
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function rgbToHex(r, g, b) {
  const f = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}
export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
export function withAlpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
}
export function relLum(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function bestOn(hex) { return relLum(hex) > 0.55 ? '#08111f' : '#ffffff'; }
export function isHex(v) { return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(String(v).trim()); }

/* 解析任意 CSS 颜色（含 rgba()/颜色名）为 hex，用于 canvas 绘制 */
export function toHex(color, fallback = '#888888') {
  if (!color) return fallback;
  const c = String(color).trim();
  if (isHex(c)) {
    const { r, g, b } = hexToRgb(c);
    return rgbToHex(r, g, b);
  }
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) return rgbToHex(parts[0], parts[1], parts[2]);
  }
  return fallback;
}

/* 生成一套和谐的强调色（用于"从主色生成主题"） */
export function paletteFrom(hex) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  return {
    accent: hslToHex(h, Math.min(1, s * 0.95 + 0.1), Math.max(0.44, Math.min(0.72, l))),
    accent2: hslToHex(h + 44, Math.max(0.5, s), Math.max(0.5, Math.min(0.72, l + 0.08))),
    accent3: hslToHex(h - 48, Math.max(0.45, s), Math.max(0.5, Math.min(0.74, l + 0.04)))
  };
}
/* 从主色推导深浅背景（一键"整站换色"） */
export function surfacesFrom(hex, mode = 'dark') {
  const { r, g, b } = hexToRgb(hex);
  const { h, s } = rgbToHsl(r, g, b);
  const ss = Math.min(0.3, Math.max(0.12, s * 0.5));
  if (mode === 'light') {
    return {
      '--bg-0': hslToHex(h, ss * 0.5, 0.972),
      '--bg-1': hslToHex(h, ss * 0.32, 0.995),
      '--bg-2': '#ffffff',
      '--bg-3': hslToHex(h, ss * 0.6, 0.944)
    };
  }
  return {
    '--bg-0': hslToHex(h, ss * 0.7, 0.043),
    '--bg-1': hslToHex(h, ss * 0.7, 0.063),
    '--bg-2': hslToHex(h, ss * 0.66, 0.088),
    '--bg-3': hslToHex(h, ss * 0.58, 0.128)
  };
}

/* ---------- 解析后的令牌 ---------- */
export function resolvedMode() {
  if (state.mode === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return state.mode === 'light' ? 'light' : 'dark';
}

export function resolvedColors() {
  const preset = PRESETS[state.preset] || PRESETS.midnight;
  const mode = resolvedMode();
  const base = mode === 'light' && !preset.mode ? PRESETS.daylight.colors : preset.colors;
  const merged = { ...base, ...(state.custom || {}) };
  const accent = merged['--accent'];
  return {
    ...merged,
    '--accent-soft': withAlpha(accent, mode === 'light' ? 0.14 : 0.17),
    '--accent-contrast': bestOn(accent)
  };
}

export function motionOn() {
  if (state.motion === 'off') return false;
  if (state.motion === 'system') return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return true;
}

export function apply() {
  const root = document.documentElement;
  const mode = resolvedMode();
  root.dataset.theme = mode;
  root.dataset.variant = state.variant || '';
  root.dataset.motion = motionOn() ? 'on' : 'off';
  root.style.setProperty('--motion', motionOn() ? '1' : '0');
  if (document.body) document.body.dataset.font = state.font;
  root.style.setProperty('--fs-scale', String(state.fontScale));

  const r = state.radius;
  root.style.setProperty('--radius-xs', Math.round(6 * r) + 'px');
  root.style.setProperty('--radius-sm', Math.round(10 * r) + 'px');
  root.style.setProperty('--radius', Math.round(14 * r) + 'px');
  root.style.setProperty('--radius-lg', Math.round(20 * r) + 'px');
  root.style.setProperty('--radius-xl', Math.round(28 * r) + 'px');
  root.style.setProperty('--blur', Math.round(14 * state.blur) + 'px');

  const colors = resolvedColors();
  for (const [k, v] of Object.entries(colors)) root.style.setProperty(k, v);
  if (document.body) document.body.classList.toggle('no-glow', !state.glow);
  root.dataset.grid = state.grid ? 'on' : 'off';
}

export function get() { return { ...state }; }
export function getKey(k) { return state[k]; }

export function set(patch, { persist = true } = {}) {
  state = { ...state, ...patch };
  apply();
  if (persist) save('theme', state);
  listeners.forEach((fn) => fn(get()));
  if ('mode' in patch) window.dispatchEvent(new CustomEvent('bzm:modechange', { detail: { mode: resolvedMode() } }));
  return get();
}

export function setColor(token, value) {
  set({ custom: { ...(state.custom || {}), [token]: value } });
}
export function resetCustom() {
  set({ custom: {}, preset: DEFAULTS.preset, variant: '', mode: DEFAULTS.mode });
}
export function usePreset(id) {
  const preset = PRESETS[id];
  if (!preset) return;
  set({ preset: id, variant: preset.variant || '', custom: {}, mode: preset.mode || 'dark' });
}
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function tokens() { return resolvedColors(); }
export function curveColor(i) { return CURVE_PALETTE[i % CURVE_PALETTE.length]; }

/* 外部（如另一标签页/设置面板直接改存储）后重新载入 */
export function reload() {
  state = { ...DEFAULTS, ...(load('theme', {}) || {}) };
  apply();
  listeners.forEach((fn) => fn(get()));
}

if (typeof window !== 'undefined') {
  const mq = window.matchMedia?.('(prefers-color-scheme: light)');
  mq?.addEventListener?.('change', () => { if (state.mode === 'system') apply(); });
  const mqMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  mqMotion?.addEventListener?.('change', () => { if (state.motion === 'system') apply(); });
  window.addEventListener('storage', (e) => { if (e.key === 'bzm:theme') reload(); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { apply(); }, { once: true });
  }
}

/* theme.js — 主题系统：预设方案 + 用户自定义（主色/背景/画布/网格/字体/圆角/毛玻璃/动效） */
import { load, save } from './storage.js';

export const PRESETS = {
  github: {
    name: { zh: 'GitHub 绿', en: 'GitHub Green' },
    colors: {
      '--bg-0': '#0d1117', '--bg-1': '#11161d', '--bg-2': '#161b22', '--bg-3': '#1f2630',
      '--accent': '#3fb950', '--accent-2': '#d29922', '--accent-3': '#2ea043',
      '--canvas-bg': '#0b0f14', '--grid-minor': 'rgba(240,246,252,0.05)', '--grid-major': 'rgba(240,246,252,0.11)',
      '--axis': 'rgba(240,246,252,0.42)', '--axis-label': '#8b949e', '--geo-ink': '#e6edf3'
    }
  },
  amber: {
    name: { zh: '琥珀黄', en: 'Amber' },
    colors: {
      '--bg-0': '#0f1115', '--bg-1': '#14171c', '--bg-2': '#1a1e24', '--bg-3': '#242a32',
      '--accent': '#e3b341', '--accent-2': '#56d364', '--accent-3': '#f0883e',
      '--canvas-bg': '#0d0f13', '--grid-minor': 'rgba(255,255,255,0.05)', '--grid-major': 'rgba(255,255,255,0.11)',
      '--axis': 'rgba(255,255,255,0.42)', '--axis-label': '#9aa4ae', '--geo-ink': '#f5f0e6'
    }
  },
  lime: {
    name: { zh: '青柠', en: 'Lime' },
    colors: {
      '--bg-0': '#0b0f0c', '--bg-1': '#0f1511', '--bg-2': '#141c17', '--bg-3': '#1d2820',
      '--accent': '#a3e635', '--accent-2': '#4ade80', '--accent-3': '#facc15',
      '--canvas-bg': '#090d0a', '--grid-minor': 'rgba(233,255,233,0.05)', '--grid-major': 'rgba(233,255,233,0.11)',
      '--axis': 'rgba(233,255,233,0.4)', '--axis-label': '#8ea88f', '--geo-ink': '#eafbe7'
    }
  },
  forest: {
    name: { zh: '深林', en: 'Deep Forest' },
    colors: {
      '--bg-0': '#0a1210', '--bg-1': '#0e1a16', '--bg-2': '#13241e', '--bg-3': '#1a2f27',
      '--accent': '#4ade80', '--accent-2': '#fbbf24', '--accent-3': '#a3e635',
      '--canvas-bg': '#0c1714', '--grid-minor': 'rgba(255,255,255,0.05)', '--grid-major': 'rgba(255,255,255,0.1)',
      '--axis': 'rgba(255,255,255,0.4)', '--axis-label': '#84a99a', '--geo-ink': '#e7fff5'
    }
  },
  ember: {
    name: { zh: '余烬', en: 'Ember' },
    colors: {
      '--bg-0': '#150f0d', '--bg-1': '#1d1512', '--bg-2': '#261b17', '--bg-3': '#33241e',
      '--accent': '#f0883e', '--accent-2': '#facc15', '--accent-3': '#ffa657',
      '--canvas-bg': '#180f0c', '--grid-minor': 'rgba(255,255,255,0.055)', '--grid-major': 'rgba(255,255,255,0.11)',
      '--axis': 'rgba(255,255,255,0.42)', '--axis-label': '#b39a8c', '--geo-ink': '#fff2e8'
    }
  },
  teal: {
    name: { zh: '青碧', en: 'Teal' },
    colors: {
      '--bg-0': '#08110f', '--bg-1': '#0c1716', '--bg-2': '#111f1d', '--bg-3': '#182a27',
      '--accent': '#2dd4bf', '--accent-2': '#a3e635', '--accent-3': '#3fb950',
      '--canvas-bg': '#070f0e', '--grid-minor': 'rgba(230,255,250,0.05)', '--grid-major': 'rgba(230,255,250,0.11)',
      '--axis': 'rgba(230,255,250,0.4)', '--axis-label': '#83a8a2', '--geo-ink': '#e6fffb'
    }
  },
  graphite: {
    name: { zh: '石墨灰', en: 'Graphite' },
    colors: {
      '--bg-0': '#101114', '--bg-1': '#16181d', '--bg-2': '#1d2026', '--bg-3': '#262a32',
      '--accent': '#c9d1d9', '--accent-2': '#8b949e', '--accent-3': '#6e7681',
      '--canvas-bg': '#131519', '--grid-minor': 'rgba(255,255,255,0.06)', '--grid-major': 'rgba(255,255,255,0.12)',
      '--axis': 'rgba(255,255,255,0.45)', '--axis-label': '#9ca3af', '--geo-ink': '#f3f4f6'
    }
  },
  oled: {
    name: { zh: '纯黑 OLED', en: 'OLED Black' },
    variant: 'oled',
    colors: {
      '--bg-0': '#000000', '--bg-1': '#04060b', '--bg-2': '#080a11', '--bg-3': '#10131c',
      '--accent': '#3fb950', '--accent-2': '#d29922', '--accent-3': '#56d364',
      '--canvas-bg': '#000000', '--grid-minor': 'rgba(255,255,255,0.06)', '--grid-major': 'rgba(255,255,255,0.12)',
      '--axis': 'rgba(255,255,255,0.5)', '--axis-label': '#7d8590', '--geo-ink': '#e6edf3'
    }
  },
  daylight: {
    name: { zh: '白昼', en: 'Daylight' },
    mode: 'light',
    colors: {
      '--bg-0': '#f6f8fa', '--bg-1': '#ffffff', '--bg-2': '#ffffff', '--bg-3': '#eaeef2',
      '--accent': '#1a7f37', '--accent-2': '#9a6700', '--accent-3': '#2da44e',
      '--canvas-bg': '#ffffff', '--grid-minor': 'rgba(27,31,36,0.07)', '--grid-major': 'rgba(27,31,36,0.14)',
      '--axis': 'rgba(27,31,36,0.5)', '--axis-label': '#57606a', '--geo-ink': '#1f2328'
    }
  }
};

export const CURVE_PALETTE = ['#3fb950', '#d29922', '#2ea043', '#e3b341', '#56d364', '#f0883e', '#a3e635', '#ffa657', '#7ee787', '#8b949e'];

export const DEFAULTS = {
  mode: 'dark',              // dark | light | system
  preset: 'github',
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
  if (!/^[0-9a-fA-F]{3,8}$/.test(h)) return { r: 63, g: 185, b: 80 };
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
  const preset = PRESETS[state.preset] || PRESETS.github;
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
  root.classList.add('js-tip');
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
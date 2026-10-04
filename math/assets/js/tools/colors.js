/* colors.js — 颜色工具（HEX/RGB/HSL 互转、随机、和谐配色、对比度） */
export function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function rgbToHex(r, g, b) {
  const f = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
export const hexToHsl = (hex) => { const { r, g, b } = hexToRgb(hex); return rgbToHsl(r, g, b); };
export const hslToHex = (h, s, l) => { const { r, g, b } = hslToRgb(h, s, l); return rgbToHex(r, g, b); };
export function relLum(hex) {
  const { r, g, b } = hexToRgb(hex);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a, b) {
  const l1 = relLum(a), l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
export const bestTextOn = (hex) => (relLum(hex) > 0.5 ? '#101828' : '#ffffff');
export function randomHex() {
  return rgbToHex(Math.random() * 255, Math.random() * 255, Math.random() * 255);
}
/* 和谐配色 */
export function harmony(hex, rule = 'analogous', count = 5) {
  const { h, s, l } = hexToHsl(hex);
  const out = [];
  switch (rule) {
    case 'complementary':
      for (let i = 0; i < count; i++) out.push(hslToHex(h + (i % 2 ? 180 : 0), s, l + (i > 1 ? (i % 2 ? 0.12 : -0.12) : 0)));
      break;
    case 'triadic':
      for (let i = 0; i < count; i++) out.push(hslToHex(h + i * 120, s, l + (i > 2 ? 0.1 : 0)));
      break;
    case 'tetradic':
      for (let i = 0; i < count; i++) out.push(hslToHex(h + i * 90, s, l + (i > 3 ? 0.1 : 0)));
      break;
    case 'shades':
      for (let i = 0; i < count; i++) out.push(hslToHex(h, s, Math.max(0.08, Math.min(0.94, 0.12 + (i * 0.8) / Math.max(1, count - 1)))));
      break;
    case 'mono':
      for (let i = 0; i < count; i++) out.push(hslToHex(h, Math.max(0.05, s - i * 0.12), Math.max(0.12, Math.min(0.92, l + (i - 2) * 0.08))));
      break;
    case 'analogous':
    default:
      for (let i = 0; i < count; i++) out.push(hslToHex(h + (i - Math.floor(count / 2)) * 24, s, l));
      break;
  }
  return out.map((c) => ({ hex: c, rgb: hexToRgb(c), hsl: hexToHsl(c), contrastOnWhite: contrast(c, '#ffffff'), contrastOnBlack: contrast(c, '#000000') }));
}
export function shadeScale(hex, steps = 10) {
  const { h, s } = hexToHsl(hex);
  const out = [];
  for (let i = 0; i < steps; i++) {
    const l = 0.95 - (i * 0.85) / (steps - 1);
    out.push(hslToHex(h, Math.min(1, s * (1 - Math.abs(l - 0.5) * 0.35)), l));
  }
  return out;
}
export const fmtRgb = (hex) => { const { r, g, b } = hexToRgb(hex); return 'rgb(' + r + ', ' + g + ', ' + b + ')'; };
export const fmtHsl = (hex) => { const { h, s, l } = hexToHsl(hex); return 'hsl(' + Math.round(h) + ', ' + Math.round(s * 100) + '%, ' + Math.round(l * 100) + '%)'; };

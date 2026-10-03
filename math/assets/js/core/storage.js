/* storage.js — localStorage 安全封装（隐私模式 / 配额满时自动降级到内存） */
const memory = new Map();
let usable = null;

function probe() {
  if (usable !== null) return usable;
  try {
    const k = '__bzm_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    usable = true;
  } catch {
    usable = false;
  }
  return usable;
}

export const NS = 'bzm:';

export function load(key, fallback = null) {
  const full = NS + key;
  try {
    const raw = probe() ? window.localStorage.getItem(full) : memory.get(full);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  const full = NS + key;
  const raw = JSON.stringify(value);
  try {
    if (probe()) window.localStorage.setItem(full, raw);
    else memory.set(full, raw);
  } catch {
    memory.set(full, raw);
  }
}

export function remove(key) {
  const full = NS + key;
  try {
    if (probe()) window.localStorage.removeItem(full);
  } catch { /* ignore */ }
  memory.delete(full);
}

export function clearAll(prefix = NS) {
  try {
    if (!probe()) return;
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch { /* ignore */ }
  memory.clear();
}

export function exportAll() {
  const out = {};
  try {
    if (probe()) {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(NS)) out[k.slice(NS.length)] = JSON.parse(window.localStorage.getItem(k));
      }
    }
  } catch { /* ignore */ }
  for (const [k, v] of memory) if (k.startsWith(NS)) out[k.slice(NS.length)] = JSON.parse(v);
  return out;
}

export function importAll(obj, { replace = false } = {}) {
  if (!obj || typeof obj !== 'object') return 0;
  if (replace) clearAll();
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    save(k, v);
    n++;
  }
  return n;
}

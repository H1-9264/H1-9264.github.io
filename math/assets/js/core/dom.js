/* dom.js — 极简 DOM 助手：选择、创建、事件、拖拽、尺寸监听 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
}

export function on(target, type, handler, opts) {
  target.addEventListener(type, handler, opts);
  return () => target.removeEventListener(type, handler, opts);
}

export function delegate(root, type, selector, handler) {
  return on(root, type, (ev) => {
    const t = ev.target instanceof Element ? ev.target.closest(selector) : null;
    if (t && root.contains(t)) handler(ev, t);
  });
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* 拖拽（鼠标 + 触摸统一走 Pointer Events） */
export function dragify(target, { onStart, onMove, onEnd, cursor = 'grabbing' } = {}) {
  let active = false;
  let id = null;
  const prev = document.body.style.cursor;

  const down = (ev) => {
    if (ev.button !== undefined && ev.button !== 0 && ev.pointerType === 'mouse') return;
    active = true;
    id = ev.pointerId;
    target.setPointerCapture?.(id);
    document.body.style.cursor = cursor;
    onStart?.(ev);
  };
  const move = (ev) => { if (active) onMove?.(ev); };
  const up = (ev) => {
    if (!active) return;
    active = false;
    try { target.releasePointerCapture?.(id); } catch { /* ignore */ }
    document.body.style.cursor = prev;
    onEnd?.(ev);
  };
  target.addEventListener('pointerdown', down);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
  return () => {
    target.removeEventListener('pointerdown', down);
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
  };
}

/* 观察容器尺寸变化（ResizeObserver 兜底 window.resize） */
export function observeSize(node, cb) {
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) cb(e.contentRect.width, e.contentRect.height);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }
  const handler = () => cb(node.clientWidth, node.clientHeight);
  window.addEventListener('resize', handler);
  handler();
  return () => window.removeEventListener('resize', handler);
}

/* 数字格式化：去掉浮点噪声 */
export function fmt(v, digits = 6) {
  if (!Number.isFinite(v)) return String(v);
  if (Object.is(v, -0)) v = 0;
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e7)) return v.toExponential(4).replace('e', 'e');
  const s = v.toFixed(digits);
  return s.replace(/\.?0+$/, '') || '0';
}

export function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

/* 触发下载（纯前端 Blob） */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text, filename, mime = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      resolve();
    } catch (e) { reject(e); }
  });
}

export function debounce(fn, ms = 180) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function throttle(fn, ms = 60) {
  let last = 0;
  let timer = 0;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = 0;
        last = Date.now();
        fn(...lastArgs);
      }, ms - (now - last));
    }
  };
}

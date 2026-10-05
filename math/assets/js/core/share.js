/* share.js — 把当前作品编码进 URL（纯前端，无需服务器） */
import { toast } from './ui.js';
import { t } from './i18n.js';
import { copyText } from './dom.js';

/* UTF-8 → base64url（比 encodeURIComponent 短且干净） */
export function encodeState(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState(str) {
  if (!str) return null;
  try {
    const b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/* 当前页面的分享链接（#s=...） */
export function shareUrl(obj) {
  return location.origin + location.pathname + '#s=' + encodeState(obj);
}

/* 读取 URL 里的分享状态 */
export function readShared() {
  const hash = location.hash || '';
  const m = hash.match(/[#&]s=([A-Za-z0-9\-_]+)/);
  return m ? decodeState(m[1]) : null;
}

export async function copyShareLink(obj, { silent = false } = {}) {
  const url = shareUrl(obj);
  await copyText(url);
  if (!silent) {
    const short = url.length > 72 ? url.slice(0, 69) + '…' : url;
    toast(t('share.copied', { url: short }), { type: 'ok', timeout: 3200 });
  }
  return url;
}

/* 写入地址栏（不刷新页面） */
export function pushShareState(obj) {
  try {
    history.replaceState(null, '', location.pathname + '#s=' + encodeState(obj));
  } catch { /* ignore */ }
}

/* i18n.js — 多语言（简体中文 / English / 日本語）
   字典分别放在 lang-zh.js / lang-en.js / lang-ja.js，本文件只负责逻辑：
   语言选择、t() 取词、setLang() 切换、data-i18n* 自动翻译。 */
import { load, save } from './storage.js';
import { zh } from './lang-zh.js';
import { en } from './lang-en.js';
import { ja } from './lang-ja.js';

export const LANGS = [
  { id: 'zh', label: '简体中文', short: '中' },
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'ja', label: '日本語', short: '日' }
];

const DICT = { zh, en, ja };

export const SUPPORTED = Object.keys(DICT);

let lang = load('lang', null);
if (!lang) {
  const nav = (navigator.language || 'en').toLowerCase();
  lang = nav.startsWith('zh') ? 'zh' : nav.startsWith('ja') ? 'ja' : 'en';
}
if (!SUPPORTED.includes(lang)) lang = 'en';

export function getLang() { return lang; }

/* 取词：缺失时回退英文 → 中文 → 原样返回 key */
export function t(key, vars) {
  const table = DICT[lang] || DICT.en;
  let s = table[key];
  if (s === undefined) s = DICT.en[key];
  if (s === undefined) s = DICT.zh[key];
  if (s === undefined) return key;
  if (vars) s = String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return s;
}

export function setLang(next) {
  if (!SUPPORTED.includes(next)) return;
  lang = next;
  save('lang', next);
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : next;
  applyTranslations(document);
  window.dispatchEvent(new CustomEvent('bzm:langchange', { detail: { lang } }));
}

/* 把 data-i18n* 属性应用到 DOM */
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    const val = t(key);
    if (node.hasAttribute('data-i18n-attr')) node.setAttribute(node.getAttribute('data-i18n-attr'), val);
    else node.textContent = val;
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.getAttribute('data-i18n-placeholder')));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((node) => {
    node.setAttribute('title', t(node.getAttribute('data-i18n-title')));
  });
  root.querySelectorAll('[data-i18n-hint]').forEach((node) => {
    node.setAttribute('data-hint', t(node.getAttribute('data-i18n-hint')));
  });
}

/* 浏览器环境自动应用；Node 下导入（单元测试）自动跳过。
   模块可能在 DOMContentLoaded 之后才被动态导入（页面脚本在 </body> 前），
   所以必须同时处理"已就绪"和"尚未就绪"两种情况。 */
export function initI18n(root = document) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyTranslations(root), { once: true });
  } else {
    applyTranslations(root);
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  window.addEventListener('bzm:langchange', () => applyTranslations(document));
  initI18n();
}

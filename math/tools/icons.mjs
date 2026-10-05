/* icons.mjs — 生成 PNG / ICO 图标：用无头 Chrome 把 SVG 渲染成 PNG，再打包成 ICO
   用法: node tools/icons.mjs  （需要本机有 Chrome 或 Edge） */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = process.cwd();
const tmp = ROOT + '/.shots/iconwork';
mkdirSync(tmp, { recursive: true });

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].find((p) => existsSync(p));
if (!chrome) { console.error('找不到 Chrome/Edge'); process.exit(2); }

const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

async function renderPng(svgPath, outPath, size) {
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}img{display:block;width:' +
    size + 'px;height:' + size + 'px}</style></head><body><img src="' + fileUrl(svgPath) + '"></body></html>';
  const htmlPath = tmp + '/render-' + size + '.html';
  writeFileSync(htmlPath, html);
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--default-background-color=00000000', '--window-size=' + size + ',' + size,
    '--virtual-time-budget=2500', '--screenshot=' + outPath, fileUrl(htmlPath)], { stdio: 'ignore' });
  await new Promise((res) => child.on('exit', res));
  return existsSync(outPath) && readFileSync(outPath).length > 200;
}

/* ICO 封装：内嵌 PNG（Windows Vista 及以上支持） */
function toIco(pngPath, outPath) {
  const png = readFileSync(pngPath);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0);
  entry.writeUInt8(0, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12);
  writeFileSync(outPath, Buffer.concat([header, entry, png]));
}

const abs = (p) => (p.startsWith('/') || /^[A-Za-z]:/.test(p) ? p : ROOT + '/' + p);
const jobs = [
  ['assets/icon.svg', 'assets/icon-192.png', 192],
  ['assets/icon.svg', 'assets/icon-512.png', 512],
  ['assets/icon.svg', 'assets/apple-touch-icon.png', 180],
  ['assets/favicon.svg', tmp + '/favicon-256.png', 256]
];
let icoSource = null;
for (const [svg, out, size] of jobs) {
  const ok = await renderPng(abs(svg), abs(out), size);
  if (ok && /favicon-256/.test(out)) icoSource = abs(out);
  console.log((ok ? 'ok   ' : 'FAIL ') + out + ' (' + size + 'px)');
  await sleep(150);
}
if (icoSource) { toIco(icoSource, ROOT + '/favicon.ico'); console.log('ok   favicon.ico'); }
else console.log('FAIL favicon.ico（缺少源 PNG）');
console.log('ok   favicon.ico');
rmSync(tmp, { recursive: true, force: true });
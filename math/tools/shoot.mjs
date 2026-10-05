/* shoot.mjs — 在页面里执行一段脚本后再截图（用于演示图/验收图）
   用法: node tools/shoot.mjs <url> <out.png> <waitMs> [preFile] */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const [url, outFile, waitArg, preFile] = process.argv.slice(2);
const waitMs = Number(waitArg || 3000);
const ROOT = process.cwd();
const PORT = 9700 + Math.floor(Math.random() * 250);
const profile = ROOT + '/.shots/shoot-' + PORT;
mkdirSync(profile, { recursive: true });

const browser = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find((p) => existsSync(p));
if (!browser) { console.error('找不到浏览器'); process.exit(2); }

const child = spawn(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });

/* 退出前清掉临时浏览器 profile，避免每次调试堆积十几 MB */
function cleanupProfile(dir) {
  if (!dir || !existsSync(dir)) return;
  /* Chrome 刚被 taskkill 时可能仍占用文件，做几次重试；还失败就交给 detached 进程稍后删 */
  for (let i = 0; i < 4; i++) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
    } catch { /* 继续重试 */ }
    if (!existsSync(dir)) return;
  }
  try {
    const cmd = "setTimeout(()=>{try{require('fs').rmSync(process.argv[1],{recursive:true,force:true})}catch(e){}},1500)";
    spawn(process.execPath, ['-e', cmd, dir], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* ignore */ }
}

function killTree(c) {
  try { if (c && c.pid) spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* ignore */ }
}

let ver = null;
for (let i = 0; i < 80; i++) {
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { ver = await r.json(); break; } } catch { /* retry */ }
  await sleep(250);
}
if (!ver) { console.error('DevTools 未就绪'); killTree(child); cleanupProfile(profile); process.exit(1); }

const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((res) => ws.addEventListener('open', res));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const d = JSON.parse(ev.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const i = ++id;
  const timer = setTimeout(() => { pending.delete(i); rej(new Error('timeout ' + method)); }, 15000);
  pending.set(i, (r) => { clearTimeout(timer); res(r); });
  ws.send(JSON.stringify(sessionId ? { id: i, method, params, sessionId } : { id: i, method, params }));
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url }, sessionId);
await sleep(waitMs);
if (preFile && existsSync(preFile)) {
  /* 预置脚本通常写 localStorage；写完必须重新加载页面才会生效 */
  await send('Runtime.evaluate', { expression: readFileSync(preFile, 'utf8'), returnByValue: true }, sessionId);
  await send('Page.navigate', { url }, sessionId);
  await sleep(1200);
}
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
console.log('wrote ' + outFile);
try { ws.close(); } catch { /* ignore */ }
killTree(child);
cleanupProfile(typeof profile !== 'undefined' ? profile : null);
setTimeout(() => process.exit(0), 400);
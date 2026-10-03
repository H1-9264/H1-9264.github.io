/* probe.mjs — 在无头浏览器中打开页面并执行一段表达式，打印结果（调试用）
   用法: node tools/probe.mjs <url> <file-with-js-expression> [waitMs] */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const url = process.argv[2];
const exprFile = process.argv[3];
const waitMs = Number(process.argv[4] || 3000);
const expr = exprFile ? readFileSync(exprFile, 'utf8') : 'document.title';



/* 结束浏览器进程树：只杀浏览器子进程，随后强制退出，避免管道挂住 */
function killTree(child) {
  try {
    const pid = child && child.pid;
    if (pid) {
      if (process.platform === 'win32') {
        const res = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
        void res;
      } else {
        try { process.kill(-pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    }
  } catch { /* ignore */ }
}

/* WATCHDOG: 任何情况下 60 秒后强制退出，避免挂住调用方 */
const WATCHDOG = setTimeout(() => {
  console.error('probe 超时（60s），强制退出');
  process.exit(3);
}, 60000);
WATCHDOG.unref?.();

const ROOT = process.cwd();
const PORT = 9500 + Math.floor(Math.random() * 400);
const browser = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find((p) => existsSync(p));
const profileDir = ROOT + '/.shots/probe-profile-' + PORT;
mkdirSync(profileDir, { recursive: true });
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profileDir, '--window-size=1440,900', '--no-first-run', 'about:blank'], { stdio: 'ignore' });

let ver = null;
for (let i = 0; i < 80; i++) {
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { ver = await r.json(); break; } } catch { /* retry */ }
  await sleep(250);
}
if (!ver) {
  console.error('DevTools 未就绪（端口 ' + PORT + '）');
  try { killTree(child); } catch { /* ignore */ }
  process.exit(1);
}

const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((res) => ws.addEventListener('open', res));
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (ev) => {
  const d = JSON.parse(ev.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
  else if (d.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
  else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('CONSOLE ERROR: ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const i = ++id;
  const timer = setTimeout(() => { pending.delete(i); rej(new Error('CDP send 超时: ' + method)); }, 15000);
  pending.set(i, (result) => { clearTimeout(timer); res(result); });
  ws.send(JSON.stringify(sessionId ? { id: i, method, params, sessionId } : { id: i, method, params }));
});

/* 复用浏览器启动时创建的 page target，避免 createTarget/attach 竞态导致的长时间挂起 */
let targetId = null;
for (let i = 0; i < 40 && !targetId; i++) {
  const list = await send('Target.getTargets');
  const page = (list.targetInfos || []).find((t) => t.type === 'page');
  if (page) targetId = page.targetId;
  else await sleep(250);
}
if (!targetId) { console.error('找不到可用的 page target'); killTree(child); process.exit(1); }
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url }, sessionId);
await sleep(waitMs);
let res;
try {
  res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
} catch (err) {
  console.error('EVAL 失败: ' + err.message);
  killTree(child);
  process.exit(2);
}
if (res.exceptionDetails) console.log('EVAL ERROR:', res.exceptionDetails.exception?.description || res.exceptionDetails.text);
else if (typeof res.result.value === 'string' && res.result.value.startsWith('data:image/png;base64,')) {
  const { writeFileSync } = await import('node:fs');
  const out = ROOT + '/.shots/dump.png';
  writeFileSync(out, Buffer.from(res.result.value.split(',')[1], 'base64'));
  console.log('wrote', out);
}
else console.log(typeof res.result.value === 'string' ? res.result.value : JSON.stringify(res.result.value, null, 2));
if (logs.length) console.log('\n--- page logs ---\n' + logs.join('\n'));
try { ws.close(); } catch { /* ignore */ }
killTree(child);
process.exit(0);
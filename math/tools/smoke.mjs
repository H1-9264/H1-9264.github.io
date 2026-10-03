/* smoke.mjs — 无头浏览器冒烟测试：加载页面、收集控制台错误/异常、可选截图
   用法: node tools/smoke.mjs [baseUrl] [--shots]
   依赖 Node 22+ 内置 WebSocket 与 fetch，无需安装任何依赖。 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8765';
const wantShots = process.argv.includes('--shots');
const PORT = 9333;



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

const ROOT = process.cwd();

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];
const browser = CANDIDATES.find((p) => existsSync(p));
if (!browser) {
  console.error('找不到 Chrome/Edge，无法运行冒烟测试');
  process.exit(2);
}

const profile = ROOT + '/.shots/profile';
mkdirSync(profile, { recursive: true });

const child = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--mute-audio', '--disable-extensions',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });

const extra = process.argv.filter((a) => a.startsWith('--page=')).map((a) => a.slice(7));
const PAGES = extra.length
  ? extra.map((p) => ({ path: p, name: p.replace(/[^a-z0-9]+/gi, '_') }))
  : [
    { path: 'index.html', name: 'home' },
    { path: 'plotter.html', name: 'plotter' },
    { path: 'geometry.html', name: 'geometry' },
    { path: 'tools.html', name: 'tools' },
    { path: 'help.html', name: 'help' }
  ];

async function waitForDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      if (res.ok) return await res.json();
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('DevTools 端口未就绪');
}

let msgId = 0;
function makeClient(ws) {
  const pending = new Map();
  const events = [];
  const listeners = new Set();
  ws.addEventListener('message', (ev) => {
    const data = JSON.parse(ev.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    } else if (data.method) {
      events.push(data);
      listeners.forEach((fn) => fn(data));
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('timeout: ' + method)); }
    }, 30000);
  });
  return { send, events, on: (fn) => listeners.add(fn) };
}

function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', (e) => reject(new Error('ws error: ' + (e.message || 'unknown'))));
  });
}

const results = [];
try {
  const version = await waitForDevtools();
  const ws = await open(version.webSocketDebuggerUrl);
  const client = makeClient(ws);

  for (const page of PAGES) {
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    const logs = [];
    const off = (ev) => {
      if (ev.sessionId !== sessionId) return;
      if (ev.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(ev.params.type)) {
        logs.push({ kind: ev.params.type, text: ev.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ') });
      }
      if (ev.method === 'Runtime.exceptionThrown') {
        const d = ev.params.exceptionDetails;
        logs.push({ kind: 'exception', text: (d.exception && (d.exception.description || d.exception.value)) || d.text });
      }
      if (ev.method === 'Log.entryAdded' && ev.params.entry.level === 'error') {
        logs.push({ kind: 'log', text: ev.params.entry.text + ' ' + (ev.params.entry.url || '') });
      }
    };
    client.on(off);
    await client.send('Runtime.enable', {}, sessionId);
    await client.send('Log.enable', {}, sessionId);
    await client.send('Page.enable', {}, sessionId);
    await client.send('Page.navigate', { url: base + '/' + page.path }, sessionId);
    await sleep(2600);

    // 探测页面关键节点
    const probe = await client.send('Runtime.evaluate', {
      expression: `(() => {
        const q = (s) => !!document.querySelector(s);
        return JSON.stringify({
          title: document.title,
          nav: q('#site-nav .brand'),
          footer: q('#site-footer'),
          canvas: q('canvas'),
          canvasSize: (() => { const c = document.querySelector('canvas'); return c ? c.width + 'x' + c.height : null; })(),
          bodyText: document.body.innerText.slice(0, 120).replace(/\\s+/g, ' '),
          jsErrors: window.__bzmErrors ? window.__bzmErrors.length : 0
        });
      })()`,
      returnByValue: true
    }, sessionId);

    let shot = null;
    if (wantShots) {
      const res = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      const dir = ROOT + '/.shots';
      mkdirSync(dir, { recursive: true });
      const file = dir + '/' + page.name + '.png';
      writeFileSync(file, Buffer.from(res.data, 'base64'));
      shot = file;
    }
    results.push({ page: page.path, probe: JSON.parse(probe.result.value), logs, shot });
    await client.send('Target.closeTarget', { targetId });
    client.events.length = 0;
  }
  ws.close();
} catch (err) {
  console.error('SMOKE FAILED:', err.message);
} finally {
  killTree(child);
}

let bad = 0;
for (const r of results) {
  console.log('\n=== ' + r.page + ' ===');
  console.log('  title:', r.probe.title);
  console.log('  nav/footer/canvas:', r.probe.nav, r.probe.footer, r.probe.canvas, r.probe.canvasSize || '');
  console.log('  text:', r.probe.bodyText.slice(0, 90));
  if (r.shot) console.log('  shot:', r.shot);
  const errs = r.logs.filter((l) => l.kind !== 'warning');
  const warns = r.logs.filter((l) => l.kind === 'warning');
  if (errs.length) {
    bad += errs.length;
    console.log('  ERRORS:');
    errs.slice(0, 8).forEach((l) => console.log('   - [' + l.kind + '] ' + String(l.text).split('\n')[0].slice(0, 200)));
  } else {
    console.log('  errors: none');
  }
  if (warns.length) console.log('  warnings:', warns.length, String(warns[0].text).slice(0, 120));
}
console.log('\nTOTAL ERRORS: ' + bad);
process.exit(bad ? 1 : 0);
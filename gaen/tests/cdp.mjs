#!/usr/bin/env node
/**
 * Minimal zero-dependency Chrome DevTools Protocol driver for local acceptance tests.
 * Connects to an already-running headless Chrome (launched once outside this sandbox).
 *
 * Usage:
 *   node tests/cdp.mjs probe
 *   node tests/cdp.mjs shot <url> <outfile> [waitMs] [width] [height]
 *   node tests/cdp.mjs eval <url> <jsExpr> [waitMs]
 *   node tests/cdp.mjs wait <url> <outfile> [timeoutMs] [width] [height] [expr]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PORT = Number(process.env.CDP_PORT || 9334);
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;

async function getJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return await res.json();
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.listeners = new Map();
  }
  async connect() {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('CDP WebSocket timeout')), 8000);
      this.ws.addEventListener('open', () => { clearTimeout(t); resolve(); });
      this.ws.addEventListener('error', () => { clearTimeout(t); reject(new Error('CDP WebSocket error')); });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
          else p.resolve(msg.result);
        }
      } else {
        this.events.push(msg);
        const list = this.listeners.get(msg.method);
        if (list) for (const fn of list) fn(msg.params);
      }
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method}: timeout`));
        }
      }, 180000);
    });
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
  close() { try { this.ws.close(); } catch {} }
}

async function createPage(width = 1440, height = 900, scale = 1) {
  const target = await getJSON(`${BASE}/json/new?about:blank`, { method: 'PUT' });
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();
  const logs = [];
  const errors = [];
  cdp.on('Runtime.consoleAPICalled', (p) => {
    const text = p.args.map(a => a.value ?? a.description ?? a.type).join(' ');
    logs.push({ type: p.type, text });
  });
  cdp.on('Runtime.exceptionThrown', (p) => {
    errors.push({ type: 'exception', text: p.exceptionDetails?.text, detail: p.exceptionDetails?.exception?.description });
  });
  cdp.on('Log.entryAdded', (p) => {
    logs.push({ type: p.entry.level, text: p.entry.text, source: p.entry.source });
  });
  cdp.on('Page.javascriptDialogOpening', async () => {
    await cdp.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  return { cdp, logs, errors, targetId: target.id, width, height };
}

async function goto(cdp, url) {
  await cdp.send('Page.navigate', { url });
}

async function evalJS(cdp, expression, awaitPromise = true) {
  const res = await cdp.send('Runtime.evaluate', {
    expression, awaitPromise, returnByValue: true, userGesture: true,
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  }
  return res.result?.value;
}

async function waitFor(cdp, expression, timeoutMs = 60000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await evalJS(cdp, expression);
      if (last) return last;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`waitFor timeout after ${timeoutMs}ms; last=${JSON.stringify(last)}`);
}

async function screenshot(cdp, file, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await new Promise(r => setTimeout(r, 500));
  const res = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
}

function filterLogs(logs, errors) {
  const relevantLogs = logs.filter(l => l.type === 'error' || l.type === 'warning' || /gargantua|webgl|shader|three|render/i.test(String(l.text)));
  return { relevantLogs, errors };
}

async function closePage(targetId) {
  try { await fetch(`${BASE}/json/close/${targetId}`); } catch {}
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'probe') {
    console.log(JSON.stringify(await getJSON(`${BASE}/json/version`), null, 2));
    return;
  }
  if (cmd === 'tabs') {
    const tabs = await getJSON(`${BASE}/json/list`);
    console.log(JSON.stringify(tabs.map(t => ({ id: t.id, url: t.url })), null, 2));
    return;
  }

  const isWait = cmd === 'wait';
  const isSmoke = cmd === 'smoke';
  if (!['shot', 'eval', 'smoke', 'wait'].includes(cmd)) {
    console.error('Unknown command. Use probe|tabs|shot|eval|smoke|wait.');
    process.exit(2);
  }

  const url = args[0];
  const outfile = isSmoke ? 'tests/out/smoke.png' : (isWait ? (args[1] || 'tests/out/waited.png') : (cmd === 'shot' ? args[1] : 'tests/out/eval.png'));
  const waitMs = Number(isSmoke ? (args[1] || 8000) : (isWait ? 0 : (cmd === 'shot' ? (args[2] || 4000) : (args[2] || 3000))));
  const timeoutMs = isWait ? Number(args[2] || 180000) : 0;
  const width = Number(isSmoke ? (args[2] || 1440) : (isWait ? (args[3] || 1440) : (cmd === 'shot' ? (args[3] || 1440) : 1440)));
  const height = Number(isSmoke ? (args[3] || 900) : (isWait ? (args[4] || 900) : (cmd === 'shot' ? (args[4] || 900) : 900)));
  const expr = isWait ? (args[5] || 'window.__GARGANTUA_READY__ === true') : null;

  const { cdp, logs, errors, targetId } = await createPage(width, height, 1);
  try {
    await goto(cdp, url);
    let result;
    if (isWait) {
      result = await waitFor(cdp, expr, timeoutMs);
      await new Promise(r => setTimeout(r, 700));
      result = await evalJS(cdp, `(async()=>{
        const base = {
          ready: window.__GARGANTUA_READY__ === true,
          error: window.__GARGANTUA_ERROR__ || null,
          title: document.title,
          bodyClass: document.body.className,
          bootHidden: getComputedStyle(document.querySelector('#boot')).visibility === 'hidden' || getComputedStyle(document.querySelector('#boot')).display === 'none',
          fatalVisible: document.querySelector('#fatal')?.classList.contains('is-open') || false,
          fatalTitle: document.querySelector('#fatal-title')?.textContent || '',
          canvas: (()=>{const c=document.querySelector('canvas'); if(!c) return null; const gl=c.getContext('webgl2'); return {w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight, ctx: gl ? gl.getParameter(gl.VERSION) : 'none'};})(),
          state: window.GARGANTUA ? window.GARGANTUA.getState() : null,
          diagnostics: window.GARGANTUA ? window.GARGANTUA.getDiagnostics() : null,
          errors: window.__GARGANTUA_ERRORS__ || [],
        };
        return base;
      })()`);
    } else if (cmd === 'eval') {
      await new Promise(r => setTimeout(r, waitMs));
      result = await evalJS(cdp, args[1]);
    } else if (isSmoke) {
      await new Promise(r => setTimeout(r, waitMs));
      result = await evalJS(cdp, `(async()=>({
        ready: window.__GARGANTUA_READY__ === true,
        error: window.__GARGANTUA_ERROR__ || null,
        title: document.title,
        bodyClass: document.body.className,
        fatalVisible: document.querySelector('#fatal')?.classList.contains('is-open') || false,
        fatalTitle: document.querySelector('#fatal-title')?.textContent || '',
        bootHidden: getComputedStyle(document.querySelector('#boot')).visibility === 'hidden' || getComputedStyle(document.querySelector('#boot')).display === 'none',
        canvas: (()=>{const c=document.querySelector('canvas'); if(!c) return null; const gl=c.getContext('webgl2'); return {w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight,ctx: gl?gl.getParameter(gl.VERSION):'none'};})(),
        state: window.GARGANTUA ? window.GARGANTUA.getState() : null,
        diagnostics: window.GARGANTUA ? window.GARGANTUA.getDiagnostics() : null,
        errors: window.__GARGANTUA_ERRORS__ || [],
      }))()`);
    } else {
      await new Promise(r => setTimeout(r, waitMs));
    }

    await screenshot(cdp, outfile, width, height);
    const filtered = filterLogs(logs, errors);
    const summary = {
      cmd, url, outfile, waitedMs: waitMs, width, height,
      consoleLogs: filtered.relevantLogs,
      pageErrors: filtered.errors,
      result,
    };
    fs.mkdirSync('tests/out', { recursive: true });
    const diagFile = `tests/out/${path.basename(outfile, '.png')}.json`;
    fs.writeFileSync(diagFile, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    cdp.close();
    await closePage(targetId);
  }
}

let exitCode = 0;
main().catch(e => { console.error(e.stack || e); exitCode = 1; }).finally(() => {
  process.exit(exitCode);
});

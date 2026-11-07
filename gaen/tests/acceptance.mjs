#!/usr/bin/env node
/**
 * GARGANTUA — browser acceptance suite (zero dependencies).
 * Connects to the persistent headless Chrome already listening on CDP_PORT.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PORT = Number(process.env.CDP_PORT || 9334);
const BASE = `http://127.0.0.1:${PORT}`;
const SITE = process.env.GARGANTUA_URL || 'http://127.0.0.1:4173/';
const OUT = 'tests/out/acceptance';
fs.mkdirSync(OUT, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  site: SITE,
  browser: null,
  cases: [],
  console: [],
  pageErrors: [],
  summary: { passed: 0, failed: 0, skipped: 0 },
};

const results = [];
let currentCase = null;

function recordCase(name, status, detail, artifacts = []) {
  const entry = { name, status, detail, artifacts, at: new Date().toISOString() };
  results.push(entry);
  if (status === 'passed') report.summary.passed++;
  else if (status === 'failed') report.summary.failed++;
  else report.summary.skipped++;
  const glyph = status === 'passed' ? 'PASS' : status === 'failed' ? 'FAIL' : 'SKIP';
  console.log(`[${glyph}] ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
}

async function runCase(name, fn) {
  currentCase = name;
  try {
    const detail = await fn();
    recordCase(name, 'passed', detail || 'ok');
  } catch (error) {
    recordCase(name, 'failed', error?.stack ? String(error.stack).split('\n').slice(0, 3).join(' | ') : String(error));
  } finally {
    currentCase = null;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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
    this.listeners = new Map();
  }
  async connect() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WS connection timeout')), 8000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); });
      this.ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WS error')); });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id) {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(`${pending.method}: ${msg.error.message}`));
        else pending.resolve(msg.result);
      } else {
        const listeners = this.listeners.get(msg.method);
        if (listeners) listeners.forEach((fn) => fn(msg.params));
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

class PageSession {
  constructor({ width = 1440, height = 900, dpr = 1, mobile = false } = {}) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.mobile = mobile;
    this.logs = [];
    this.errors = [];
    this.consoleErrors = [];
  }

  async open() {
    const target = await getJSON(`${BASE}/json/new?about:blank`, { method: 'PUT' });
    this.targetId = target.id;
    this.cdp = new CDP(target.webSocketDebuggerUrl);
    await this.cdp.connect();
    this.cdp.on('Runtime.consoleAPICalled', (params) => {
      const text = params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
      const type = params.type;
      this.logs.push({ type, text });
      if (type === 'error') {
        this.consoleErrors.push(text);
        report.console.push({ case: currentCase, type, text });
      }
    });
    this.cdp.on('Runtime.exceptionThrown', (params) => {
      const error = {
        text: params.exceptionDetails?.text,
        detail: params.exceptionDetails?.exception?.description,
      };
      this.errors.push(error);
      report.pageErrors.push({ case: currentCase, ...error });
    });
    this.cdp.on('Log.entryAdded', (params) => {
      if (params.entry.level === 'error') {
        this.consoleErrors.push(params.entry.text);
        report.console.push({ case: currentCase, type: 'error', text: params.entry.text, source: params.entry.source });
      }
    });
    await this.cdp.send('Page.enable');
    await this.cdp.send('Runtime.enable');
    await this.cdp.send('Log.enable');
    await this.cdp.send('Network.enable');
    await this.cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await this.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: this.width,
      height: this.height,
      deviceScaleFactor: this.dpr,
      mobile: this.mobile,
    });
    if (this.mobile) {
      await this.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }
    return this;
  }

  async goto(url) {
    await this.cdp.send('Page.navigate', { url });
  }

  async eval(expression, awaitPromise = true) {
    const res = await this.cdp.send('Runtime.evaluate', {
      expression, awaitPromise, returnByValue: true, userGesture: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'evaluation error');
    }
    return res.result?.value;
  }

  async waitFor(expression, timeoutMs = 180000, intervalMs = 250) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeoutMs) {
      try {
        last = await this.eval(expression);
        if (last) return last;
      } catch (error) {
        last = String(error.message || error);
      }
      await sleep(intervalMs);
    }
    throw new Error(`waitFor timeout (${timeoutMs}ms); last=${JSON.stringify(last)}`);
  }

  async waitReady(timeoutMs = 180000) {
    await this.waitFor('window.__GARGANTUA_READY__ === true || !!window.__GARGANTUA_ERROR__ || document.querySelector("#fatal")?.classList.contains("is-open")', timeoutMs);
    await sleep(1150);
    const diagnostics = await this.eval('window.GARGANTUA ? GARGANTUA.getDiagnostics() : null');
    if (diagnostics?.error || diagnostics?.bootFailed || diagnostics?.fatalActive) {
      throw new Error(`renderer not ready: ${JSON.stringify(diagnostics)}`);
    }
    return diagnostics;
  }

  async screenshot(name) {
    const file = path.join(OUT, name);
    const res = await this.cdp.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
    });
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
    return file;
  }

  async key(key, code, vk) {
    const params = {
      key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
    };
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
    await sleep(120);
  }

  async clickSelector(selector) {
    const ok = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`Selector not found: ${selector}`);
    await sleep(160);
  }

  async drag(fromX, fromY, toX, toY, steps = 8) {
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: fromX, y: fromY, button: 'none', buttons: 0,
    });
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: fromX, y: fromY, button: 'left', buttons: 1, clickCount: 1,
    });
    for (let i = 1; i <= steps; i++) {
      const x = fromX + (toX - fromX) * (i / steps);
      const y = fromY + (toY - fromY) * (i / steps);
      await this.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x, y, button: 'left', buttons: 1,
      });
      await sleep(35);
    }
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: toX, y: toY, button: 'left', buttons: 0, clickCount: 1,
    });
    await sleep(350);
  }

  async close() {
    this.cdp?.close();
    try { await fetch(`${BASE}/json/close/${this.targetId}`); } catch {}
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function testDesktop() {
  const session = await new PageSession({ width: 1440, height: 900, dpr: 1, mobile: false }).open();
  try {
    const url = `${SITE}?quality=standard&scale=0.2&time=17&cinematic=1&ui=1&paused=0&fresh=1`;
    await session.goto(url);
    await runCase('desktop: boots without fatal / console errors', async () => {
      const diagnostics = await session.waitReady(180000);
      assert(diagnostics.runtimeErrors.length === 0, `runtime errors: ${JSON.stringify(diagnostics.runtimeErrors)}`);
      assert(session.consoleErrors.length === 0, `console errors: ${session.consoleErrors.join(' | ')}`);
      assert(session.errors.length === 0, `page errors: ${JSON.stringify(session.errors)}`);
      const baseline = await session.eval(`({
        title: document.title,
        brand: document.querySelector('.brand__word')?.textContent,
        viewButtons: document.querySelectorAll('.view-btn').length,
        qualityButtons: document.querySelectorAll('[data-quality-choice]').length,
        debugChips: document.querySelectorAll('.debug-chip').length,
        params: document.querySelectorAll('#parameter-panel input[type=range]').length,
        canvas: (()=>{const c=document.querySelector('canvas'); return {w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight};})(),
        bootHidden: getComputedStyle(document.querySelector('#boot')).visibility === 'hidden',
        bodyClass: document.body.className,
        state: GARGANTUA.getState()
      })`);
      assert(baseline.title.includes('GARGANTUA'), 'missing document title');
      assert(baseline.brand === 'GARGANTUA', 'brand missing');
      assert(baseline.viewButtons === 4, `view buttons: ${baseline.viewButtons}`);
      assert(baseline.qualityButtons === 3, `quality buttons: ${baseline.qualityButtons}`);
      assert(baseline.debugChips === 10, `debug chips: ${baseline.debugChips}`);
      assert(baseline.params === 21, `parameter count: ${baseline.params}`);
      assert(baseline.canvas.w > 0 && baseline.canvas.h > 0, 'canvas has no drawing buffer');
      assert(baseline.bootHidden, 'boot overlay not hidden');
      assert(baseline.state.cinematic === true, 'cinematic did not engage by default');
      return baseline;
    });

    await runCase('desktop: cinematic camera is moving', async () => {
      const a = await session.eval('GARGANTUA.getState().camera.position');
      await sleep(1200);
      const b = await session.eval('GARGANTUA.getState().camera.position');
      const dist = Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
      assert(dist > 1e-3, `camera did not move: ${JSON.stringify({a, b, dist})}`);
      return { delta: Number(dist.toFixed(4)) };
    });

    await runCase('desktop: screenshot API returns a PNG data URL', async () => {
      const result = await session.eval(`(async()=>{
        const data = await GARGANTUA.capture();
        return { prefix: data.slice(0, 32), length: data.length, png: data.startsWith('data:image/png;base64,') };
      })()`);
      assert(result.png && result.length > 10000, `bad capture ${JSON.stringify(result)}`);
      return { bytesApprox: Math.round(result.length * 0.75) };
    });

    await runCase('desktop: pause/resume + UI hide/restore shortcuts', async () => {
      await session.key('p', 'KeyP', 80);
      let state = await session.eval('GARGANTUA.getState()');
      assert(state.paused === true, 'P did not pause');
      await session.key('p', 'KeyP', 80);
      state = await session.eval('GARGANTUA.getState()');
      assert(state.paused === false, 'P did not resume');
      await session.key('h', 'KeyH', 72);
      let uiState = await session.eval('document.body.dataset.ui');
      assert(uiState === 'off', `H did not hide UI (${uiState})`);
      await session.key('h', 'KeyH', 72);
      uiState = await session.eval('document.body.dataset.ui');
      assert(uiState === 'on', `H did not restore UI (${uiState})`);
      return 'P/H verified';
    });

    await runCase('desktop: all four view presets via UI', async () => {
      await session.eval('GARGANTUA.set({ paused: true, cinematic: false })');
      for (let i = 0; i < 4; i++) {
        await session.clickSelector(`.view-btn[data-preset="${i}"]`);
        const state = await session.eval('GARGANTUA.getState()');
        assert(state.preset === i, `preset click ${i} did not activate (${state.preset})`);
        assert(state.cinematic === false, `preset click ${i} left cinematic on`);
      }
      const active = await session.eval(`Array.from(document.querySelectorAll('.view-btn')).map(b=>({i:b.dataset.preset, active:b.classList.contains('is-active'), pressed:b.getAttribute('aria-pressed')}))`);
      assert(active.filter((x) => x.active).length === 1, `active presets: ${JSON.stringify(active)}`);
      return active;
    });

    await runCase('desktop: keyboard presets Q/W/E/R and V cycle', async () => {
      await session.key('q', 'KeyQ', 81);
      assert((await session.eval('GARGANTUA.getState().preset')) === 0, 'Q failed');
      await session.key('e', 'KeyE', 69);
      assert((await session.eval('GARGANTUA.getState().preset')) === 2, 'E failed');
      await session.key('v', 'KeyV', 86);
      assert((await session.eval('GARGANTUA.getState().preset')) === 3, 'V cycle failed');
      return 'Q/E/V verified';
    });

    await runCase('desktop: all ten debug views (0-9) apply', async () => {
      await session.eval('GARGANTUA.set({ paused: true, cinematic: false })');
      const seen = [];
      const hashes = [];
      for (let i = 0; i <= 9; i++) {
        await session.key(String(i), `Digit${i}`, 48 + i);
        const state = await session.eval(`(async()=>{
          const debug = GARGANTUA.getState().debug;
          const strip = document.querySelector('#debug-strip').classList.contains('is-active');
          const code = document.querySelector('#debug-code').textContent;
          const name = document.querySelector('#debug-name').textContent;
          const data = await GARGANTUA.capture();
          let h = 2166136261 >>> 0;
          for (let i = 0; i < data.length; i += 7) { h ^= data.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
          return { debug, strip, code, name, length: data.length, hash: h.toString(16) };
        })()`);
        assert(state.debug === i, `debug ${i} not set (${state.debug})`);
        assert(state.strip === (i !== 0), `debug strip state wrong for ${i}`);
        assert(state.length > 2000, `debug ${i} rendered an empty canvas (${state.length} bytes b64)`);
        seen.push(`${state.code}:${state.name}:${state.length}:${state.hash}`);
        hashes.push(state.hash);
      }
      assert(new Set(hashes).size >= 8, `diagnostic views lack distinct output: ${hashes.join(',')}`);
      return seen;
    });

    await runCase('desktop: 21-parameter panel, live slider input, tabs', async () => {
      await session.clickSelector('#panel-toggle');
      const opened = await session.eval(`({
        expanded: document.querySelector('#panel-toggle').getAttribute('aria-expanded'),
        open: document.querySelector('#parameter-panel').classList.contains('is-open'),
        sliders: document.querySelectorAll('#parameter-panel input[type=range]').length,
        tabs: document.querySelectorAll('.panel-tab').length
      })`);
      assert(opened.expanded === 'true' && opened.open, 'panel did not open');
      assert(opened.sliders === 21, `slider count ${opened.sliders}`);
      assert(opened.tabs === 4, `tab count ${opened.tabs}`);
      await session.eval(`(() => {
        const input = document.querySelector('#param-exposure');
        input.value = '1.23';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      await sleep(250);
      const state = await session.eval(`({
        value: GARGANTUA.getState().params.exposure,
        readout: document.querySelector('[data-value="exposure"]').textContent,
        note: document.querySelector('.panel-foot__note').textContent
      })`);
      assert(Math.abs(state.value - 1.23) < 1e-6, `exposure did not update: ${state.value}`);
      assert(state.readout === '1.23', `readout ${state.readout}`);
      for (const group of ['optics', 'spacetime', 'disk', 'sky']) {
        await session.eval(`document.querySelector('.panel-tab[data-group="${group}"]').click()`);
        await sleep(50);
      }
      await session.screenshot('desktop-panel.png');
      await session.clickSelector('#panel-close');
      return opened;
    });

    await runCase('desktop: quality tiers update engine profile', async () => {
      const profiles = [];
      const expected = { standard: 230, high: 310, cinematic: 520 };
      for (const q of ['standard', 'high', 'cinematic']) {
        await session.eval(`document.querySelector('[data-quality-choice="${q}"]').click()`);
        await sleep(250);
        const state = await session.eval(`({
          quality: GARGANTUA.getState().quality,
          maxSteps: GARGANTUA.getDiagnostics().render?.maxSteps || null,
          active: document.querySelector('[data-quality-choice="${q}"]').classList.contains('is-active')
        })`);
        assert(state.quality === q, `quality ${q} not applied`);
        assert(state.maxSteps === expected[q], `quality ${q} maxSteps ${state.maxSteps} != ${expected[q]}`);
        assert(state.active, `quality button ${q} not active`);
        profiles.push(state);
      }
      await session.eval('GARGANTUA.setQuality("standard")');
      return profiles;
    });

    await runCase('desktop: manual OrbitControls drag after camera grab', async () => {
      await session.eval('GARGANTUA.set({ paused: true, cinematic: false, preset: 0 })');
      await sleep(400);
      const before = await session.eval('GARGANTUA.getState().camera.position');
      await session.drag(720, 500, 840, 570, 9);
      const after = await session.eval('GARGANTUA.getState().camera.position');
      const movement = Math.hypot(after[0]-before[0], after[1]-before[1], after[2]-before[2]);
      assert(movement > 0.05, `OrbitControls drag did not move camera (${movement})`);
      const controls = await session.eval('GARGANTUA.getDiagnostics().controls');
      assert(controls.enabled === true, 'controls not enabled after drag');
      return { movement: Number(movement.toFixed(4)), controls };
    });

    await runCase('desktop: URL overrides + state persistence', async () => {
      const before = await session.eval('GARGANTUA.getState()');
      await session.eval('GARGANTUA.set({ params: { exposure: 1.11 }, debug: 4, paused: true })');
      await sleep(400);
      const storage = await session.eval(`(() => {
        const raw = localStorage.getItem('gargantua:state:v1');
        return raw ? JSON.parse(raw) : null;
      })()`);
      assert(storage && Math.abs(storage.params.exposure - 1.11) < 1e-6, `state not persisted: ${JSON.stringify(storage)}`);
      return { exposureBefore: before.params.exposure, persisted: storage.params.exposure };
    });

    await runCase('desktop: state persists across reload', async () => {
      await session.goto(`${SITE}?quality=standard&scale=0.2&ui=1&paused=1`);
      await session.waitReady(180000);
      const st = await session.eval('GARGANTUA.getState()');
      assert(Math.abs(st.params.exposure - 1.11) < 1e-6, `exposure was not restored: ${st.params.exposure}`);
      assert(st.debug === 4, `debug view was not restored: ${st.debug}`);
      await session.screenshot('desktop-persistence.png');
      return { exposure: st.params.exposure, debug: st.debug, camera: st.camera.position };
    });

    await runCase('desktop: simulation time changes the disk', async () => {
      await session.eval('GARGANTUA.set({ paused: true, cinematic: false, preset: 0, time: 20 })');
      const result = await session.eval(`(async()=>{
        const hash = (s) => { let h=2166136261>>>0; for (let i=0;i<s.length;i+=9){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0;} return h.toString(16); };
        const a = await GARGANTUA.capture();
        GARGANTUA.setTime(41.75);
        const b = await GARGANTUA.capture();
        return { a: hash(a), b: hash(b), changed: a !== b, aLen: a.length, bLen: b.length };
      })()`);
      assert(result.changed && result.a !== result.b, `disk time produced identical frames: ${JSON.stringify(result)}`);
      return result;
    });

    await runCase('desktop: share link API builds a deep link', async () => {
      const link = await session.eval('GARGANTUA.getShareLink()');
      assert(link && link.includes('quality=') && link.includes('time=') && link.includes('cinematic='), `bad share link: ${link}`);
      assert(link.includes('p='), 'parameter state not encoded in share link');
      return link.slice(0, 180);
    });

    await runCase('desktop: WebGL context loss auto-restores', async () => {
      await session.eval('GARGANTUA.set({ paused: true })');
      const lost = await session.eval('GARGANTUA.debug.loseContext()');
      assert(lost === true, 'could not request context loss');
      await session.waitFor(`document.querySelector('#fatal').classList.contains('is-open')`, 8000);
      await session.waitFor(`!document.querySelector('#fatal').classList.contains('is-open') && !GARGANTUA.getDiagnostics().render?.contextLost`, 30000);
      await sleep(900);
      const capture = await session.eval(`(async()=>{ const d=await GARGANTUA.capture(); return { length:d.length, png:d.startsWith('data:image/png') }; })()`);
      const diagnostics = await session.eval('GARGANTUA.getDiagnostics()');
      assert(capture.png && capture.length > 5000, `post-restore capture failed: ${JSON.stringify(capture)}`);
      assert(diagnostics.render.contextLosses >= 1, `context loss not counted: ${JSON.stringify(diagnostics.render)}`);
      assert(diagnostics.render.restoreAttempts >= 1, 'no restore attempt recorded');
      assert(diagnostics.render.contextLost === false, 'context still lost');
      assert(diagnostics.fatalActive === false, 'fatal overlay remained active');
      return { losses: diagnostics.render.contextLosses, restoreAttempts: diagnostics.render.restoreAttempts, captureBytes: Math.round(capture.length*0.75) };
    });

    await runCase('desktop: final diagnostics clean', async () => {
      const diagnostics = await session.eval('GARGANTUA.getDiagnostics()');
      assert(diagnostics.runtimeErrors.length === 0, `runtime errors: ${JSON.stringify(diagnostics.runtimeErrors)}`);
      assert(session.consoleErrors.length === 0, `console errors: ${session.consoleErrors.join(' | ')}`);
      assert(session.errors.length === 0, `page errors: ${JSON.stringify(session.errors)}`);
      await session.screenshot('desktop-final.png');
      return {
        fps: diagnostics.fps,
        render: diagnostics.render,
        console: session.consoleErrors.length,
        pageErrors: session.errors.length,
        runtimeErrors: diagnostics.runtimeErrors.length,
      };
    });
  } finally {
    await session.close();
  }
}

async function testMobile() {
  const session = await new PageSession({ width: 390, height: 844, dpr: 2, mobile: true }).open();
  try {
    const url = `${SITE}?shot=1&ui=1&quality=standard&preset=0&time=22&cinematic=0&paused=1`;
    await session.goto(url);
    await runCase('mobile: retina layout boots and fits viewport', async () => {
      const diagnostics = await session.waitReady(180000);
      const metrics = await session.eval(`({
        innerWidth: innerWidth,
        innerHeight: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.getBoundingClientRect().width,
        canvas: (()=>{const c=document.querySelector('canvas'); return {w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight};})(),
        topbar: (()=>{const r=document.querySelector('.topbar').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};})(),
        deck: (()=>{const r=document.querySelector('.deck').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};})(),
        viewButtons: document.querySelectorAll('.view-btn').length,
        qualityButtons: document.querySelectorAll('[data-quality-choice]').length,
        sliders: document.querySelectorAll('#parameter-panel input[type=range]').length,
        overflow: document.documentElement.scrollWidth - innerWidth
      })`);
      assert(metrics.overflow <= 1, `horizontal overflow ${metrics.overflow}`);
      assert(metrics.canvas.w > metrics.canvas.cw || metrics.canvas.w === Math.round(metrics.canvas.cw * diagnostics.render.scale), 'retina buffer not sized');
      assert(metrics.canvas.h > 0, 'canvas missing');
      assert(metrics.viewButtons === 4, 'view buttons missing');
      assert(metrics.qualityButtons === 3, 'quality controls missing');
      assert(metrics.sliders === 21, 'parameters missing');
      await session.screenshot('mobile-default.png');
      return metrics;
    });

    await runCase('mobile: parameter sheet fits and closes', async () => {
      await session.clickSelector('#panel-toggle');
      const panel = await session.eval(`(() => {
        const r = document.querySelector('#parameter-panel').getBoundingClientRect();
        return { top:r.top,left:r.left,right:r.right,bottom:r.bottom,iw:innerWidth,ih:innerHeight,
          open:document.querySelector('#parameter-panel').classList.contains('is-open'),
          scrollable:document.querySelector('.panel-body').scrollHeight > document.querySelector('.panel-body').clientHeight };
      })()`);
      assert(panel.open, 'mobile panel did not open');
      assert(panel.left >= -1 && panel.right <= panel.iw + 1, `panel horizontally outside viewport ${JSON.stringify(panel)}`);
      assert(panel.top >= -1 && panel.bottom <= panel.ih + 1, `panel vertically outside viewport ${JSON.stringify(panel)}`);
      await session.screenshot('mobile-panel.png');
      await session.clickSelector('#panel-close');
      assert(!(await session.eval(`document.querySelector('#parameter-panel').classList.contains('is-open')`)), 'mobile panel did not close');
      return panel;
    });

    await runCase('mobile: touch/pointer OrbitControls still available', async () => {
      await session.drag(195, 420, 250, 470, 6);
      const controls = await session.eval('GARGANTUA.getDiagnostics().controls');
      assert(controls.enabled === true, 'controls disabled on mobile');
      return controls;
    });
  } finally {
    await session.close();
  }
}

async function testScreenshotUrl() {
  const session = await new PageSession({ width: 1024, height: 640, dpr: 1, mobile: false }).open();
  try {
    const url = `${SITE}?shot=1&ui=0&quality=high&preset=edge&debug=0&time=31.5&cinematic=0&paused=1&scale=0.35`;
    await session.goto(url);
    await runCase('automation: deterministic shot URL, hidden UI, exact camera/time', async () => {
      const diagnostics = await session.waitReady(180000);
      const state = await session.eval(`({ state:GARGANTUA.getState(), ui:document.body.dataset.ui, bootHidden:getComputedStyle(document.querySelector('#boot')).display==='none'||getComputedStyle(document.querySelector('#boot')).visibility==='hidden' })`);
      assert(state.state.paused === true, 'shot mode not paused');
      assert(state.state.cinematic === false, 'shot mode cinematic not disabled');
      assert(Math.abs(state.state.time - 31.5) < 0.05, `time override failed: ${state.state.time}`);
      assert(state.state.preset === 1, `preset URL failed: ${state.state.preset}`);
      assert(state.ui === 'off', 'UI not hidden in shot mode');
      assert(state.bootHidden, 'boot overlay visible');
      await session.screenshot('automation-edge.png');
      return { time: state.state.time, preset: state.state.preset, quality: state.state.quality, diagnostics: { width: diagnostics.render.width, height: diagnostics.render.height } };
    });

    await runCase('automation: debug URL deep link', async () => {
      await session.eval('GARGANTUA.set({ paused: true })');
      const result = await session.eval(`(async()=>{
        const data = await GARGANTUA.capture();
        return { debug: GARGANTUA.getState().debug, bytes: data.length };
      })()`);
      assert(result.bytes > 10000, 'capture empty');
      return result;
    });
  } finally {
    await session.close();
  }
}

async function testDesktopScreenshotOnly() {
  const session = await new PageSession({ width: 1440, height: 900, dpr: 1, mobile: false }).open();
  try {
    await session.goto(`${SITE}?shot=1&ui=1&quality=standard&preset=0&time=22&cinematic=0&paused=1&scale=0.62`);
    await runCase('desktop: UI visual plate ready', async () => {
      await session.waitReady(180000);
      await session.screenshot('desktop-ui.png');
      return 'captured desktop-ui.png';
    });
  } finally {
    await session.close();
  }
}

async function main() {
  report.browser = await getJSON(`${BASE}/json/version`);
  console.log(`GARGANTUA acceptance against ${SITE}`);
  await testDesktop();
  await testDesktopScreenshotOnly();
  await testMobile();
  await testScreenshotUrl();

  report.cases = results;
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const md = [
    `# GARGANTUA acceptance report`,
    '',
    `- Site: ${SITE}`,
    `- Browser: ${report.browser?.Browser || 'unknown'}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Cases: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped`,
    `- Console errors: ${report.console.length}`,
    `- Page errors: ${report.pageErrors.length}`,
    '',
    '| Status | Case | Detail |',
    '| --- | --- | --- |',
    ...report.cases.map((c) => `| ${c.status} | ${c.name.replaceAll('|', '/')} | ${String(typeof c.detail === 'string' ? c.detail : JSON.stringify(c.detail)).replaceAll('|', '/').replace(/\n/g, ' ').slice(0, 260)} |`),
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'report.md'), md);
  console.log(`\nSUMMARY: ${report.summary.passed} passed / ${report.summary.failed} failed; console errors ${report.console.length}; page errors ${report.pageErrors.length}`);
  await sleep(350);
  process.exit(report.summary.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error.stack || error);
  report.cases = results;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  process.exit(1);
});

/* home.js — 首页：Hero 动态曲线、迷你演示图、主题快捷卡片 */
import { $, $$, el, clamp, debounce } from '../core/dom.js';
import { t, getLang } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import { initChrome, initReveal, settingsPanel, toast } from '../core/ui.js';
import { tryCompile, FUNCTIONS } from '../plot/expr.js';
import { PlotEngine } from '../plot/engine.js';

/* ---------------- Hero 动态曲线 ---------------- */
function heroAnimation() {
  const canvas = $('#heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const stage = canvas.parentElement;
  let W = 0, H = 0, dpr = 1;
  let time = 0;
  let raf = 0;
  let fps = 60, lastT = performance.now(), frames = 0;
  const pointer = { x: 0.5, y: 0.5, active: false };
  const motion = theme.motionOn();

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = Math.max(120, rect.width);
    H = Math.max(120, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const curves = [
    { color: () => theme.tokens()['--accent'], f: (x, time) => Math.sin(x + time * 0.9) * Math.exp(-(x * x) / 18) * 1.5, width: 2.6 },
    { color: () => theme.tokens()['--accent-2'], f: (x, time) => Math.cos(2 * x - time * 1.4) * 0.55 + Math.sin(x * 0.5 + time * 0.4) * 0.25, width: 1.8 },
    { color: () => theme.tokens()['--accent-3'], f: (x, time) => Math.sin(3 * x + time * 1.1) * 0.18 + Math.cos(x * 2.2 - time) * 0.2, width: 1.3 }
  ];

  const draw = (now) => {
    raf = requestAnimationFrame(draw);
    frames++;
    if (now - lastT > 500) {
      fps = Math.round((frames * 1000) / (now - lastT));
      frames = 0;
      lastT = now;
      const badge = $('#heroFps');
      if (badge) badge.textContent = fps + ' fps';
    }
    time = motion ? now / 1000 : 1.2;
    const tokens = theme.tokens();
    const bg = tokens['--canvas-bg'] || '#080a13';
    const grid = tokens['--grid-minor'] || 'rgba(255,255,255,0.055)';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 网格
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = 34;
    for (let x = 0; x < W; x += step) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
    for (let y = 0; y < H; y += step) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
    ctx.stroke();

    // 坐标轴
    const y0 = H * 0.55;
    ctx.strokeStyle = tokens['--axis'] || 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y0); ctx.lineTo(W, y0);
    ctx.moveTo(W * 0.5, 0); ctx.lineTo(W * 0.5, H);
    ctx.stroke();

    // 鼠标涟漪
    if (pointer.active) {
      const px = pointer.x * W, py = pointer.y * H;
      const g = ctx.createRadialGradient(px, py, 0, px, py, 160);
      g.addColorStop(0, theme.withAlpha(theme.toHex(tokens['--accent'], '#3fb950'), 0.16));
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(px - 160, py - 160, 320, 320);
    }

    // 曲线
    for (const c of curves) {
      const color = theme.toHex(c.color(), '#3fb950');
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = c.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (theme.getKey('glow')) {
        ctx.shadowColor = theme.withAlpha(color, 0.75);
        ctx.shadowBlur = 14;
      }
      ctx.beginPath();
      const N = Math.max(200, Math.floor(W / 1.4));
      for (let i = 0; i <= N; i++) {
        const px = (i / N) * W;
        const x = ((i / N) - 0.5) * 12;
        let y = c.f(x, time);
        if (pointer.active) {
          const influence = Math.exp(-Math.pow((i / N - pointer.x) * 9, 2));
          y += influence * (pointer.y - 0.55) * 1.6;
        }
        const py = y0 - y * (H * 0.16);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 顶部光晕
    const gg = ctx.createLinearGradient(0, 0, W, H);
    gg.addColorStop(0, theme.withAlpha(theme.toHex(tokens['--accent'], '#3fb950'), 0.10));
    gg.addColorStop(0.6, 'transparent');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, W, H);
  };

  stage.addEventListener('pointermove', (e) => {
    const rect = stage.getBoundingClientRect();
    pointer.x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    pointer.y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    pointer.active = true;
  });
  stage.addEventListener('pointerleave', () => { pointer.active = false; });

  resize();
  window.addEventListener('resize', debounce(resize, 150));
  window.addEventListener('bzm:modechange', resize);
  if (motion) raf = requestAnimationFrame(draw);
  else draw(performance.now());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (motion) raf = requestAnimationFrame(draw);
  });
}

/* ---------------- 迷你演示图（用绘图引擎绘制） ---------------- */
function miniDemos() {
  const specs = {
    waves: { src: 'sin(x)+sin(2x)/2+sin(3x)/3', view: [-7, 7, -2, 2] },
    damped: { src: 'e^(-x/4)*sin(3x)', view: [0, 12, -1.1, 1.1] },
    rose: { polar: '3cos(4t)', view: [-3.4, 3.4, -3.4, 3.4] },
    gauss: { src: 'e^(-x^2/2)/sqrt(2pi)', view: [-4, 4, -0.05, 0.5] }
  };
  $$('canvas[data-demo]').forEach((canvas) => {
    const spec = specs[canvas.dataset.demo];
    if (!spec) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(80, rect.width), H = Math.max(60, rect.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const tokens = theme.tokens();
      const engine = new PlotEngine({
        xMin: spec.view[0], xMax: spec.view[1], yMin: spec.view[2], yMax: spec.view[3],
        showGrid: true, showMinorGrid: false, showAxes: true, showLabels: false,
        bg: tokens['--canvas-bg'] || '#080a13',
        gridMinor: tokens['--grid-minor'], gridMajor: tokens['--grid-major'],
        axis: tokens['--axis'], label: tokens['--axis-label'],
        glow: theme.getKey('glow'), samples: 900
      });
      engine.setSize(W, H, dpr);
      const res = tryCompile(spec.polar ? '3cos(4t)' : spec.src);
      if (res.error) return;
      let fn = { id: 'demo', kind: spec.polar ? 'polar' : 'cartesian', color: theme.toHex(tokens['--accent-2'] || '#d29922'), width: 1.8, source: spec.src || spec.polar, fn: (s) => res.fn(s) };
      if (spec.polar) {
        fn.sampleFn = (n) => {
          const pts = [];
          for (let i = 0; i <= n; i++) {
            const tt = (Math.PI * 2 * i) / n;
            const r = res.fn({ t: tt, theta: tt });
            pts.push({ x: r * Math.cos(tt), y: r * Math.sin(tt), ok: Number.isFinite(r) });
          }
          return pts;
        };
        fn.kind = 'parametric';
        fn.source = 'r=3cos(4t)';
      }
      engine.setFunctions([fn]);
      engine.render(ctx);
    };
    draw();
    window.addEventListener('resize', debounce(draw, 200));
    theme.subscribe(draw);
    window.addEventListener('bzm:modechange', draw);
  });
}

/* ---------------- 主题快捷卡片 ---------------- */
function presetCards() {
  const host = $('#homePresets');
  if (!host) return;
  const current = theme.getKey('preset');
  Object.entries(theme.PRESETS).forEach(([id, preset]) => {
    const c = preset.colors;
    const card = el('button', {
      type: 'button',
      class: 'preset-card' + (current === id ? ' active' : ''),
      onclick: () => {
        theme.usePreset(id);
        host.querySelectorAll('.preset-card').forEach((n) => n.classList.remove('active'));
        card.classList.add('active');
        toast(t('settings.theme') + ': ' + (preset.name[getLang()] || preset.name.en), { type: 'ok', timeout: 1600 });
      }
    }, [
      el('span', {
        class: 'preset-preview',
        style: {
          background: 'linear-gradient(135deg,' + c['--bg-2'] + ' 0 55%,' + c['--bg-0'] + ' 55% 100%)',
          borderColor: c['--accent']
        }
      }, [
        el('i', { style: { background: c['--accent'], position: 'absolute', left: '8px', bottom: '8px', width: '13px', height: '13px', borderRadius: '50%' } }),
        el('i', { style: { background: c['--accent-2'], position: 'absolute', right: '8px', top: '8px', width: '9px', height: '9px', borderRadius: '50%' } })
      ]),
      el('span', { class: 'text-xs', text: preset.name[getLang()] || preset.name.en })
    ]);
    host.appendChild(card);
  });
  $$('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      theme.set({ mode: btn.dataset.mode });
      $$('[data-mode]').forEach((b) => b.classList.toggle('btn-primary', b === btn));
    });
  });
}

/* ---------------- 启动 ---------------- */
function boot() {
  initChrome('home');
  const fnCount = $$('#statFn');
  if (fnCount.length) fnCount[0].textContent = Object.keys(FUNCTIONS).length + '+';
  heroAnimation();
  miniDemos();
  presetCards();
  $('#openSettings2')?.addEventListener('click', () => settingsPanel());
  $('#heroTheme')?.addEventListener('click', () => settingsPanel());
  initReveal();
}

boot();

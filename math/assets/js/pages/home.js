/* home.js — 首页：Hero 动态曲线、迷你演示图、主题快捷卡片 */
import { $, $$, el, clamp, debounce } from '../core/dom.js';
import { t, getLang } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import { initChrome, initReveal, settingsPanel, toast } from '../core/ui.js';
import { tryCompile, FUNCTIONS } from '../plot/expr.js';
import { PlotEngine } from '../plot/engine.js';

/* ---------------- Hero 动态曲线 ----------------
   设计要点：
   1) 显示范围完全固定（y 恒为 [-2.6, 2.6]），只有相位随时间变化，
      所以曲线不会"越长越高 / 越来越扁"，不会跳动变形；
   2) 鼠标只影响曲线的相位与亮度，不改变振幅，避免视觉上被拉伸；
   3) 尺寸变化时按比例重建，坐标系不变。 */
function heroAnimation() {
  const canvas = $('#heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const stage = canvas.parentElement;
  const Y_RANGE = 2.6;           // 固定坐标系，永不变化
  const X_RANGE = 6.5;
  let W = 0, H = 0, dpr = 1;
  let raf = 0;
  let fps = 60, lastT = performance.now(), frames = 0;
  const pointer = { phase: 0, glow: 0, target: 0, x: 0.5, y: 0.5, inside: false, lift: 0, liftTarget: 0 };
  const ripples = [];
  const motion = theme.motionOn();

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(120, Math.round(rect.width));
    H = Math.max(120, Math.round(rect.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const curves = [
    { pick: 'accent', width: 2.6, f: (x, t, lift) => Math.sin(x + t * 0.9) * Math.exp(-(x * x) / 18) * (1.5 + lift * 0.5) },
    { pick: 'accent-2', width: 1.8, f: (x, t, lift) => Math.cos(2 * x - t * 1.4) * (0.55 + lift * 0.12) + Math.sin(x * 0.5 + t * 0.4) * 0.25 },
    { pick: 'accent-3', width: 1.3, f: (x, t, lift) => Math.sin(3 * x + t * 1.1) * 0.18 + Math.cos(x * 2.2 - t) * (0.2 + lift * 0.06) }
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
    const time = motion ? now / 1000 : 1.2;
    const tokens = theme.tokens();
    const bg = tokens['--canvas-bg'] || '#0b0f14';
    const grid = tokens['--grid-minor'] || 'rgba(240,246,252,0.05)';

    pointer.phase += (pointer.target - pointer.phase) * 0.06;
    pointer.glow += ((pointer.target !== 0 ? 1 : 0) - pointer.glow) * 0.05;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 固定网格
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = 34;
    for (let x = 0; x < W; x += step) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
    for (let y = 0; y < H; y += step) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
    ctx.stroke();

    // 坐标轴（固定在几何中心，不随时间移动）
    const y0 = H * 0.5;
    const x0 = W * 0.5;
    ctx.strokeStyle = tokens['--axis'] || 'rgba(240,246,252,0.42)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y0); ctx.lineTo(W, y0);
    ctx.moveTo(x0, 0); ctx.lineTo(x0, H);
    ctx.stroke();

    // 指针光晕（跟随鼠标，纯装饰）
    pointer.lift += (pointer.liftTarget - pointer.lift) * 0.08;
    if (pointer.inside) {
      const px = pointer.x * W;
      const py = pointer.y * H;
      const g = ctx.createRadialGradient(px, py, 0, px, py, 170);
      g.addColorStop(0, theme.withAlpha(theme.toHex(tokens['--accent'], '#3fb950'), 0.16));
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(Math.max(0, px - 170), Math.max(0, py - 170), 340, 340);
    }

    // 点击涟漪
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.life += 0.022;
      if (rp.life >= 1) { ripples.splice(i, 1); continue; }
      const r = 8 + rp.life * 150;
      ctx.save();
      ctx.globalAlpha = (1 - rp.life) * 0.5;
      ctx.strokeStyle = theme.toHex(tokens['--accent-2'], '#d29922');
      ctx.lineWidth = 2 * (1 - rp.life) + 0.6;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 曲线：坐标系固定，仅相位随时间推进
    const pxPerUnit = H / (Y_RANGE * 2);
    for (const c of curves) {
      const color = theme.toHex(tokens['--' + c.pick] || tokens['--accent'], '#3fb950');
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = c.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (theme.getKey('glow')) {
        ctx.shadowColor = theme.withAlpha(color, 0.7);
        ctx.shadowBlur = 14;
      }
      ctx.beginPath();
      const N = Math.max(200, Math.floor(W / 1.4));
      for (let i = 0; i <= N; i++) {
        const px = (i / N) * W;
        const x = ((i / N) - 0.5) * (X_RANGE * 2);
        let y = 0;
        try { y = c.f(x, time + pointer.phase * 0.35, pointer.lift); } catch { y = 0; }
        if (!Number.isFinite(y)) y = 0;
        const py = y0 - y * pxPerUnit;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 十字准线 + 曲线上的取值点
    if (pointer.inside) {
      const px = pointer.x * W;
      const py = pointer.y * H;
      const worldX = (pointer.x - 0.5) * (X_RANGE * 2);
      let curveY = 0;
      try { curveY = curves[0].f(worldX, time + pointer.phase * 0.35, pointer.lift); } catch { curveY = 0; }
      const cy2 = y0 - (Number.isFinite(curveY) ? curveY : 0) * pxPerUnit;

      ctx.save();
      ctx.strokeStyle = theme.withAlpha(theme.toHex(tokens['--axis'], 'rgba(240,246,252,0.4)'), 0.5);
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, 0); ctx.lineTo(px, H);
      ctx.moveTo(0, py); ctx.lineTo(W, py);
      ctx.stroke();
      ctx.setLineDash([]);

      // 到曲线的竖线 + 取值点
      ctx.strokeStyle = theme.withAlpha(theme.toHex(tokens['--accent-2'], '#d29922'), 0.85);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, cy2);
      ctx.stroke();

      ctx.fillStyle = theme.toHex(tokens['--accent-2'], '#d29922');
      ctx.beginPath();
      ctx.arc(px, cy2, 4.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = theme.withAlpha(tokens['--canvas-bg'] || '#0b0f14', 0.9);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // 读数
      const chip = $('#heroReadout');
      if (chip) {
        const showY = c => (Number.isFinite(c) ? c.toFixed(3) : '—');
        chip.textContent = 'x ' + worldX.toFixed(2) + '   y ' + showY(curveY);
      }
    } else {
      const chip = $('#heroReadout');
      if (chip) chip.textContent = '移动鼠标试试 · move your cursor';
    }
  };

  const setPointer = (e) => {
    const rect = stage.getBoundingClientRect();
    pointer.x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    pointer.y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    pointer.target = clamp((pointer.x - 0.5) * 2, -1, 1);
    /* 竖向位置有界地改变主曲线振幅（最多 ±0.5），保证坐标系与比例稳定 */
    pointer.liftTarget = clamp((0.5 - pointer.y) * 1.2, -0.35, 0.35);
    pointer.inside = true;
  };
  stage.addEventListener('pointermove', setPointer);
  stage.addEventListener('pointerdown', (e) => {
    setPointer(e);
    const rect = stage.getBoundingClientRect();
    ripples.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, life: 0 });
    if (ripples.length > 6) ripples.shift();
  });
  stage.addEventListener('pointerleave', () => {
    pointer.target = 0;
    pointer.liftTarget = 0;
    pointer.inside = false;
  });
  stage.addEventListener('pointercancel', () => { pointer.inside = false; });

  resize();
  window.addEventListener('resize', debounce(resize, 150));
  window.addEventListener('bzm:modechange', resize);
  theme.subscribe(resize);
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
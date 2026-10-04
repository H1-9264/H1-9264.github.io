/* fourier.js — 傅里叶动画：用旋转圆的叠加画出方波 / 锯齿波 / 三角波
   数学：偶函数用余弦项、奇函数用正弦项；这里三种波形都是奇函数，只取正弦项。
     方波：  f(t) = Σ_{n odd} (4/π) · sin(n t)/n
     锯齿波：f(t) = Σ_{n≥1} (2/π) · (-1)^{n+1} · sin(n t)/n
     三角波：f(t) = Σ_{n odd} (8/π²) · (-1)^{(n-1)/2} · sin(n t)/n² */
import { el, fmt, clamp, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import { toast } from '../core/ui.js';

const WAVES = {
  square: {
    label: 'fourier.square',
    term: (n) => (n % 2 === 1 ? { a: (4 / Math.PI) / n, sign: 1, n } : null),
    formula: 'f(t) = 4/π · Σ sin(nt)/n   (n = 1,3,5…)'
  },
  sawtooth: {
    label: 'fourier.sawtooth',
    term: (n) => ({ a: (2 / Math.PI) / n, sign: n % 2 === 1 ? 1 : -1, n }),
    formula: 'f(t) = 2/π · Σ (−1)^(n+1) sin(nt)/n'
  },
  triangle: {
    label: 'fourier.triangle',
    term: (n) => (n % 2 === 1 ? { a: (8 / (Math.PI * Math.PI)) / (n * n), sign: (((n - 1) / 2) % 2 === 0 ? 1 : -1), n } : null),
    formula: 'f(t) = 8/π² · Σ (−1)^((n−1)/2) sin(nt)/n²   (n = 1,3,5…)'
  }
};

export function initFourier(host, lang = 'zh') {
  const state = { wave: 'square', harmonics: 9, speed: 1, circles: true, waveLine: true, playing: true, t: 0 };
  const chartWrap = el('div', { class: 'chart-card fourier-card' });
  const canvas = el('canvas');
  chartWrap.appendChild(canvas);
  const formulaOut = el('div', { class: 'deriv-code mono' });
  const effectiveOut = el('div', { class: 'stat-grid' });

  const waveSel = el('select', { class: 'select' }, Object.entries(WAVES).map(([k, w]) => el('option', { value: k, text: t(w.label) })));
  const harmonics = el('input', { type: 'range', min: '1', max: '40', step: '1', value: String(state.harmonics) });
  const harmonicsOut = el('span', { class: 'val mono', text: String(state.harmonics) });
  const speed = el('input', { type: 'range', min: '0.2', max: '3', step: '0.1', value: String(state.speed) });
  const speedOut = el('span', { class: 'val mono', text: state.speed.toFixed(1) + '×' });
  const circleCb = el('input', { type: 'checkbox', checked: true });
  const waveCb = el('input', { type: 'checkbox', checked: true });
  const playBtn = el('button', { class: 'btn btn-sm btn-primary', type: 'button', html: icon('pause', { size: 14 }) + t('tools.timer.pause') });
  const resetBtn = el('button', { class: 'btn btn-sm', type: 'button', html: icon('refresh', { size: 14 }) + t('fourier.reset') });

  let raf = 0, last = 0;

  const terms = () => {
    const list = [];
    const n = state.harmonics;
    for (let i = 1, count = 0; i < 400 && count < n; i++) {
      const term = WAVES[state.wave].term(i);
      if (term) { list.push(term); count++; }
    }
    return list;
  };

  const resize = () => {
    const rect = chartWrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(320, Math.round(rect.width));
    const H = Math.max(260, Math.round(rect.height));
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W, H };
  };

  const draw = () => {
    const { ctx, W, H } = resize();
    const tokens = theme.tokens();
    const bg = tokens['--canvas-bg'] || '#0b0f14';
    const gc = tokens['--grid-minor'] || 'rgba(240,246,252,0.05)';
    const ink = tokens['--text-2'] || '#8b949e';
    const accent = theme.toHex(tokens['--accent'], '#3fb950');
    const accent2 = theme.toHex(tokens['--accent-2'], '#d29922');
    const accent3 = theme.toHex(tokens['--accent-3'], '#2ea043');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 网格
    ctx.strokeStyle = gc;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x += 32) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
    for (let y = 0; y < H; y += 32) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
    ctx.stroke();

    const cy = H * 0.5;
    const scale = Math.min(H * 0.34, 150);
    const originX = Math.min(W * 0.3, 220);
    const waveX = originX + Math.max(120, W * 0.12);
    const waveW = Math.max(80, W - waveX - 24);
    const list = terms();
    const T = Math.PI * 2;

    // 坐标轴
    ctx.strokeStyle = tokens['--axis'] || 'rgba(240,246,252,0.42)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(W, cy);
    ctx.stroke();

    // 旋转圆叠加
    let px = originX, py = cy;
    if (state.circles) {
      list.forEach((term, idx) => {
        const r = term.a * scale;
        const ang = state.t * term.n * (term.sign || 1) - Math.PI / 2;
        const cx = px, cyy = py;
        ctx.save();
        ctx.strokeStyle = 'rgba(' + (idx % 2 ? '210,153,34' : '63,185,80') + ',0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cyy, Math.abs(r), 0, T);
        ctx.stroke();
        ctx.restore();
        px += Math.cos(ang) * r;
        py += Math.sin(ang) * r;
        ctx.save();
        ctx.strokeStyle = idx % 2 ? accent2 : accent;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cyy);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.restore();
      });
    } else {
      list.forEach((term) => {
        const ang = state.t * term.n * (term.sign || 1) - Math.PI / 2;
        py += Math.sin(ang) * term.a * scale;
      });
      px = originX;
    }

    // 从展开点连到波形
    ctx.save();
    ctx.strokeStyle = theme.withAlpha(accent2, 0.7);
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(waveX, py);
    ctx.stroke();
    ctx.restore();

    // 波形：解析值 + 部分和
    const evalPartial = (tt) => list.reduce((s, term) => s + term.sign * term.a * Math.sin(term.n * tt), 0);
    const evalExact = (tt) => {
      switch (state.wave) {
        case 'square': return Math.sin(tt) >= 0 ? 1 : -1;
        case 'sawtooth': return ((tt / Math.PI) % 2 + 2) % 2 - 1;
        case 'triangle': return (2 / Math.PI) * Math.asin(Math.sin(tt));
        default: return 0;
      }
    };
    const winW = T * 2;
    const xOf = (tt) => waveX + ((tt % winW) / winW) * waveW;
    const yOf = (v) => cy - v * scale;

    // 完整波形（淡色）
    ctx.save();
    ctx.strokeStyle = theme.withAlpha(ink, 0.55);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i <= 400; i++) {
      const tt = (i / 400) * winW;
      const X = xOf(tt), Y = yOf(evalExact(tt));
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    ctx.restore();

    // 部分和（已走过的部分实线，未走过的虚线）
    if (state.waveLine) {
      const trail = ((state.t % winW) + winW) % winW;
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= 600; i++) {
        const tt = (i / 600) * winW;
        if (tt > trail) break;
        const X = xOf(tt), Y = yOf(evalPartial(tt));
        if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = theme.withAlpha(accent3, 0.35);
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let st2 = false;
      for (let i = 0; i <= 600; i++) {
        const tt = (i / 600) * winW;
        if (tt <= trail) continue;
        const X = xOf(tt), Y = yOf(evalPartial(tt));
        if (!st2) { ctx.moveTo(X, Y); st2 = true; } else ctx.lineTo(X, Y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 当前点
    ctx.save();
    ctx.fillStyle = accent2;
    ctx.beginPath();
    ctx.arc(waveX, py, 4.5, 0, T);
    ctx.fill();
    ctx.strokeStyle = theme.withAlpha(ink, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, T);
    ctx.stroke();
    ctx.restore();

    // 数值
    const cur = ((state.t % winW) + winW) % winW;
    const partial = evalPartial(cur);
    const exact = evalExact(cur);
    effectiveOut.innerHTML = '';
    [
      [t('fourier.harmonics'), String(list.length)],
      ['Σ f(t)', fmt(partial, 4)],
      ['f(t)', fmt(exact, 4)],
      ['|误差|', fmt(Math.abs(partial - exact), 4)]
    ].forEach(([k, v]) => effectiveOut.appendChild(el('div', { class: 'stat-box' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v })])));
    void accent3;
  };

  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (state.playing) state.t += dt * state.speed * 1.1;
    draw();
  };

  const restart = () => {
    state.t = 0;
    if (!raf) raf = requestAnimationFrame(loop);
  };

  waveSel.addEventListener('change', () => { state.wave = waveSel.value; updateFormula(); restart(); });
  harmonics.addEventListener('input', () => {
    state.harmonics = Number(harmonics.value);
    harmonicsOut.textContent = String(state.harmonics);
    updateFormula();
  });
  speed.addEventListener('input', () => {
    state.speed = Number(speed.value);
    speedOut.textContent = state.speed.toFixed(1) + '×';
  });
  circleCb.addEventListener('change', () => { state.circles = circleCb.checked; });
  waveCb.addEventListener('change', () => { state.waveLine = waveCb.checked; });
  playBtn.addEventListener('click', () => {
    state.playing = !state.playing;
    playBtn.innerHTML = icon(state.playing ? 'pause' : 'play', { size: 14 }) + (state.playing ? t('tools.timer.pause') : t('tools.timer.resume'));
  });
  resetBtn.addEventListener('click', restart);

  function updateFormula() {
    const w = WAVES[state.wave];
    formulaOut.textContent = w.formula + '\n' + t('fourier.harmonics') + ': ' + terms().length +
      '   |   ' + t('fourier.wave') + ': ' + t(w.label) + '   |   ' + (lang === 'zh' ? '叠加越多越接近目标波形' : 'more harmonics → closer to the target');
  }

  host.appendChild(el('div', { class: 'tool-layout' }, [
    el('div', { class: 'col' }, [chartWrap, formulaOut]),
    el('div', { class: 'col' }, [
      el('div', { class: 'card card-pad col' }, [
        el('strong', { text: t('tools.fourier') }),
        el('div', { class: 'field' }, [el('label', { text: t('fourier.wave') }), waveSel]),
        el('div', { class: 'slider-row' }, [el('span', { class: 'label', text: t('fourier.harmonics') }), harmonicsOut, harmonics]),
        el('div', { class: 'slider-row' }, [el('span', { class: 'label', text: t('fourier.speed') }), speedOut, speed]),
        el('label', { class: 'checkbox' }, [circleCb, el('span', { text: t('fourier.showCircles') })]),
        el('label', { class: 'checkbox' }, [waveCb, el('span', { text: t('fourier.showWave') })]),
        el('div', { class: 'row-inline' }, [playBtn, resetBtn])
      ]),
      el('div', { class: 'card card-pad col' }, [el('strong', { text: t('fourier.formula') }), effectiveOut])
    ])
  ]));

  updateFormula();
  playBtn.innerHTML = icon('pause', { size: 14 }) + t('tools.timer.pause');
  const ro = new ResizeObserver(debounce(draw, 120));
  ro.observe(chartWrap);
  theme.subscribe(draw);
  raf = requestAnimationFrame(loop);
  void clamp; void toast;
}
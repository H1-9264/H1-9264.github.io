/* probability.js — 概率分布探索器
   支持：正态 / 二项 / 泊松 / 指数 / 均匀；连续分布画密度曲线，离散分布画概率柱，
   可调区间 [a, b] 并实时计算区间概率、期望、方差、众数、单侧概率与 68-95-99.7 区间。 */
import { el, fmt, clamp, debounce, downloadBlob } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as theme from '../core/theme.js';
import { toast } from '../core/ui.js';

/* ---------- 数学函数 ---------- */
const erf = (x) => {
  const s = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const tt = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * tt - 1.453152027) * tt + 1.421413741) * tt - 0.284496736) * tt + 0.254829592) * tt * Math.exp(-ax * ax);
  return s * y;
};
const normCdf = (x, mu, sigma) => 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
const logGamma = (z) => {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < g.length; i++) x += g[i] / (z + i + 1);
  const tt = z + g.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(tt) - tt + Math.log(x);
};
const logFact = (n) => logGamma(n + 1);
const binomPmf = (k, n, p) => {
  if (k < 0 || k > n) return 0;
  const lp = logFact(n) - logFact(k) - logFact(n - k) + k * Math.log(Math.max(p, 1e-300)) + (n - k) * Math.log(Math.max(1 - p, 1e-300));
  return Math.exp(lp);
};
const poisPmf = (k, lambda) => (k < 0 ? 0 : Math.exp(-lambda + k * Math.log(Math.max(lambda, 1e-300)) - logFact(k)));

const DISTS = {
  normal: {
    label: 'prob.normal', discrete: false,
    domain: (p) => [p.mu - 4.2 * p.sigma, p.mu + 4.2 * p.sigma],
    pdf: (x, p) => Math.exp(-((x - p.mu) ** 2) / (2 * p.sigma * p.sigma)) / (p.sigma * Math.sqrt(2 * Math.PI)),
    cdf: (x, p) => normCdf(x, p.mu, p.sigma),
    mean: (p) => p.mu, variance: (p) => p.sigma * p.sigma, mode: (p) => p.mu,
    params: () => ['mu', 'sigma'],
    formula: (p) => 'f(x) = 1/(σ√(2π)) · e^(−(x−μ)²/(2σ²))'
  },
  binomial: {
    label: 'prob.binomial', discrete: true,
    domain: (p) => [-0.5, p.n + 0.5],
    pmf: (k, p) => binomPmf(k, p.n, p.p),
    cdf: (x, p) => {
      let s = 0;
      for (let k = 0; k <= Math.floor(x); k++) s += binomPmf(k, p.n, p.p);
      return clamp(s, 0, 1);
    },
    mean: (p) => p.n * p.p, variance: (p) => p.n * p.p * (1 - p.p),
    mode: (p) => Math.floor((p.n + 1) * p.p),
    params: () => ['n', 'p'],
    formula: (p) => 'P(X=k) = C(n,k) p^k (1−p)^(n−k)'
  },
  poisson: {
    label: 'prob.poisson', discrete: true,
    domain: (p) => [-0.5, Math.max(6, p.lambda * 3 + 6)],
    pmf: (k, p) => poisPmf(k, p.lambda),
    cdf: (x, p) => {
      let s = 0;
      for (let k = 0; k <= Math.floor(x); k++) s += poisPmf(k, p.lambda);
      return clamp(s, 0, 1);
    },
    mean: (p) => p.lambda, variance: (p) => p.lambda, mode: (p) => Math.floor(p.lambda),
    params: () => ['lambda'],
    formula: (p) => 'P(X=k) = e^(−λ) λ^k / k!'
  },
  exponential: {
    label: 'prob.exponential', discrete: false,
    domain: (p) => [-0.15 * (4 / p.lambda), (4 / p.lambda) * 1.4],
    pdf: (x, p) => (x < 0 ? 0 : p.lambda * Math.exp(-p.lambda * x)),
    cdf: (x, p) => (x < 0 ? 0 : 1 - Math.exp(-p.lambda * x)),
    mean: (p) => 1 / p.lambda, variance: (p) => 1 / (p.lambda * p.lambda), mode: () => 0,
    params: () => ['lambda'],
    formula: (p) => 'f(x) = λ e^(−λx)  (x ≥ 0)'
  },
  uniform: {
    label: 'prob.uniform', discrete: false,
    domain: (p) => [p.lo - 0.25 * (p.hi - p.lo), p.hi + 0.25 * (p.hi - p.lo)],
    pdf: (x, p) => (x < p.lo || x > p.hi ? 0 : 1 / (p.hi - p.lo)),
    cdf: (x, p) => clamp((x - p.lo) / (p.hi - p.lo), 0, 1),
    mean: (p) => (p.lo + p.hi) / 2, variance: (p) => ((p.hi - p.lo) ** 2) / 12,
    mode: (p) => [p.lo, p.hi], twin: ['lo', 'hi'],
    params: () => ['lo', 'hi'],
    formula: (p) => 'f(x) = 1/(b−a)  (a ≤ x ≤ b)'
  }
};

export function initProbability(host, lang = 'zh') {
  const st = {
    kind: 'normal',
    mu: 0, sigma: 1,
    n: 20, p: 0.5,
    lambda: 3,
    lo: 0, hi: 1,
    a: -1, b: 1,
    compare: false, mu2: 1.5
  };
  const chartWrap = el('div', { class: 'chart-card prob-card' });
  const canvas = el('canvas');
  chartWrap.appendChild(canvas);
  const statsHost = el('div', { class: 'stat-grid' });
  const formulaHost = el('div', { class: 'deriv-code mono' });
  const paramHost = el('div', { class: 'col' });
  const kindSel = el('select', { class: 'select' }, Object.entries(DISTS).map(([k, v]) => el('option', { value: k, text: t(v.label) })));
  const aIn = el('input', { class: 'input input-sm mono', type: 'number', step: 'any', value: String(st.a), style: { width: '84px' } });
  const bIn = el('input', { class: 'input input-sm mono', type: 'number', step: 'any', value: String(st.b), style: { width: '84px' } });
  const compareCb = el('input', { type: 'checkbox' });

  const dist = () => DISTS[st.kind];
  const params = () => ({
    mu: st.mu, sigma: Math.max(1e-6, st.sigma), n: Math.max(1, Math.round(st.n)),
    p: clamp(st.p, 0, 1), lambda: Math.max(1e-6, st.lambda),
    lo: Math.min(st.lo, st.hi - 1e-9), hi: Math.max(st.hi, st.lo + 1e-9)
  });

  /* 参数控件 */
  const renderParams = () => {
    paramHost.innerHTML = '';
    const list = dist().params();
    const defs = {
      mu: { key: 'prob.mu', min: -10, max: 10, step: 0.1, val: () => st.mu },
      sigma: { key: 'prob.sigma', min: 0.1, max: 5, step: 0.05, val: () => st.sigma },
      n: { key: 'prob.n', min: 1, max: 120, step: 1, val: () => st.n },
      p: { key: 'prob.p', min: 0, max: 1, step: 0.01, val: () => st.p },
      lambda: { key: 'prob.lambda', min: 0.1, max: 20, step: 0.1, val: () => st.lambda },
      lo: { key: 'prob.a', min: -5, max: 5, step: 0.1, val: () => st.lo },
      hi: { key: 'prob.b', min: -4, max: 6, step: 0.1, val: () => st.hi }
    };
    list.forEach((name) => {
      const d = defs[name];
      const out = el('span', { class: 'val mono', text: fmt(d.val(), 3) });
      const inp = el('input', { type: 'range', min: String(d.min), max: String(d.max), step: String(d.step), value: String(d.val()) });
      inp.addEventListener('input', () => {
        st[name] = Number(inp.value);
        out.textContent = fmt(Number(inp.value), 3);
        draw();
      });
      paramHost.appendChild(el('div', { class: 'slider-row' }, [el('span', { class: 'label', text: t(d.key) }), out, inp]));
    });
    if (dist().twin) {
      const d2 = defs.hi, out2 = el('span', { class: 'val mono', text: fmt(st.hi, 3) });
      const inp2 = el('input', { type: 'range', min: String(d2.min), max: String(d2.max), step: String(d2.step), value: String(st.hi) });
      inp2.addEventListener('input', () => { st.hi = Math.max(st.lo + 0.1, Number(inp2.value)); out2.textContent = fmt(st.hi, 3); draw(); });
      paramHost.appendChild(el('div', { class: 'slider-row' }, [el('span', { class: 'label', text: t('prob.b') }), out2, inp2]));
    }
    if (st.kind === 'normal') {
      const out3 = el('span', { class: 'val mono', text: fmt(st.mu2, 2) });
      const inp3 = el('input', { type: 'range', min: '-10', max: '10', step: '0.1', value: String(st.mu2) });
      inp3.addEventListener('input', () => { st.mu2 = Number(inp3.value); out3.textContent = fmt(st.mu2, 2); draw(); });
      paramHost.appendChild(el('label', { class: 'checkbox' }, [compareCb, el('span', { text: t('prob.compare') })]));
      paramHost.appendChild(el('div', { class: 'slider-row' }, [el('span', { class: 'label', text: 'μ₂' }), out3, inp3]));
    }
  };

  /* 区间概率：优先解析式积分（连续），否则数值/求和 */
  const intervalProb = (lo, hi, P, d) => {
    if (d.discrete) {
      let s = 0;
      for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) s += d.pmf(k, P);
      return clamp(s, 0, 1);
    }
    return clamp(d.cdf(hi, P) - d.cdf(lo, P), 0, 1);
  };

  const draw = () => {
    const d = dist();
    const P = params();
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

    const tokens = theme.tokens();
    const bg = tokens['--canvas-bg'] || '#0b0f14';
    const grid = tokens['--grid-minor'] || 'rgba(240,246,252,0.05)';
    const axis = tokens['--axis'] || 'rgba(240,246,252,0.4)';
    const label = tokens['--axis-label'] || '#8b949e';
    const ink = tokens['--text-1'] || '#b6c2cd';
    const accent = theme.toHex(tokens['--accent'] || '#3fb950');
    const accent2 = theme.toHex(tokens['--accent-2'] || '#d29922');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const [x0, x1] = d.domain(P);
    const pad = { l: 46, r: 18, t: 18, b: 34 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const X = (x) => pad.l + ((x - x0) / (x1 - x0)) * plotW;
    const Y = (y) => pad.t + plotH - y * plotH;

    // 峰值：连续用扫描，离散用最大概率
    let peak = 0;
    if (d.discrete) {
      for (let k = Math.ceil(x0); k <= Math.floor(x1); k++) peak = Math.max(peak, d.pmf(k, P));
    } else {
      for (let i = 0; i <= 400; i++) peak = Math.max(peak, d.pdf(x0 + ((x1 - x0) * i) / 400, P));
    }
    const yMax = peak * (d.discrete ? 1.18 : 1.15) || 1;
    const Yv = (y) => pad.t + plotH - (y / yMax) * plotH;

    // 网格
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) { const x = pad.l + (plotW * i) / 10; ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); }
    for (let i = 0; i <= 6; i++) { const y = pad.t + (plotH * i) / 6; ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); }
    ctx.stroke();

    // 坐标轴
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + plotH); ctx.lineTo(pad.l + plotW, pad.t + plotH);
    ctx.stroke();

    // x 轴刻度
    ctx.fillStyle = label;
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const stepX = (() => {
      const raw = (x1 - x0) / 8;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const n = raw / mag;
      return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
    })();
    for (let v = Math.ceil(x0 / stepX) * stepX; v <= x1; v += stepX) {
      ctx.fillText(fmt(v, 3), X(v), pad.t + plotH + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(yMax, 3), pad.l - 6, pad.t + 4);
    ctx.fillText('0', pad.l - 6, pad.t + plotH);
    ctx.save();
    ctx.translate(14, pad.t + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = label;
    ctx.fillText(d.discrete ? t('prob.pmf') : t('prob.pdf'), 0, 0);
    ctx.restore();

    // 区间阴影
    const a = Math.min(st.a, st.b), b = Math.max(st.a, st.b);
    ctx.save();
    ctx.fillStyle = theme.withAlpha(accent2, 0.28);
    if (d.discrete) {
      for (let k = Math.ceil(a); k <= Math.floor(b); k++) {
        if (k < x0 || k > x1) continue;
        const x = X(k), w = Math.max(2, plotW / Math.max(6, (x1 - x0)) * 0.62);
        const yTop = Yv(d.pmf(k, P));
        ctx.fillRect(x - w / 2, yTop, w, pad.t + plotH - yTop);
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(X(clamp(a, x0, x1)), pad.t + plotH);
      const N = 240;
      for (let i = 0; i <= N; i++) {
        const x = a + ((b - a) * i) / N;
        if (x < x0 || x > x1) continue;
        ctx.lineTo(X(x), Yv(d.pdf(x, P)));
      }
      ctx.lineTo(X(clamp(b, x0, x1)), pad.t + plotH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 分布曲线 / 概率柱
    if (d.discrete) {
      for (let k = Math.ceil(x0); k <= Math.floor(x1); k++) {
        const x = X(k), w = Math.max(2, (plotW / Math.max(6, (x1 - x0))) * 0.62);
        const yTop = Yv(d.pmf(k, P));
        ctx.fillStyle = theme.withAlpha(accent, 0.85);
        ctx.fillRect(x - w / 2, yTop, w, pad.t + plotH - yTop);
      }
    } else {
      ctx.save();
      const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + plotH);
      grad.addColorStop(0, theme.withAlpha(accent, 0.45));
      grad.addColorStop(1, theme.withAlpha(accent, 0.04));
      ctx.beginPath();
      ctx.moveTo(X(x0), pad.t + plotH);
      for (let i = 0; i <= 400; i++) {
        const x = x0 + ((x1 - x0) * i) / 400;
        ctx.lineTo(X(x), Yv(d.pdf(x, P)));
      }
      ctx.lineTo(X(x1), pad.t + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i <= 400; i++) {
        const x = x0 + ((x1 - x0) * i) / 400;
        const y = Yv(d.pdf(x, P));
        if (i === 0) ctx.moveTo(X(x), y); else ctx.lineTo(X(x), y);
      }
      ctx.stroke();
      ctx.restore();

      // 对比曲线
      if (st.kind === 'normal' && compareCb.checked) {
        const P2 = { ...P, mu: st.mu2 };
        ctx.save();
        ctx.strokeStyle = theme.withAlpha(accent2, 0.9);
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 400; i++) {
          const x = x0 + ((x1 - x0) * i) / 400;
          const y = Yv(d.pdf(x, P2));
          if (i === 0) ctx.moveTo(X(x), y); else ctx.lineTo(X(x), y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // 均值线 + 68-95-99.7 区间（仅连续正态）
    if (st.kind === 'normal') {
      const bands = [[1, 0.20], [2, 0.14], [3, 0.09]];
      ctx.save();
      bands.forEach(([k, alpha]) => {
        ctx.fillStyle = theme.withAlpha(accent, alpha * 0.5);
        const left = X(clamp(st.mu - k * st.sigma, x0, x1));
        const right = X(clamp(st.mu + k * st.sigma, x0, x1));
        ctx.fillRect(left, pad.t, right - left, plotH);
      });
      ctx.strokeStyle = theme.withAlpha(ink, 0.75);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(X(st.mu), pad.t);
      ctx.lineTo(X(st.mu), pad.t + plotH);
      ctx.stroke();
      ctx.restore();
    }

    // 区间端点
    ctx.save();
    ctx.strokeStyle = theme.withAlpha(accent2, 0.9);
    ctx.lineWidth = 1.4;
    [a, b].forEach((v) => {
      if (v < x0 || v > x1) return;
      ctx.beginPath();
      ctx.moveTo(X(v), pad.t);
      ctx.lineTo(X(v), pad.t + plotH);
      ctx.stroke();
    });
    ctx.restore();

    // 统计量
    const prob = intervalProb(a, b, P, d);
    const tail = clamp(1 - (d.discrete ? d.cdf(a - 1, P) : d.cdf(a, P)), 0, 1);
    const mean = d.mean(P);
    const variance = d.variance(P);
    const mode = d.mode(P);
    statsHost.innerHTML = '';
    const rows = [
      [t('prob.interval'), fmt(prob, 6)],
      [t('prob.tail'), fmt(tail, 6)],
      [t('prob.mean'), fmt(mean, 5)],
      [t('prob.variance'), fmt(variance, 5)],
      [t('prob.stdev'), fmt(Math.sqrt(Math.max(0, variance)), 5)],
      [t('prob.mode'), Array.isArray(mode) ? fmt(mode[0], 3) + ' ~ ' + fmt(mode[1], 3) : fmt(mode, 3)]
    ];
    if (st.kind === 'normal') {
      rows.push(['P(μ±σ)', fmt(normCdf(1, 0, 1) - normCdf(-1, 0, 1), 4)]);
      rows.push(['P(μ±2σ)', fmt(normCdf(2, 0, 1) - normCdf(-2, 0, 1), 4)]);
    }
    rows.forEach(([k, v]) => statsHost.appendChild(el('div', { class: 'stat-box' }, [
      el('div', { class: 'k', text: k }),
      el('div', { class: 'v', text: v })
    ])));

    formulaHost.textContent = d.formula(P) + '\n' +
      (d.discrete ? t('prob.pmf') : t('prob.pdf')) + ' · ' + t('prob.rule') + ': μ±σ ' +
      fmt(mean - Math.sqrt(variance), 3) + ' ~ ' + fmt(mean + Math.sqrt(variance), 3);
  };

  kindSel.addEventListener('change', () => {
    st.kind = kindSel.value;
    // 给一个合理的默认区间
    const P = params();
    const d = dist();
    const [x0, x1] = d.domain(P);
    if (st.kind === 'normal') { st.a = -1; st.b = 1; }
    else if (st.kind === 'binomial') { st.a = Math.round(P.n * P.p) - 2; st.b = Math.round(P.n * P.p) + 2; }
    else if (st.kind === 'poisson') { st.a = 0; st.b = Math.ceil(P.lambda) + 2; }
    else if (st.kind === 'exponential') { st.a = 0; st.b = 2 / P.lambda; }
    else { st.a = P.lo; st.b = P.hi; }
    aIn.value = String(Number(st.a.toPrecision(4)));
    bIn.value = String(Number(st.b.toPrecision(4)));
    void x0; void x1;
    renderParams();
    draw();
  });
  aIn.addEventListener('change', () => { st.a = Number(aIn.value); draw(); });
  bIn.addEventListener('change', () => { st.b = Number(bIn.value); draw(); });
  compareCb.addEventListener('change', draw);

  host.appendChild(el('div', { class: 'tool-layout' }, [
    el('div', { class: 'col' }, [
      chartWrap,
      el('div', { class: 'row-inline' }, [
        el('span', { class: 'label', text: t('prob.a') }), aIn,
        el('span', { class: 'label', text: t('prob.b') }), bIn,
        el('button', {
          class: 'btn btn-sm', type: 'button', html: icon('download', { size: 14 }) + ' PNG',
          onclick: () => {
            canvas.toBlob((blob) => {
              if (blob) { downloadBlob(blob, 'distribution.png'); toast(t('plot.saved'), { type: 'ok' }); }
            }, 'image/png');
          }
        })
      ]),
      formulaHost
    ]),
    el('div', { class: 'col' }, [
      el('div', { class: 'card card-pad col' }, [
        el('div', { class: 'field' }, [el('label', { text: t('prob.dist') }), kindSel]),
        paramHost
      ]),
      el('div', { class: 'card card-pad col' }, [el('strong', { text: t('tools.prob') }), statsHost])
    ])
  ]));

  renderParams();
  const ro = new ResizeObserver(debounce(draw, 120));
  ro.observe(chartWrap);
  theme.subscribe(draw);
  setTimeout(draw, 40);
  void lang;
}

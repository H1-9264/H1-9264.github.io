/* pomodoro.js — 番茄钟：环形进度、阶段循环、提示音、桌面通知 */
import { el, fmt, clamp, copyText } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { toast } from '../core/ui.js';
import * as store from '../core/storage.js';

const PHASES = [
  { id: 'work', key: 'tools.timer.work', color: 'var(--accent)' },
  { id: 'short', key: 'tools.timer.short', color: 'var(--accent-2)' },
  { id: 'long', key: 'tools.timer.long', color: 'var(--accent-3)' }
];

export function initPomodoro(host) {
  const cfg = Object.assign({ work: 25, short: 5, long: 15, rounds: 4, sound: true, notify: false }, store.load('pomodoroCfg', {}) || {});
  let phaseIndex = 0;
  let remaining = cfg.work * 60;
  let total = remaining;
  let running = false;
  let completed = 0;
  let timer = 0;

  const ring = el('div', { class: 'timer-ring' });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  const defs = document.createElementNS(svgNS, 'defs');
  defs.innerHTML = '<linearGradient id="timerGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/></linearGradient>';
  const track = document.createElementNS(svgNS, 'circle');
  track.setAttribute('class', 'track');
  track.setAttribute('cx', '60'); track.setAttribute('cy', '60'); track.setAttribute('r', '52'); track.setAttribute('stroke-width', '8');
  const prog = document.createElementNS(svgNS, 'circle');
  prog.setAttribute('class', 'prog');
  prog.setAttribute('cx', '60'); prog.setAttribute('cy', '60'); prog.setAttribute('r', '52'); prog.setAttribute('stroke-width', '8');
  const circumference = 2 * Math.PI * 52;
  prog.style.strokeDasharray = String(circumference);
  svg.appendChild(defs); svg.appendChild(track); svg.appendChild(prog);
  const timeText = el('div', { class: 'timer-time' }, [el('span', { text: '25:00' }), el('small', { text: t(PHASES[0].key) })]);
  ring.appendChild(svg);
  ring.appendChild(timeText);

  const phaseBtns = el('div', { class: 'segmented' });
  PHASES.forEach((p, i) => phaseBtns.appendChild(el('button', {
    type: 'button', text: t(p.key), class: i === 0 ? 'active' : '',
    onclick: () => { phaseIndex = i; reset(); }
  })));

  const startBtn = el('button', { class: 'btn btn-primary', type: 'button', html: icon('play', { size: 15 }), text: t('tools.timer.start') });
  const resetBtn = el('button', { class: 'btn', type: 'button', html: icon('refresh', { size: 15 }), text: t('tools.timer.reset') });
  const skipBtn = el('button', { class: 'btn', type: 'button', html: icon('chevronRight', { size: 15 }), text: t('tools.timer.skip') });

  const cfgHost = el('div', { class: 'col' });
  [['work', 'tools.timer.workMin', 1, 120], ['short', 'tools.timer.shortMin', 1, 60], ['long', 'tools.timer.longMin', 1, 60], ['rounds', 'tools.timer.rounds', 1, 12]].forEach(([key, labelKey, min, max]) => {
    const out = el('span', { class: 'val' , text: String(cfg[key]) });
    const input = el('input', { type: 'range', min: String(min), max: String(max), step: '1', value: String(cfg[key]) });
    input.addEventListener('input', () => {
      cfg[key] = Number(input.value);
      out.textContent = String(cfg[key]);
      store.save('pomodoroCfg', cfg);
      if (key === PHASES[phaseIndex].id && !running) reset();
    });
    cfgHost.appendChild(el('div', { class: 'slider-row' }, [el('span', { class: 'label', text: t(labelKey) }), out, input]));
  });
  const soundSwitch = el('label', { class: 'switch' }, [el('input', { type: 'checkbox', checked: cfg.sound }), el('span', { class: 'track' }), el('span', { text: t('tools.timer.sound') })]);
  const notifySwitch = el('label', { class: 'switch' }, [el('input', { type: 'checkbox', checked: cfg.notify }), el('span', { class: 'track' }), el('span', { text: t('tools.timer.notify') })]);
  soundSwitch.querySelector('input').addEventListener('change', (e) => { cfg.sound = e.target.checked; store.save('pomodoroCfg', cfg); });
  notifySwitch.querySelector('input').addEventListener('change', async (e) => {
    cfg.notify = e.target.checked;
    store.save('pomodoroCfg', cfg);
    if (cfg.notify && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
  });

  const autoBtn = el('button', { class: 'btn btn-sm', type: 'button', html: icon('copy', { size: 13 }) + ' ' + 'URL', onclick: async () => {
    await copyText(location.href.split('#')[0] + '#timer');
    toast(t('common.copied'), { type: 'ok', timeout: 1300 });
  } });
  void autoBtn;

  function currentPhase() { return PHASES[phaseIndex]; }
  function phaseDuration() { return cfg[currentPhase().id] * 60; }

  function reset() {
    running = false;
    total = phaseDuration();
    remaining = total;
    paint();
    startBtn.innerHTML = icon('play', { size: 15 }) + t('tools.timer.start');
  }

  function paint() {
    const pct = total > 0 ? clamp(remaining / total, 0, 1) : 0;
    prog.style.strokeDashoffset = String(circumference * (1 - pct));
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    timeText.firstChild.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    timeText.lastChild.textContent = t(currentPhase().key) + ' · ' + completed + '/' + cfg.rounds;
    Array.from(phaseBtns.children).forEach((b, i) => b.classList.toggle('active', i === phaseIndex));
    document.title = (running ? (String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ' · ') : '') + 'Buzhidao Math';
  }

  function beep() {
    if (!cfg.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const now = ac.currentTime;
      [880, 1320].forEach((f, i) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, now + i * 0.22);
        gain.gain.exponentialRampToValueAtTime(0.28, now + i * 0.22 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.22 + 0.35);
        osc.connect(gain).connect(ac.destination);
        osc.start(now + i * 0.22);
        osc.stop(now + i * 0.22 + 0.4);
      });
      setTimeout(() => ac.close(), 1600);
    } catch { /* ignore */ }
  }

  function notify(title, body) {
    if (!cfg.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, icon: 'assets/favicon.svg' }); } catch { /* ignore */ }
  }

  function finish() {
    beep();
    notify(t('app.name'), t('tools.timer.finished', { name: t(currentPhase().key) }));
    toast(t('tools.timer.done'), { type: 'ok', timeout: 4000 });
    if (currentPhase().id === 'work') {
      completed++;
      phaseIndex = completed % cfg.rounds === 0 ? 2 : 1;
    } else {
      phaseIndex = 0;
    }
    running = false;
    total = phaseDuration();
    remaining = total;
    startBtn.innerHTML = icon('play', { size: 15 }) + t('tools.timer.start');
    paint();
  }

  function tick() {
    remaining -= 1;
    if (remaining <= 0) { remaining = 0; paint(); finish(); return; }
    paint();
  }

  startBtn.addEventListener('click', () => {
    running = !running;
    if (running) {
      startBtn.innerHTML = icon('pause', { size: 15 }) + t('tools.timer.pause');
      clearInterval(timer);
      timer = setInterval(tick, 1000);
      if (cfg.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    } else {
      startBtn.innerHTML = icon('play', { size: 15 }) + t('tools.timer.resume');
      clearInterval(timer);
    }
    paint();
  });
  resetBtn.addEventListener('click', () => { clearInterval(timer); reset(); });
  skipBtn.addEventListener('click', () => { clearInterval(timer); finish(); });

  host.appendChild(el('div', { class: 'tool-layout' }, [
    el('div', { class: 'col center', style: { alignItems: 'center' } }, [
      ring,
      phaseBtns,
      el('div', { class: 'row-inline' }, [startBtn, resetBtn, skipBtn])
    ]),
    el('div', { class: 'col' }, [
      el('div', { class: 'card card-pad col' }, [el('strong', { text: t('tools.timer') }), cfgHost, soundSwitch, notifySwitch]),
      el('div', { class: 'card card-pad col' }, [
        el('p', { class: 'text-xs text-dim', text: '🍅 25/5/15 循环，可在左侧自定义时长；结束时会播放提示音并可发送桌面通知。' })
      ])
    ])
  ]));
  reset();
  paint();
  void fmt;
  void autoBtn;
}

/**
 * GARGANTUA — HUD, control matrix and shortcut ledger.
 */
import {
  PARAMETERS,
  PARAM_GROUPS,
  PRESETS,
  DEBUG_VIEWS,
  SHORTCUTS,
  QUALITY,
  formatParam,
} from './config.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const pad = (value, width = 2) => String(Math.floor(value)).padStart(width, '0');

export class GargantuaUI {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.state = {
      params: {},
      quality: 'high',
      preset: 0,
      debug: 0,
      cinematic: true,
      paused: false,
      music: false,
      uiVisible: true,
      time: 0,
    };
    this.bootHidden = false;
    this._toastTimer = 0;
    this._lastFocused = null;
    this._paramRows = new Map();
    this._paramTab = 'optics';

    this.el = {
      body: document.body,
      ui: $('#ui'),
      boot: $('#boot'),
      bootProgress: $('#boot-progress'),
      bootMessage: $('#boot-message'),
      bootPercent: $('#boot-percent'),
      fatal: $('#fatal'),
      fatalTitle: $('#fatal-title'),
      fatalDetail: $('#fatal-detail'),
      fatalMeta: $('#fatal-meta'),
      toast: $('#toast'),
      panel: $('#parameter-panel'),
      panelToggle: $('#panel-toggle'),
      panelClose: $('#panel-close'),
      panelScrim: $('#drawer-scrim'),
      panelTabs: $('#panel-tabs'),
      paramGroups: $('#param-groups'),
      qualityNote: $('#quality-note'),
      viewList: $('#view-list'),
      diagNext: $('#diag-next'),
      diagValue: $('#diag-value'),
      debugStrip: $('#debug-strip'),
      debugCode: $('#debug-code'),
      debugName: $('#debug-name'),
      debugDesc: $('#debug-desc'),
      debugReturn: $('#debug-return'),
      cinemaToggle: $('#cinema-toggle'),
      pauseToggle: $('#pause-toggle'),
      musicToggle: $('#music-toggle'),
      helpToggle: $('#help-toggle'),
      helpModal: $('#help-modal'),
      helpClose: $('#help-close'),
      shortcutList: $('#shortcut-list'),
      debugGrid: $('#debug-grid'),
      resetParams: $('#reset-params'),
      copyLink: $('#copy-link'),
      alt: $('#hud-alt'),
      inclination: $('#hud-incl'),
      resolution: $('#hud-res'),
      fps: $('#hud-fps'),
      steps: $('#hud-steps'),
      simTime: $('#sim-time'),
      timecode: $('#timecode'),
      timelineFill: $('#timeline-fill'),
      timelineHead: $('#timeline-head'),
      solverStatus: $('#solver-status'),
      utcClock: $('#utc-clock'),
      autoOrbitIndicator: $('#auto-orbit-indicator'),
      qualityButtons: $$('[data-quality-choice]'),
      fatalRetry: $('#fatal-retry'),
      fatalSafe: $('#fatal-safe'),
      fatalReload: $('#fatal-reload'),
    };

    this._buildViewPresets();
    this._buildParameterMatrix();
    this._buildShortcutLedger();
    this._buildDebugGrid();
    this._bindStaticEvents();
    this._startClock();
  }

  /* -----------------------------------------------------------------------
     Build
     ----------------------------------------------------------------------- */

  _buildViewPresets() {
    this.el.viewList.replaceChildren();
    for (const preset of PRESETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'view-btn';
      button.dataset.preset = String(preset.index);
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${preset.title} — ${preset.caption}`);
      const code = document.createElement('span');
      code.className = 'view-btn__code';
      code.textContent = preset.code;
      const label = document.createElement('span');
      label.className = 'view-btn__label';
      label.textContent = preset.label;
      const caption = document.createElement('span');
      caption.className = 'view-btn__caption';
      caption.textContent = preset.caption;
      button.append(code, label, caption);
      button.addEventListener('click', () => this.handlers.onPreset?.(preset.index));
      this.el.viewList.append(button);
    }
  }

  _buildParameterMatrix() {
    this.el.panelTabs.replaceChildren();
    this.el.paramGroups.replaceChildren();

    PARAM_GROUPS.forEach((group) => {
      const count = PARAMETERS.filter((p) => p.group === group.id).length;
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'panel-tab';
      tab.dataset.group = group.id;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', 'false');
      tab.setAttribute('aria-controls', `group-${group.id}`);
      tab.innerHTML = `${group.label}<span>${pad(count)} 项</span>`;
      tab.addEventListener('click', () => this._activateParamTab(group.id));
      this.el.panelTabs.append(tab);
    });

    PARAM_GROUPS.forEach((group) => {
      const section = document.createElement('section');
      section.className = 'param-group';
      section.id = `group-${group.id}`;
      section.dataset.group = group.id;
      section.setAttribute('role', 'tabpanel');

      const description = document.createElement('p');
      description.className = 'param-group__desc';
      description.textContent = group.description.toUpperCase();
      section.append(description);

      for (const param of PARAMETERS.filter((p) => p.group === group.id)) {
        const row = document.createElement('div');
        row.className = 'param-row';
        row.dataset.param = param.id;

        const head = document.createElement('div');
        head.className = 'param-row__head';

        const label = document.createElement('label');
        label.className = 'param-row__label';
        label.htmlFor = `param-${param.id}`;
        label.textContent = param.label;

        const value = document.createElement('span');
        value.className = 'param-row__value';
        const valueNumber = document.createElement('b');
        valueNumber.dataset.value = param.id;
        valueNumber.textContent = formatParam(param, param.value);
        value.append(valueNumber);
        if (param.unit) {
          const unit = document.createElement('span');
          unit.className = 'param-row__unit';
          unit.textContent = param.unit;
          value.append(unit);
        }

        head.append(label, value);

        const rangeWrap = document.createElement('div');
        rangeWrap.className = 'param-row__range';
        const input = document.createElement('input');
        input.type = 'range';
        input.id = `param-${param.id}`;
        input.min = String(param.min);
        input.max = String(param.max);
        input.step = String(param.step);
        input.value = String(param.value);
        input.setAttribute('aria-label', `${param.label}${param.unit ? `，单位 ${param.unit}` : ''}`);
        input.setAttribute('aria-describedby', `hint-${param.id}`);
        this._setRangeFill(input, param, param.value);
        input.addEventListener('input', () => {
          const parsed = Number(input.value);
          this._setRangeFill(input, param, parsed);
          const output = $(`[data-value="${param.id}"]`, this.el.paramGroups);
          if (output) output.textContent = formatParam(param, parsed);
          this.handlers.onParam?.(param.id, parsed);
        });
        rangeWrap.append(input);

        const hint = document.createElement('span');
        hint.className = 'param-row__hint';
        hint.id = `hint-${param.id}`;
        hint.textContent = param.hint;

        row.append(head, rangeWrap, hint);
        section.append(row);
        this._paramRows.set(param.id, { input, output: valueNumber, param });
      }

      this.el.paramGroups.append(section);
    });

    this._activateParamTab(this._paramTab);
  }

  _setRangeFill(input, param, value) {
    const fraction = Math.max(0, Math.min(1, (value - param.min) / Math.max(param.max - param.min, 1e-7)));
    input.style.setProperty('--fill', `${(fraction * 100).toFixed(2)}%`);
  }

  _buildShortcutLedger() {
    this.el.shortcutList.replaceChildren();
    for (const shortcut of SHORTCUTS) {
      const row = document.createElement('div');
      row.className = 'shortcut-row';
      const keys = document.createElement('div');
      keys.className = 'shortcut-row__keys';
      shortcut.keys.forEach((key) => {
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        keys.append(kbd);
      });
      const label = document.createElement('span');
      label.className = 'shortcut-row__label';
      label.textContent = shortcut.label;
      const note = document.createElement('span');
      note.className = 'shortcut-row__note';
      note.textContent = shortcut.note;
      row.append(keys, label, note);
      this.el.shortcutList.append(row);
    }
  }

  _buildDebugGrid() {
    this.el.debugGrid.replaceChildren();
    for (const view of DEBUG_VIEWS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'debug-chip';
      button.dataset.debugView = String(view.id);
      button.title = view.desc;
      const code = document.createElement('span');
      code.textContent = view.code;
      const label = document.createElement('b');
      label.textContent = view.label;
      button.append(code, label);
      button.addEventListener('click', () => this.handlers.onDebug?.(view.id));
      this.el.debugGrid.append(button);
    }
  }

  _bindStaticEvents() {
    this.el.qualityButtons.forEach((button) => {
      button.addEventListener('click', () => this.handlers.onQuality?.(button.dataset.qualityChoice));
    });

    this.el.panelToggle.addEventListener('click', () => {
      if (this.isPanelOpen()) this.closePanel();
      else this.openPanel();
    });
    this.el.panelClose.addEventListener('click', () => this.closePanel());
    this.el.panelScrim.addEventListener('click', () => this.closePanel());

    this.el.helpToggle.addEventListener('click', () => this.toggleHelp());
    this.el.helpClose.addEventListener('click', () => this.closeHelp());
    $$('[data-close-help]', this.el.helpModal).forEach((node) => {
      node.addEventListener('click', () => this.closeHelp());
    });

    this.el.viewList.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const buttons = $$('.view-btn', this.el.viewList);
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown'
        ? (index + 1 + buttons.length) % buttons.length
        : (index - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
    });

    this.el.diagNext.addEventListener('click', () => this.handlers.onCycleDebug?.());
    this.el.debugReturn.addEventListener('click', () => this.handlers.onDebug?.(0));

    this.el.cinemaToggle.addEventListener('click', () => this.handlers.onToggleCinema?.());
    this.el.pauseToggle.addEventListener('click', () => this.handlers.onTogglePause?.());
    this.el.musicToggle.addEventListener('click', () => this.handlers.onToggleMusic?.());
    this.el.resetParams.addEventListener('click', () => this.handlers.onResetParams?.());
    this.el.copyLink.addEventListener('click', () => this.handlers.onCopyLink?.());

    this.el.fatalRetry.addEventListener('click', () => this.handlers.onFatalRetry?.());
    this.el.fatalSafe.addEventListener('click', () => this.handlers.onFatalSafe?.());
    this.el.fatalReload.addEventListener('click', () => this.handlers.onFatalReload?.());

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (this.isHelpOpen()) {
        event.preventDefault();
        this.closeHelp();
      } else if (this.isPanelOpen()) {
        event.preventDefault();
        this.closePanel();
      }
    });
  }

  _startClock() {
    const update = () => {
      try {
        const now = new Date();
        this.el.utcClock.textContent = `${now.toISOString().slice(11, 19)} UTC`;
      } catch {
        this.el.utcClock.textContent = '— UTC';
      }
    };
    update();
    this._clockTimer = window.setInterval(update, 1000);
  }

  _activateParamTab(groupId) {
    if (!PARAM_GROUPS.some((g) => g.id === groupId)) return;
    this._paramTab = groupId;
    $$('.panel-tab', this.el.panelTabs).forEach((tab) => {
      const active = tab.dataset.group === groupId;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    $$('.param-group', this.el.paramGroups).forEach((section) => {
      section.classList.toggle('is-active', section.dataset.group === groupId);
    });
  }

  /* -----------------------------------------------------------------------
     State synchronization
     ----------------------------------------------------------------------- */

  setState(next) {
    this.state = { ...this.state, ...next };
    if (next.params) this.refreshParams(next.params);
    if (next.quality) this.setQuality(next.quality);
    if (Object.prototype.hasOwnProperty.call(next, 'preset')) this.setActivePreset(next.cinematic ? null : next.preset);
    if (Object.prototype.hasOwnProperty.call(next, 'debug')) this.setDebug(next.debug);
    if (Object.prototype.hasOwnProperty.call(next, 'cinematic')) this.setCinematic(next.cinematic);
    if (Object.prototype.hasOwnProperty.call(next, 'paused')) this.setPaused(next.paused);
    if (Object.prototype.hasOwnProperty.call(next, 'music')) this.setMusic(next.music);
    if (Object.prototype.hasOwnProperty.call(next, 'uiVisible')) this.setUiVisible(next.uiVisible);
    if (Object.prototype.hasOwnProperty.call(next, 'time')) {
      this.state.time = next.time;
      this._updateTimeline(next.time);
    }
  }

  refreshParams(params) {
    this.state.params = { ...params };
    for (const [id, entry] of this._paramRows.entries()) {
      const value = Number(params[id]);
      if (!Number.isFinite(value)) continue;
      const { param, input, output } = entry;
      if (input.value !== String(value)) input.value = String(value);
      this._setRangeFill(input, param, value);
      output.textContent = formatParam(param, value);
    }
  }

  setQuality(quality) {
    if (!QUALITY[quality]) return;
    this.state.quality = quality;
    this.el.qualityButtons.forEach((button) => {
      const active = button.dataset.qualityChoice === quality;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const meta = QUALITY[quality];
    if (this.el.qualityNote) {
      this.el.qualityNote.textContent = `${meta.label} · ${meta.note} · 最高 ${meta.maxSteps} 步`;
    }
  }

  setActivePreset(index) {
    this.state.preset = index;
    $$('.view-btn', this.el.viewList).forEach((button) => {
      const active = index != null && Number(button.dataset.preset) === Number(index);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  setDebug(mode) {
    const view = DEBUG_VIEWS.find((v) => v.id === Number(mode)) || DEBUG_VIEWS[0];
    this.state.debug = view.id;
    this.el.diagValue.textContent = view.code;
    this.el.debugCode.textContent = view.code;
    this.el.debugName.textContent = view.label;
    this.el.debugDesc.textContent = view.desc;
    this.el.debugStrip.classList.toggle('is-active', view.id !== 0);
    $$('.debug-chip', this.el.debugGrid).forEach((chip) => {
      chip.classList.toggle('is-active', Number(chip.dataset.debugView) === view.id);
    });
    if (view.id === 0) {
      // no other chrome needed
    }
  }

  setCinematic(enabled) {
    this.state.cinematic = !!enabled;
    this.el.cinemaToggle.setAttribute('aria-pressed', String(this.state.cinematic));
    this.el.autoOrbitIndicator.textContent = this.state.cinematic ? '开' : '关';
    this._updateSolverStatus();
  }

  setPaused(paused) {
    this.state.paused = !!paused;
    this.el.pauseToggle.setAttribute('aria-pressed', String(this.state.paused));
    const pauseLabel = this.el.pauseToggle.querySelector('span:last-child');
    if (pauseLabel) pauseLabel.textContent = this.state.paused ? '继续' : '暂停';
    this._updateSolverStatus();
  }

  setMusic(playing, available = true) {
    this.state.music = !!playing;
    this.el.musicToggle.classList.toggle('is-playing', this.state.music);
    this.el.musicToggle.setAttribute('aria-pressed', String(this.state.music));
    this.el.musicToggle.disabled = !available;
    this.el.musicToggle.style.opacity = available ? '' : '0.4';
    this.el.musicToggle.title = available ? '环境音乐（M）' : '环境音乐不可用';
  }

  setUiVisible(visible) {
    this.state.uiVisible = !!visible;
    this.el.body.dataset.ui = this.state.uiVisible ? 'on' : 'off';
    if (!this.state.uiVisible) {
      this.closePanel();
      this.closeHelp();
    }
  }

  _updateSolverStatus() {
    if (this.state.paused) {
      this.el.solverStatus.textContent = '积分器暂停';
    } else if (this.state.cinematic) {
      this.el.solverStatus.textContent = '电影环绕运行中';
    } else {
      this.el.solverStatus.textContent = '测地线求解器运行中';
    }
  }

  updateTelemetry(data = {}) {
    const { cameraRadius, inclination, fps, width, height, maxSteps, time = 0, paused, cinematic } = data;
    if (Number.isFinite(cameraRadius)) {
      this.el.alt.innerHTML = `${cameraRadius.toFixed(2)} <small>rₛ</small>`;
    }
    if (Number.isFinite(inclination)) {
      const rounded = Math.abs(inclination).toFixed(1).padStart(4, '0');
      this.el.inclination.textContent = `${inclination >= 0 ? '+' : '−'}${rounded}°`;
    }
    if (Number.isFinite(width) && Number.isFinite(height)) {
      this.el.resolution.textContent = `${Math.round(width)}×${Math.round(height)}`;
    }
    if (Number.isFinite(fps)) {
      this.el.fps.textContent = (this.state.paused || fps <= 0) ? '保持' : `${Math.round(fps)} 帧/秒`;
    }
    if (Number.isFinite(maxSteps)) {
      this.el.steps.textContent = `${maxSteps} 步`;
    }
    if (Number.isFinite(time)) {
      this.state.time = time;
      this._updateTimeline(time);
    }
    if (typeof paused === 'boolean') this.state.paused = paused;
    if (typeof cinematic === 'boolean') this.state.cinematic = cinematic;
    this._updateSolverStatus();
  }

  _updateTimeline(time) {
    const period = 90;
    const normalized = ((time % period) + period) % period;
    const pct = Math.max(0, Math.min(100, (normalized / period) * 100));
    if (this.el.timelineFill) this.el.timelineFill.style.width = `${pct.toFixed(3)}%`;
    if (this.el.timelineHead) this.el.timelineHead.style.left = `${pct.toFixed(3)}%`;

    const minutes = Math.floor(normalized / 60);
    const seconds = Math.floor(normalized % 60);
    const frames = Math.floor((normalized % 1) * 24);
    if (this.el.timecode) this.el.timecode.textContent = `00:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
    if (this.el.simTime) this.el.simTime.textContent = `T+${pad(minutes)}:${String(seconds).padStart(2, '0')}.${String(Math.floor((normalized % 1) * 100)).padStart(2, '0')}`;
  }

  /* -----------------------------------------------------------------------
     Boot, overlays, errors
     ----------------------------------------------------------------------- */

  setBootProgress(percent, message) {
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    this.el.bootProgress.style.width = `${pct.toFixed(1)}%`;
    this.el.bootPercent.textContent = `${pad(pct, 2)}%`.replace('  ', '');
    if (message) this.el.bootMessage.textContent = message;
  }

  hideBoot() {
    if (this.bootHidden) return;
    this.bootHidden = true;
    this.el.boot.classList.add('is-hidden');
    this.el.boot.setAttribute('aria-hidden', 'true');
    this.el.body.classList.remove('is-booting');
    this.el.body.classList.add('is-ready');
  }

  openPanel() {
    if (this.el.panel.classList.contains('is-open')) return;
    this.closeHelp();
    this._lastFocused = document.activeElement;
    this.el.panel.classList.add('is-open');
    this.el.panel.setAttribute('aria-hidden', 'false');
    this.el.panelToggle.setAttribute('aria-expanded', 'true');
    this.el.panelScrim.classList.add('is-open');
    this.el.body.classList.add('panel-open');
    window.setTimeout(() => this.el.panelClose.focus({ preventScroll: true }), 80);
  }

  closePanel() {
    if (!this.el.panel.classList.contains('is-open')) return;
    this.el.panel.classList.remove('is-open');
    this.el.panel.setAttribute('aria-hidden', 'true');
    this.el.panelToggle.setAttribute('aria-expanded', 'false');
    this.el.panelScrim.classList.remove('is-open');
    this.el.body.classList.remove('panel-open');
    if (this._lastFocused && typeof this._lastFocused.focus === 'function') {
      this._lastFocused.focus({ preventScroll: true });
      this._lastFocused = null;
    }
  }

  togglePanel() {
    if (this.isPanelOpen()) this.closePanel();
    else this.openPanel();
  }

  isPanelOpen() {
    return this.el.panel.classList.contains('is-open');
  }

  openHelp() {
    if (this.isHelpOpen()) return;
    this.closePanel();
    this._lastFocused = document.activeElement;
    this.el.helpModal.classList.add('is-open');
    this.el.helpModal.setAttribute('aria-hidden', 'false');
    this.el.body.classList.add('help-open');
    window.setTimeout(() => this.el.helpClose.focus({ preventScroll: true }), 80);
  }

  closeHelp() {
    if (!this.isHelpOpen()) return;
    this.el.helpModal.classList.remove('is-open');
    this.el.helpModal.setAttribute('aria-hidden', 'true');
    this.el.body.classList.remove('help-open');
    if (this._lastFocused && typeof this._lastFocused.focus === 'function') {
      this._lastFocused.focus({ preventScroll: true });
      this._lastFocused = null;
    }
  }

  toggleHelp() {
    if (this.isHelpOpen()) this.closeHelp();
    else this.openHelp();
  }

  isHelpOpen() {
    return this.el.helpModal.classList.contains('is-open');
  }

  showFatal({ title = '渲染核心不可用', detail = '', meta = '' } = {}) {
    this.hideBoot();
    this.el.fatalTitle.textContent = title;
    this.el.fatalDetail.textContent = detail;
    if (meta) this.el.fatalMeta.textContent = meta;
    this.el.fatal.classList.add('is-open');
    this.el.fatal.setAttribute('aria-hidden', 'false');
    this.el.body.classList.add('has-fatal');
  }

  hideFatal() {
    this.el.fatal.classList.remove('is-open');
    this.el.fatal.setAttribute('aria-hidden', 'true');
    this.el.body.classList.remove('has-fatal');
  }

  setFatalMeta(text) {
    this.el.fatalMeta.textContent = text;
  }

  toast(message, duration = 2200) {
    window.clearTimeout(this._toastTimer);
    this.el.toast.textContent = message;
    this.el.toast.classList.add('is-visible');
    this._toastTimer = window.setTimeout(() => {
      this.el.toast.classList.remove('is-visible');
    }, duration);
  }

  setDebugHelpState(activeDebug) {
    $$('.debug-chip', this.el.debugGrid).forEach((chip) => {
      chip.classList.toggle('is-active', Number(chip.dataset.debugView) === Number(activeDebug));
    });
  }

  destroy() {
    window.clearTimeout(this._toastTimer);
    window.clearInterval(this._clockTimer);
  }
}

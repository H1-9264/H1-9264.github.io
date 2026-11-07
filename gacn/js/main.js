/**
 * GARGANTUA — application orchestration.
 *
 * Responsibilities:
 *  - deterministic URL state + localStorage persistence
 *  - camera rig: cinematic orbit, four authored viewpoints, free OrbitControls
 *  - UI wiring, shortcuts, audio, screenshot API, WebGL recovery
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  QUALITY,
  PARAMETERS,
  DEFAULT_PARAMS,
  PRESETS,
  DEBUG_VIEWS,
  STORAGE_KEY,
  clamp,
  clampParams,
  lerp,
} from './config.js';
import { GargantuaEngine } from './engine.js';
import { GargantuaUI } from './ui.js';
import { AmbientAudio } from './audio.js';

const CINEMA_PERIOD = 90;
const DEG = Math.PI / 180;
const canvas = document.getElementById('stage');
const query = new URLSearchParams(window.location.search);
const bootStartedAt = performance.now();
const runtimeErrors = [];
window.__GARGANTUA_ERRORS__ = runtimeErrors;

let engine = null;
let camera = null;
let controls = null;
let ui = null;
let audio = null;
let ready = false;
let fatalActive = false;
let fatalWasContextLoss = false;
let bootFinished = false;
let bootFailed = false;

let simTime = 17.25;
let previousFrameAt = performance.now();
let lastRenderWallTime = 0;
let renderMs = 0;
let fps = 0;
let lastHudUpdate = 0;
let needsRender = true;
let cameraTween = null;
let cinemaEntry = null;
let contextRestoreTimer = 0;
let resizeTimer = 0;
let saveTimer = 0;

const shotMode = query.has('shot') ? parseLooseBool(query.get('shot'), true) : false;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const isMobileLike = window.innerWidth <= 820 || (window.matchMedia?.('(pointer: coarse)').matches && Math.min(window.screen?.width || 9999, window.screen?.height || 9999) <= 900);

if (shotMode) document.body.classList.add('is-shot');

const ignoreStoredState = shotMode || parseLooseBool(query.get('fresh'), false);
const stored = ignoreStoredState ? null : readStoredState();
const initialQuality = chooseQuality();
const initialParams = chooseParams();
const initialCinematic = chooseCinematic();
const initialPaused = query.has('paused') ? parseLooseBool(query.get('paused'), false) : shotMode;
let initialUiVisible = query.has('ui')
  ? parseLooseBool(query.get('ui'), true)
  : (query.has('hud') ? parseLooseBool(query.get('hud'), true) : !shotMode);
const initialDebug = chooseDebug();
const initialPresetInfo = choosePreset();
const initialCameraInfo = chooseInitialCamera(initialCinematic, initialPresetInfo.activePreset);
simTime = chooseTime();

const state = {
  quality: initialQuality,
  params: initialParams,
  preset: initialCinematic ? null : initialCameraInfo.preset,
  debug: initialDebug,
  cinematic: initialCinematic,
  paused: initialPaused,
  uiVisible: initialUiVisible,
  music: false,
};

document.body.dataset.quality = state.quality;
document.body.dataset.debug = String(state.debug);
document.body.dataset.ui = state.uiVisible ? 'on' : 'off';

/* -------------------------------------------------------------------------
   URL / persistence parsing
   ------------------------------------------------------------------------- */

function parseLooseBool(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '' || normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') return false;
  return fallback;
}

function readStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function chooseQuality() {
  const requested = query.get('quality');
  if (requested && QUALITY[requested]) return requested;
  if (stored?.quality && QUALITY[stored.quality]) return stored.quality;
  if (shotMode) return isMobileLike ? 'standard' : 'high';
  return isMobileLike ? 'standard' : 'high';
}

function decodeCompactParams(value) {
  if (!value) return null;
  try {
    let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const decoded = decodeURIComponent(escape(atob(base64)));
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function chooseParams() {
  const source = {
    ...DEFAULT_PARAMS,
    ...(stored?.params && typeof stored.params === 'object' ? stored.params : {}),
    ...(decodeCompactParams(query.get('p')) || {}),
  };
  for (const param of PARAMETERS) {
    if (query.has(param.id)) {
      const value = Number(query.get(param.id));
      if (Number.isFinite(value)) source[param.id] = value;
    }
  }
  return clampParams(source);
}

function chooseCinematic() {
  if (query.has('cinematic')) return parseLooseBool(query.get('cinematic'), true);
  if (shotMode) return false;
  if (query.has('preset')) return false;
  if (typeof stored?.cinematic === 'boolean') return stored.cinematic;
  return !reducedMotion;
}

function chooseTime() {
  const raw = query.get('time');
  if (raw != null) {
    const v = Number(raw);
    if (Number.isFinite(v)) return Math.max(0, v);
  }
  return 17.25;
}

function chooseDebug() {
  if (query.has('debug')) {
    const v = clamp(Math.round(Number(query.get('debug')) || 0), 0, 9);
    return v;
  }
  if (stored?.debug != null) {
    const v = clamp(Math.round(Number(stored.debug) || 0), 0, 9);
    return v;
  }
  return 0;
}

function choosePreset() {
  const raw = query.get('preset');
  if (raw != null) {
    const byId = PRESETS.find((p) => p.id === raw.toLowerCase());
    const byNumber = PRESETS.find((p) => p.index === Number(raw) || p.code === raw);
    const found = byId || byNumber;
    if (found) return { activePreset: found.index, source: 'url' };
  }
  if (!shotMode && Number.isInteger(Number(stored?.preset)) && stored.preset >= 0 && stored.preset < PRESETS.length) {
    return { activePreset: Number(stored.preset), source: 'stored' };
  }
  return { activePreset: 0, source: 'default' };
}

function parseVector3(raw) {
  if (typeof raw !== 'string') return null;
  const parts = raw.split(',').map((v) => Number(v.trim()));
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return null;
  const length = Math.hypot(parts[0], parts[1], parts[2]);
  if (length < 5 || length > 80) return null;
  return parts;
}

function chooseInitialCamera(cinematic, activePreset) {
  const rawCamera = query.get('camera');
  const fromUrl = parseVector3(rawCamera);
  if (fromUrl && !cinematic) {
    const fovQ = Number(query.get('fov'));
    return {
      position: fromUrl,
      fov: Number.isFinite(fovQ) ? clamp(fovQ, 20, 80) : (PRESETS[activePreset]?.fov ?? 42),
      preset: null,
    };
  }

  if (cinematic) return { position: null, fov: null, preset: null };
  if (query.has('preset')) {
    const preset = PRESETS[activePreset] || PRESETS[0];
    return { position: preset.position.slice(), fov: preset.fov, preset: activePreset };
  }

  if (!shotMode && stored?.camera && Array.isArray(stored.camera.position)) {
    const pos = stored.camera.position.map(Number);
    if (pos.length === 3 && pos.every(Number.isFinite) && Math.hypot(...pos) >= 5 && Math.hypot(...pos) <= 80) {
      const storedFov = Number(stored.camera.fov);
      return {
        position: pos,
        fov: Number.isFinite(storedFov) ? clamp(storedFov, 20, 80) : 42,
        preset: null,
      };
    }
  }

  const preset = PRESETS[activePreset] || PRESETS[0];
  return { position: preset.position.slice(), fov: preset.fov, preset: preset.index };
}

/* -------------------------------------------------------------------------
   Cinematic camera
   ------------------------------------------------------------------------- */

function cinematicPoseAt(timeSeconds) {
  const period = CINEMA_PERIOD;
  const u = ((timeSeconds % period) + period) % period / period;
  const theta = 0.32 + u * Math.PI * 2;
  const elevation = (
    11.5
    + 3.0 * Math.sin(u * Math.PI * 4.0 + 0.8)
    + 0.7 * Math.sin(u * Math.PI * 10.0 + 1.4)
  ) * DEG;
  const radius = 20.6
    + 0.9 * Math.sin(u * Math.PI * 4.0 + 1.2)
    + 0.22 * Math.cos(u * Math.PI * 10.0 + 0.2);
  const cosE = Math.cos(elevation);
  const position = new THREE.Vector3(
    radius * cosE * Math.cos(theta),
    radius * Math.sin(elevation),
    radius * cosE * Math.sin(theta),
  );
  const fov = 41.5 + 1.0 * Math.sin(u * Math.PI * 4.0 + 0.4);
  return { position, fov };
}

function cinematicPoseForNow() {
  return cinematicPoseAt(simTime);
}

function applyCinematicPoseNow() {
  if (!camera) return;
  const pose = cinematicPoseForNow();
  camera.position.copy(pose.position);
  camera.fov = pose.fov;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  if (controls) {
    controls.enabled = false;
    controls.target.set(0, 0, 0);
  }
}

function easeInOutQuart(t) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2;
}

/* -------------------------------------------------------------------------
   State mutators
   ------------------------------------------------------------------------- */

function setQuality(quality, { announce = false, save = true } = {}) {
  if (!QUALITY[quality] || !engine) return;
  if (state.quality === quality) {
    engine.setQuality(quality);
    return;
  }
  state.quality = quality;
  try {
    engine.setQuality(quality);
  } catch (error) {
    handleRuntimeError(error, 'quality-change');
    return;
  }
  document.body.dataset.quality = quality;
  ui.setQuality(quality);
  requestRender();
  if (save) requestSave();
  if (announce) ui.toast(`渲染配置 // ${QUALITY[quality].label} · ${QUALITY[quality].maxSteps} 步`, 1800);
  updateTelemetry(true);
}

function applyParam(id, value, { fromUI = false, save = true, render = true } = {}) {
  const param = PARAMETERS.find((p) => p.id === id);
  if (!param) return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  const next = clamp(numeric, param.min, param.max);
  state.params = { ...state.params, [id]: next };
  if (engine) engine.setParam(param, next);
  if (!fromUI) ui.refreshParams(state.params);
  if (render) requestRender();
  if (save) requestSave();
}

function resetParams({ announce = true } = {}) {
  state.params = { ...DEFAULT_PARAMS };
  if (engine) engine.setParams(state.params);
  ui.refreshParams(state.params);
  requestRender();
  requestSave();
  if (announce) ui.toast('控制矩阵已重置 // 21 项默认值');
}

function setDebugView(value, { announce = false } = {}) {
  const debug = clamp(Math.round(Number(value) || 0), 0, 9);
  state.debug = debug;
  document.body.dataset.debug = String(debug);
  if (engine) engine.setDebug(debug);
  ui.setDebug(debug);
  requestRender();
  requestSave();
  if (announce) {
    const view = DEBUG_VIEWS.find((v) => v.id === debug) || DEBUG_VIEWS[0];
    ui.toast(`诊断 ${view.code} // ${view.label}`, 1700);
  }
}

function setPreset(index, { instant = false, announce = false, save = true } = {}) {
  const preset = PRESETS.find((p) => p.index === Number(index));
  if (!preset) return;
  if (!camera || !controls) return;

  state.cinematic = false;
  state.preset = preset.index;
  cinemaEntry = null;
  controls.enabled = false;
  ui.setCinematic(false);
  ui.setActivePreset(preset.index);
  ui.setPaused(state.paused);
  document.body.dataset.debug = String(state.debug);

  const targetPos = new THREE.Vector3(...preset.position);
  const targetFov = preset.fov;
  if (state.paused || instant) {
    cameraTween = null;
    camera.position.copy(targetPos);
    camera.fov = targetFov;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.enabled = true;
    controls.update();
  } else {
    cameraTween = {
      start: performance.now(),
      duration: 1250,
      fromPosition: camera.position.clone(),
      toPosition: targetPos,
      fromFov: camera.fov,
      toFov: targetFov,
    };
  }

  needsRender = true;
  updateTelemetry(true);
  if (save) requestSave();
  if (announce) ui.toast(`视角 ${preset.code} // ${preset.label}`, 1600);
}

function cyclePreset() {
  const current = state.cinematic ? -1 : (state.preset == null ? -1 : state.preset);
  const next = (current + 1 + PRESETS.length) % PRESETS.length;
  setPreset(next, { announce: true });
}

function setCinematic(enabled, { instant = false, announce = false, save = true } = {}) {
  if (!camera || !controls) return;
  const next = !!enabled;
  if (next === state.cinematic) {
    if (announce) ui.toast(next ? '自动环绕已启用' : '自动环绕已解除', 1400);
    return;
  }
  state.cinematic = next;
  state.preset = null;
  cameraTween = null;
  ui.setActivePreset(null);
  ui.setCinematic(next);

  if (next) {
    cinemaEntry = null;
    controls.enabled = false;
    if (state.paused || instant) {
      applyCinematicPoseNow();
    } else {
      const pose = cinematicPoseForNow();
      cinemaEntry = {
        start: performance.now(),
        duration: 1650,
        fromPosition: camera.position.clone(),
        fromFov: camera.fov,
      };
      // Keep the current view for the first frame of the blend.
      void pose;
    }
    if (announce) ui.toast('电影环绕启用 // 90 秒循环', 1800);
  } else {
    cinemaEntry = null;
    controls.enabled = true;
    controls.target.set(0, 0, 0);
    controls.update();
    if (announce) ui.toast('自由环绕已解除', 1500);
  }
  markCameraDirty();
  requestRender();
  if (save) requestSave();
  updateTelemetry(true);
}

function setPaused(paused, { announce = false } = {}) {
  const next = !!paused;
  if (next === state.paused) return;
  state.paused = next;
  ui.setPaused(next);
  previousFrameAt = performance.now();
  requestRender();
  updateTelemetry(true);
  if (announce) {
    ui.toast(next ? '积分器暂停 // 时空冻结' : '积分器恢复 // 时间流动', 1700);
  }
}

function setSimulationTime(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return;
  simTime = Math.max(0, value);
  needsRender = true;
  updateTelemetry(true);
  requestRender();
}

function setUiVisible(visible, { announce = false } = {}) {
  state.uiVisible = !!visible;
  ui.setUiVisible(state.uiVisible);
  if (announce) {
    ui.toast(state.uiVisible ? '界面已显示 // H 隐藏' : '界面已隐藏 // H 恢复', 1700);
  }
}

function setCameraProgrammatic({ position, fov, target = [0, 0, 0] } = {}) {
  if (!camera || !controls) return;
  if (!Array.isArray(position) || position.length !== 3) return;
  const parsed = position.map(Number);
  if (!parsed.every(Number.isFinite)) return;
  const radius = Math.hypot(...parsed);
  if (radius < 4.5) return;
  state.cinematic = false;
  state.preset = null;
  cameraTween = null;
  cinemaEntry = null;
  controls.enabled = true;
  camera.position.set(parsed[0], parsed[1], parsed[2]);
  if (Number.isFinite(fov)) camera.fov = clamp(Number(fov), 20, 80);
  const t = Array.isArray(target) ? target.map(Number) : [0, 0, 0];
  controls.target.set(
    Number.isFinite(t[0]) ? t[0] : 0,
    Number.isFinite(t[1]) ? t[1] : 0,
    Number.isFinite(t[2]) ? t[2] : 0,
  );
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  ui.setCinematic(false);
  ui.setActivePreset(null);
  markCameraDirty();
  requestRender();
  requestSave();
  updateTelemetry(true);
}

function markCameraDirty() {
  needsRender = true;
  if (!state.cinematic) {
    state.preset = null;
    ui.setActivePreset(null);
  }
}

/* -------------------------------------------------------------------------
   User interaction
   ------------------------------------------------------------------------- */

function takeManualControl() {
  if (!controls) return;
  let changed = false;
  if (state.cinematic) {
    state.cinematic = false;
    ui.setCinematic(false);
    changed = true;
  }
  if (cameraTween) {
    cameraTween = null;
    changed = true;
  }
  if (cinemaEntry) {
    cinemaEntry = null;
    changed = true;
  }
  if (!controls.enabled) controls.enabled = true;
  if (state.preset != null) {
    state.preset = null;
    ui.setActivePreset(null);
    changed = true;
  }
  needsRender = true;
  if (changed) requestSave();
}

function attachInteraction() {
  const onGrab = () => {
    if (!ready) return;
    takeManualControl();
  };
  canvas.addEventListener('pointerdown', onGrab, { capture: true, passive: true });
  canvas.addEventListener('wheel', onGrab, { capture: true, passive: true });
  canvas.addEventListener('touchstart', onGrab, { capture: true, passive: true });

  controls.addEventListener('start', () => {
    takeManualControl();
  });
  controls.addEventListener('change', () => {
    if (!state.cinematic) needsRender = true;
  });
  controls.addEventListener('end', () => {
    makeCameraDirtyForSave();
    requestSave();
  });

  window.addEventListener('resize', onWindowResize, { passive: true });
  window.addEventListener('orientationchange', onWindowResize, { passive: true });
  window.addEventListener('keydown', onKeyDown);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      audio?.onVisibilityChange(true);
      saveNow();
    } else {
      previousFrameAt = performance.now();
      audio?.onVisibilityChange(false);
      needsRender = true;
    }
  });

  window.addEventListener('pagehide', saveNow);

  const fullScreenChange = () => {
    const isFs = !!document.fullscreenElement;
    ui.toast(isFs ? '沉浸画面 // 全屏' : '已退出全屏', 1300);
  };
  document.addEventListener('fullscreenchange', fullScreenChange);

  canvas.addEventListener('webglcontextlost', () => {
    fatalActive = true;
  }, false);
}

function makeCameraDirtyForSave() {
  if (!camera) return;
  needsRender = true;
}

function onWindowResize() {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (!camera || !engine) return;
    camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    camera.updateProjectionMatrix();
    try {
      engine.resize();
    } catch (error) {
      handleRuntimeError(error, 'resize');
    }
    needsRender = true;
    updateTelemetry(true);
  }, 140);
}

function onKeyDown(event) {
  const target = event.target;
  const typing = target instanceof HTMLElement && (
    target.matches('input, textarea, select, [contenteditable="true"]')
  );
  if (typing) return;
  if (target instanceof HTMLElement && target.closest('button') && (event.key === ' ' || event.key === 'Enter')) {
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const key = event.key;
  const code = event.code;

  if (/^[0-9]$/.test(key)) {
    event.preventDefault();
    setDebugView(Number(key), { announce: true });
    return;
  }
  if (code === 'KeyQ') {
    event.preventDefault();
    setPreset(0, { announce: true });
    return;
  }
  if (code === 'KeyW') {
    event.preventDefault();
    setPreset(1, { announce: true });
    return;
  }
  if (code === 'KeyE') {
    event.preventDefault();
    setPreset(2, { announce: true });
    return;
  }
  if (code === 'KeyR') {
    event.preventDefault();
    setPreset(3, { announce: true });
    return;
  }
  if (code === 'KeyV') {
    event.preventDefault();
    cyclePreset();
    return;
  }
  if (code === 'KeyC') {
    event.preventDefault();
    setCinematic(!state.cinematic, { announce: true });
    return;
  }
  if (code === 'KeyP' || code === 'Space') {
    event.preventDefault();
    setPaused(!state.paused, { announce: true });
    return;
  }
  if (code === 'KeyM') {
    event.preventDefault();
    void toggleMusic();
    return;
  }
  if (code === 'KeyH') {
    event.preventDefault();
    setUiVisible(!state.uiVisible, { announce: true });
    return;
  }
  if (code === 'KeyG') {
    event.preventDefault();
    ui.togglePanel();
    return;
  }
  if (code === 'KeyS') {
    event.preventDefault();
    void saveFrame();
    return;
  }
  if (code === 'KeyF') {
    event.preventDefault();
    void toggleFullscreen();
    return;
  }
  if (key === '?' || (event.shiftKey && code === 'Slash')) {
    event.preventDefault();
    ui.toggleHelp();
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    ui.toast('当前环境不支持全屏', 1800);
  }
}

async function toggleMusic() {
  if (!audio) return;
  if (audio.playing) {
    audio.pause();
    ui.setMusic(false, audio.available);
    ui.toast('环境音已静音', 1300);
    return;
  }
  try {
    await audio.play();
    ui.setMusic(true, true);
    ui.toast('环境音开启 // 环境地平线', 1900);
  } catch {
    ui.setMusic(false, audio.available);
    ui.toast(audio.available ? '浏览器阻止了音频播放' : '音频资源不可用', 2100);
  }
}

/* -------------------------------------------------------------------------
   Render loop
   ------------------------------------------------------------------------- */

function requestRender() {
  needsRender = true;
}

function updateCameraTransitions(now) {
  if (cameraTween) {
    const t = clamp((now - cameraTween.start) / cameraTween.duration, 0, 1);
    const eased = easeInOutQuart(t);
    camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased);
    camera.fov = lerp(cameraTween.fromFov, cameraTween.toFov, eased);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    if (t >= 1) {
      cameraTween = null;
      controls.target.set(0, 0, 0);
      controls.enabled = true;
      requestSave();
    }
    return true;
  }

  if (state.cinematic && !state.paused) {
    const pose = cinematicPoseForNow();
    if (cinemaEntry) {
      const t = clamp((now - cinemaEntry.start) / cinemaEntry.duration, 0, 1);
      const eased = easeInOutQuart(t);
      camera.position.lerpVectors(cinemaEntry.fromPosition, pose.position, eased);
      camera.fov = lerp(cinemaEntry.fromFov, pose.fov, eased);
      if (t >= 1) cinemaEntry = null;
    } else {
      camera.position.copy(pose.position);
      camera.fov = pose.fov;
    }
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    return true;
  }

  if (!state.cinematic && controls) {
    const moved = controls.update();
    if (moved) needsRender = true;
  }
  return false;
}

function renderFrame() {
  if (!engine || !camera || fatalActive) return false;
  const start = performance.now();
  try {
    engine.render(camera, simTime);
  } catch (error) {
    handleRenderFailure(error);
    return false;
  }
  const ended = performance.now();
  renderMs = ended - start;
  if (!state.paused && lastRenderWallTime > 0) {
    const gap = ended - lastRenderWallTime;
    if (gap > 0 && gap < 600) {
      const instant = 1000 / gap;
      fps = fps > 0 ? fps * 0.88 + instant * 0.12 : instant;
    }
  } else if (state.paused) {
    fps = 0;
  }
  lastRenderWallTime = ended;
  needsRender = false;
  return true;
}

function updateTelemetry(force = false) {
  if (!ui || !camera) return;
  const now = performance.now();
  if (!force && now - lastHudUpdate < 170) return;
  lastHudUpdate = now;
  const radius = camera.position.length();
  const inclination = (Math.asin(clamp(camera.position.y / Math.max(radius, 1e-4), -1, 1)) / DEG);
  const info = engine?.getRenderInfo();
  ui.updateTelemetry({
    cameraRadius: radius,
    inclination,
    fps,
    width: info?.width,
    height: info?.height,
    maxSteps: info?.maxSteps,
    time: simTime,
    paused: state.paused,
    cinematic: state.cinematic,
  });
}

function animate(now) {
  window.requestAnimationFrame(animate);
  if (bootFailed) return;

  const dt = Math.min(0.1, Math.max(0, (now - previousFrameAt) / 1000));
  previousFrameAt = now;

  if (fatalActive) {
    updateTelemetry();
    return;
  }

  if (!state.paused) {
    simTime += dt;
    needsRender = true;
  }

  if (engine) {
    updateCameraTransitions(now);
    if (!state.paused) needsRender = true;

    if (needsRender) {
      renderFrame();
      updateTelemetry();
    } else if (now - lastHudUpdate > 500) {
      updateTelemetry();
    }
  }
}

/* -------------------------------------------------------------------------
   Render failure / context restoration
   ------------------------------------------------------------------------- */

function handleRenderFailure(error) {
  const message = String(error?.message || error || 'Unknown renderer failure');
  runtimeErrors.push({ kind: 'render', message, at: new Date().toISOString() });
  fatalActive = true;
  window.__GARGANTUA_ERROR__ = message;
  ui.showFatal({
    title: '测地线求解器故障',
    detail: `片段管线停止：${message.slice(0, 520)}`,
    meta: '渲染核心：着色器 / 帧缓冲 · 尝试标准模式或重新加载',
  });
}

function handleContextLost() {
  if (!engine) return;
  fatalActive = true;
  fatalWasContextLoss = true;
  window.clearTimeout(contextRestoreTimer);
  const diagnostics = engine.getDiagnostics();
  ui.showFatal({
    title: 'WEBGL 上下文丢失',
    detail: '浏览器或驱动暂停了 GPU 上下文。GARGANTUA 正在自动恢复；相机、参数与模拟状态均已保留。',
    meta: `上下文丢失 ${String(diagnostics.contextLosses || 1).padStart(2, '0')} · 0.9 秒后自动恢复 · ${diagnostics.glRenderer || 'WebGL2'}`,
  });

  const scheduleRestore = (attempt = 0) => {
    if (!engine || !engine.contextLost) return;
    engine.forceContextRestore();
    ui.setFatalMeta(`恢复请求 ${attempt + 1} / 3 · 等待 GPU 确认`);
    if (attempt < 2) {
      contextRestoreTimer = window.setTimeout(() => scheduleRestore(attempt + 1), attempt === 0 ? 1800 : 3200);
    } else {
      contextRestoreTimer = window.setTimeout(() => {
        if (engine?.contextLost) {
          ui.setFatalMeta('恢复未确认 · 请使用恢复渲染器或重新加载');
        }
      }, 5000);
    }
  };

  contextRestoreTimer = window.setTimeout(() => scheduleRestore(0), 900);
}

function handleContextRestored() {
  window.clearTimeout(contextRestoreTimer);
  fatalActive = false;
  fatalWasContextLoss = false;
  if (engine) {
    try {
      engine.resize(true);
      engine.setDebug(state.debug);
      engine.setParams(state.params);
      if (qualityForRestore) {
        engine.setQuality(qualityForRestore);
        qualityForRestore = null;
      }
    } catch (error) {
      runtimeErrors.push({ kind: 'context-restore', message: String(error) });
    }
  }
  ui.setFatalMeta('恢复已确认 · HDR 管线重新分配');
  ui.hideFatal();
  ui.toast('渲染核心已恢复 // 积分继续', 2200);
  previousFrameAt = performance.now();
  requestRender();
  window.__GARGANTUA_ERROR__ = null;
}

let qualityForRestore = null;

function retryRenderer() {
  if (!engine) {
    window.location.reload();
    return;
  }
  if (engine.contextLost) {
    ui.setFatalMeta('已请求手动恢复 · 请稍候');
    engine.forceContextRestore();
  } else {
    fatalActive = false;
    ui.hideFatal();
    requestRender();
  }
}

function safeMode() {
  try {
    state.quality = 'standard';
    document.body.dataset.quality = 'standard';
    ui.setQuality('standard');
    requestSave();
    if (engine && !engine.contextLost) {
      engine.setQuality('standard');
      fatalActive = false;
      ui.hideFatal();
      requestRender();
      ui.toast('安全配置 // 标准画质', 1800);
    } else {
      qualityForRestore = 'standard';
      if (engine) engine.forceContextRestore();
      ui.setFatalMeta('安全模式已排队 · 标准配置 · 正在恢复上下文');
    }
  } catch {
    window.location.reload();
  }
}

/* -------------------------------------------------------------------------
   Screenshot API / sharing
   ------------------------------------------------------------------------- */

function forceRenderNow() {
  if (!engine || !camera || fatalActive) return false;
  return renderFrame();
}

function downloadDataURL(dataURL, filename) {
  const anchor = document.createElement('a');
  anchor.href = dataURL;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function captureFrame({ download = false, filename = null } = {}) {
  if (!engine) throw new Error('Renderer is not initialized.');
  if (fatalActive) throw new Error('Renderer is in a fault state.');
  forceRenderNow();
  const dataURL = engine.capture();
  if (download) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadDataURL(dataURL, filename || `gargantua-diag-${String(state.debug).padStart(2, '0')}-${stamp}.png`);
  }
  return dataURL;
}

async function saveFrame() {
  try {
    captureFrame({ download: true });
    ui.toast('帧已保存 // HDR 测地线画面', 1900);
  } catch {
    ui.toast('帧捕获失败 // 渲染核心不可用', 2200);
  }
}

function encodeCompactParams() {
  const diff = {};
  for (const param of PARAMETERS) {
    const value = state.params[param.id];
    if (Math.abs(value - DEFAULT_PARAMS[param.id]) > (param.step > 1 ? param.step * 0.1 : 1e-9)) {
      const rounded = Number(value.toFixed(param.digits + 1));
      diff[param.id] = rounded;
    }
  }
  if (!Object.keys(diff).length) return null;
  try {
    return btoa(JSON.stringify(diff)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch {
    return null;
  }
}

function buildShareLink() {
  const url = new URL(window.location.href);
  url.search = '';
  const params = url.searchParams;
  params.set('quality', state.quality);
  params.set('time', String(Number(simTime.toFixed(2))));
  if (state.debug) params.set('debug', String(state.debug));
  if (state.uiVisible) params.set('ui', '1');
  else params.set('ui', '0');
  if (state.cinematic) {
    params.set('cinematic', '1');
  } else {
    params.set('cinematic', '0');
    if (state.preset != null) {
      params.set('preset', PRESETS[state.preset]?.id || String(state.preset));
    } else if (camera) {
      const p = camera.position;
      params.set('camera', [p.x, p.y, p.z].map((v) => Number(v.toFixed(2))).join(','));
      params.set('fov', String(Number(camera.fov.toFixed(1))));
    }
  }
  const compact = encodeCompactParams();
  if (compact) params.set('p', compact);
  return url.toString();
}

function copyShareLink() {
  const link = buildShareLink();
  const done = () => ui.toast('分享链接已复制 // 深链接状态', 1900);
  const fail = () => ui.toast('剪贴板不可用 // 请从控制台复制', 2100);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(link).then(done).catch(fail);
  } else {
    try {
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    } catch {
      fail();
    }
  }
}

/* -------------------------------------------------------------------------
   Persistence
   ------------------------------------------------------------------------- */

function buildStoredState() {
  return {
    version: 1,
    quality: state.quality,
    params: { ...state.params },
    preset: state.preset,
    cinematic: state.cinematic,
    debug: state.debug,
    camera: !state.cinematic && state.preset == null && camera ? {
      position: [
        Number(camera.position.x.toFixed(3)),
        Number(camera.position.y.toFixed(3)),
        Number(camera.position.z.toFixed(3)),
      ],
      fov: Number(camera.fov.toFixed(2)),
    } : null,
  };
}

function saveNow() {
  if (shotMode) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildStoredState()));
  } catch {
    /* Storage may be unavailable in private or embedded contexts. */
  }
}

function requestSave() {
  if (shotMode) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveNow, 220);
}

function storeSafeProfile() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...buildStoredState(), quality: 'standard' }));
  } catch {
    /* noop */
  }
}

/* -------------------------------------------------------------------------
   Errors and diagnostics
   ------------------------------------------------------------------------- */

function recordRuntimeError(kind, error) {
  runtimeErrors.push({
    kind,
    message: String(error?.message || error || 'Unknown error'),
    at: new Date().toISOString(),
  });
  if (runtimeErrors.length > 30) runtimeErrors.shift();
}

function showBootFailure(title, detail, meta) {
  bootFailed = true;
  fatalActive = true;
  const message = `${title}: ${detail}`;
  window.__GARGANTUA_ERROR__ = message;
  try {
    ui.showFatal({ title, detail, meta });
  } catch {
    /* fatal UI should never mask the failure */
  }
}

function handleRuntimeError(error, context = 'runtime') {
  recordRuntimeError(context, error);
  if (!ready) {
    showBootFailure('渲染核心初始化失败', String(error?.message || error || error), '检查 WEBGL2 · HDR 缓冲 · 本地服务器');
    return;
  }
  if (context === 'render') {
    handleRenderFailure(error);
    return;
  }
  ui?.toast('信号异常 // 状态已恢复', 2000);
}

function getPublicState() {
  return {
    ready,
    quality: state.quality,
    preset: state.preset,
    debug: state.debug,
    cinematic: state.cinematic,
    paused: state.paused,
    uiVisible: state.uiVisible,
    music: !!audio?.playing,
    time: Number(simTime.toFixed(4)),
    params: { ...state.params },
    camera: camera ? {
      position: [camera.position.x, camera.position.y, camera.position.z].map((v) => Number(v.toFixed(4))),
      target: controls ? [controls.target.x, controls.target.y, controls.target.z] : [0, 0, 0],
      fov: Number(camera.fov.toFixed(2)),
    } : null,
  };
}

function getDiagnostics() {
  const info = engine?.getDiagnostics() || {};
  return {
    app: 'GARGANTUA',
    version: '1.0.0',
    ready,
    fatalActive,
    bootFailed,
    quality: state.quality,
    debug: state.debug,
    cinematic: state.cinematic,
    paused: state.paused,
    time: simTime,
    fps: Number(fps.toFixed(2)),
    renderMs: Number(renderMs.toFixed(2)),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    },
    render: info,
    webglSupported: !!engine,
    url: window.location.href,
    runtimeErrors: runtimeErrors.slice(),
    audio: {
      available: !!audio?.available,
      playing: !!audio?.playing,
    },
    controls: controls ? {
      enabled: controls.enabled,
      minDistance: controls.minDistance,
      maxDistance: controls.maxDistance,
      panEnabled: controls.enablePan,
    } : null,
  };
}

function getPublicApi() {
  return {
    version: '1.0.0',
    get ready() { return ready; },
    getState: getPublicState,
    getDiagnostics,
    set(patch = {}) {
      if ('quality' in patch) setQuality(patch.quality);
      if ('params' in patch && patch.params && typeof patch.params === 'object') {
        for (const [id, value] of Object.entries(patch.params)) applyParam(id, value);
      }
      if ('debug' in patch) setDebugView(patch.debug);
      if ('cinematic' in patch) setCinematic(patch.cinematic, { instant: true });
      if ('preset' in patch) {
        if (patch.preset == null) {
          state.preset = null;
          ui.setActivePreset(null);
          setCinematic(false, { instant: true });
        } else {
          const found = PRESETS.find((p) => p.index === Number(patch.preset) || p.id === String(patch.preset));
          if (found) setPreset(found.index, { instant: true });
        }
      }
      if ('paused' in patch) setPaused(patch.paused);
      if ('time' in patch) setSimulationTime(patch.time);
      if ('uiVisible' in patch) setUiVisible(patch.uiVisible);
      if ('camera' in patch) setCameraProgrammatic({ ...patch.camera, fov: patch.camera?.fov ?? patch.fov });
      else if ('position' in patch) setCameraProgrammatic({ position: patch.position, fov: patch.fov, target: patch.target });
      if ('music' in patch) {
        if (patch.music && !audio?.playing) void toggleMusic();
        else if (!patch.music && audio?.playing) void toggleMusic();
      }
      if (state.paused) forceRenderNow();
      return getPublicState();
    },
    setParam(id, value) {
      applyParam(id, value);
      if (state.paused) forceRenderNow();
      return getPublicState();
    },
    setDebug(value) { setDebugView(value); if (state.paused) forceRenderNow(); return getPublicState(); },
    setPreset(value) {
      const found = PRESETS.find((p) => p.index === Number(value) || p.id === String(value));
      if (found) setPreset(found.index, { instant: state.paused });
      if (state.paused) forceRenderNow();
      return getPublicState();
    },
    setQuality(value) { setQuality(value); if (state.paused) forceRenderNow(); return getPublicState(); },
    setCinematic(value) { setCinematic(value, { instant: state.paused }); if (state.paused) forceRenderNow(); return getPublicState(); },
    setPaused(value) { setPaused(value); if (state.paused) forceRenderNow(); return getPublicState(); },
    setTime(value) { setSimulationTime(value); if (state.paused) forceRenderNow(); return getPublicState(); },
    setCamera(cameraOptions) {
      setCameraProgrammatic(cameraOptions);
      if (state.paused) forceRenderNow();
      return getPublicState();
    },
    render: () => { forceRenderNow(); return engine?.getRenderInfo() || null; },
    capture: async (options = {}) => captureFrame(options),
    screenshot: async (options = {}) => captureFrame({ ...options, download: true }),
    save: () => captureFrame({ download: true }),
    getShareLink: () => buildShareLink(),
    resetParams: () => { resetParams({ announce: false }); if (state.paused) forceRenderNow(); return getPublicState(); },
    reset() {
      state.quality = isMobileLike ? 'standard' : 'high';
      document.body.dataset.quality = state.quality;
      engine?.setQuality(state.quality);
      ui.setQuality(state.quality);
      state.params = { ...DEFAULT_PARAMS };
      engine?.setParams(state.params);
      ui.refreshParams(state.params);
      setDebugView(0);
      setCinematic(false, { instant: true, save: false });
      setPreset(0, { instant: true, save: false });
      simTime = 17.25;
      setPaused(state.paused);
      requestSave();
      requestRender();
      return getPublicState();
    },
    debug: {
      loseContext() {
        return engine ? engine.loseContextForTesting() : false;
      },
      restoreContext() {
        try {
          return engine ? engine.forceContextRestore() : false;
        } catch {
          return false;
        }
      },
      diagnostics: getDiagnostics,
    },
    constants: {
      rs: 1,
      photonSphere: 1.5,
      isco: 3,
      criticalB: 3 * Math.sqrt(3) / 2,
      cinematicPeriod: CINEMA_PERIOD,
      parameterCount: PARAMETERS.length,
    },
  };
}

/* -------------------------------------------------------------------------
   UI handlers
   ------------------------------------------------------------------------- */

const uiHandlers = {
  onParam(id, value) {
    applyParam(id, value, { fromUI: true });
  },
  onQuality(quality) {
    setQuality(quality, { announce: true });
  },
  onPreset(index) {
    setPreset(index, { announce: true });
  },
  onDebug(value) {
    setDebugView(value, { announce: true });
  },
  onCycleDebug() {
    const next = (state.debug + 1) % DEBUG_VIEWS.length;
    setDebugView(next, { announce: true });
  },
  onToggleCinema() {
    setCinematic(!state.cinematic, { announce: true });
  },
  onTogglePause() {
    setPaused(!state.paused, { announce: true });
  },
  onToggleMusic() {
    void toggleMusic();
  },
  onResetParams() {
    resetParams();
  },
  onCopyLink() {
    copyShareLink();
  },
  onFatalRetry() {
    retryRenderer();
  },
  onFatalSafe() {
    safeMode();
  },
  onFatalReload() {
    window.location.reload();
  },
};

/* -------------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------------- */

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createCameraAndControls() {
  const preset = PRESETS[initialPresetInfo.activePreset] || PRESETS[0];
  const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
  camera = new THREE.PerspectiveCamera(preset.fov, aspect, 0.1, 1200);
  camera.up.set(0, 1, 0);
  camera.position.set(...preset.position);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.75;
  controls.enablePan = false;
  controls.minDistance = 6.5;
  controls.maxDistance = 42;
  controls.minPolarAngle = 0.09;
  controls.maxPolarAngle = Math.PI - 0.09;
  controls.enabled = !state.cinematic;
  controls.update();

  if (state.cinematic) {
    applyCinematicPoseNow();
    controls.enabled = false;
  } else if (initialCameraInfo.position) {
    camera.position.set(...initialCameraInfo.position);
    camera.fov = initialCameraInfo.fov || preset.fov;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    controls.enabled = true;
    controls.target.set(0, 0, 0);
    controls.update();
  }
}

async function boot() {
  ui = new GargantuaUI(uiHandlers);
  audio = new AmbientAudio('./assets/audio/ambient-horizon.ogg');

  ui.setState({
    params: state.params,
    quality: state.quality,
    preset: state.preset,
    debug: state.debug,
    cinematic: state.cinematic,
    paused: state.paused,
    music: false,
    uiVisible: state.uiVisible,
    time: simTime,
  });
  ui.setActivePreset(state.cinematic ? null : state.preset);
  ui.setMusic(false, audio.available);

  ui.setBootProgress(5, '正在校准观测台');
  await nextFrame();

  if (!GargantuaEngine.isSupported()) {
    showBootFailure(
      '需要 WEBGL2',
      '本仪器逐像素积分 520 步零测地线场，需要支持 16 位浮点渲染目标的 WebGL2。请开启硬件加速，或使用最新版 Chromium、Firefox 或 Safari。',
      'GPU 上下文：不可用 · 需要本地 HTTP 服务器',
    );
    return;
  }

  ui.setBootProgress(18, '正在分配 HDR 测地线通道');
  await nextFrame();

  createCameraAndControls();

  const scaleRaw = query.get('scale');
  const scale = scaleRaw != null ? Number(scaleRaw) : null;

  try {
    engine = new GargantuaEngine({
      canvas,
      quality: state.quality,
      renderScale: Number.isFinite(scale) ? scale : null,
      onContextLost: handleContextLost,
      onContextRestored: handleContextRestored,
      onFatal: (failure) => showBootFailure(
        'WEBGL 上下文创建失败',
        failure?.message || '浏览器拒绝了 WebGL2 上下文创建。',
        '检查硬件加速 · 重新加载 · 标准模式',
      ),
    });
  } catch (error) {
    showBootFailure(
      '渲染器初始化失败',
      String(error?.message || error),
      'WEBGL2 · RGBA16F · 硬件加速',
    );
    return;
  }

  engine.setQuality(state.quality);
  engine.setParams(state.params);
  engine.setDebug(state.debug);
  attachInteraction();

  ui.setBootProgress(48, '正在编译史瓦西测地线场');
  await nextFrame();

  ui.setBootProgress(72, '正在追踪首批零测地线');
  await nextFrame();

  const compiledAt = performance.now();
  let firstFrameRendered = false;
  try {
    firstFrameRendered = engine.render(camera, simTime);
    renderMs = performance.now() - compiledAt;
  } catch (error) {
    handleRuntimeError(error, 'render');
    return;
  }

  if (!firstFrameRendered) {
    showBootFailure(
      '未产生画面',
      '渲染管线已分配，但未产生可绘制帧。请尝试标准画质或重新加载仪器。',
      '帧：0 · 管线：HDR/泛光/ACES',
    );
    return;
  }

  ui.setBootProgress(100, '观测台在线');
  updateTelemetry(true);

  if (!shotMode) {
    const minIntro = 780;
    const elapsed = performance.now() - bootStartedAt;
    if (elapsed < minIntro) await delay(minIntro - elapsed);
  }

  ui.hideBoot();
  bootFinished = true;
  ready = true;
  window.GARGANTUA_READY = true;
  window.__GARGANTUA_READY__ = true;
  window.__GARGANTUA_ERROR__ = null;
  document.body.dataset.ready = 'true';
  document.body.classList.add('is-ready');
  previousFrameAt = performance.now();
  lastRenderWallTime = performance.now();
  window.dispatchEvent(new CustomEvent('gargantua:ready', { detail: getPublicState() }));

  if (parseLooseBool(query.get('capture'), false)) {
    window.requestAnimationFrame(() => {
      try {
        const data = captureFrame();
        window.__GARGANTUA_CAPTURE__ = data;
        window.__GARGANTUA_CAPTURE_READY__ = true;
        window.dispatchEvent(new CustomEvent('gargantua:capture', { detail: { data } }));
      } catch (error) {
        recordRuntimeError('capture-url', error);
        window.__GARGANTUA_CAPTURE_READY__ = false;
      }
    });
  }

  if (!shotMode) {
    window.requestAnimationFrame(animate);
  } else {
    // Deterministic screenshot mode: one settled plate, no animation loop.
    if (!state.paused) {
      state.paused = true;
      ui.setPaused(true);
    }
    window.requestAnimationFrame(animate);
  }
}

/* -------------------------------------------------------------------------
   Global error capture (no uncaught console noise; diagnostics remain)
   ------------------------------------------------------------------------- */

window.addEventListener('error', (event) => {
  recordRuntimeError('window', event.error || event.message || 'Window error');
  event.preventDefault?.();
  if (!ready && bootFinished === false) {
    if (!bootFailed) {
      showBootFailure(
        '初始化中断',
        String(event.error?.message || event.message || '未知初始化错误'),
        '检查浏览器控制台诊断 · 重新加载',
      );
    }
  }
}, true);

window.addEventListener('unhandledrejection', (event) => {
  recordRuntimeError('promise', event.reason || 'Unhandled rejection');
  event.preventDefault?.();
  if (!ready && !bootFailed) {
    showBootFailure(
      '初始化中断',
      String(event.reason?.message || event.reason || '未处理的 Promise 拒绝'),
      '检查浏览器控制台诊断 · 重新加载',
    );
  }
});

window.GARGANTUA = getPublicApi();
window.GARGANTUA_READY = false;
window.__GARGANTUA_READY__ = false;
window.__GARGANTUA_CAPTURE_READY__ = false;
window.__GARGANTUA_CAPTURE__ = null;

boot().catch((error) => {
  handleRuntimeError(error, 'boot');
});

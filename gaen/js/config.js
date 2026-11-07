/**
 * GARGANTUA — shared configuration.
 * All physical quantities are in geometrized units with r_s = 1 (M = 0.5).
 */

export const PHYSICS = Object.freeze({
  rs: 1,
  massM: 0.5,
  horizon: 1,
  photonSphere: 1.5,
  criticalB: 3 * Math.sqrt(3) / 2,
  isco: 3,
  escapeRadius: 56,
  defaultCameraRadius: 20.5,
});

export const QUALITY = Object.freeze({
  standard: {
    id: 'standard',
    label: 'STANDARD',
    short: 'STD',
    maxSteps: 230,
    stepScale: 1.14,
    dprCap: 1.15,
    baseScale: 0.95,
    maxPixels: 1_450_000,
    bloomLevels: 4,
    note: 'Mobile-first / sustained frame rate',
  },
  high: {
    id: 'high',
    label: 'HIGH',
    short: 'HIGH',
    maxSteps: 310,
    stepScale: 1.0,
    dprCap: 1.75,
    baseScale: 1.0,
    maxPixels: 3_400_000,
    bloomLevels: 5,
    note: 'Native Retina / default desktop',
  },
  cinematic: {
    id: 'cinematic',
    label: 'CINEMATIC',
    short: 'CINE',
    maxSteps: 520,
    stepScale: 0.9,
    dprCap: 2.0,
    baseScale: 1.0,
    maxPixels: 7_200_000,
    bloomLevels: 6,
    note: 'Maximum geodesic fidelity',
  },
});

export const PARAM_GROUPS = Object.freeze([
  { id: 'optics', label: 'OPTICS', short: 'OPT', description: 'Camera response & physical film response' },
  { id: 'spacetime', label: 'SPACETIME', short: 'SPT', description: 'Relativistic transfer of light' },
  { id: 'disk', label: 'ACCRETION', short: 'DSK', description: 'Procedural Shakura–Sunyaev disk' },
  { id: 'sky', label: 'SKY', short: 'SKY', description: 'Procedural galactic environment' },
]);

/** Exactly 21 live parameters. */
export const PARAMETERS = Object.freeze([
  {
    id: 'exposure', uniform: 'uExposure', group: 'optics', label: 'Exposure',
    unit: '', min: 0.2, max: 3.0, step: 0.01, value: 0.92, digits: 2,
    hint: 'Linear exposure before ACES filmic tone mapping.',
  },
  {
    id: 'bloomStrength', uniform: 'uBloomStrength', group: 'optics', label: 'Bloom Strength',
    unit: '', min: 0, max: 2, step: 0.01, value: 0.34, digits: 2,
    hint: 'Additive HDR multi-scale bloom.',
  },
  {
    id: 'bloomThreshold', uniform: 'uBloomThreshold', group: 'optics', label: 'Bloom Threshold',
    unit: '', min: 0, max: 3, step: 0.01, value: 1.45, digits: 2,
    hint: 'HDR luminance required to seed the bloom chain.',
  },
  {
    id: 'grain', uniform: 'uGrain', group: 'optics', label: 'Film Grain',
    unit: '', min: 0, max: 1, step: 0.01, value: 0.16, digits: 2,
    hint: 'Animated photochemical grain.',
  },
  {
    id: 'vignette', uniform: 'uVignette', group: 'optics', label: 'Vignette',
    unit: '', min: 0, max: 1.5, step: 0.01, value: 0.60, digits: 2,
    hint: 'Lens falloff toward the frame edge.',
  },
  {
    id: 'chromatic', uniform: 'uChromatic', group: 'optics', label: 'Dispersion',
    unit: '', min: 0, max: 1.5, step: 0.01, value: 0.18, digits: 2,
    hint: 'Radial lateral chromatic aberration.',
  },
  {
    id: 'doppler', uniform: 'uDoppler', group: 'spacetime', label: 'Doppler Beaming',
    unit: '×', min: 0, max: 2, step: 0.01, value: 1.0, digits: 2,
    hint: 'Exponent on the relativistic Doppler factor (1 = physical).',
  },
  {
    id: 'redshift', uniform: 'uRedshift', group: 'spacetime', label: 'Gravitational Redshift',
    unit: '×', min: 0, max: 2, step: 0.01, value: 1.0, digits: 2,
    hint: 'Exponent on the static-observer redshift factor (1 = physical).',
  },
  {
    id: 'photonGlow', uniform: 'uPhotonGlow', group: 'spacetime', label: 'Photon Corona',
    unit: '', min: 0, max: 1.5, step: 0.01, value: 0.12, digits: 2,
    hint: 'Optically thin emission near the photon sphere; integrated along the ray.',
  },
  {
    id: 'diskBrightness', uniform: 'uDiskBrightness', group: 'disk', label: 'Disk Brightness',
    unit: '', min: 0, max: 4, step: 0.01, value: 0.76, digits: 2,
    hint: 'Scale of the radiating disk surface brightness.',
  },
  {
    id: 'diskTemp', uniform: 'uDiskTemp', group: 'disk', label: 'Peak Temperature',
    unit: 'K', min: 2800, max: 16000, step: 100, value: 4800, digits: 0,
    hint: 'Display temperature of the Shakura–Sunyaev profile peak.',
  },
  {
    id: 'diskInner', uniform: 'uDiskInner', group: 'disk', label: 'Inner Radius',
    unit: 'rₛ', min: 2.0, max: 6.0, step: 0.01, value: 3.0, digits: 2,
    hint: 'ISCO for Schwarzschild is exactly 3 rₛ. Values below are non-Keplerian.',
  },
  {
    id: 'diskOuter', uniform: 'uDiskOuter', group: 'disk', label: 'Outer Radius',
    unit: 'rₛ', min: 6, max: 24, step: 0.1, value: 11.0, digits: 1,
    hint: 'Truncation radius of the emission profile.',
  },
  {
    id: 'turbulence', uniform: 'uTurbulence', group: 'disk', label: 'Turbulence',
    unit: '', min: 0, max: 1.5, step: 0.01, value: 0.78, digits: 2,
    hint: 'Amplitude of the magnetorotational-like density field.',
  },
  {
    id: 'noiseScale', uniform: 'uNoiseScale', group: 'disk', label: 'Turbulence Scale',
    unit: '', min: 0.3, max: 8, step: 0.05, value: 2.90, digits: 2,
    hint: 'Spatial frequency of the disk plasma field.',
  },
  {
    id: 'diskSpeed', uniform: 'uDiskSpeed', group: 'disk', label: 'Orbital Speed',
    unit: '×', min: 0, max: 4, step: 0.01, value: 0.85, digits: 2,
    hint: 'Visual multiplier for Keplerian shear. Above 1 is time-lapse.',
  },
  {
    id: 'diskThickness', uniform: 'uDiskThickness', group: 'disk', label: 'Disk Thickness',
    unit: 'rₛ', min: 0.01, max: 0.6, step: 0.01, value: 0.20, digits: 2,
    hint: 'Soft optical thickness and grazing path length.',
  },
  {
    id: 'diskOpacity', uniform: 'uDiskOpacity', group: 'disk', label: 'Optical Depth',
    unit: '', min: 0.05, max: 1, step: 0.01, value: 0.62, digits: 2,
    hint: 'Absorption of each equatorial crossing; lower reveals secondary images.',
  },
  {
    id: 'skyBrightness', uniform: 'uSkyBrightness', group: 'sky', label: 'Sky Luminance',
    unit: '', min: 0, max: 3, step: 0.01, value: 0.72, digits: 2,
    hint: 'Integrated brightness of the procedural galactic sky.',
  },
  {
    id: 'starDensity', uniform: 'uStarDensity', group: 'sky', label: 'Star Density',
    unit: '', min: 0, max: 2, step: 0.01, value: 1.0, digits: 2,
    hint: 'Resolved stellar population density.',
  },
  {
    id: 'milkyway', uniform: 'uMilkyway', group: 'sky', label: 'Galactic Band',
    unit: '', min: 0, max: 2, step: 0.01, value: 1.0, digits: 2,
    hint: 'Strength of the lensed Milky Way and dust lanes.',
  },
]);

export const DEFAULT_PARAMS = Object.freeze(
  Object.fromEntries(PARAMETERS.map((p) => [p.id, p.value])),
);

export const PRESETS = Object.freeze([
  {
    id: 'equatorial',
    index: 0,
    code: '01',
    label: 'EQUATORIAL',
    title: 'Equatorial drift',
    caption: '12° above disk plane',
    position: [0.0, 4.4, 20.5],
    fov: 42,
  },
  {
    id: 'edge',
    index: 1,
    code: '02',
    label: 'EDGE-ON',
    title: 'Razor edge',
    caption: '2.3° — photon line',
    position: [0.0, 0.78, 19.5],
    fov: 38,
  },
  {
    id: 'polar',
    index: 2,
    code: '03',
    label: 'POLAR',
    title: 'High inclination',
    caption: '74° — full shadow',
    position: [1.8, 23.0, 6.2],
    fov: 46,
  },
  {
    id: 'close',
    index: 3,
    code: '04',
    label: 'CLOSE PASS',
    title: 'Close pass',
    caption: '13.4 rₛ — strong lensing',
    position: [5.6, 2.5, 12.0],
    fov: 55,
  },
]);

export const DEBUG_VIEWS = Object.freeze([
  { id: 0, code: '00', label: 'FINAL COMPOSITE', desc: 'HDR bloom · ACES · plate response' },
  { id: 1, code: '01', label: 'GEODESIC FIELD', desc: 'ray fate · winding · disk crossings' },
  { id: 2, code: '02', label: 'CRITICAL CURVE', desc: 'impact parameter vs. 3√3/2 rₛ' },
  { id: 3, code: '03', label: 'MULTI-IMAGE', desc: 'equatorial crossings per pixel' },
  { id: 4, code: '04', label: 'DOPPLER SHIFT', desc: 'blue / redshift of the moving plasma' },
  { id: 5, code: '05', label: 'GRAVITATIONAL REDSHIFT', desc: '√(1 − rₛ/r) at the disk' },
  { id: 6, code: '06', label: 'HDR BUFFER', desc: 'log-luminance before display transform' },
  { id: 7, code: '07', label: 'BLOOM ISOLATION', desc: 'thresholded multi-scale bloom only' },
  { id: 8, code: '08', label: 'RAY STEP COST', desc: 'adaptive integration steps per pixel' },
  { id: 9, code: '09', label: 'LENSED SKY ONLY', desc: 'procedural galaxy · disk disabled' },
]);

export const SHORTCUTS = Object.freeze([
  { keys: ['0', '…', '9'], label: 'Diagnostic views', note: '0 returns to final' },
  { keys: ['Q', 'W', 'E', 'R'], label: 'View presets', note: 'Equatorial · Edge-on · Polar · Close' },
  { keys: ['C'], label: 'Cinematic orbit', note: 'Auto camera loop' },
  { keys: ['P', 'SPACE'], label: 'Pause integration', note: 'Freezes simulation time' },
  { keys: ['V'], label: 'Cycle viewpoints', note: 'Steps through the four presets' },
  { keys: ['G'], label: 'Parameter matrix', note: '21 live parameters' },
  { keys: ['H'], label: 'Hide interface', note: 'Reveals the clean plate' },
  { keys: ['M'], label: 'Ambient audio', note: 'Starts on explicit request only' },
  { keys: ['F'], label: 'Fullscreen', note: 'Immersive mode' },
  { keys: ['S'], label: 'Save frame', note: 'PNG · lens name metadata-free' },
  { keys: ['?'], label: 'Shortcut ledger', note: 'Scientific notes + controls' },
  { keys: ['ESC'], label: 'Close overlay', note: 'Help / parameters' },
]);

export const STORAGE_KEY = 'gargantua:state:v1';
export const URL_DEFAULTS = Object.freeze({
  time: 17.25,
  warmup: 2,
});

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function normalizedParamValue(param, value) {
  return clamp((value - param.min) / (param.max - param.min), 0, 1);
}

export function clampParams(candidate = {}) {
  const out = { ...DEFAULT_PARAMS };
  for (const p of PARAMETERS) {
    const v = Number(candidate[p.id]);
    if (Number.isFinite(v)) out[p.id] = clamp(v, p.min, p.max);
  }
  return out;
}

export function resolveQuality(name, fallback = 'high') {
  return QUALITY[name] ? name : fallback;
}

export function formatParam(param, value) {
  if (param.id === 'diskTemp') return `${Math.round(value).toLocaleString('en-US')}`;
  if (param.id === 'diskOuter') return value.toFixed(1);
  if (param.id === 'diskInner') return value.toFixed(2);
  return value.toFixed(param.digits);
}

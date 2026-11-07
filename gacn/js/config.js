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
    label: '标准',
    short: '标准',
    maxSteps: 230,
    stepScale: 1.14,
    dprCap: 1.15,
    baseScale: 0.95,
    maxPixels: 1_450_000,
    bloomLevels: 4,
    note: '移动优先 · 稳定帧率',
  },
  high: {
    id: 'high',
    label: '高清',
    short: '高清',
    maxSteps: 310,
    stepScale: 1.0,
    dprCap: 1.75,
    baseScale: 1.0,
    maxPixels: 3_400_000,
    bloomLevels: 5,
    note: '原生 Retina · 桌面默认',
  },
  cinematic: {
    id: 'cinematic',
    label: '电影',
    short: '电影',
    maxSteps: 520,
    stepScale: 0.9,
    dprCap: 2.0,
    baseScale: 1.0,
    maxPixels: 7_200_000,
    bloomLevels: 6,
    note: '最高测地线精度',
  },
});

export const PARAM_GROUPS = Object.freeze([
  { id: 'optics', label: '光学', short: '光学', description: '相机与胶片响应' },
  { id: 'spacetime', label: '时空', short: '时空', description: '光的相对论传递' },
  { id: 'disk', label: '吸积盘', short: '吸积', description: '程序化 Shakura–Sunyaev 吸积盘' },
  { id: 'sky', label: '星空', short: '星空', description: '程序化银河环境' },
]);

/** Exactly 21 live parameters. */
export const PARAMETERS = Object.freeze([
  {
    id: 'exposure', uniform: 'uExposure', group: 'optics', label: '曝光',
    unit: '', min: 0.2, max: 3.0, step: 0.01, value: 0.92, digits: 2,
    hint: 'ACES 电影色调映射前的线性曝光。',
  },
  {
    id: 'bloomStrength', uniform: 'uBloomStrength', group: 'optics', label: '泛光强度',
    unit: '', min: 0, max: 2, step: 0.01, value: 0.34, digits: 2,
    hint: '叠加式 HDR 多尺度泛光。',
  },
  {
    id: 'bloomThreshold', uniform: 'uBloomThreshold', group: 'optics', label: '泛光阈值',
    unit: '', min: 0, max: 3, step: 0.01, value: 1.45, digits: 2,
    hint: '触发泛光链所需的 HDR 亮度。',
  },
  {
    id: 'grain', uniform: 'uGrain', group: 'optics', label: '胶片颗粒',
    unit: '', min: 0, max: 1, step: 0.01, value: 0.16, digits: 2,
    hint: '动态光化学颗粒。',
  },
  {
    id: 'vignette', uniform: 'uVignette', group: 'optics', label: '暗角',
    unit: '', min: 0, max: 1.5, step: 0.01, value: 0.60, digits: 2,
    hint: '画面边缘的镜头衰减。',
  },
  {
    id: 'chromatic', uniform: 'uChromatic', group: 'optics', label: '色散',
    unit: '', min: 0, max: 1.5, step: 0.01, value: 0.18, digits: 2,
    hint: '径向横向色差。',
  },
  {
    id: 'doppler', uniform: 'uDoppler', group: 'spacetime', label: '多普勒增亮',
    unit: '×', min: 0, max: 2, step: 0.01, value: 1.0, digits: 2,
    hint: '相对论多普勒因子的指数（1 = 物理值）。',
  },
  {
    id: 'redshift', uniform: 'uRedshift', group: 'spacetime', label: '引力红移',
    unit: '×', min: 0, max: 2, step: 0.01, value: 1.0, digits: 2,
    hint: '静态观测者红移因子的指数（1 = 物理值）。',
  },
  {
    id: 'photonGlow', uniform: 'uPhotonGlow', group: 'spacetime', label: '光子日冕',
    unit: '', min: 0, max: 1.5, step: 0.01, value: 0.12, digits: 2,
    hint: '光子球附近的薄发射，沿光线积分。',
  },
  {
    id: 'diskBrightness', uniform: 'uDiskBrightness', group: 'disk', label: '盘面亮度',
    unit: '', min: 0, max: 4, step: 0.01, value: 0.76, digits: 2,
    hint: '吸积盘表面辐射亮度的缩放。',
  },
  {
    id: 'diskTemp', uniform: 'uDiskTemp', group: 'disk', label: '峰值温度',
    unit: 'K', min: 2800, max: 16000, step: 100, value: 4800, digits: 0,
    hint: 'Shakura–Sunyaev 温度分布峰值的显示温度。',
  },
  {
    id: 'diskInner', uniform: 'uDiskInner', group: 'disk', label: '内半径',
    unit: 'rₛ', min: 2.0, max: 6.0, step: 0.01, value: 3.0, digits: 2,
    hint: '史瓦西黑洞的 ISCO 恰为 3 rₛ；更小值为非开普勒轨道。',
  },
  {
    id: 'diskOuter', uniform: 'uDiskOuter', group: 'disk', label: '外半径',
    unit: 'rₛ', min: 6, max: 24, step: 0.1, value: 11.0, digits: 1,
    hint: '辐射分布的截断半径。',
  },
  {
    id: 'turbulence', uniform: 'uTurbulence', group: 'disk', label: '湍流',
    unit: '', min: 0, max: 1.5, step: 0.01, value: 0.78, digits: 2,
    hint: '类磁旋转密度场的振幅。',
  },
  {
    id: 'noiseScale', uniform: 'uNoiseScale', group: 'disk', label: '湍流尺度',
    unit: '', min: 0.3, max: 8, step: 0.05, value: 2.90, digits: 2,
    hint: '盘面等离子体场的空间频率。',
  },
  {
    id: 'diskSpeed', uniform: 'uDiskSpeed', group: 'disk', label: '轨道速度',
    unit: '×', min: 0, max: 4, step: 0.01, value: 0.85, digits: 2,
    hint: '开普勒剪切的视觉倍率；大于 1 为延时摄影。',
  },
  {
    id: 'diskThickness', uniform: 'uDiskThickness', group: 'disk', label: '盘面厚度',
    unit: 'rₛ', min: 0.01, max: 0.6, step: 0.01, value: 0.20, digits: 2,
    hint: '柔和光学厚度与掠射路径长度。',
  },
  {
    id: 'diskOpacity', uniform: 'uDiskOpacity', group: 'disk', label: '光学深度',
    unit: '', min: 0.05, max: 1, step: 0.01, value: 0.62, digits: 2,
    hint: '每次赤道面穿越的吸收；更低值可显露二次像。',
  },
  {
    id: 'skyBrightness', uniform: 'uSkyBrightness', group: 'sky', label: '星空亮度',
    unit: '', min: 0, max: 3, step: 0.01, value: 0.72, digits: 2,
    hint: '程序化银河天空的总亮度。',
  },
  {
    id: 'starDensity', uniform: 'uStarDensity', group: 'sky', label: '恒星密度',
    unit: '', min: 0, max: 2, step: 0.01, value: 1.0, digits: 2,
    hint: '可分辨恒星群的密度。',
  },
  {
    id: 'milkyway', uniform: 'uMilkyway', group: 'sky', label: '银河带',
    unit: '', min: 0, max: 2, step: 0.01, value: 1.0, digits: 2,
    hint: '透镜化银河与尘埃带的强度。',
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
    label: '赤道',
    title: '赤道漂移',
    caption: '盘面上方 12°',
    position: [0.0, 4.4, 20.5],
    fov: 42,
  },
  {
    id: 'edge',
    index: 1,
    code: '02',
    label: '侧视',
    title: '刀锋边缘',
    caption: '2.3° · 光子线',
    position: [0.0, 0.78, 19.5],
    fov: 38,
  },
  {
    id: 'polar',
    index: 2,
    code: '03',
    label: '极地',
    title: '高倾角',
    caption: '74° · 完整阴影',
    position: [1.8, 23.0, 6.2],
    fov: 46,
  },
  {
    id: 'close',
    index: 3,
    code: '04',
    label: '近距',
    title: '近距掠过',
    caption: '13.4 rₛ · 强透镜',
    position: [5.6, 2.5, 12.0],
    fov: 55,
  },
]);

export const DEBUG_VIEWS = Object.freeze([
  { id: 0, code: '00', label: '最终合成', desc: 'HDR 泛光 · ACES · 最终成像' },
  { id: 1, code: '01', label: '测地线场', desc: '光线归宿 · 绕转 · 盘面穿越' },
  { id: 2, code: '02', label: '临界曲线', desc: '碰撞参数 vs. 3√3/2 rₛ' },
  { id: 3, code: '03', label: '多重像', desc: '每像素赤道面穿越次数' },
  { id: 4, code: '04', label: '多普勒频移', desc: '运动等离子体的蓝移 / 红移' },
  { id: 5, code: '05', label: '引力红移', desc: '盘面处的 √(1 − rₛ/r)' },
  { id: 6, code: '06', label: 'HDR 缓冲', desc: '显示变换前的对数亮度' },
  { id: 7, code: '07', label: '泛光分离', desc: '仅阈值化多尺度泛光' },
  { id: 8, code: '08', label: '光线步数成本', desc: '每像素自适应积分步数' },
  { id: 9, code: '09', label: '仅透镜星空', desc: '程序化银河 · 关闭吸积盘' },
]);

export const SHORTCUTS = Object.freeze([
  { keys: ['0', '…', '9'], label: '诊断视图', note: '按 0 返回最终合成' },
  { keys: ['Q', 'W', 'E', 'R'], label: '视角预设', note: '赤道 · 侧视 · 极地 · 近距' },
  { keys: ['C'], label: '电影环绕', note: '自动相机循环' },
  { keys: ['P', 'SPACE'], label: '暂停积分', note: '冻结模拟时间' },
  { keys: ['V'], label: '循环视角', note: '依次切换四个预设' },
  { keys: ['G'], label: '参数矩阵', note: '21 项实时参数' },
  { keys: ['H'], label: '隐藏界面', note: '显示纯净画面' },
  { keys: ['M'], label: '环境音乐', note: '仅在明确操作后启动' },
  { keys: ['F'], label: '全屏', note: '沉浸模式' },
  { keys: ['S'], label: '保存帧', note: 'PNG · 不含镜头元数据' },
  { keys: ['?'], label: '快捷键手册', note: '科学说明与操作' },
  { keys: ['ESC'], label: '关闭浮层', note: '帮助 / 参数' },
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

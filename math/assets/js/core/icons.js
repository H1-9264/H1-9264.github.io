/* icons.js — 全站内联 SVG 图标（24x24，线性风格，随 currentColor 变色） */
const P = {
  home: '<path d="M3 10.2 12 3.5l9 6.7"/><path d="M5.5 9.3V20h13V9.3"/><path d="M9.8 20v-5.2h4.4V20"/>',
  function: '<path d="M3.5 20V4"/><path d="M3.5 20h17"/><path d="M4.5 16.5c3-1 4.5-6 7-9.5s4.5-3.4 8-2"/>',
  shapes: '<circle cx="8.5" cy="8.5" r="5"/><path d="M3.5 20.5h11L9 12.5z"/><path d="M15.5 15.5l5 5M20.5 15.5l-5 5"/>',
  toolbox: '<path d="M3.5 8.5h17v11h-17z"/><path d="M8.5 8.5V4.5h7v4"/><path d="M3.5 13.2h17"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8.8a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9.2a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z"/>',
  monitor: '<path d="M3.5 4.5h17v11h-17z"/><path d="M9 20h6M12 15.5V20"/>',
  download: '<path d="M12 3.5v11"/><path d="M7.8 10.4 12 14.6l4.2-4.2"/><path d="M4 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-1.5"/>',
  upload: '<path d="M12 20.5v-11"/><path d="M7.8 13.6 12 9.4l4.2 4.2"/><path d="M4 6.5V5A1.5 1.5 0 0 1 5.5 3.5h13A1.5 1.5 0 0 1 20 5v1.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.8" cy="9.8" r="1.6"/><path d="m4.5 17.5 4.7-4.7 3.3 3.3 2.7-2.7 4.3 4.3"/>',
  copy: '<rect x="9" y="9" width="11.5" height="11.5" rx="2"/><path d="M15 5.6A2 2 0 0 0 13 3.5H5.5a2 2 0 0 0-2 2V13a2 2 0 0 0 2 2"/>',
  trash: '<path d="M4.5 6.5h15"/><path d="M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7"/><path d="M6.5 6.5 7.4 20a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13.5"/><path d="M10.5 10.5v6.5M13.5 10.5v6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  refresh: '<path d="M20 11.5a8 8 0 1 0-2.4 5.9"/><path d="M20 4.5v7h-7"/>',
  reset: '<path d="M4 11.5a8 8 0 1 1 2.4 5.9"/><path d="M4 4.5v7h7"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4 21 21M10.5 7.8v5.4M7.8 10.5h5.4"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4 21 21M7.8 10.5h5.4"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/>',
  grid: '<path d="M3.5 3.5h17v17h-17z"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  play: '<path d="M7.5 4.8 19 12 7.5 19.2z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2"/><path d="M9.5 2.5h5"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h5.5L10 21.5l8.5-11H13z"/>',
  ruler: '<rect x="1.8" y="8.2" width="20.4" height="7.6" rx="1.6" transform="rotate(-45 12 12)"/><path d="M9 6.8l1.6 1.6M12 9.8l1.6 1.6M15 12.8l1.6 1.6"/>',
  compass: '<circle cx="12" cy="4.6" r="2.1"/><path d="M12 6.7 5.5 20.5M12 6.7l6.5 13.8"/><path d="M6.9 14.4a9 9 0 0 1 10.2 0"/>',
  point: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>',
  segment: '<path d="M5.5 18.5 18.5 5.5"/><circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="5.5" r="2"/>',
  line: '<path d="M2.5 15.5 21.5 8.5"/><circle cx="7" cy="13.8" r="1.8"/><circle cx="17" cy="10.2" r="1.8"/>',
  ray: '<path d="M3.5 19 21 6"/><circle cx="7.5" cy="16" r="1.8"/><path d="M17.5 8.6 21.5 6l-1 4.3"/>',
  perpendicular: '<path d="M4 19.5V5.5h15"/><path d="M8 19.5V9.5h6"/>',
  parallel: '<path d="M4 18.5 12 4"/><path d="M11 20.5 19 6"/>',
  circle: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
  arc: '<path d="M3.5 17a9 9 0 0 1 15 0"/><circle cx="3.5" cy="17" r="1.8"/><circle cx="18.5" cy="17" r="1.8"/>',
  polygon: '<path d="M12 3.6 20.5 9.8 17.2 19.8H6.8L3.5 9.8z"/>',
  angle: '<path d="M4 20 12 6l8 14"/><path d="M7 15.7a9.5 9.5 0 0 1 10 0"/>',
  distance: '<path d="M4.5 12h15"/><path d="M4.5 8.5v7M19.5 8.5v7"/>',
  area: '<path d="M4 5.5h16v13H4z"/><path d="m7.5 15.5 4-6 3 4 2-2.6"/>',
  text: '<path d="M5 6.5V5h14v1.5"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  select: '<path d="M5 3.5 18.5 12 12 13.5 9 20z"/>',
  trace: '<path d="M3.5 20V4"/><path d="M3.5 20h17"/><path d="M5.5 16.5c3.5 0 4.5-8 8-8s4 5.5 6.5 5.5"/><circle cx="13.5" cy="8.6" r="1.9" fill="currentColor" stroke="none"/>',
  transform: '<path d="M6 18 18 6"/><path d="M6 12V6h6"/><path d="M18 12v6h-6"/>',
  reflect: '<path d="M12 3v18"/><path d="M8.5 7.5 3.5 12l5 4.5z"/><path d="M15.5 7.5 20.5 12l-5 4.5z"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 3.5v5h-5"/>',
  scale: '<path d="M4 20 10 14"/><path d="M4 14v6h6"/><path d="M10 10h10v10H10z"/>',
  undo: '<path d="M9 7H5.5v-3.5"/><path d="M5.7 7.2A8 8 0 1 1 5 13"/>',
  redo: '<path d="M15 7h3.5v-3.5"/><path d="M18.3 7.2A8 8 0 1 0 19 13"/>',
  save: '<path d="M5 3.5h11L20.5 8v12a.5.5 0 0 1-.5.5H5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M8 3.5v6h7v-6"/><path d="M8 20.5v-6h8v6"/>',
  folder: '<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.3"/><circle cx="12" cy="16.6" r="0.9" fill="currentColor" stroke="none"/>',
  keyboard: '<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M8 14h8"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.6-1.6-1.9-1.6-3.1 0-1 .8-1.7 1.9-1.7h1.6A4.8 4.8 0 0 0 20.5 9c0-3.1-3.8-5.5-8.5-5.5z"/><circle cx="8" cy="10" r="1.2" fill="currentColor" stroke="none"/><circle cx="11.5" cy="7.8" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="9.6" r="1.2" fill="currentColor" stroke="none"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 17v-5M12.5 17V8M17 17v-8"/>',
  database: '<ellipse cx="12" cy="6.5" rx="7.5" ry="3"/><path d="M4.5 6.5v11c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-11"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
  calculator: '<rect x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M8 6.5h8"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>',
  swap: '<path d="M7 5.5 3.5 9 7 12.5"/><path d="M3.5 9h12.5"/><path d="M17 11.5 20.5 15 17 18.5"/><path d="M20.5 15H8"/>',
  sliders: '<path d="M5 6.5h14M5 12h14M5 17.5h14"/><circle cx="9" cy="6.5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="17.5" r="2"/>',
  layers: '<path d="m12 3.5 8.5 4.6L12 12.7 3.5 8.1z"/><path d="m4.6 12.4 7.4 4 7.4-4"/><path d="m4.6 16.4 7.4 4 7.4-4"/>',
  login: '<path d="M14 3.5h4.5a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H14"/><path d="M9.5 8 13.5 12l-4 4"/><path d="M13.5 12H3.5"/>',
  external: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v5.5H4.5V6H10"/>',
  sparkle: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5 10.2 12.6 4.5 10.8 10.2 9z"/><path d="M19 3.5v3M17.5 5h3"/>',
  infinity: '<path d="M8 15.5c-2.5 0-4-1.6-4-3.5s1.5-3.5 4-3.5c3.5 0 4.5 7 8 7 2.5 0 4-1.6 4-3.5s-1.5-3.5-4-3.5c-3.5 0-4.5 7-8 7z"/>',
  github: '<path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.7-.2.7-.5v-1.8c-2.6.6-3.2-1.2-3.2-1.2-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.7-1.4-2.1-.2-4.3-1-4.3-4.6 0-1 .4-1.9 1-2.5-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.6 1 1.5 1 2.5 0 3.6-2.2 4.4-4.3 4.6.4.4.7 1 .7 2v3c0 .3.2.6.7.5A9.5 9.5 0 0 0 12 2.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  eye: '<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16"/><path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.9"/><path d="M6.4 7.3A17 17 0 0 0 2.5 12S6 19 12 19a9.3 9.3 0 0 0 3.6-.7"/><path d="M10 10a2.8 2.8 0 0 0 4 4"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  unlock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 7.5-2"/>',
  pin: '<path d="M12 21v-6"/><path d="M8 3.5h8l-.8 3.2 2.8 3.3a1 1 0 0 1-.7 1.7H6.7A1 1 0 0 1 6 10l2.8-3.3z"/>',
  bell: '<path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5z"/><path d="M10 18.5a2 2 0 0 0 4 0"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  curve: '<path d="M3.5 18.5c4-1 5.5-13 9-13 2.4 0 3.6 3.4 8 3.4"/>',
  integrate: '<path d="M8 4.5c-2 0-2.5 2-2.5 5s.5 5 .5 7-1 3-2.5 3"/><path d="M3.5 20.5h17"/><path d="M11 16.5c2.5-3 3.5-7 6-9"/>',
  root: '<path d="M3 12h3l2.5 6L12 5h9"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.6"/><path d="M3.5 9.5h17M9.5 9.5v10M15.5 9.5v10"/>',
  printer: '<path d="M7 8.5V3.5h10v5"/><rect x="3.5" y="8.5" width="17" height="8" rx="1.6"/><path d="M7 14.5h10v6H7z"/>',
  qr: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><path d="M13.5 13.5h3v3h-3zM20.5 13.5v3M17 20.5h3.5M13.5 20.5h.01"/>',
  wave: '<path d="M2.5 14c2-5 3.5-5 5.5 0s3.5 5 5.5 0 3.5-5 5.5 0 2.5 3 2.5 3"/>',
  box: '<path d="M12 3.5 20.5 8v8L12 20.5 3.5 16V8z"/><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8"/>',
  matrix: '<path d="M7.5 3.5H5v17h2.5M16.5 3.5H19v17h-2.5"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/>',
  equation: '<path d="M5 7.5h6M5 12h6M5 16.5h6M14.5 7.5h5M17 5l-5 14 5-0"/>',
  code: '<path d="m9 7-5 5 5 5M15 7l5 5-5 5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  flame: '<path d="M12 21c3.6 0 6-2.4 6-5.6 0-4.4-4.2-5.6-4.2-9.4 0-1-.4-2-1.2-3-1.2 2.6-3.4 3.4-4.6 5.6A8.6 8.6 0 0 0 6 14c0 3.6 2.4 7 6 7z"/><path d="M12 18c1.4 0 2.4-1 2.4-2.3 0-1.7-1.7-2.2-1.7-3.8-1 1-2.8 1.6-2.8 3.6 0 1.4 1 2.5 2.1 2.5z"/>',
  shuffle: '<path d="M17 4.5 20.5 8 17 11.5"/><path d="M17 12.5 20.5 16 17 19.5"/><path d="M3.5 8h4c4 0 5 8 9 8h4"/><path d="M3.5 16h4c1.2 0 2.2-.7 3-1.8"/>',
  star: '<path d="m12 3.8 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 10l5.9-.8z"/>',
  wand: '<path d="M4 20 15 9"/><path d="M14 4.5 15 7l2.5 1-2.5 1-1 2.5-1-2.5L10.5 8 13 7z"/><path d="M19.5 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  uploadImage: '<path d="M4 17.5V6a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 6v11.5"/><path d="m4 17.5 5-5 3.5 3.5 2.5-2.5 5 5"/><circle cx="9" cy="9" r="1.5"/>',
  filter: '<path d="M3.5 5.5h17l-6.5 8v6l-4-2.5v-3.5z"/>',
  file: '<path d="M6 3.5h7.5L19 9v11.5H6z"/><path d="M13.5 3.5V9H19"/>',
  box3d: '<path d="M12 2.8 21 7.6v8.8L12 21.2 3 16.4V7.6z"/><path d="M3 7.6 12 12.4l9-4.8M12 12.4v8.8"/>',
  anchor: '<circle cx="12" cy="5.5" r="2.5"/><path d="M12 8v13"/><path d="M5 12H3.5a8.5 8.5 0 0 0 17 0H19"/>',
  clipboard: '<rect x="6.5" y="4.5" width="11" height="16" rx="1.6"/><path d="M9.5 4.5V3.5h5v1"/><path d="M9.5 10h5M9.5 13.5h5M9.5 17h3"/>',
  link: '<path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7l-1.4 1.4"/><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.4-1.4"/>'
};

export function icon(name, { size = 20, cls = '', stroke = 1.7, fill = false } = {}) {
  const body = P[name] || P.info;
  return '<svg class="' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' +
    (fill ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="' + stroke +
    '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
}

export function iconEl(name, opts) {
  const wrap = document.createElement('span');
  wrap.style.display = 'inline-flex';
  wrap.innerHTML = icon(name, opts);
  return wrap.firstElementChild;
}

export const ICON_NAMES = Object.keys(P);
export const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
  '<stop offset="0" stop-color="#3fb950"/><stop offset="1" stop-color="#d29922"/></linearGradient></defs>' +
  '<rect width="64" height="64" rx="15" fill="#161b22"/>' +
  '<path d="M10 52V12M10 52h44" stroke="#30363d" stroke-width="4" stroke-linecap="round"/>' +
  '<path d="M12 44c8-2 10-22 20-24s10 14 20 12" fill="none" stroke="url(#g)" stroke-width="6" stroke-linecap="round"/>' +
  '<circle cx="32" cy="20" r="4.5" fill="#d29922"/></svg>'
);
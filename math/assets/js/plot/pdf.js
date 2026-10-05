/* pdf.js — 极简 PDF 写入器（零依赖，把 canvas 图片组成多页 PDF）
   PDF 结构：Catalog → Pages → 每页 { Contents 流 + Image XObject }，图片用 JPEG(DCTDecode) 嵌入。
   坐标系：调用方用"左上角原点、单位 pt"，内部统一翻转到 PDF 的左下角原点。 */

const A4 = { w: 595.28, h: 841.89 };
const LETTER = { w: 612, h: 792 };
const LANDSCAPE = (s) => ({ w: s.h, h: s.w });

export const PAGE_SIZES = { a4: A4, letter: LETTER };

function asciiBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function parseDataUrl(dataUrl) {
  const m = String(dataUrl).match(/^data:image\/([a-zA-Z]+);base64,(.*)$/s);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  return { kind, bytes: base64ToBytes(m[2]), filter: kind === 'png' ? '/FlateDecode' : '/DCTDecode' };
}

/* PDF 标准字体只支持 WinAnsi：非 ASCII 一律替换（标题中文建议走图片或英文） */
export function asciiSafe(str) {
  return String(str ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00d7/g, 'x')
    .replace(/[^\x20-\x7e]/g, '?');
}
const esc = (s) => asciiSafe(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export class PdfDoc {
  constructor({ size = 'a4', landscape = false, margin = 40 } = {}) {
    const base = PAGE_SIZES[size] || A4;
    this.page = landscape ? LANDSCAPE(base) : { ...base };
    this.margin = margin;
    this.pages = [];
  }

  get contentWidth() { return this.page.w - this.margin * 2; }
  get contentHeight() { return this.page.h - this.margin * 2; }

  /* 新增一页，返回页面对象（供 draw* 使用） */
  addPage() {
    const page = { ops: [], images: [], font: new Set(), pageH: this.page.h };
    this.pages.push(page);
    return page;
  }

  /* 图片：给出像素尺寸与目标框（左上角原点），等比缩放并居中 */
  fitImage(page, canvas, box, { quality = 0.92 } = {}) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return null;
    const pxW = canvas.width;
    const pxH = canvas.height;
    page.images.push({ ...parsed, pxW, pxH });
    const idx = page.images.length;
    const scale = Math.min(box.w / pxW, box.h / pxH);
    const w = pxW * scale;
    const h = pxH * scale;
    const x = box.x + (box.w - w) / 2;
    const y = box.y + (box.h - h) / 2;
    page.ops.push('q ' + w.toFixed(2) + ' 0 0 ' + h.toFixed(2) + ' ' + x.toFixed(2) + ' ' +
      (page.pageH - y - h).toFixed(2) + ' cm /Im' + idx + ' Do Q');
    return { x, y, w, h };
  }

  drawText(page, text, x, y, { size = 11, bold = false, color = [0.12, 0.14, 0.16] } = {}) {
    const font = bold ? '/F2' : '/F1';
    page.font.add(font);
    page.ops.push('BT ' + font + ' ' + size + ' Tf ' + color.map((v) => v.toFixed(3)).join(' ') + ' rg ' +
      x.toFixed(2) + ' ' + (page.pageH - y - size).toFixed(2) + ' Td (' + esc(text) + ') Tj ET');
  }

  drawLine(page, x1, y1, x2, y2, { width = 0.6, color = [0.78, 0.8, 0.84] } = {}) {
    page.ops.push('q ' + width + ' w ' + color.map((v) => v.toFixed(3)).join(' ') + ' RG ' +
      x1.toFixed(2) + ' ' + (page.pageH - y1).toFixed(2) + ' m ' +
      x2.toFixed(2) + ' ' + (page.pageH - y2).toFixed(2) + ' l S Q');
  }

  /* 组装 PDF 字节 */
  build() {
    const parts = [];
    let length = 0;
    const push = (bytes) => { parts.push(bytes); length += bytes.length; };
    const ascii = (str) => push(asciiBytes(str));

    const pageCount = this.pages.length;
    const pageObjIds = [];
    const contentObjIds = [];
    const imageObjIds = [];
    let next = 5;
    this.pages.forEach((page) => {
      pageObjIds.push(next++);
      contentObjIds.push(next++);
      const ids = [];
      page.images.forEach(() => ids.push(next++));
      imageObjIds.push(ids);
    });

    const objects = new Map();
    objects.set(1, () => '<< /Type /Catalog /Pages 2 0 R >>');
    objects.set(2, () => '<< /Type /Pages /Count ' + pageCount + ' /Kids [' +
      pageObjIds.map((id) => id + ' 0 R').join(' ') + '] >>');
    objects.set(3, () => '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objects.set(4, () => '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    this.pages.forEach((page, i) => {
      const pid = pageObjIds[i];
      const cid = contentObjIds[i];
      const ids = imageObjIds[i];
      objects.set(pid, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
        this.page.w.toFixed(2) + ' ' + this.page.h.toFixed(2) + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>' +
        (ids.length ? ' /XObject << ' + ids.map((id, k) => '/Im' + (k + 1) + ' ' + id + ' 0 R').join(' ') + ' >>' : '') +
        ' >> /Contents ' + cid + ' 0 R >>');
      const stream = page.ops.join('\n');
      objects.set(cid, () => ({ data: asciiBytes(stream) }));
      page.images.forEach((img, k) => {
        objects.set(ids[k], () => ({
          data: img.bytes,
          dict: '/Type /XObject /Subtype /Image /Width ' + img.pxW + ' /Height ' + img.pxH +
            ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ' + img.filter +
            (img.filter === '/FlateDecode'
              ? ' /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ' + img.pxW + ' >>'
              : '')
        }));
      });
    });

    ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const total = next;                       // 对象编号 1..next-1
    const offsets = new Array(total).fill(0);
    for (let id = 1; id < total; id++) {
      offsets[id] = length;
      const fn = objects.get(id);
      if (!fn) { ascii(id + ' 0 obj\n<< >>\nendobj\n'); continue; }
      const res = fn();
      if (typeof res === 'string') {
        ascii(id + ' 0 obj\n' + res + '\nendobj\n');
      } else {
        ascii(id + ' 0 obj\n<< ' + (res.dict ? res.dict + ' ' : '') + '/Length ' + res.data.length + ' >>\nstream\n');
        push(res.data);
        ascii('\nendstream\nendobj\n');
      }
    }
    const xref = length;
    ascii('xref\n0 ' + total + '\n0000000000 65535 f \n');
    for (let id = 1; id < total; id++) ascii(String(offsets[id]).padStart(10, '0') + ' 00000 n \n');
    ascii('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');

    return new Blob(parts, { type: 'application/pdf' });
  }
}

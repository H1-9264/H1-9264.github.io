/* ===== aiweb · project.js —— JSON 解析 / 文件树 / 下载 / ZIP / 预览 / PPT ===== */
(function (g) {
  'use strict';

  /* ---------- 从模型回复里抠出 JSON（带容错修复） ---------- */
  function tryParse(c) {
    try {
      var v = JSON.parse(c);
      return (v && typeof v === 'object') ? v : null;
    } catch (e) { return null; }
  }
  /* 模型常见毛病：字符串里写裸换行 / 尾随逗号 / 围栏残留 */
  function repairJson(c) {
    var out = '', inStr = false, esc = false;
    for (var i = 0; i < c.length; i++) {
      var ch = c.charAt(i), code = c.charCodeAt(i);
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = !inStr; out += ch; continue; }
      if (!inStr) { out += ch; continue; }
      if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else if (code < 0x20) out += '\\u' + ('000' + code.toString(16)).slice(-4);
      else out += ch;
    }
    return out.replace(/,\s*([}\]])/g, '$1');
  }
  function extractJSON(text) {
    if (!text) return null;
    var s = String(text).replace(/^\uFEFF/, '').trim();
    var cands = [];
    var fence = s.match(/```(?:json|javascript|js|typescript)?\s*([\s\S]*?)```/i);
    if (fence) cands.push(fence[1].trim());
    cands.push(s);
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) cands.push(s.slice(a, b + 1));
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!c) continue;
      var v = tryParse(c);
      if (v) return v;
      v = tryParse(repairJson(c));
      if (v) return v;
    }
    return null;
  }

  /* 快速判定这条回复是不是「结构化产物」（避免对每次回复都跑完整解析） */
  function detectKind(text) {
    var s = String(text || '');
    if (!s || s.length < 12) return null;
    if (/"projectName"\s*:/.test(s) && /"files"\s*:/.test(s)) return 'project';
    if (/"slides"\s*:/.test(s)) return 'ppt';
    return null;
  }

  var EXT_LANG = {
    html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml',
    css: 'css', scss: 'scss', less: 'less',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json', md: 'markdown', py: 'python', java: 'java', c: 'c', h: 'c',
    cpp: 'cpp', hpp: 'cpp', cs: 'csharp', go: 'go', rs: 'rust', rb: 'ruby',
    php: 'php', sh: 'bash', bash: 'bash', yml: 'yaml', yaml: 'yaml',
    sql: 'sql', txt: 'plaintext', toml: 'ini', ini: 'ini', vue: 'xml'
  };
  function langOf(path) {
    var m = String(path || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return (m && EXT_LANG[m[1]]) || 'plaintext';
  }
  function baseName(p) { return String(p).split('/').pop(); }
  function bytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  /* ---------- 下载 ---------- */
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  }
  function downloadText(name, text, mime) {
    saveBlob(new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' }), name);
  }

  /* ---------- ZIP ---------- */
  function zip(files, projectName) {
    if (!g.JSZip) return Promise.reject(new Error('JSZip 未加载（离线时 CDN 不可用）'));
    var z = new g.JSZip();
    (files || []).forEach(function (f) {
      z.file(String(f.path || 'unnamed.txt').replace(/^\/+/, ''), f.content == null ? '' : String(f.content));
    });
    return z.generateAsync({ type: 'blob' }).then(function (b) {
      saveBlob(b, (projectName || 'project') + '.zip');
    });
  }

  /* ---------- 把多文件项目内联成单页 HTML，供 iframe 预览 ---------- */
  function inlinePreview(files) {
    var map = {};
    (files || []).forEach(function (f) { map[String(f.path).replace(/^\.?\//, '')] = f.content == null ? '' : String(f.content); });
    var entry = map['index.html'] || map['Index.html'] || map['index.htm'];
    if (!entry) {
      for (var k in map) if (/\.html?$/i.test(k)) { entry = map[k]; break; }
    }
    if (!entry) return '<!doctype html><meta charset="utf-8"><body style="font:14px sans-serif;padding:24px;color:#666">此项目没有 index.html，无法预览。</body>';

    var html = entry;
    // 内联 <link rel=stylesheet href=...>
    html = html.replace(/<link[^>]+href=["']([^"']+\.css[^"']*)["'][^>]*>/gi, function (m, href) {
      var key = href.replace(/^\.?\//, '').split('?')[0];
      var f = map[key] || map[baseName(key)];
      return f != null ? '<style>\n' + f + '\n</style>' : m;
    });
    // 内联 <script src=...>
    html = html.replace(/<script([^>]*)\ssrc=["']([^"']+)["']([^>]*)><\/script>/gi, function (m, p1, src, p2) {
      if (/^https?:|^\/\//i.test(src)) return m;
      var key = src.replace(/^\.?\//, '').split('?')[0];
      var f = map[key] || map[baseName(key)];
      return f != null ? '<script' + (/\btype=/.test(p1 + p2) ? p1 : p1 + ' type="text/javascript"') + '>\n' + f + '\n<\/script>' : m;
    });
    // 内联 <img src=本地相对路径>（只处理文本资源，图片不动）
    return html;
  }

  function previewBlobUrl(files) {
    return URL.createObjectURL(new Blob([inlinePreview(files)], { type: 'text/html;charset=utf-8' }));
  }

  /* ---------- 文件树 ---------- */
  function tree(files, container, onPick) {
    container.innerHTML = '';
    var flat = (files || []).slice().sort(function (a, b) { return String(a.path).localeCompare(String(b.path)); });
    var box = document.createElement('div');
    box.className = 'tree';
    if (!flat.length) { container.innerHTML = '<div class="empty">还没有生成文件</div>'; return; }
    flat.forEach(function (f) {
      var depth = String(f.path).split('/').length - 1;
      var el = document.createElement('div');
      el.className = 'tnode';
      el.style.paddingLeft = (8 + depth * 14) + 'px';
      var icon = /\.html?$/i.test(f.path) ? '🌐' : /\.css$/i.test(f.path) ? '🎨'
        : /\.(js|mjs|ts|jsx|tsx)$/i.test(f.path) ? '📜' : /\.json$/i.test(f.path) ? '🧾'
        : /\.md$/i.test(f.path) ? '📘' : /\.(png|jpe?g|gif|svg|webp)$/i.test(f.path) ? '🖼️' : '📄';
      el.innerHTML = '<span>' + icon + '</span><span class="t"></span><span class="sz"></span>';
      el.querySelector('.t').textContent = baseName(f.path);
      el.title = f.path;
      el.querySelector('.sz').textContent = bytes(String(f.content || '').length);
      el.addEventListener('click', function () { onPick(f, el); });
      box.appendChild(el);
    });
    container.appendChild(box);
  }

  function highlightInto(pre, code, lang) {
    pre.innerHTML = '';
    var el = document.createElement('code');
    el.className = 'language-' + (lang || 'plaintext');
    el.textContent = code;
    pre.appendChild(el);
    // 超大文件跳过高亮，避免卡顿
    if (g.hljs && String(code).length < 200000) {
      try { g.hljs.highlightElement(el); } catch (e) {}
    }
  }

  /* ---------- Markdown / 文档导出 ---------- */
  function mdToHtml(md, title) {
    var body = g.marked ? g.marked.parse(String(md || '')) : '<pre>' + String(md || '') + '</pre>';
    if (g.DOMPurify) body = g.DOMPurify.sanitize(body);
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + escapeHtml(title || 'document') +
      '</title><style>body{max-width:820px;margin:40px auto;padding:0 20px;font:16px/1.75 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1b2333}' +
      'pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,Consolas,monospace;font-size:.92em}' +
      'pre code{background:none}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dfe3ea;padding:6px 10px}' +
      'th{background:#f2f5fa}blockquote{border-left:3px solid #5b8cff;margin:0;padding:.2em 1em;color:#555}</style></head><body>' + body + '</body></html>';
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function downloadDoc(title, md) {
    // 用 HTML 包一层 .doc，Word 可直接打开
    var html = mdToHtml(md, title);
    saveBlob(new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }), (title || 'document') + '.doc');
  }
  function downloadHtml(title, md) {
    saveBlob(new Blob([mdToHtml(md, title)], { type: 'text/html;charset=utf-8' }), (title || 'document') + '.html');
  }

  /* ---------- PPT：切换与动画的 OOXML 注入 ---------- */
  var TRANS_MAP = {
    fade: '<p:fade/>',
    push: '<p:push dir="l"/>',
    wipe: '<p:wipe dir="l"/>',
    zoom: '<p:zoom dir="in"/>',
    split: '<p:split orient="horz" dir="in"/>'
  };
  function maxShapeId(xml) {
    var ids = String(xml).match(/<p:cNvPr id="(\d+)"/g) || [];
    var max = 0;
    ids.forEach(function (s) {
      var n = parseInt(s.replace(/\D+/g, ''), 10);
      if (n > max && n !== 1) max = n;
    });
    return max;
  }
  /* 最小合法的入场动画时间树（PowerPoint 认可的标准结构） */
  function timingXml(spid, anim) {
    var filter = (anim === 'wipe' || anim === 'fly-in') ? 'wipe(up)' : 'fade';
    var dur = anim === 'zoom-in' ? 400 : 500;
    return '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>' +
      '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>' +
      '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>' +
      '<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>' +
      '<p:animEffect transition="in" filter="' + filter + '"><p:cBhvr>' +
      '<p:cTn id="5" dur="' + dur + '"/><p:tgtEl><p:spTgt spid="' + spid + '"/></p:tgtEl></p:cBhvr></p:animEffect>' +
      '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>' +
      '</p:childTnLst></p:cTn></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>';
  }
  function patchSlideXml(xml, trans, anim) {
    var t = String(trans || '').trim().toLowerCase();
    var a = String(anim || '').trim().toLowerCase();
    var add = '';
    if (TRANS_MAP[t]) add += '<p:transition spd="med" advClick="1">' + TRANS_MAP[t] + '</p:transition>';
    if (a && a !== 'none') {
      var spid = maxShapeId(xml);
      if (spid) add += timingXml(spid, a);
    }
    if (!add) return xml;
    // 元素顺序：cSld → clrMapOvr → transition → timing
    if (xml.indexOf('<p:timing') >= 0) return xml.replace('<p:timing', add + '<p:timing');
    return xml.replace(/<\/p:sld>\s*$/, add + '</p:sld>');
  }
  function injectPptAnim(blob, slides) {
    if (!g.JSZip) return Promise.resolve({ blob: blob, ok: false, reason: 'JSZip 未加载' });
    return blob.arrayBuffer().then(function (buf) {
      return g.JSZip.loadAsync(buf).then(function (zip) {
        var names = Object.keys(zip.files).filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); })
          .sort(function (x, y) { return parseInt(x.replace(/\D+/g, ''), 10) - parseInt(y.replace(/\D+/g, ''), 10); });
        if (!names.length) return { blob: blob, ok: false, reason: '没找到 slide 部件' };
        var chain = Promise.resolve(), touched = 0;
        names.forEach(function (n, i) {
          chain = chain.then(function () {
            return zip.file(n).async('string').then(function (xml) {
              var s = i === 0 ? {} : (slides[i - 1] || {});   // 第 1 张是封面
              var fixed = patchSlideXml(xml, s.transition, s.animation);
              if (fixed !== xml) { zip.file(n, fixed); touched++; }
            });
          });
        });
        return chain.then(function () {
          return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
            .then(function (b) { return { blob: b, ok: touched > 0, touched: touched, total: names.length }; });
        });
      });
    });
  }

  /* ---------- PPT ---------- */
  function exportPptx(data, name) {
    if (!g.PptxGenJS) return Promise.reject(new Error('PptxGenJS 未加载（离线时 CDN 不可用）'));
    var slides = (data && data.slides) || [];
    if (!slides.length) return Promise.reject(new Error('slides 为空'));
    var pptx = new g.PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'aiweb';
    pptx.title = data.title || name || 'presentation';

    // 封面
    var cover = pptx.addSlide();
    cover.background = { color: '1B2333' };
    cover.addText(data.title || 'Presentation', {
      x: 0.6, y: 2.1, w: 9, h: 1.3, fontSize: 36, bold: true, color: 'FFFFFF', align: 'center'
    });
    cover.addText(new Date().toLocaleDateString(), {
      x: 0.6, y: 3.5, w: 9, h: 0.5, fontSize: 14, color: '8B98AB', align: 'center'
    });

    slides.forEach(function (s) {
      var sl = pptx.addSlide();
      sl.addText(s.title || '', { x: 0.5, y: 0.35, w: 9, h: 0.9, fontSize: 26, bold: true, color: '1B2333' });
      sl.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.2, w: 1.4, h: 0.06, fill: { color: '5B8CFF' } });
      var bullets = (s.bullets || []).map(function (b) {
        return { text: String(b), options: { bullet: true, fontSize: 18, color: '33415C', breakLine: true } };
      });
      if (bullets.length) sl.addText(bullets, { x: 0.7, y: 1.6, w: 8.6, h: 3.4, lineSpacingMultiple: 1.25, valign: 'top' });
      var noteBits = [];
      if (s.notes) noteBits.push(String(s.notes));
      if (s.transition && s.transition !== 'none') noteBits.push('切换：' + s.transition);
      if (s.animation && s.animation !== 'none') noteBits.push('动画：' + s.animation);
      if (noteBits.length) sl.addNotes(noteBits.join('｜'));
    });

    var out = (data.title || name || 'presentation').replace(/[\\/:*?"<>|]/g, '_');
    // 先生成 blob，再把切换/动画注入 slide XML
    if (typeof pptx.write === 'function') {
      return pptx.write({ outputType: 'blob' }).then(function (b) {
        return injectPptAnim(b, slides).then(function (r) {
          saveBlob(r.blob, out + '.pptx');
          return r;
        }, function () {
          saveBlob(b, out + '.pptx');
          return { ok: false, reason: '注入失败，已导出基础版' };
        });
      });
    }
    return pptx.writeFile({ fileName: out + '.pptx' }).then(function () { return { ok: false, reason: '该版本不支持注入' }; });
  }

  /* ---------- 代码块 → 文件 ---------- */
  function filesFromCodeBlocks(md) {
    var re = /```([a-zA-Z0-9_+-]*)\s*(?:file:|\/\/\s*file:|title=)?([^\n`]*)\n([\s\S]*?)```/g;
    var out = [], m, guess = 1;
    while ((m = re.exec(String(md || '')))) {
      var lang = m[1], label = (m[2] || '').trim(), code = m[3];
      var path = label;
      if (!path || /\s/.test(path) || !/\./.test(path)) {
        var ext = { javascript: 'js', js: 'js', typescript: 'ts', python: 'py', html: 'html', css: 'css', json: 'json', markdown: 'md', bash: 'sh', sh: 'sh', sql: 'sql', java: 'java', cpp: 'cpp' }[lang] || 'txt';
        path = 'file' + (guess++) + '.' + ext;
      }
      out.push({ path: path.replace(/^\.?\//, ''), content: code.replace(/\n$/, '') });
    }
    return out;
  }

  /* ===================================================================
   * Markdown → 真·DOCX（自研最小 OOXML，只用已有的 JSZip，无需额外 CDN）
   * =================================================================== */
  var XMLDECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  function rXml(t, f) {
    if (!t) return '';
    var p = '';
    if (f.b) p += '<w:b/>';
    if (f.i) p += '<w:i/>';
    if (f.code) p += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="\u7b49\u7ebf"/>' +
      '<w:shd w:val="clear" w:color="auto" w:fill="EFF2F6"/>';
    return '<w:r>' + (p ? '<w:rPr>' + p + '</w:rPr>' : '') +
      '<w:t xml:space="preserve">' + escapeHtml(t) + '</w:t></w:r>';
  }
  function inline(text) {
    var re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)]+\))/g;
    var out = '', last = 0, m;
    var s = String(text == null ? '' : text);
    while ((m = re.exec(s))) {
      if (m.index > last) out += rXml(s.slice(last, m.index), {});
      var t = m[0];
      if (/^(\*\*|__)/.test(t)) out += rXml(t.slice(2, -2), { b: 1 });
      else if (t.charAt(0) === '`') out += rXml(t.slice(1, -1), { code: 1 });
      else if (t.charAt(0) === '[') {
        var mm = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        out += rXml(mm[1], {}) + rXml('（' + mm[2] + '）', { i: 1 });
      } else out += rXml(t.slice(1, -1), { i: 1 });
      last = m.index + t.length;
    }
    if (last < s.length) out += rXml(s.slice(last), {});
    return out;
  }
  function pXml(styleId, inner, ppr) {
    var p = (styleId ? '<w:pStyle w:val="' + styleId + '"/>' : '') + (ppr || '');
    return '<w:p>' + (p ? '<w:pPr>' + p + '</w:pPr>' : '') + (inner || '') + '</w:p>';
  }
  function hrXml() {
    return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D8DEE7"/></w:pBdr></w:pPr></w:p>';
  }
  function isBlockStart(l) {
    return /^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|```|~~~|\|)/.test(l) || /^\s*([-*_])\s*(\1\s*){2,}$/.test(l);
  }
  function splitRow(l) {
    return l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
  }
  function tableXml(rows) {
    var bd = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) {
      return '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="D8DEE7"/>';
    }).join('');
    var trs = rows.map(function (r) {
      var tcs = r.cells.map(function (c) {
        var shd = r.head ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF2F8"/>' : '';
        return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' + shd + '</w:tcPr>' +
          pXml(null, r.head ? rXml(c, { b: 1 }) : inline(c)) + '</w:tc>';
      }).join('');
      return '<w:tr>' + (r.head ? '<w:trPr><w:tblHeader/></w:trPr>' : '') + tcs + '</w:tr>';
    }).join('');
    return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' + bd + '</w:tblBorders>' +
      '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>' +
      '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>' + trs + '</w:tbl>';
  }
  function hStyle(lv, sz, color, before) {
    return '<w:style w:type="paragraph" w:styleId="Heading' + lv + '">' +
      '<w:name w:val="heading ' + lv + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
      '<w:pPr><w:keepNext/><w:spacing w:before="' + before + '" w:after="120"/>' +
      '<w:outlineLvl w:val="' + (lv - 1) + '"/></w:pPr>' +
      '<w:rPr><w:b/><w:sz w:val="' + sz + '"/><w:color w:val="' + color + '"/></w:rPr></w:style>';
  }
  function stylesXml() {
    return XMLDECL + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="\u7b49\u7ebf" w:cs="Calibri"/>' +
      '<w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="1B2333"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      hStyle(1, 36, '1F3A6E', 320) + hStyle(2, 30, '274C8F', 280) + hStyle(3, 26, '2E5FA3', 240) + hStyle(4, 24, '33415C', 200) +
      '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/>' +
      '<w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F5F7FA"/>' +
      '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:contextualSpacing/>' +
      '<w:ind w:left="180" w:right="180"/></w:pPr>' +
      '<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="\u7b49\u7ebf"/>' +
      '<w:sz w:val="19"/><w:color w:val="22303F"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/>' +
      '<w:pPr><w:ind w:left="420"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="5B8CFF"/></w:pBdr></w:pPr>' +
      '<w:rPr><w:i/><w:color w:val="5A6472"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/>' +
      '<w:pPr><w:spacing w:after="60"/><w:ind w:left="425" w:hanging="255"/></w:pPr></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:qFormat/>' +
      '<w:tblPr><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>' +
      '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      '</w:styles>';
  }

  /** Markdown → { 部件路径: XML 文本 }，纯字符串函数，便于校验 */
  function docxParts(md, title) {
    var lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
    var body = [], i = 0, num = 0;
    while (i < lines.length) {
      var line = lines[i].replace(/\s+$/, '');

      var fence = line.match(/^\s*(```+|~~~+)\s*([a-zA-Z0-9_+.-]*)\s*$/);
      if (fence) {
        var ch = fence[1].charAt(0), buf = [];
        i++;
        var endRe = new RegExp('^\\s*' + ch + '{3,}\\s*$');
        while (i < lines.length && !endRe.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        if (!buf.length) buf = [''];
        buf.forEach(function (l) { body.push(pXml('Code', rXml(l === '' ? ' ' : l, {}))); });
        body.push(pXml(null, ''));
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
        var rows = [{ cells: splitRow(line), head: true }];
        i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push({ cells: splitRow(lines[i]) }); i++; }
        body.push(tableXml(rows));
        body.push(pXml(null, ''));
        continue;
      }
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { body.push(pXml('Heading' + Math.min(4, h[1].length), inline(h[2].trim()))); i++; num = 0; continue; }
      if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) { body.push(hrXml()); i++; continue; }
      if (/^\s*>\s?/.test(line)) {
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          body.push(pXml('Quote', inline(lines[i].replace(/^\s*>\s?/, '')))); i++;
        }
        continue;
      }
      var ul = line.match(/^\s*[-*+]\s+(.*)$/);
      if (ul) { body.push(pXml('ListParagraph', rXml('•\u00a0', {}) + inline(ul[1]))); i++; continue; }
      var ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (ol) {
        num = parseInt(ol[1], 10) || (num + 1);
        body.push(pXml('ListParagraph', rXml(num + '.\u00a0', {}) + inline(ol[2])));
        i++; num++; continue;
      }
      if (!line.trim()) { i++; num = 0; continue; }
      var para = [line]; i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { para.push(lines[i].replace(/\s+$/, '')); i++; }
      body.push(pXml(null, inline(para.join(' '))));
    }

    var sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>';
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    var t = escapeHtml(title || 'document');

    return {
      '[Content_Types].xml': XMLDECL +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>',
      '_rels/.rels': XMLDECL +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        '</Relationships>',
      'word/document.xml': XMLDECL +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
        body.join('') + sect + '</w:body></w:document>',
      'word/_rels/document.xml.rels': XMLDECL +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
      'word/styles.xml': stylesXml(),
      'docProps/core.xml': XMLDECL +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
        'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:title>' + t + '</dc:title><dc:creator>aiweb</dc:creator><cp:lastModifiedBy>aiweb</cp:lastModifiedBy>' +
        '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
        '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
        '</cp:coreProperties>',
      'docProps/app.xml': XMLDECL +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
        '<Application>aiweb</Application></Properties>'
    };
  }

  var DOCX_ORDER = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml',
    'word/_rels/document.xml.rels', 'word/styles.xml', 'docProps/core.xml', 'docProps/app.xml'];

  function docxBlob(md, title) {
    if (!g.JSZip) return Promise.reject(new Error('JSZip 未加载（离线时 CDN 不可用）'));
    var parts = docxParts(md, title);
    var z = new g.JSZip();
    DOCX_ORDER.forEach(function (k) { z.file(k, parts[k]); });
    return z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }
  function downloadDocx(title, md) {
    return docxBlob(md, title).then(function (b) {
      var name = String(title || 'document').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
      saveBlob(b, name + '.docx');
    });
  }

  g.AiProject = {
    extractJSON: extractJSON, repairJson: repairJson, detectKind: detectKind,
    langOf: langOf, bytes: bytes, baseName: baseName,
    downloadText: downloadText, saveBlob: saveBlob, zip: zip,
    inlinePreview: inlinePreview, previewBlobUrl: previewBlobUrl, previewHtml: inlinePreview,
    injectPptAnim: injectPptAnim, patchSlideXml: patchSlideXml, timingXml: timingXml,
    tree: tree, highlightInto: highlightInto,
    mdToHtml: mdToHtml, downloadDoc: downloadDoc, downloadHtml: downloadHtml, escapeHtml: escapeHtml,
    docxParts: docxParts, docxBlob: docxBlob, downloadDocx: downloadDocx,
    exportPptx: exportPptx, filesFromCodeBlocks: filesFromCodeBlocks
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.AiProject;
})(window);

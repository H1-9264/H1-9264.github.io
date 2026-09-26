(function (g) {
  'use strict';
  var Api = g.AiApi, Pj = g.AiProject, Sk = g.AiSkills, PR = g.AiPrompts;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var K = { set: 'openclaw_settings', sess: 'openclaw_sessions', cur: 'openclaw_current', art: 'openclaw_artifacts' };
  var KEYFIELD = 'api' + 'Key';
  var FILE_EXT = ['.txt', '.md', '.markdown', '.js', '.mjs', '.json', '.html', '.htm', '.css', '.csv'];
  var BINARY_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.zip', '.rar', '.7z', '.mp3', '.mp4', '.mov', '.avi', '.exe'];
  var BINARY_MSG = '暂不支持解析，请提供文本内容';
  var FILE_MAX = 200 * 1024;

  var STRICT = [
    '【硬性输出约束】',
    '1. 不输出任何解释、寒暄、前言、总结。',
    '2. 不输出思考过程（The user wants… / 让我想想…），不输出 <think> 标签。',
    '3. JSON 任务：只输出一个合法 JSON，不加代码围栏、不加注释，字符串内换行写成 \\n。',
    '4. 一次写完，不中途截断。',
    '5. 文档只输出标准 Markdown：禁止任何 HTML 标签（<br>、<div>、<span>、<h1 align>、<table> 等），换行用空行分段，表格用 Markdown 竖线语法。'
  ].join('\n');

  var DEF = {
    baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat',
    temperature: 0.7, maxTokens: 8000, stream: true, proxy: '',
    theme: 'dark', font: 'sans', ctxCount: 12, timeoutMs: 300000, retries: 2, stallMs: 60000,
    noSaveKey: false, autoSave: true, hideThinking: true,
    webProvider: 'browser', webKey: '', searchEngine: 'bing',
    systemPrompt: PR.SYS_BASE
  };

  var S = {
    settings: {}, sessions: [], cur: null, skill: null, mode: 'chat',
    files: [], curFile: null, artifacts: [], busy: false, ctl: null,
    previewUrl: null, wbTab: 'project', _doc: null, _ppt: null, _keyMem: '',
    attachments: [], codeMode: 'hl', skillCat: '全部', skillQuery: ''
  };

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('本地存储已满', 'err'); } }

  function loadAll() {
    S.settings = Object.assign({}, DEF, lsGet(K.set, {}));
    if (!S.settings.maxTokens || S.settings.maxTokens < 8000) S.settings.maxTokens = 8000;
    S.sessions = lsGet(K.sess, []);
    S.artifacts = lsGet(K.art, []);
    var cur = lsGet(K.cur, null);
    if (!cur || !S.sessions.some(function (s) { return s.id === cur; })) cur = S.sessions[0] ? S.sessions[0].id : null;
    S.cur = cur;
    if (!S.sessions.length) newSession(true);
    if (S.settings.noSaveKey) { S._keyMem = S.settings.apiKey; S.settings.apiKey = ''; }
  }
  function saveSettings() {
    var c = Object.assign({}, S.settings);
    if (c.noSaveKey) c.apiKey = '';
    lsSet(K.set, c);
  }
  function keyNow() { return S.settings.noSaveKey ? (S._keyMem || '') : S.settings.apiKey; }
  function curSession() { for (var i = 0; i < S.sessions.length; i++) if (S.sessions[i].id === S.cur) return S.sessions[i]; return null; }
  function saveSessions() { lsSet(K.sess, S.sessions); }
  function newSession(silent) {
    var s = { id: 's' + Date.now().toString(36), title: '新对话', ts: Date.now(), messages: [], summary: '' };
    S.sessions.unshift(s); S.cur = s.id; lsSet(K.cur, s.id); saveSessions();
    if (!silent) { renderSessions(); renderChat(); }
    return s;
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', S.settings.theme === 'light' ? 'light' : 'dark');
    document.documentElement.setAttribute('data-font', S.settings.font || 'sans');
    $('#btnTheme').textContent = S.settings.theme === 'light' ? '☀️' : '🌙';
    var hl = $('#hlTheme');
    if (hl) hl.href = S.settings.theme === 'light'
      ? 'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/styles/github.min.css'
      : 'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/styles/github-dark.min.css';
  }

  function toast(msg, kind, ms) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 3600);
  }

  function md(text) {
    var s = String(text == null ? '' : text);
    var out = g.marked ? g.marked.parse(s, { breaks: true, gfm: true }) : Pj.escapeHtml(s).replace(/\n/g, '<br>');
    if (g.DOMPurify) out = g.DOMPurify.sanitize(out, { ADD_ATTR: ['target'] });
    return out;
  }
  function decorate(scope) {
    $$('pre', scope).forEach(function (pre) {
      if ($('.copy-code', pre)) return;
      var b = document.createElement('button');
      b.className = 'copy-code'; b.textContent = '复制';
      b.onclick = function () { copy(pre.querySelector('code') ? pre.querySelector('code').innerText : pre.innerText); };
      pre.appendChild(b);
      var code = pre.querySelector('code');
      if (code && g.hljs && !code.dataset.hl) { try { g.hljs.highlightElement(code); code.dataset.hl = '1'; } catch (e) {} }
    });
  }
  function copy(t) {
    t = String(t == null ? '' : t);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast('已复制', 'ok', 1400); }, function () { fallbackCopy(t); });
    } else fallbackCopy(t);
  }
  function fallbackCopy(t) {
    var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); toast('已复制', 'ok', 1400); } catch (e) { toast('复制失败', 'err'); }
    ta.remove();
  }
  function safeName(s) { return String(s || 'untitled').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 50); }
  function docTitle(text) {
    var m = String(text || '').match(/^\s*#{1,6}\s+(.+)$/m);
    if (m) return m[1].replace(/[*`]/g, '').trim().slice(0, 40);
    return (String(text || '').replace(/[#*`>\-\s]+/g, ' ').trim().slice(0, 24) || '文档');
  }
  function extractCode(text, langs) {
    var re = /```([a-zA-Z0-9_+-]*)\s*\n([\s\S]*?)```/g, m;
    while ((m = re.exec(String(text || '')))) {
      var lang = (m[1] || '').toLowerCase();
      if (!langs.length || langs.indexOf(lang) >= 0) return m[2].trim();
    }
    return '';
  }

  /* ---------- 会话 ---------- */
  function renderSessions() {
    var q = ($('#sessSearch') ? $('#sessSearch').value : '').trim().toLowerCase();
    var box = $('#sessList'); box.innerHTML = '';
    var list = S.sessions.filter(function (s) {
      if (!q) return true;
      if (s.title.toLowerCase().indexOf(q) >= 0) return true;
      return s.messages.some(function (m) { return String(m.content).toLowerCase().indexOf(q) >= 0; });
    });
    if (!list.length) { box.innerHTML = '<div class="empty">没有匹配的会话</div>'; return; }
    var groups = [], map = {};
    list.forEach(function (s) {
      var n = dayGroup(s.ts || Date.now());
      if (!map[n]) { map[n] = []; groups.push(n); }
      map[n].push(s);
    });
    groups.forEach(function (n) {
      var h = document.createElement('div'); h.className = 'sgroup'; h.textContent = n; box.appendChild(h);
      map[n].forEach(function (s) { box.appendChild(sessItem(s)); });
    });
  }
  function dayGroup(ts) {
    var d = new Date(ts), n = new Date();
    var d0 = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var diff = Math.round((d0 - t) / 86400000);
    if (diff <= 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff <= 7) return '过去 7 天';
    if (diff <= 30) return '过去 30 天';
    return '更早';
  }
  function sessItem(s) {
    var el = document.createElement('div');
    el.className = 'item' + (s.id === S.cur ? ' on' : '');
    el.innerHTML = '<span class="ii">💬</span><span class="t"></span><span class="acts">' +
      '<button class="iact" data-a="ren">✏️</button><button class="iact" data-a="exp">⬇</button>' +
      '<button class="iact" data-a="del">🗑</button></span>';
    el.querySelector('.t').textContent = s.title;
    el.onclick = function (e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'ren') { e.stopPropagation(); renameSession(s); return; }
      if (a === 'exp') { e.stopPropagation(); exportSession(s); return; }
      if (a === 'del') { e.stopPropagation(); delSession(s); return; }
      S.cur = s.id; lsSet(K.cur, s.id); renderSessions(); renderChat();
      if (window.innerWidth <= 900) $('#left').classList.remove('open');
    };
    return el;
  }
  function renameSession(s) {
    var t = prompt('重命名会话', s.title);
    if (t) { s.title = t.trim().slice(0, 60); s.ts = Date.now(); saveSessions(); renderSessions(); renderHead(); }
  }
  function delSession(s) {
    if (!confirm('删除会话「' + s.title + '」？')) return;
    S.sessions = S.sessions.filter(function (x) { return x.id !== s.id; });
    if (S.cur === s.id) S.cur = S.sessions[0] ? S.sessions[0].id : null;
    if (!S.sessions.length) newSession(true);
    lsSet(K.cur, S.cur); saveSessions(); renderSessions(); renderChat();
  }
  function exportSession(s) {
    Pj.downloadText(safeName(s.title) + '.json',
      JSON.stringify({ title: s.title, exportedAt: new Date().toISOString(), messages: s.messages }, null, 2), 'application/json');
  }
  function exportSessionMD(s) {
    var out = '# ' + s.title + '\n\n';
    s.messages.forEach(function (m) {
      out += (m.role === 'user' ? '## 🧑 用户' : '## 🤖 助手') + '\n\n' + (m.kind ? '（' + m.kind + ' 产物）' : m.content) + '\n\n---\n\n';
    });
    Pj.downloadText(safeName(s.title) + '.md', out, 'text/markdown');
  }
  function renderHead() {
    var s = curSession();
    $('#curTitle').textContent = s ? s.title : '新对话';
    $('#curSkillPill').textContent = S.skill ? ((Sk.get(S.skill) || {}).name || '') : '';
    $('#mModel').textContent = S.settings.model + ' · ' + (S.settings.stream ? '流式' : '非流式');
  }

  /* ---------- 附件 ---------- */
  function renderAttach() {
    var box = $('#attachBar'); box.innerHTML = '';
    S.attachments.forEach(function (a, i) {
      var el = document.createElement('span');
      el.className = 'chip-file';
      el.title = '点击删除';
      el.innerHTML = '<span>📄</span><b></b><span class="chip-x">✕</span>';
      el.querySelector('b').textContent = a.name;
      el.onclick = function () { S.attachments.splice(i, 1); renderAttach(); };
      box.appendChild(el);
    });
  }
  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var added = 0;
    files.forEach(function (f) {
      var name = String(f.name || 'file');
      var dot = name.lastIndexOf('.');
      var ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
      if (BINARY_EXT.indexOf(ext) >= 0) { toast(name + '：' + BINARY_MSG, 'err', 6000); return; }
      if (FILE_EXT.indexOf(ext) < 0) { toast('不支持的文件类型：' + name, 'err', 5000); return; }
      if (f.size > FILE_MAX) { toast('文件过大（上限 200KB）：' + name, 'err', 5000); return; }
      var fr = new FileReader();
      fr.onload = function () {
        S.attachments.push({ name: name, size: f.size, content: String(fr.result || '') });
        renderAttach();
      };
      fr.onerror = function () { toast('读取失败：' + name, 'err'); };
      fr.readAsText(f);
      added++;
    });
    if (added) setTimeout(function () { toast('已添加 ' + added + ' 个附件', 'ok', 1600); }, 300);
  }
  function attachPrefix() {
    if (!S.attachments.length) return '';
    var t = S.attachments.map(function (a) { return '[附件: ' + a.name + ']\n' + a.content; }).join('\n\n');
    S.attachments = []; renderAttach();
    return t + '\n\n';
  }

  /* ---------- 聊天 ---------- */
  var CARD_TEXT = { project: '📦 项目已生成，请在右侧查看并下载。', ppt: '🖼️ PPT 已生成，请在右侧查看并导出。', doc: '📘 文档已生成，请在右侧查看并导出。', style: '🎨 样式已更新，预览已刷新。' };
  var CARD_ICON = { project: '📦', ppt: '🖼️', doc: '📘', style: '🎨' };

  function cardXml(m, busy) {
    var kind = m.kind || 'project', meta = m.meta || {};
    var t = busy ? '正在生成…' : CARD_TEXT[kind];
    return '<div class="artcard' + (busy ? ' busy' : '') + '"><div class="ac-ic">' + (CARD_ICON[kind] || '📦') + '</div>' +
      '<div class="ac-main"><div class="ac-t">' + (busy ? t : Pj.escapeHtml(t)) + '</div>' +
      '<div class="ac-s">' + Pj.escapeHtml(meta.sub || '') + (busy ? '<span class="spin"></span>' : '') + '</div>' +
      '<div class="ac-acts"></div></div></div>';
  }
  function brokenXml(m) {
    return '<div class="artcard broken"><div class="ac-ic">⚠️</div><div class="ac-main">' +
      '<div class="ac-t">解析失败，可能是内容太长被截断，请尝试重新生成。</div>' +
      '<div class="ac-s">' + (m.truncated ? 'finish_reason = length' : '返回内容不是合法 JSON') + '</div>' +
      '<details class="ac-raw"><summary>查看原始返回</summary><pre></pre></details><div class="ac-acts"></div></div></div>';
  }
  function emptyXml(m) {
    return '<div class="artcard broken"><div class="ac-ic">⚠️</div><div class="ac-main">' +
      '<div class="ac-t">' + (m.filtered ? '模型只返回了思考过程，没有实际输出。' : '空回复：可能是 max_tokens 太小被截断。') + '</div>' +
      '<div class="ac-s">' + (m.truncated ? 'finish_reason = length' : '建议把 max_tokens 提到 8000 以上') + '</div><div class="ac-acts"></div></div></div>';
  }
  function msgEl(m, showThink) {
    var role = m.role === 'user' ? 'user' : 'ai';
    var hasThink = !!showThink || !!m.think;
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    wrap.innerHTML = '<div class="av">' + (role === 'user' ? '🧑' : '◈') + '</div><div class="bubble">' +
      '<div class="who"><span>' + (role === 'user' ? '你' : 'aiweb') + '</span><span class="ts"></span></div>' +
      (hasThink ? '<div class="think"></div>' : '') + '<div class="md"></div><div class="msg-acts"></div></div>';
    wrap.querySelector('.ts').textContent = new Date(m.ts || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    var mdBox = wrap.querySelector('.md'), thinkBox = wrap.querySelector('.think');
    if (thinkBox) thinkBox.textContent = typeof m.think === 'string' ? m.think : '';
    fillBody(mdBox, m);
    return wrap;
  }
  function fillBody(mdBox, m) {
    mdBox.classList.remove('is-card');
    if (m.kind) { mdBox.classList.add('is-card'); mdBox.innerHTML = cardXml(m); }
    else if (m.broken) {
      mdBox.classList.add('is-card'); mdBox.innerHTML = brokenXml(m);
      var pre = mdBox.querySelector('.ac-raw pre');
      if (pre) pre.textContent = m.content || '';
    } else if (m.empty) { mdBox.classList.add('is-card'); mdBox.innerHTML = emptyXml(m); }
    else { mdBox.innerHTML = md(m.content); decorate(mdBox); }
  }
  function bindCard(el, m) {
    var box = el.querySelector('.ac-acts');
    if (!box) return;
    box.innerHTML = '';
    var payload = function () { return Pj.extractJSON(m.content); };
    if (m.kind === 'project') {
      box.appendChild(mkAct('打开工作台', function () { var j = payload(); if (j) parseAndRenderProject(j); }));
      box.appendChild(mkAct('下载 ZIP', function () { var j = payload(); if (j) autoDownloadProject(j); }));
      box.appendChild(mkAct('预览', function () { openWorkbench('preview'); }));
    } else if (m.kind === 'ppt') {
      box.appendChild(mkAct('PPT 大纲', function () { var j = payload(); if (j) { renderPpt(j); openWorkbench('ppt'); } }));
      box.appendChild(mkAct('导出 .pptx', function () { var j = payload(); if (j) doPptx(j); }));
    } else if (m.kind === 'doc') {
      box.appendChild(mkAct('打开文档', function () { renderDoc(m.meta.title || '文档', m.content); openWorkbench('doc'); }));
      box.appendChild(mkAct('导出 .docx', function () {
        Pj.downloadDocx(m.meta.title || 'document', m.content).then(function () { toast('已导出 .docx', 'ok'); }, function (e) { toast(e.message, 'err'); });
      }));
    } else if (m.kind === 'style') {
      box.appendChild(mkAct('查看代码', function () { openWorkbench('code'); }));
      box.appendChild(mkAct('预览', function () { openWorkbench('preview'); }));
    } else if (m.broken || m.empty) {
      box.appendChild(mkAct('重新生成', function () {
        var s = curSession(); if (!s) return;
        var i = s.messages.indexOf(m);
        if (i >= 0) resend(i);
      }));
      if (m.content) box.appendChild(mkAct('复制原文', function () { copy(m.content); }));
    }
  }
  function actionsFor(bubble, m, idx) {
    var acts = bubble.querySelector('.msg-acts'); acts.innerHTML = '';
    acts.appendChild(mkAct('复制', function () { copy(m.content); }));
    acts.appendChild(mkAct('重发', function () { resend(idx); }));
    if (!m.kind && !m.empty) {
      acts.appendChild(mkAct('收进文档', function () {
        var t = docTitle(m.content);
        renderDoc(t, m.content); addArtifact({ type: 'doc', name: t, content: m.content }); openWorkbench('doc');
      }));
      acts.appendChild(mkAct('导出 .docx', function () {
        var t = docTitle(m.content);
        Pj.downloadDocx(t, m.content).then(function () { toast('已导出 ' + t + '.docx', 'ok'); }, function (e) { toast(e.message, 'err'); });
      }));
      acts.appendChild(mkAct('存为文件', function () {
        var fs = Pj.filesFromCodeBlocks(m.content);
        if (!fs.length) { toast('没有检测到代码块', 'err'); return; }
        setFiles(fs); addArtifact({ type: 'project', name: fs[0].path, content: m.content, files: fs });
        openWorkbench('project');
      }));
    }
    var j = Pj.extractJSON(m.content);
    if (j && j.files && j.files.length) {
      acts.appendChild(mkAct('载入项目', function () { parseAndRenderProject(j); }));
      acts.appendChild(mkAct('下载 ZIP', function () { autoDownloadProject(j); }));
    }
    if (j && j.slides && j.slides.length) acts.appendChild(mkAct('导出 .pptx', function () { doPptx(j); }));
  }
  function mkAct(label, fn) {
    var b = document.createElement('button'); b.className = 'mini'; b.textContent = label; b.onclick = fn; return b;
  }
  function renderChat() {
    var s = curSession(), box = $('#chat');
    box.innerHTML = '';
    renderHead();
    if (!s || !s.messages.length) { box.innerHTML = heroXml(); bindHero(box); updateMeta(); return; }
    var wrap = document.createElement('div'); wrap.className = 'wrap';
    s.messages.forEach(function (m, i) {
      var el = msgEl(m);
      wrap.appendChild(el);
      if (m.kind || m.broken || m.empty) bindCard(el, m);
      actionsFor(el.querySelector('.bubble'), m, i);
    });
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
    updateMeta();
  }
  function heroXml() {
    var ex = [
      { i: '📦', t: '生成项目', p: '/project 做一个番茄钟计时器' },
      { i: '📘', t: '写文档', p: '/doc 帮我做一个中秋月圆的科普文档' },
      { i: '🖼️', t: '做 PPT', p: '/ppt 主题：大模型如何帮助中学生学习' },
      { i: '🎬', t: 'PPT 动画', p: '/ppt-anim 做一个科技风产品介绍' },
      { i: '🎨', t: '改样式', p: '/style 把按钮改成蓝色，字号加大' },
      { i: '🐞', t: '调试', p: '/debug Uncaught TypeError: Cannot read properties of undefined' }
    ];
    return '<div class="wrap"><div class="hero"><div class="hero-logo">◈</div><h1>aiweb</h1>' +
      '<p>DeepSeek / OpenAI 兼容 · 项目、文档、PPT 直接出文件</p>' +
      (keyNow() || S.settings.noSaveKey ? '' : '<p class="warnline">还没填 API Key，点击右上角 ⚙️</p>') +
      '<div class="exas">' + ex.map(function (e, i) {
        return '<button class="exa" data-i="' + i + '"><span class="ei">' + e.i + '</span><span class="et"><b>' + e.t + '</b><i>' + Pj.escapeHtml(e.p) + '</i></span></button>';
      }).join('') + '</div></div></div>';
  }
  function bindHero(box) {
    var texts = ['/project 做一个番茄钟计时器', '/doc 帮我做一个中秋月圆的科普文档', '/ppt 主题：大模型如何帮助中学生学习',
      '/ppt-anim 做一个科技风产品介绍', '/style 把按钮改成蓝色，字号加大',
      '/debug Uncaught TypeError: Cannot read properties of undefined'];
    $$('.exa', box).forEach(function (b) {
      b.onclick = function () { $('#input').value = texts[+b.getAttribute('data-i')] || ''; $('#input').focus(); autoGrow(); };
    });
  }
  function updateMeta() {
    var s = curSession(); if (!s) return;
    var all = s.systemPromptCache || S.settings.systemPrompt;
    s.messages.forEach(function (m) { all += m.content; });
    $('#mTok').textContent = '≈ ' + Api.estimateTokens(all) + ' tokens';
    $('#mStat').textContent = S.busy ? '生成中…' : (s.messages.length + ' 条消息');
  }

  /* ---------- 请求 ---------- */
  function buildMessages(userText) {
    var s = curSession();
    var sys = S.settings.systemPrompt || PR.SYS_BASE;
    var sk = S.skill ? Sk.get(S.skill) : null;
    if (sk) sys += '\n\n【当前技能 · ' + sk.name + '】\n' + sk.prompt + '\n输出格式：' + sk.fmt;
    if (S.mode === 'project') sys += '\n\n【任务：完整项目】只输出 JSON：{"projectName":"","files":[{"path":"index.html","content":"..."}],"readme":"","run":""}。不加围栏，字符串内换行写 \\n。';
    if (S.mode === 'ppt') sys += '\n\n【任务：PPT 大纲】只输出 JSON：{"title":"","slides":[{"title":"","bullets":[]}]}。不加围栏。';
    if (S.mode === 'ppt-anim') sys += '\n\n【任务：带切换与动画的 PPT 大纲】只输出 JSON：{"title":"","slides":[{"title":"","bullets":[],"transition":"fade","animation":"zoom-in"}]}。transition 取 fade/push/wipe/zoom/split/none；animation 取 fade/zoom-in/fly-in/none；每页都写这两个字段。';
    if (S.mode === 'style') sys += '\n\n【任务：改样式】若上文有项目 JSON 就返回修改后的完整项目 JSON（结构不变，只改样式文件）；否则只返回一个 ```css 代码块。';
    if (S.mode === 'doc') sys += '\n\n【任务：文档】只输出标准 Markdown：第一行是 # 一级标题；绝对禁止任何 HTML 标签（<br> <div> <span> <center> <font> 等）；换行用空行分段；表格用 Markdown 竖线语法；不加前言后语。';
    sys += '\n\n' + PR.SYS_TOKEN_SAVE + '\n\n' + STRICT;
    s.systemPromptCache = sys;

    var n = Math.max(2, Number(S.settings.ctxCount) || 12);
    var msgs = s.messages.slice();
    var older = msgs.slice(0, Math.max(0, msgs.length - n));
    var recent = msgs.slice(-n);
    if (older.length) {
      if (!s.summary) s.summary = summarize(older);
      sys += '\n\n【历史摘要】\n' + s.summary;
    }
    var out = [{ role: 'system', content: sys }];
    recent.forEach(function (m) {
      if (m.kind) { out.push({ role: m.role, content: '（此前已生成 ' + m.kind + '，内容在工作台）' }); return; }
      out.push({ role: m.role, content: m.content });
    });
    if (!recent.length || recent[recent.length - 1].content !== userText) out.push({ role: 'user', content: userText });
    return out;
  }
  function summarize(msgs) {
    return msgs.map(function (m) {
      return (m.role === 'user' ? '· 用户: ' : '· 助手: ') + String(m.content).replace(/\s+/g, ' ').slice(0, 160);
    }).join('\n').slice(0, 2200);
  }
  function autoGrow() {
    var t = $('#input');
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 180) + 'px';
  }

  function send(text, opts) {
    opts = opts || {};
    text = (text == null ? $('#input').value : text).trim();
    if (!text) return;
    if (S.busy) { toast('正在生成，先停止再发送'); return; }
    if (!keyNow() && !S.settings.noSaveKey) { toast('请先在设置里填 API Key', 'err'); openSettings(); return; }

    var cmd = text.split(/\s+/)[0].toLowerCase();
    if (PR.COMMANDS[cmd]) {
      var c = PR.COMMANDS[cmd];
      text = text.slice(cmd.length).trim();
      if (c.skill) S.skill = c.skill;
      if (c.mode) S.mode = c.mode;
      if (!text) { toast('用法：' + cmd + ' 你的需求'); renderHead(); return; }
    }
    if (!opts.direct && (S.mode === 'ppt' || S.mode === 'ppt-anim')) { openPpt(text); return; }

    var pre = attachPrefix();
    var s = curSession();
    if (!s.messages.length) { s.title = text.slice(0, 24); s.ts = Date.now(); }
    s.messages.push({ role: 'user', content: text, ts: Date.now() });
    saveSessions(); renderSessions(); renderHead();

    var payload = buildMessages(pre + text);
    s.systemPromptCache = payload[0].content;

    var box = $('#chat'); if (!$('.wrap', box)) box.innerHTML = '';
    var wrap = $('.wrap', box) || (function () { var w = document.createElement('div'); w.className = 'wrap'; box.appendChild(w); return w; })();
    wrap.appendChild(msgEl({ role: 'user', content: text, ts: Date.now() }));
    var aiEl = msgEl({ role: 'ai', content: '' }, true);
    wrap.appendChild(aiEl);
    var mdBox = aiEl.querySelector('.md'), thinkBox = aiEl.querySelector('.think');
    box.scrollTop = box.scrollHeight;

    var wantsArtifact = ['project', 'doc', 'ppt', 'ppt-anim', 'style'].indexOf(S.mode) >= 0;
    if (wantsArtifact) {
      hideWbError();
      showWbLoading(true, S.mode === 'project' ? '正在生成项目…' : S.mode === 'doc' ? '正在写文档…' : S.mode === 'style' ? '正在改样式…' : '正在生成 PPT…');
    }

    setBusy(true);
    var acc = '', think = '', last = 0, pending = false;
    function flush() {
      pending = false;
      var clean = Api.stripThinking(acc, '');
      var kind = Pj.detectKind(clean);
      if (kind) {
        mdBox.classList.add('is-card');
        mdBox.innerHTML = cardXml({ kind: kind === 'ppt' ? 'ppt' : 'project', meta: { sub: '已完成 ' + acc.length + ' 字符' } }, true);
      } else {
        mdBox.classList.remove('is-card');
        mdBox.innerHTML = md(acc) + (S.busy ? '<span class="cursor"></span>' : '');
        decorate(mdBox);
      }
      box.scrollTop = box.scrollHeight;
    }
    S.ctl = new AbortController();
    var reqOpts = {
      baseUrl: S.settings.baseUrl, model: S.settings.model,
      messages: payload, temperature: S.settings.temperature, maxTokens: S.settings.maxTokens,
      stream: S.settings.stream, proxy: S.settings.proxy, timeoutMs: S.settings.timeoutMs,
      retries: S.settings.retries, hideThinking: S.settings.hideThinking !== false,
      stallMs: Number(S.settings.stallMs) || 60000,
      onEnd: function () { showWbLoading(false); },
      onStall: function () { showWbLoading(false); toast('超过 ' + Math.round((S.settings.stallMs || 60000) / 1000) + ' 秒没有新数据，已自动中断', 'err', 6000); },
      signal: S.ctl.signal
    };
    reqOpts[KEYFIELD] = keyNow();
    Api.chat(reqOpts, function (d) {
      if (d === '\u0000retry:1' || d === '\u0000retry:2') { toast('请求失败，正在自动重试…'); return; }
      acc += d;
      var now = Date.now();
      if (now - last > 70) { last = now; flush(); } else if (!pending) { pending = true; setTimeout(flush, 80); }
    }, function (t) {
      think += t;
      if (thinkBox) thinkBox.textContent = think.slice(-1500);
    }).then(function (r) {
      setBusy(false); showWbLoading(false);
      var m = {
        role: 'assistant', content: r.text || '', raw: r.rawText || '', think: think || r.reasoning || '',
        ts: Date.now(), truncated: !!r.truncated, filtered: !!r.filtered, empty: !!r.empty
      };
      attachArtifact(m);
      s.messages.push(m); s.summary = ''; saveSessions();
      fillBody(mdBox, m);
      if (m.kind || m.broken || m.empty) bindCard(aiEl, m);
      actionsFor(aiEl.querySelector('.bubble'), m, s.messages.length - 1);
      box.scrollTop = box.scrollHeight;
      updateMeta(); renderSessions();
      if (r.truncated) {
        toast('回复被截断（finish_reason=length）：提高 max_tokens 或减少规模', 'err', 8000);
        if (wantsArtifact) showWbError('解析失败，请尝试重新生成或减少项目规模（内容被截断）');
      }
      if (r.filtered && m.kind) toast('已过滤模型输出的思考过程', 'ok', 3500);
    }).catch(function (err) {
      setBusy(false); showWbLoading(false);
      var msg = Api.friendly(err);
      mdBox.classList.remove('is-card');
      mdBox.innerHTML = md('**❌ 出错了**\n\n' + msg);
      toast(msg, 'err', 6000);
      if (wantsArtifact) showWbError(msg);
      if (!acc) { s.messages.pop(); saveSessions(); }
    });
  }

  function parseAndRenderProject(textOrObj) {
    var j = (textOrObj && textOrObj.files) ? textOrObj : Pj.extractJSON(textOrObj);
    if (!j || !j.files || !j.files.length) return false;
    var files = normalizeFiles(j);
    hideWbError();
    setFiles(files);
    addArtifact({ type: 'project', name: j.projectName || 'project', content: JSON.stringify(j).slice(0, 200000), files: files });
    openWorkbench('project');
    runPreview();
    return true;
  }

  function attachArtifact(m) {
    var text = m.content || '';
    var kind = Pj.detectKind(text);
    if (kind) {
      var j = Pj.extractJSON(text);
      if (j && kind === 'project' && j.files && j.files.length) {
        m.kind = 'project';
        m.meta = { title: j.projectName || 'project', sub: (j.projectName || 'project') + ' · ' + j.files.length + ' 个文件' };
        parseAndRenderProject(j);
        if (S.settings.autoSave !== false) autoDownloadProject(j);
        return true;
      }
      if (j && kind === 'ppt' && j.slides && j.slides.length) {
        m.kind = 'ppt';
        m.meta = { title: j.title || 'PPT', sub: (j.title || 'PPT') + ' · ' + j.slides.length + ' 页' };
        renderPpt(j);
        addArtifact({ type: 'ppt', name: j.title || 'PPT', content: JSON.stringify(j) });
        openWorkbench('ppt');
        if (S.settings.autoSave !== false) autoDownloadPpt(j);
        return true;
      }
      m.kind = ''; m.broken = true;
      showWbError('解析失败，请尝试重新生成或减少项目规模');
      toast('JSON 解析失败，已降级显示', 'err', 6000);
      return false;
    }
    if (S.mode === 'style' && applyStyleResult(m, text)) return true;
    if (S.mode === 'doc' && text.trim()) {
      var t = docTitle(text);
      m.kind = 'doc';
      m.meta = { title: t, sub: t + ' · ' + text.length + ' 字符' };
      renderDoc(t, text);
      addArtifact({ type: 'doc', name: t, content: text });
      openWorkbench('doc');
      if (S.settings.autoSave !== false) {
        Pj.downloadDocx(t, text).then(function () { toast('已生成 ' + t + '.docx', 'ok', 6000); }, function (e) { toast(e.message, 'err', 5000); });
      }
      return true;
    }
    if (!text.trim()) m.empty = true;
    return false;
  }

  function applyStyleResult(m, text) {
    var j = Pj.extractJSON(text);
    if (j && j.files && j.files.length) {
      m.kind = 'project';
      m.meta = { title: j.projectName || 'project', sub: '样式已更新 · ' + j.files.length + ' 个文件' };
      parseAndRenderProject(j);
      toast('样式已更新，预览已刷新', 'ok', 5000);
      return true;
    }
    var css = extractCode(text, ['css', 'scss', 'less']) || (/^[^{}]*\{[^}]*\}/m.test(text) ? text.trim() : '');
    if (!css) return false;
    if (!S.files.length) {
      var html = '<!doctype html><meta charset="utf-8"><style>' + css + '</style>' +
        '<body style="font:15px -apple-system,sans-serif;padding:26px"><h1>样式预览</h1>' +
        '<p>这是 /style 返回的 CSS 渲染效果。</p><button>按钮</button><div class="box">示例块</div></body>';
      setFiles([{ path: 'style.css', content: css }, { path: 'index.html', content: html }]);
      showCode(S.files[0]);
      openWorkbench('code'); runPreview();
      toast('已生成样式预览', 'ok', 5000);
      return true;
    }
    var target = S.files.filter(function (f) { return /\.(css|scss|less|styl)$/i.test(f.path); })[0];
    if (!target) target = S.files.filter(function (f) { return /<style/i.test(f.content || ''); })[0];
    if (!target) { target = { path: 'css/style.css', content: '' }; S.files.push(target); }
    target.content = css;
    setFiles(S.files);
    showCode(target);
    openWorkbench('code'); runPreview();
    m.kind = 'style';
    m.meta = { title: target.path, sub: '样式已写入 ' + target.path + ' · 预览已刷新' };
    toast('已写入 ' + target.path, 'ok', 4000);
    return true;
  }

  function showWbError(msg) {
    var box = $('#wbError');
    if (!box) return;
    var t = $('#wbErrMsg');
    if (t) t.textContent = msg || '解析失败，请尝试重新生成或减少项目规模';
    box.style.display = 'flex';
    openWorkbench('project');
  }
  function hideWbError() { var b = $('#wbError'); if (b) b.style.display = 'none'; }
  function retryLast(narrow) {
    hideWbError();
    var s = curSession();
    if (!s || S.busy) return;
    if (narrow) {
      var i;
      for (i = s.messages.length - 1; i >= 0; i--) if (s.messages[i].role === 'user') break;
      if (i >= 0) {
        var t = s.messages[i].content + '\n\n【重要】上次输出被截断。请减少规模：文件不超过 4 个，单文件不超过 150 行，确保 JSON 完整闭合。';
        s.messages = s.messages.slice(0, i);
        saveSessions(); renderChat();
        send(t);
        return;
      }
    }
    resend(s.messages.length);
  }
  function resend(idx) {
    var s = curSession(); if (!s || S.busy) return;
    var i;
    for (i = Math.min(idx, s.messages.length - 1); i >= 0; i--) if (s.messages[i].role === 'user') break;
    if (i < 0) return;
    var t = s.messages[i].content;
    s.messages = s.messages.slice(0, i);
    saveSessions(); renderChat();
    send(t);
  }
  function setBusy(b) {
    S.busy = b;
    var btn = $('#send');
    btn.classList.toggle('stop', b);
    btn.textContent = b ? '■' : '↑';
    if (b) S.ctl = S.ctl || new AbortController(); else S.ctl = null;
    updateMeta();
  }

  /* ---------- 工作台 ---------- */
  var WB_TABS = ['project', 'doc', 'ppt', 'preview'];
  var WB_NAME = { project: '项目', doc: '文档', ppt: 'PPT', preview: '预览' };

  function openWorkbench(tab) {
    if (tab) setWbTab(tab);
    document.body.classList.add('wb-open');
  }
  function closeWorkbench() { document.body.classList.remove('wb-open'); }
  function toggleWorkbench() {
    if (document.body.classList.contains('wb-open')) closeWorkbench(); else openWorkbench();
  }
  function setWbTab(tab) {
    if (tab === 'code') tab = 'project';
    if (WB_TABS.indexOf(tab) < 0) tab = 'project';
    S.wbTab = tab;
    WB_TABS.forEach(function (t) {
      var el = $('#wb' + t.charAt(0).toUpperCase() + t.slice(1));
      if (el) el.style.display = (t === tab) ? '' : 'none';
    });
    $$('[data-wb]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-wb') === tab); });
    var lbl = $('#wbLabel');
    if (lbl) lbl.textContent = WB_NAME[tab];
    if (tab === 'preview') runPreview();
  }
  function showWbLoading(on, text) {
    var el = $('#wbLoading');
    if (!el) return;
    if (on) {
      openWorkbench();
      var t = el.querySelector('.wl-t');
      if (t) t.textContent = text || '正在生成…';
      el.style.display = 'flex';
    } else { el.style.display = 'none'; }
  }

  function normalizeFiles(j) {
    return ((j && j.files) || []).map(function (f) {
      return { path: f.path || 'file.txt', content: f.content == null ? '' : String(f.content) };
    });
  }
  function autoDownloadProject(j) {
    var files = normalizeFiles(j);
    if (!files.length) return;
    var name = safeName(j.projectName || 'project');
    Pj.zip(files, name).then(function () { toast('已打包 ' + name + '.zip', 'ok', 6000); }, function (e) { toast('打包失败：' + e.message, 'err', 5000); });
  }
  function autoDownloadPpt(j) {
    var name = j.title || 'presentation';
    Pj.exportPptx(j, name).then(function (r) {
      toast(r && r.ok ? '已导出 ' + name + '.pptx（注入 ' + r.touched + ' 页动画）' : '已导出 ' + name + '.pptx', 'ok', 6000);
    }, function (e) { toast('PPTX 导出失败：' + e.message, 'err', 5000); });
  }
  function doZip() {
    if (!S.files.length) { toast('没有文件可打包', 'err'); return; }
    var cur = curSession();
    var name = safeName((cur && cur.title) || 'project');
    Pj.zip(S.files, name).then(function () { toast('已下载 ' + name + '.zip', 'ok', 5000); }, function (e) { toast(e.message, 'err', 5000); });
  }
  function doPptx(data) {
    Pj.exportPptx(data, data.title).then(function (r) {
      toast(r && r.ok ? '已导出并注入 ' + r.touched + '/' + r.total + ' 页切换与动画' : 'PPTX 已导出' + (r && r.reason ? '（' + r.reason + '）' : ''), 'ok', 6000);
    }, function (e) { toast(e.message, 'err'); });
  }

  function setFiles(files) {
    S.files = files || [];
    Pj.tree(S.files, $('#tree'), function (f, el) {
      $$('.tnode', $('#tree')).forEach(function (n) { n.classList.remove('on'); });
      el.classList.add('on');
      showCode(f);
    });
    var pill = $('#projPill');
    if (pill) pill.textContent = S.files.length ? (S.files.length + ' 个文件') : '';
    if (!S.files.length) $('#tree').innerHTML = '<div class="empty">还没有项目<br>用 /project 生成</div>';
    else {
      var first = S.files.filter(function (f) { return /\.html?$/i.test(f.path); })[0] || S.files[0];
      showCode(first);
    }
  }
  function showCode(f) {
    if (!f) return;
    S.curFile = f;
    var src = f.content == null ? '' : String(f.content);
    $('#codeName').textContent = f.path;
    $('#codeArea').value = src;
    $('#codeArea').oninput = function () { f.content = $('#codeArea').value; };
    var hl = $('#codeHl');
    if (hl) Pj.highlightInto(hl, src, Pj.langOf(f.path));
    setCodeMode('hl');
  }
  function setCodeMode(mode) {
    S.codeMode = mode;
    var hl = $('#codeHl'), ta = $('#codeArea'), b = $('#btnCodeMode');
    if (hl) hl.style.display = mode === 'hl' ? '' : 'none';
    if (ta) ta.style.display = mode === 'edit' ? '' : 'none';
    if (b) b.textContent = mode === 'hl' ? '编辑' : '高亮';
  }
  function toggleCodeMode() {
    if (!S.curFile) { toast('先选一个文件', 'err'); return; }
    if (S.codeMode === 'hl') { setCodeMode('edit'); $('#codeArea').focus(); return; }
    S.curFile.content = $('#codeArea').value;
    var hl = $('#codeHl');
    if (hl) Pj.highlightInto(hl, S.curFile.content, Pj.langOf(S.curFile.path));
    setCodeMode('hl');
  }
  function cleanMd(s) {
    return String(s == null ? '' : s)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function renderDoc(title, markdown) {
    S._doc = { title: title || 'document', md: cleanMd(markdown) };
    var t = $('#docTitle'); if (t) t.textContent = S._doc.title;
    $('#docPreview').innerHTML = md(S._doc.md);
    decorate($('#docPreview'));
  }
  var DOC_CSS = [
    'body{max-width:820px;margin:40px auto;padding:0 20px;font:16px/1.75 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#0f172a}',
    'h1,h2,h3,h4{page-break-after:avoid;break-after:avoid;color:#1e3a8a}',
    'table,pre,blockquote,figure{page-break-inside:avoid;break-inside:avoid}',
    'tr,td,th,li{page-break-inside:avoid;break-inside:avoid}',
    'p,li{orphans:3;widows:3}',
    'pre{background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto;font-size:13px}',
    'code{font-family:ui-monospace,Consolas,monospace;font-size:.92em}',
    'pre code{background:none}',
    'table{border-collapse:collapse;width:100%;font-size:14px}',
    'th,td{border:1px solid #cbd5e1;padding:6px 10px;text-align:left}',
    'th{background:#f1f5f9}',
    'blockquote{border-left:3px solid #1e3a8a;margin:0;padding:.2em 1em;color:#475569}',
    '@page{margin:2.2cm}'
  ].join('');
  function docHtml(title, markdown) {
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>' +
      Pj.escapeHtml(title || 'document') + '</title><style>' + DOC_CSS + '</style></head><body>' +
      md(cleanMd(markdown)) + '</body></html>';
  }
  function exportDoc(kind) {
    if (!S._doc) { toast('还没有文档', 'err'); return; }
    var t = S._doc.title || 'document';
    var text = cleanMd(S._doc.md);
    if (kind === 'md') { Pj.downloadText(t + '.md', text, 'text/markdown'); return; }
    if (kind === 'docx') {
      Pj.downloadDocx(t, text).then(function () { toast('已导出 .docx', 'ok'); }, function (e) { toast(e.message, 'err'); });
      return;
    }
    var html = docHtml(t, text);
    if (kind === 'html') Pj.saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), t + '.html');
    else Pj.saveBlob(new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }), t + '.doc');
  }
  function renderPpt(data) {
    S._ppt = data;
    var box = $('#pptOutline'); box.innerHTML = '';
    var slides = (data && data.slides) || [];
    if (!slides.length) { box.innerHTML = '<div class="empty">还没有 PPT 大纲<br>用 /ppt 或 /ppt-anim 生成</div>'; return; }
    var h = document.createElement('div');
    h.className = 'ppt-title'; h.textContent = data.title || '演示文稿';
    box.appendChild(h);
    slides.forEach(function (s, i) {
      var d = document.createElement('div');
      d.className = 'slidecard';
      d.innerHTML = '<div class="sc-n">第 ' + (i + 1) + ' 页</div><div class="sc-t"></div><div class="sc-badges"></div><ul class="sc-b"></ul>';
      d.querySelector('.sc-t').textContent = s.title || '';
      var badges = d.querySelector('.sc-badges');
      if (s.transition && s.transition !== 'none') {
        var b1 = document.createElement('span'); b1.className = 'badge'; b1.textContent = '切换 ' + s.transition; badges.appendChild(b1);
      }
      if (s.animation && s.animation !== 'none') {
        var b2 = document.createElement('span'); b2.className = 'badge'; b2.textContent = '动画 ' + s.animation; badges.appendChild(b2);
      }
      var ul = d.querySelector('.sc-b');
      (s.bullets || []).forEach(function (b) { var li = document.createElement('li'); li.textContent = b; ul.appendChild(li); });
      box.appendChild(d);
    });
    var pill = $('#pptPill');
    if (pill) pill.textContent = slides.length + ' 页';
  }
  function runPreview() {
    var fr = $('#previewFrame');
    if (!S.files.length) {
      fr.removeAttribute('src');
      fr.srcdoc = '<body style="font:14px -apple-system,sans-serif;padding:30px;color:#888;text-align:center">还没有可预览的项目<br><br>用 /project 生成</body>';
      S.previewUrl = null;
      return;
    }
    fr.removeAttribute('src');
    fr.srcdoc = Pj.inlinePreview(S.files);
    if (S.previewUrl) { try { URL.revokeObjectURL(S.previewUrl); } catch (e) {} }
    S.previewUrl = Pj.previewBlobUrl(S.files);
  }

  /* ---------- 产出 ---------- */
  function addArtifact(a) {
    a.id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    a.ts = Date.now();
    S.artifacts.unshift(a);
    S.artifacts = S.artifacts.slice(0, 40);
    lsSet(K.art, S.artifacts);
    renderOutputs();
  }
  function renderOutputs() {
    var box = $('#outList'); if (!box) return;
    box.innerHTML = '';
    if (!S.artifacts.length) { box.innerHTML = '<div class="empty">暂无产出</div>'; return; }
    S.artifacts.forEach(function (a) {
      var ic = a.type === 'project' ? '📦' : a.type === 'ppt' ? '🖼️' : a.type === 'doc' ? '📘' : '📄';
      var el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = '<span class="ii">' + ic + '</span><span class="t"></span><span class="acts">' +
        '<button class="iact" data-a="dl">⬇</button><button class="iact" data-a="op">👁</button><button class="iact" data-a="del">🗑</button></span>';
      el.querySelector('.t').textContent = a.name;
      el.onclick = function (e) {
        var k = e.target.getAttribute && e.target.getAttribute('data-a');
        if (k === 'del') { e.stopPropagation(); S.artifacts = S.artifacts.filter(function (x) { return x.id !== a.id; }); lsSet(K.art, S.artifacts); renderOutputs(); return; }
        if (k === 'dl') { e.stopPropagation(); downloadArtifact(a); return; }
        openArtifact(a);
      };
      box.appendChild(el);
    });
  }
  function openArtifact(a) {
    if (a.files && a.files.length) { setFiles(a.files); openWorkbench('project'); return; }
    if (a.type === 'ppt') { try { renderPpt(JSON.parse(a.content)); openWorkbench('ppt'); } catch (e) { toast('解析失败', 'err'); } return; }
    renderDoc(a.name, a.content); openWorkbench('doc');
  }
  function downloadArtifact(a) {
    if (a.files && a.files.length) { Pj.zip(a.files, a.name).then(function () { toast('ZIP 已下载', 'ok'); }, function (e) { toast(e.message, 'err'); }); return; }
    if (a.type === 'ppt') { try { doPptx(JSON.parse(a.content)); } catch (e) { toast('解析失败', 'err'); } return; }
    Pj.downloadText(a.name + '.md', a.content, 'text/markdown');
  }

  /* ---------- 技能 ---------- */
  function renderSkills() {
    var fp = $('#skillFootPill');
    if (fp) fp.textContent = Sk.all().length + ' 个技能';
    var cats = $('#skillCats'); cats.innerHTML = '';
    Sk.cats.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'chip' + (c === S.skillCat ? ' on' : '');
      b.textContent = c;
      b.onclick = function () { S.skillCat = c; renderSkills(); };
      cats.appendChild(b);
    });
    var favs = Sk.favs();
    var list = Sk.search(S.skillQuery).filter(function (s) { return S.skillCat === '全部' || s.cat === S.skillCat; });
    if (S.skillQuery) {
      list = Sk.search(S.skillQuery);
      var f = list.filter(function (s) { return favs.indexOf(s.id) >= 0; });
      if (f.length) list = f.concat(list.filter(function (s) { return favs.indexOf(s.id) < 0; }));
    } else if (favs.length) {
      list.sort(function (a, b) { return (favs.indexOf(b.id) >= 0 ? 1 : 0) - (favs.indexOf(a.id) >= 0 ? 1 : 0); });
    }
    var box = $('#skillGrid'); box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<div class="empty">没有匹配技能</div>'; return; }
    list.forEach(function (s) {
      var el = document.createElement('div');
      el.className = 'skill' + (S.skill === s.id ? ' on' : '');
      el.innerHTML = '<span class="star' + (favs.indexOf(s.id) >= 0 ? ' on' : '') + '">★</span>' +
        '<span class="ic">' + s.icon + '</span><span><span class="nm"></span><span class="ct"></span></span>';
      el.querySelector('.nm').textContent = s.name;
      el.querySelector('.ct').textContent = (s.cmd ? s.cmd + ' · ' : '') + s.cat + (s.builtin ? '' : ' · 自定义');
      el.onclick = function (e) {
        if (e.target.classList.contains('star')) { Sk.toggleFav(s.id); renderSkills(); return; }
        S.skill = s.id;
        S.mode = s.id === 'ppt.anim' ? 'ppt-anim' : s.id === 'style.ui' ? 'style'
          : s.id === 'doc.slide' ? 'ppt' : s.id === 'code.full' ? 'project' : 'chat';
        var inp = $('#input');
        var fill = Sk.fillText(s);
        if (fill) inp.value = fill + (s.hint || '');
        else if (!inp.value.trim() && s.hint) inp.value = s.hint;
        renderSkills(); renderHead(); autoGrow();
        inp.focus();
        try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (err) {}
        toast('已选用：' + s.name + (fill ? '（指令已填入）' : ''), 'ok', 2600);
      };
      el.oncontextmenu = function (e) {
        e.preventDefault();
        if (s.builtin) return;
        if (confirm('编辑「' + s.name + '」？取消则删除。')) openSkillEdit(s);
        else { Sk.delCustom(s.id); renderSkills(); }
      };
      box.appendChild(el);
    });
  }
  function openSkillEdit(s) {
    s = s || {};
    $('#skName').value = s.name || '';
    $('#skIcon').value = s.icon || '🧩';
    $('#skCat').value = s.cat || '编程';
    $('#skFmt').value = s.fmt || 'code';
    $('#skCmd').value = s.cmd || '';
    $('#skHint').value = s.hint || '';
    $('#skPrompt').value = s.prompt || '';
    S._editSkill = s;
    show('#mSkill');
  }
  function saveSkill() {
    var name = $('#skName').value.trim();
    if (!name) { toast('填个名字', 'err'); return; }
    var cmd = $('#skCmd').value.trim();
    if (cmd && cmd.charAt(0) !== '/') cmd = '/' + cmd;
    Sk.addCustom(Object.assign({}, S._editSkill || {}, {
      name: name, icon: $('#skIcon').value.trim() || '🧩', cat: $('#skCat').value,
      fmt: $('#skFmt').value, cmd: cmd, hint: $('#skHint').value.trim(), prompt: $('#skPrompt').value.trim()
    }));
    hide('#mSkill'); renderSkills();
    toast('已保存到 ' + Sk.K_SKILLS, 'ok', 3000);
  }

  /* ---------- 搜索 ---------- */
  function globalSearch(q) {
    q = (q || '').trim();
    var box = $('#searchResults');
    if (!q) { box.innerHTML = '<div class="empty">输入关键词搜索会话、技能、产出</div>'; return; }
    var low = q.toLowerCase(), hits = [];
    S.sessions.forEach(function (s) {
      if (s.title.toLowerCase().indexOf(low) >= 0)
        hits.push({ k: '会话', t: s.title, s: '标题匹配', go: function () { S.cur = s.id; lsSet(K.cur, s.id); renderSessions(); renderChat(); hide('#mSearch'); } });
      s.messages.forEach(function (m) {
        var i = String(m.content).toLowerCase().indexOf(low);
        if (i >= 0) hits.push({
          k: '消息', t: s.title, s: String(m.content).slice(Math.max(0, i - 30), i + 80),
          go: function () { S.cur = s.id; lsSet(K.cur, s.id); renderSessions(); renderChat(); hide('#mSearch'); }
        });
      });
    });
    Sk.search(q).forEach(function (sk) {
      hits.push({ k: '技能', t: sk.icon + ' ' + sk.name, s: sk.cat, go: function () { S.skill = sk.id; renderSkills(); renderHead(); hide('#mSearch'); } });
    });
    S.artifacts.forEach(function (a) {
      if ((a.name + a.content).toLowerCase().indexOf(low) >= 0)
        hits.push({ k: '产出', t: a.name, s: a.type, go: function () { hide('#mSearch'); openArtifact(a); } });
    });
    box.innerHTML = '';
    if (!hits.length) {
      box.innerHTML = '<div class="empty">没有结果<br><br><button class="btn" id="webGo">联网搜索「' + Pj.escapeHtml(q) + '」</button></div>';
      $('#webGo').onclick = function () { webSearch(q); };
      return;
    }
    var d = document.createElement('div'); d.className = 'sres';
    hits.slice(0, 60).forEach(function (h) {
      var el = document.createElement('div'); el.className = 'r';
      el.innerHTML = '<div class="rt"><span class="pill">' + h.k + '</span><span class="hrt"></span></div><div class="rs"></div>';
      el.querySelector('.hrt').textContent = h.t;
      el.querySelector('.rs').textContent = h.s;
      el.onclick = h.go;
      d.appendChild(el);
    });
    box.appendChild(d);
    var wb = document.createElement('button');
    wb.className = 'btn'; wb.style.marginTop = '10px'; wb.textContent = '联网搜索「' + q + '」并问 AI';
    wb.onclick = function () { webSearch(q); };
    box.appendChild(wb);
  }
  var ENGINES = {
    bing: 'https://www.bing.com/search?q=', google: 'https://www.google.com/search?q=',
    baidu: 'https://www.baidu.com/s?wd=', ddg: 'https://duckduckgo.com/?q='
  };
  function browserSearch(q) {
    var eng = ENGINES[S.settings.searchEngine] ? S.settings.searchEngine : 'bing';
    var w = window.open(ENGINES[eng] + encodeURIComponent(q), '_blank', 'noopener');
    copy(q);
    hide('#mSearch');
    if (!w) toast('浏览器拦了新窗口，请允许弹窗', 'err', 5000);
    toast('已用系统浏览器打开搜索页，关键词已复制。把要点粘回来我接着分析。', 'ok', 7000);
  }
  function wikiSearch(q) {
    var api = 'https://zh.wikipedia.org/w/api.php';
    toast('查询维基百科…');
    fetch(api + '?action=query&list=search&srsearch=' + encodeURIComponent(q) + '&srlimit=5&format=json&origin=*')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var hits = (j.query && j.query.search) || [];
        if (!hits.length) throw new Error('维基百科没有匹配条目');
        var titles = hits.map(function (h) { return h.title; }).join('|');
        return fetch(api + '?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&origin=*&titles=' + encodeURIComponent(titles))
          .then(function (r) { return r.json(); })
          .then(function (j2) {
            var pages = (j2.query && j2.query.pages) || {}, out = [];
            Object.keys(pages).forEach(function (key) {
              var pg = pages[key];
              if (!pg || pg.missing) return;
              out.push('- ' + pg.title + '：' + String(pg.extract || '').replace(/\s+/g, ' ').slice(0, 520) +
                ' （https://zh.wikipedia.org/wiki/' + encodeURIComponent(String(pg.title).replace(/ /g, '_')) + '）');
            });
            return out.length ? out.join('\n') : hits.map(function (h) { return '- ' + h.title; }).join('\n');
          });
      })
      .then(function (txt) { injectSearch(q, txt, '维基百科'); })
      .catch(function (e) { toast('搜索失败：' + Api.friendly(e), 'err', 6000); });
  }
  function ddgSearch(q) {
    if (!S.settings.proxy) { toast('DuckDuckGo 需要先填代理 URL', 'err', 7000); openSettings(); return; }
    var url = Api.proxied('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), S.settings.proxy);
    toast('经代理搜索中…');
    fetch(url).then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html'), out = [];
      Array.prototype.slice.call(doc.querySelectorAll('.result')).slice(0, 6).forEach(function (el) {
        var a = el.querySelector('.result__a'), sn = el.querySelector('.result__snippet');
        if (!a) return;
        out.push('- ' + a.textContent.trim() + '：' + (sn ? sn.textContent.trim() : '') + ' （' + (a.getAttribute('href') || '') + '）');
      });
      if (!out.length) throw new Error('没解析到结果');
      injectSearch(q, out.join('\n'), 'DuckDuckGo');
    }).catch(function (e) { toast('搜索失败：' + (e.message || e), 'err', 6000); });
  }
  function injectSearch(q, txt, src) {
    hide('#mSearch');
    S.mode = 'chat';
    send('/search 来源：' + src + '\n问题：' + q + '\n\n【检索结果】\n' + (txt || '（无结果）') + '\n\n要求：给结论、可运行代码或方案，末尾附来源链接。');
  }
  function webSearch(q) {
    q = String(q || '').trim();
    if (!q) return;
    var p = S.settings.webProvider || 'browser';
    if (p === 'browser') { browserSearch(q); return; }
    if (p === 'wiki') { wikiSearch(q); return; }
    if (p === 'ddg') { ddgSearch(q); return; }
    var k = S.settings.webKey;
    if (!k) { toast('「' + p + '」需要 API Key，或改用系统浏览器模式', 'err', 7000); openSettings(); return; }
    toast('搜索中…');
    var req;
    if (p === 'tavily') {
      var tav = { query: q, max_results: 6, search_depth: 'basic' };
      tav['api' + '_key'] = k;
      req = fetch('https://api.tavily.com/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tav)
      }).then(function (r) { return r.json(); }).then(function (j) {
        return (j.results || []).map(function (r) { return '- ' + r.title + '：' + (r.content || '').slice(0, 300) + ' (' + r.url + ')'; }).join('\n');
      });
    } else if (p === 'serper') {
      req = fetch('https://google.serper.dev/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': k },
        body: JSON.stringify({ q: q, num: 8 })
      }).then(function (r) { return r.json(); }).then(function (j) {
        return (j.organic || []).map(function (r) { return '- ' + r.title + '：' + (r.snippet || '') + ' (' + r.link + ')'; }).join('\n');
      });
    } else {
      req = fetch('https://api.bing.microsoft.com/v7.0/search?q=' + encodeURIComponent(q) + '&count=8', {
        headers: { 'Ocp-Apim-Subscription-Key': k }
      }).then(function (r) { return r.json(); }).then(function (j) {
        var v = (j.webPages && j.webPages.value) || [];
        return v.map(function (r) { return '- ' + r.name + '：' + (r.snippet || '') + ' (' + r.url + ')'; }).join('\n');
      });
    }
    req.then(function (txt) { injectSearch(q, txt, p); }).catch(function (e) { toast('搜索失败：' + (e.message || e), 'err', 6000); });
  }

  /* ---------- 设置 ---------- */
  function openSettings() {
    var s = S.settings;
    $('#stBase').value = s.baseUrl; $('#stKey').value = s.apiKey || S._keyMem || '';
    $('#stModel').value = s.model; $('#stTemp').value = s.temperature; $('#stMax').value = s.maxTokens;
    $('#stProxy').value = s.proxy || ''; $('#stCtx').value = s.ctxCount;
    $('#stTimeout').value = s.timeoutMs; $('#stRetry').value = s.retries;
    $('#stStall').value = Math.round((s.stallMs || 60000) / 1000);
    $('#stSys').value = s.systemPrompt; $('#stTheme').value = s.theme; $('#stFont').value = s.font;
    $('#stStream').checked = !!s.stream; $('#stNoKey').checked = !!s.noSaveKey;
    $('#stAutoSave').checked = s.autoSave !== false;
    $('#stThink').checked = s.hideThinking !== false;
    $('#stWebP').value = s.webProvider || 'browser'; $('#stWebK').value = s.webKey || '';
    $('#stEngine').value = s.searchEngine || 'bing';
    show('#mSettings');
  }
  function saveSettingsUI() {
    var s = S.settings;
    s.baseUrl = $('#stBase').value.trim() || DEF.baseUrl;
    var k = $('#stKey').value.trim();
    s.noSaveKey = $('#stNoKey').checked;
    if (s.noSaveKey) { S._keyMem = k; s[KEYFIELD] = ''; } else { s[KEYFIELD] = k; S._keyMem = ''; }
    s.model = $('#stModel').value.trim() || 'deepseek-chat';
    s.temperature = parseFloat($('#stTemp').value) || 0;
    s.maxTokens = Math.max(256, parseInt($('#stMax').value, 10) || 8000);
    s.proxy = $('#stProxy').value.trim();
    s.ctxCount = parseInt($('#stCtx').value, 10) || 12;
    s.timeoutMs = parseInt($('#stTimeout').value, 10) || 300000;
    s.retries = parseInt($('#stRetry').value, 10) || 0;
    s.stallMs = Math.max(10, parseInt($('#stStall').value, 10) || 60) * 1000;
    s.systemPrompt = $('#stSys').value || PR.SYS_BASE;
    s.theme = $('#stTheme').value; s.font = $('#stFont').value;
    s.stream = $('#stStream').checked;
    s.autoSave = $('#stAutoSave').checked;
    s.hideThinking = $('#stThink').checked;
    s.webProvider = $('#stWebP').value; s.webKey = $('#stWebK').value.trim();
    s.searchEngine = $('#stEngine').value || 'bing';
    saveSettings(); applyTheme(); renderHead(); updateMeta();
    hide('#mSettings');
    toast('设置已保存', 'ok');
  }
  function exportAll() {
    Pj.downloadText('aiweb_backup_' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify({
        v: 3, exportedAt: new Date().toISOString(),
        settings: Object.assign({}, S.settings, { apiKey: '', webKey: '' }),
        sessions: S.sessions, skills: JSON.parse(Sk.export()), artifacts: S.artifacts
      }, null, 2), 'application/json');
  }
  function importAll(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = JSON.parse(fr.result);
        if (d.settings) {
          var keepK = S.settings[KEYFIELD], keepW = S.settings.webKey, keepN = S.settings.noSaveKey;
          S.settings = Object.assign(S.settings, d.settings);
          S.settings[KEYFIELD] = keepK; S.settings.webKey = keepW; S.settings.noSaveKey = keepN;
        }
        if (d.sessions && d.sessions.length) S.sessions = d.sessions;
        if (d.skills) Sk.import(JSON.stringify(d.skills));
        if (d.artifacts) S.artifacts = d.artifacts;
        saveSettings(); saveSessions(); lsSet(K.art, S.artifacts);
        S.cur = S.sessions[0] ? S.sessions[0].id : null; lsSet(K.cur, S.cur);
        applyTheme(); renderSessions(); renderSkills(); renderChat(); renderOutputs();
        toast('导入完成', 'ok');
      } catch (e) { toast('导入失败：' + e.message, 'err'); }
    };
    fr.readAsText(file);
  }
  function clearAll() {
    if (!confirm('清空全部数据？不可恢复。')) return;
    ['openclaw_settings', 'openclaw_sessions', 'openclaw_current', 'openclaw_favorites',
      'openclaw_skills', 'openclaw_custom_skills', 'openclaw_artifacts', 'openclaw_last_project']
      .forEach(function (k) { localStorage.removeItem(k); });
    location.reload();
  }

  /* ---------- PPT ---------- */
  function cleanTopic(t) {
    return String(t || '')
      .replace(/^\s*\/(ppt-anim|ppt)\b/, '')
      .replace(/^\s*[-—\s]*主题\s*[：:]\s*/, '')
      .split(/[｜|]\s*(页数|风格)\s*[：:]/)[0]
      .replace(/[｜|]\s*$/, '')
      .trim();
  }
  function openPpt(text) {
    var t = cleanTopic(text);
    $('#pptTopic').value = t || '';
    show('#mPpt');
    setTimeout(function () { $('#pptTopic').focus(); }, 30);
  }
  function genPpt() {
    var topic = cleanTopic($('#pptTopic').value);
    if (!topic) { toast('请输入 PPT 主题', 'err'); return; }
    var n = $('#pptPages').value, style = $('#pptStyle').value;
    var anim = S.mode === 'ppt-anim' || (S.skill === 'ppt.anim');
    var cmd = anim ? '/ppt-anim' : '/ppt';
    hide('#mPpt');
    send(cmd + ' 主题：' + topic + '｜页数：' + n + '｜风格：' + style, { direct: true });
  }

  function show(sel) { $(sel).classList.add('on'); }
  function hide(sel) { $(sel).classList.remove('on'); }

  /* ---------- 启动 ---------- */
  function boot() {
    loadAll(); applyTheme();

    $('#btnTheme').onclick = function () {
      S.settings.theme = S.settings.theme === 'light' ? 'dark' : 'light';
      saveSettings(); applyTheme();
    };
    $('#btnSettings').onclick = openSettings;
    $('#btnWorkbench').onclick = toggleWorkbench;
    $('#btnWbClose').onclick = closeWorkbench;
    $('#btnSearch').onclick = function () { show('#mSearch'); $('#searchInput').focus(); globalSearch($('#searchInput').value); };
    $('#btnNewChat').onclick = function () {
      newSession(); renderChat(); autoGrow();
      if (window.innerWidth <= 900) $('#left').classList.remove('open');
      $('#input').focus();
    };
    $('#btnLeft').onclick = function () { $('#left').classList.add('open'); };
    $('#btnCollapseL').onclick = function () { document.body.classList.toggle('left-collapsed'); };
    $$('[data-rail]').forEach(function (b) {
      b.onclick = function () {
        var t = b.getAttribute('data-rail');
        document.body.classList.remove('left-collapsed');
        var tb = $$('.tab[data-tab]').filter(function (x) { return x.getAttribute('data-tab') === t; })[0];
        if (tb) tb.click();
      };
    });
    $('#btnNewChatRail').onclick = function () { newSession(); renderChat(); autoGrow(); $('#input').focus(); };
    $('#btnSettingsRail').onclick = openSettings;

    $$('.tab[data-tab]').forEach(function (b) {
      b.onclick = function () {
        $$('.tab[data-tab]').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        var t = b.getAttribute('data-tab');
        ['sessions', 'skills', 'outputs'].forEach(function (n) {
          var el = $('#tab' + n.charAt(0).toUpperCase() + n.slice(1));
          if (el) el.style.display = (n === t) ? '' : 'none';
        });
        $$('[data-rail]').forEach(function (r) { r.classList.toggle('on', r.getAttribute('data-rail') === t); });
      };
    });
    $('#sessSearch').oninput = renderSessions;
    $('#skillSearch').oninput = function () { S.skillQuery = this.value; renderSkills(); };
    $('#btnCustomSkill').onclick = function () { openSkillEdit(null); };
    $('#btnSkillExport').onclick = function () { Pj.downloadText('aiweb_skills.json', Sk.export(), 'application/json'); };
    $('#btnSkillImport').onclick = function () { $('#skillFile').click(); };
    $('#skillFile').onchange = function () {
      if (!this.files[0]) return;
      var fr = new FileReader();
      fr.onload = function () { try { var n = Sk.import(fr.result); renderSkills(); toast('已导入，共 ' + n + ' 个自定义技能', 'ok'); } catch (e) { toast('导入失败', 'err'); } };
      fr.readAsText(this.files[0]);
    };

    var input = $('#input');
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    });
    $('#send').onclick = function () {
      if (S.busy) { if (S.ctl) S.ctl.abort(); setBusy(false); showWbLoading(false); toast('已停止'); return; }
      send();
    };
    $('#btnAttach').onclick = function () { $('#filePicker').click(); };
    $('#filePicker').onchange = function () { addFiles(this.files); this.value = ''; };

    $('#cmdbar').innerHTML = '';
    Object.keys(PR.COMMANDS).forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'chip'; b.textContent = c;
      b.title = PR.COMMANDS[c].label;
      b.onclick = function () {
        S.mode = PR.COMMANDS[c].mode || 'chat';
        if (PR.COMMANDS[c].skill) S.skill = PR.COMMANDS[c].skill;
        renderSkills(); renderHead();
        input.value = c + ' '; input.focus(); autoGrow();
      };
      $('#cmdbar').appendChild(b);
    });

    $$('[data-wb]').forEach(function (b) { b.onclick = function () { setWbTab(b.getAttribute('data-wb')); }; });
    $('#btnZipTop').onclick = doZip;
    $('#btnRetry').onclick = function () { retryLast(false); };
    $('#btnWbRetry2').onclick = function () { retryLast(true); };
    $('#btnPreviewTop').onclick = function () { setWbTab('preview'); };
    $('#btnReloadPrev').onclick = runPreview;
    $('#btnCodeMode').onclick = toggleCodeMode;
    $('#btnFileDl').onclick = function () {
      if (!S.curFile) { toast('先选一个文件', 'err'); return; }
      Pj.downloadText(Pj.baseName(S.curFile.path), $('#codeArea').value, 'text/plain');
    };
    $('#btnOpenNew').onclick = function () {
      if (!S.previewUrl) { toast('还没有预览内容', 'err'); return; }
      if (!window.open(S.previewUrl, '_blank')) toast('浏览器拦了新窗口', 'err', 5000);
    };
    $('#btnDownloadMd').onclick = function () { exportDoc('md'); };
    $('#btnCopyMd').onclick = function () { if (S._doc) copy(S._doc.md); };
    $$('[data-docdl]').forEach(function (b) { b.onclick = function () { exportDoc(b.getAttribute('data-docdl')); }; });
    $('#btnDocSaveArt').onclick = function () {
      if (!S._doc) { toast('还没有文档', 'err'); return; }
      addArtifact({ type: 'doc', name: S._doc.title, content: S._doc.md });
      toast('已存入产出', 'ok');
    };
    $('#pptExportBtn').onclick = function () { if (S._ppt) doPptx(S._ppt); else toast('还没有 PPT 大纲', 'err'); };
    $('#pptCopyBtn').onclick = function () { if (S._ppt) copy(JSON.stringify(S._ppt, null, 2)); };
    $('#pptGo').onclick = genPpt;

    $('#stSave').onclick = saveSettingsUI;
    $('#stKeyClear').onclick = function () { $('#stKey').value = ''; };
    $('#stExport').onclick = exportAll;
    $('#stImport').onclick = function () { $('#stFile').click(); };
    $('#stFile').onchange = function () { if (this.files[0]) importAll(this.files[0]); this.value = ''; };
    $('#stClear').onclick = clearAll;
    $('#skSave').onclick = saveSkill;
    $('#sessExportMd').onclick = function () { var s = curSession(); if (s) exportSessionMD(s); };

    $$('.mask').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('on'); });
    });
    $$('[data-close]').forEach(function (b) { b.onclick = function () { hide('#' + b.getAttribute('data-close')); }; });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); show('#mSearch'); $('#searchInput').focus(); globalSearch($('#searchInput').value);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); toggleWorkbench(); }
      if (e.key === 'Escape') {
        if ($$('.mask.on').length) { $$('.mask.on').forEach(function (m) { m.classList.remove('on'); }); return; }
        closeWorkbench();
      }
    });
    $('#searchInput').addEventListener('input', function () { globalSearch(this.value); });

    setWbTab('project');
    renderSessions(); renderSkills(); renderChat(); renderOutputs();
    renderPpt(null); setFiles([]); renderAttach();
    if (!keyNow() && !S.settings.noSaveKey) setTimeout(function () { toast('还没填 API Key，点击右上角 ⚙️', 'err', 6000); }, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  g.AiApp = { S: S, send: send, toast: toast, openWorkbench: openWorkbench, openSettings: openSettings, genPpt: genPpt };
})(window);

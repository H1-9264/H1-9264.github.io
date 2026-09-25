/* ===== aiweb · api.js —— OpenAI 兼容客户端
 * 特性：SSE 流式 / 重试 / 超时 / CORS 代理 / 思考过程过滤 / 截断检测
 * ===== */
(function (g) {
  'use strict';

  /* ---------------- URL ---------------- */
  function endpoint(base) {
    var b = (base || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
    if (/\/chat\/completions$/.test(b)) return b;
    if (/\/completions$/.test(b)) return b.replace(/\/completions$/, '/chat/completions');
    return b + '/chat/completions';
  }
  function proxied(url, proxy) {
    proxy = (proxy || '').trim();
    if (!proxy) return url;
    if (proxy.indexOf('{url}') >= 0) return proxy.replace(/\{url\}/g, encodeURIComponent(url));
    if (/[?=&]$/.test(proxy)) return proxy + encodeURIComponent(url);
    return proxy.replace(/\/+$/, '') + '/' + url;
  }

  /* ---------------- 错误 ---------------- */
  function HttpError(msg, status, body) {
    var e = new Error(msg); e.name = 'HttpError'; e.status = status || 0; e.body = body || ''; return e;
  }
  function errText(body) {
    try {
      var j = JSON.parse(body);
      return (j.error && (j.error.message || j.error.type)) || j.message || String(body).slice(0, 400);
    } catch (e) { return String(body || '').slice(0, 400); }
  }
  function friendly(err) {
    if (err && err.stalled) return err.message;
    var m = String((err && err.message) || err);
    if (/Failed to fetch|NetworkError|load failed/i.test(m))
      return '网络/CORS 失败：目标接口未允许跨域，或被拦截插件挡住。可在设置里填写代理 URL 后重试。';
    if (/aborted|AbortError/i.test(m)) return '请求已取消或超时。';
    if (err && err.status === 400 && /max_tokens|too large/i.test(m)) return '400：max_tokens 超了模型上限，调小一点。';
    if (err && err.status === 401) return '401 未授权：API Key 无效或已过期。';
    if (err && err.status === 402) return '402 余额不足：请检查账户额度。';
    if (err && err.status === 404) return '404：Base URL 或模型名不对，检查是否漏了 /v1。';
    if (err && err.status === 429) return '429 触发限流：稍后重试或降低频率。';
    if (err && err.status >= 500) return '服务端错误 ' + err.status + '，稍后重试。';
    return m;
  }

  /* ---------------- 思考过程过滤 ---------------- */
  var THINK_STRONG = [
    /^\s*(let me|i'll|i will|i should|i need to|i'm going to)\b/i,
    /^\s*the user\b/i,
    /^\s*(we|i)\s+(need|should|must|have|want)\s+to\b/i,
    /^\s*(thinking|analysis|reasoning|thought process)\s*[:：]/i,
    /^\s*<\/?think/i,
    /^\s*(让我|我先|我来|我需要|我要|用户|对方)(想要|希望|要求|需要|来|先)?/,
    /^\s*(分析|思考|推理)(一下|过程)[：:，,]/,
    /^\s*(step|步骤)\s*\d/i
  ];
  var THINK_WEAK = [
    /^\s*(first|firstly|to start|starting|next|then|okay|ok|alright|hmm|well|so)\b\s*[,:，]/i,
    /^\s*(首先|先来|接下来|现在|好的|可以|嗯|那么)[，,：:]/
  ];
  function thinkLevel(l) {
    var t = String(l).trim();
    if (!t) return 0;
    for (var i = 0; i < THINK_STRONG.length; i++) if (THINK_STRONG[i].test(t)) return 2;
    for (var j = 0; j < THINK_WEAK.length; j++) if (THINK_WEAK[j].test(t)) return (t.length >= 40 ? 1 : 0);
    return 0;
  }
  function isThinkLine(l) { return thinkLevel(l) > 0; }
  /* 把「压缩后长度 n」（空白折叠成单空格后）映射回原文下标 */
  function offsetOf(s, n) {
    var count = 0, prevWs = false;
    for (var i = 0; i < s.length; i++) {
      var isWs = /\s/.test(s.charAt(i));
      if (isWs) { if (!prevWs) count++; } else count++;
      prevWs = isWs;
      if (count >= n) return i + 1;
    }
    return s.length;
  }
  /**
   * 去掉泄漏进 content 的思考文本。
   * 安全设计：短回复（<300 字符）且无 reasoning 时一律不动，避免误删正常回答。
   */
  function stripThinking(text, reasoning) {
    var raw = String(text == null ? '' : text);
    var s = raw;
    if (!s) return s;
    // 0) <think>...</think> 整块删掉
    s = s.replace(/<think(?:ing)?[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
    var hasReason = !!String(reasoning || '').trim();
    if (s.length < 300 && !hasReason) return s.trim();   // ← 短回答不碰
    // 1) 开头与 reasoning_content 重复（>=24 字符）→ 删掉重复段
    if (hasReason) {
      var r = String(reasoning).replace(/\s+/g, ' ').trim();
      var head = s.replace(/\s+/g, ' ').slice(0, 300);
      for (var len = Math.min(r.length, head.length); len >= 24; len--) {
        if (r.slice(0, len) === head.slice(0, len)) {
          s = s.slice(offsetOf(s, len)).replace(/^\s+/, '');
          break;
        }
      }
    }
    // 2) 删除开头的思考行。闸门：只有「确实像泄漏的思考」才动手
    var lines = s.split('\n');
    var first = null;
    for (var k = 0; k < lines.length; k++) { if (lines[k].trim()) { first = lines[k]; break; } }
    var lv0 = first ? thinkLevel(first) : 0;
    var gate = hasReason || s.length >= 240 || (lv0 === 2 && first.trim().length >= 60);
    if (gate) {
      var drop = 0, chars = 0;
      for (var i = 0; i < lines.length && i < 8; i++) {
        var l = lines[i];
        if (!l.trim()) { if (drop === i) drop = i + 1; continue; }
        if (isThinkLine(l)) { drop = i + 1; chars += l.length; continue; }
        break;
      }
      if (drop > 0 && chars > 0) s = lines.slice(drop).join('\n').replace(/^\s+/, '');
    }
    return s.trim();
  }

  /* ---------------- reasoner 兼容 ---------------- */
  function isReasonerModel(name) {
    return /reasoner|thinking|-r1\b|r1-|deepseek-r/i.test(String(name || ''));
  }
  /* deepseek-reasoner 不接收 system role：把系统提示并入首条 user 消息 */
  function mergeSystem(messages) {
    var msgs = messages || [];
    var sys = msgs.filter(function (m) { return m.role === 'system'; })
      .map(function (m) { return m.content; }).join('\n\n');
    var rest = msgs.filter(function (m) { return m.role !== 'system'; });
    if (!sys) return rest;
    if (!rest.length) return [{ role: 'user', content: sys }];
    if (rest[0].role === 'user') {
      rest = rest.slice();
      rest[0] = { role: 'user', content: sys + '\n\n---\n\n' + rest[0].content };
    } else {
      rest = [{ role: 'user', content: sys }].concat(rest);
    }
    return rest;
  }

  /* ---------------- 流式读取 ---------------- */
  function readStream(res, onDelta, onThink, onEnd) {
    var reader = res.body.getReader();
    var dec = new TextDecoder('utf-8');
    var buf = '', text = '', reasoning = '', usage = null, finish = null, ended = false;
    function fireEnd() {
      if (ended) return;
      ended = true;
      try { if (onEnd) onEnd(); } catch (e) {}
    }
    return new Promise(function (resolve, reject) {
      (function pump() {
        reader.read().then(function (r) {
          if (r.done) { fireEnd(); return resolve({ text: text, reasoning: reasoning, usage: usage, finishReason: finish }); }
          buf += dec.decode(r.value, { stream: true });
          var lines = buf.split('\n');
          buf = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line.charAt(0) === ':') continue;
            if (line.indexOf('data:') !== 0) continue;
            var data = line.slice(5).trim();
            if (data === '[DONE]') { fireEnd(); continue; }
            var j;
            try { j = JSON.parse(data); } catch (e) { continue; }
            if (j.usage) usage = j.usage;
            var ch = (j.choices && j.choices[0]) || {};
            if (ch.finish_reason) { finish = ch.finish_reason; fireEnd(); }
            var d = ch.delta || ch.message || {};
            var rc = d.reasoning_content != null ? d.reasoning_content
              : (d.reasoning != null ? d.reasoning : null);
            if (rc) { reasoning += rc; if (onThink) onThink(rc); }
            if (d.content) { text += d.content; if (onDelta) onDelta(d.content); }
          }
          pump();
        }).catch(reject);
      })();
    });
  }

  /**
   * 发起对话。
   * opts: {baseUrl, apiKey, model, messages, temperature, maxTokens, stream, proxy,
   *        timeoutMs, retries, hideThinking, signal}
   * 返回 {text, reasoning, usage, finishReason, truncated, filtered}
   */
  function chat(opts, onDelta, onThink) {
    var url = proxied(endpoint(opts.baseUrl), opts.proxy);
    var reasoner = isReasonerModel(opts.model);
    var msgs = reasoner ? mergeSystem(opts.messages) : (opts.messages || []);
    var body = {
      model: opts.model || 'deepseek-chat',
      messages: msgs,
      stream: !!opts.stream,
      max_tokens: Number(opts.maxTokens) || 8000
    };
    if (!reasoner) body.temperature = (opts.temperature === undefined ? 0.7 : Number(opts.temperature));

    var timeoutMs = Number(opts.timeoutMs) || 180000;
    var maxRetry = opts.retries === undefined ? 2 : Number(opts.retries);
    var attempt = 0;
    var hide = opts.hideThinking !== false;

    function finalize(r) {
      var raw = r.text || '';
      var clean = hide ? stripThinking(raw, r.reasoning) : raw;
      return {
        text: clean,
        rawText: raw,
        reasoning: r.reasoning || '',
        usage: r.usage || null,
        finishReason: r.finishReason || null,
        truncated: r.finishReason === 'length',
        filtered: clean !== raw,
        empty: !String(clean).trim()
      };
    }

    function run() {
      attempt++;
      var ctl = new AbortController();
      var settled = false, stalled = false;
      var stallMs = Number(opts.stallMs) || 60000;
      var timer = setTimeout(function () { ctl.abort(); }, timeoutMs);
      var stallTimer = null;
      /* 看门狗：stallMs 内没有任何新数据 → 主动中断，避免一直卡在「正在生成」 */
      function armStall() {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(function () {
          stalled = true;
          ctl.abort();
          try { if (opts.onStall) opts.onStall(); } catch (e) {}
        }, stallMs);
      }
      function clearTimers() { settled = true; clearTimeout(timer); if (stallTimer) clearTimeout(stallTimer); }
      function poke() { if (!settled) armStall(); }
      armStall();
      if (opts.signal) {
        if (opts.signal.aborted) ctl.abort();
        else opts.signal.addEventListener('abort', function () { ctl.abort(); });
      }
      var headers = { 'Content-Type': 'application/json' };
      if (opts.apiKey) headers['Authorization'] = 'Bearer ' + opts.apiKey;

      return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctl.signal })
        .then(function (res) {
          if (!res.ok) {
            return res.text().then(function (t) {
              throw HttpError('HTTP ' + res.status + ' · ' + errText(t), res.status, t);
            });
          }
          if (!body.stream || !res.body || !res.body.getReader) {
            return res.json().then(function (j) {
              var ch = (j.choices && j.choices[0]) || {};
              var msg = ch.message || {};
              var r = {
                text: msg.content || '',
                reasoning: msg.reasoning_content || msg.reasoning || '',
                usage: j.usage || null,
                finishReason: ch.finish_reason || null
              };
              if (onDelta && r.text) onDelta(r.text);
              try { if (opts.onEnd) opts.onEnd(); } catch (e) {}
              return finalize(r);
            });
          }
          return readStream(res, function (d) { poke(); if (onDelta) onDelta(d); },
            function (t) { poke(); if (onThink) onThink(t); }, opts.onEnd).then(finalize);
        })
        .then(function (r) { clearTimers(); return r; }, function (err) {
          clearTimers();
          if (stalled) {
            var se = HttpError('流式响应超过 ' + Math.round(stallMs / 1000) + ' 秒没有新数据，已自动中断。可以减少项目规模后重试。', 0, '');
            se.stalled = true;
            throw se;
          }
          var abortedByUser = opts.signal && opts.signal.aborted;
          var retryable = !abortedByUser && (
            /Failed to fetch|NetworkError|load failed|aborted|AbortError/i.test(String(err.message || '')) ||
            err.status === 429 || err.status >= 500
          );
          if (retryable && attempt <= maxRetry) {
            if (onDelta) onDelta('\u0000retry:' + attempt);
            return new Promise(function (r) { setTimeout(r, 600 * attempt); }).then(run);
          }
          throw err;
        });
    }
    return run();
  }

  /* ---------------- token 估算 ---------------- */
  function estimateTokens(str) {
    if (!str) return 0;
    var s = String(str);
    var cjk = (s.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length;
    return Math.ceil(cjk / 1.7 + (s.length - cjk) / 4);
  }

  g.AiApi = {
    chat: chat,
    endpoint: endpoint,
    proxied: proxied,
    friendly: friendly,
    estimateTokens: estimateTokens,
    stripThinking: stripThinking,
    isReasonerModel: isReasonerModel,
    mergeSystem: mergeSystem
  };
})(window);

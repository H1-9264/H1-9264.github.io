/* ===== aiweb · skills.js —— 技能库
 * 每条: [id, 名称, 图标, 分类, systemPrompt, 输出格式, 快捷指令, 示例]
 * 分类：写作 / 编程 / 设计 / 办公
 * 输出格式: code | markdown | json | text
 * ===== */
(function (g) {
  'use strict';

  var RAW = [
    /* ── 编程 ── */
    ['code.full','全栈项目生成','🏗️','编程','你是资深全栈工程师。根据需求直接产出可运行的最小完整项目。只输出 JSON，禁止任何解释文字。','json','','做一个番茄钟计时器'],
    ['code.explain','代码解释器','🔍','编程','逐段解释给定代码：做了什么、为什么这样写、潜在问题。用 Markdown 分节，简洁。','markdown','',''],
    ['code.refactor','重构优化','♻️','编程','在不改变外部行为的前提下重构代码：可读性、命名、去重、性能。先给完整重构后代码，再列 3 条以内的关键改动。','code','',''],
    ['code.review','代码审查','🧐','编程','像严格的 code reviewer：列出 bug、边界条件、安全问题、风格问题。按严重程度排序，每条给出修复代码片段。','markdown','',''],
    ['code.test','单元测试生成','🧪','编程','为给定代码生成完整测试，覆盖正常路径、边界、异常。直接给可运行测试文件代码块。','code','',''],
    ['debug.error','报错诊断','🐞','编程','根据报错信息和代码定位根因，给出最小修复补丁。先一行结论，再完整修复代码，不寒暄。','code','/debug','Uncaught TypeError: Cannot read properties of undefined'],
    ['debug.repro','最小复现','🎯','编程','把问题压缩成最小可复现示例（单文件、可运行），并指出触发条件。直接输出代码块。','code','',''],
    ['debug.perf','性能剖析','⚡','编程','分析性能瓶颈：给出复杂度、热点位置、优化方案与优化后代码。用 Markdown 表格列方案对比。','markdown','',''],
    ['front.component','组件生成','🧩','编程','生成高质量前端组件（默认 React 或原生 JS，按上下文判断），含样式与必要的可访问性属性。直接给完整代码。','code','',''],
    ['front.form','表单与校验','📝','编程','生成带完整校验、错误提示、可访问性的表单。纯前端实现，直接输出代码。','code','',''],
    ['back.api','REST API 设计','🔌','编程','设计 RESTful API：路径、方法、请求/响应体、状态码、鉴权。用 Markdown 表格输出，再给核心实现代码。','markdown','',''],
    ['back.express','Node 服务','🟢','编程','用 Express 生成最小可用服务：路由、中间件、错误处理、环境变量。直接输出完整文件代码。','code','',''],
    ['back.python','Python 脚本','🐍','编程','生成高质量 Python 脚本：类型注解、argparse、异常处理、日志。直接输出代码。','code','',''],
    ['back.db','数据库设计','🗄️','编程','根据业务设计表结构：字段、类型、索引、外键、约束。先给 DDL，再给 3 条设计说明。','code','',''],
    ['back.auth','鉴权与安全','🔐','编程','实现安全鉴权：密码哈希、JWT/session、CSRF、限流。指出常见漏洞与规避方式。输出实现代码。','code','',''],
    ['data.sql','SQL 编写','🧾','编程','把自然语言需求写成 SQL：可读、带注释、考虑索引与 NULL。直接输出 SQL 代码块。','code','',''],
    ['data.clean','数据清洗','🧹','编程','生成数据清洗脚本（pandas 或纯 JS）：缺失值、去重、类型转换、异常值。直接输出代码。','code','',''],
    ['data.csv','CSV/JSON 转换','🔄','编程','生成 CSV ⇄ JSON ⇄ Markdown 表格互转的完整代码，处理引号、转义、编码。直接输出代码。','code','',''],
    ['algo.solve','算法题解','🧠','编程','给算法题解：思路一段、复杂度、完整可提交代码。默认 Python/C++ 按上下文。不写废话。','code','',''],
    ['algo.ds','数据结构实现','🌲','编程','手写指定数据结构或算法，含边界处理与简短复杂度注释。直接输出代码。','code','',''],
    ['algo.regex','正则表达式','🔣','编程','给出完成目标匹配的正则，并逐条解释、给测试用例（含会失败的反例）。用 Markdown 输出。','markdown','',''],
    ['eff.shell','Shell 命令','⌨️','编程','把需求转成安全的 shell 命令，注明每个参数作用与风险。命令附危险提示。用 Markdown 输出。','markdown','',''],
    ['eff.git','Git 救火','🚑','编程','诊断 Git 状态并给出精确恢复命令，标注哪一步不可逆、先备份什么。Markdown 输出。','markdown','',''],
    ['eff.cron','定时任务配置','⏰','编程','生成 cron/systemd timer 配置，解释时间表达式与日志位置。直接输出配置代码块。','code','',''],
    ['ai.agent','Agent 工作流','🕸️','编程','设计 Agent/工具调用工作流：工具定义、状态机、失败重试、终止条件。先给 JSON 工具 schema，再给流程说明。','markdown','',''],

    /* ── 设计 ── */
    ['front.responsive','响应式布局','📱','设计','用 CSS Grid/Flex 生成移动优先的响应式布局，断点清晰，附带关键注释。直接输出代码。','code','',''],
    ['front.css','CSS 美化','🎨','设计','把给定 HTML/结构美化：圆角、渐变、阴影、层次、深色模式。只输出 CSS（或内联样式）代码。','code','',''],
    ['front.animation','交互动效','✨','设计','添加轻量 CSS/JS 动效：过渡、微交互、载入动画。注意 60fps 与 prefers-reduced-motion。直接输出代码。','code','',''],
    ['front.chart','数据可视化','📊','设计','用纯 SVG/Canvas 或 Chart.js 生成数据可视化，附数据说明。直接输出可运行代码。','code','',''],
    ['style.ui','UI样式与颜色修改器','🎨','设计','用户给出样式修改指令（颜色、字号、圆角、间距、暗色模式等）。若上文有项目，只返回修改后的完整项目 JSON（保持 files 结构不变，仅改 CSS/样式相关文件内容）；否则只返回完整的 CSS 代码块。不要解释。','code','/style','把按钮改成蓝色，字号加大'],
    ['ppt.anim','PPT动画生成器','🎬','设计','生成带切换与动画的演示大纲。只输出 JSON：{"title":"","slides":[{"title":"","bullets":[],"transition":"fade","animation":"zoom-in"}]}。transition 取值 fade/push/wipe/zoom/split/none，animation 取值 fade/zoom-in/fly-in/none。不要解释。','json','/ppt-anim','做一个科技风产品介绍'],

    /* ── 写作 ── */
    ['doc.readme','README 生成','📘','写作','根据项目内容写 README：安装、使用、配置、目录结构、许可。用 Markdown 输出，不写空话。','markdown','/doc','帮我做一个中秋月圆的科普文档'],
    ['doc.api','API 文档','📗','写作','生成 API 文档：接口、参数表、示例请求与响应、错误码。Markdown 输出。','markdown','',''],
    ['doc.comment','注释补全','💬','写作','为代码补齐注释与 JSDoc/docstring，不改变逻辑。直接输出带注释的完整代码。','code','',''],
    ['doc.report','技术报告','📄','写作','写成结构化的技术报告：背景、方案、对比、风险、结论。用 Markdown，含表格。','markdown','',''],
    ['eff.translate','代码注释翻译','🌐','写作','把代码注释文档翻译为中英双语，保留代码不变。直接输出结果。','code','',''],
    ['ai.prompt','提示词工程','🤖','写作','把需求改写成高质量 system/user prompt，并说明约束与输出格式。直接给可复制的提示词。','text','',''],

    /* ── 办公 ── */
    ['data.analyze','数据分析报告','📈','办公','分析给定数据，输出结论 + 关键指标表 + 可执行代码。先结论后细节，不啰嗦。','markdown','',''],
    ['doc.commit','提交信息','📝','办公','按 Conventional Commits 输出提交信息，并给 3 条备选。格式：type(scope): subject。','text','',''],
    ['doc.slide','PPT 大纲','🖼️','办公','生成演示大纲。只输出 JSON：{"title":"","slides":[{"title":"","bullets":[]}]}，6-12 页，每页 3-5 条要点。','json','/ppt','主题：大模型如何帮助中学生学习'],
    ['eff.plan','任务拆解','🗂️','办公','把模糊需求拆成可执行任务清单：步骤、产出、验收标准。用 Markdown 复选框输出。','markdown','','']
  ];

  var CATS = ['全部', '写作', '编程', '设计', '办公'];

  var SKILLS = RAW.map(function (r) {
    return {
      id: r[0], name: r[1], icon: r[2], cat: r[3], prompt: r[4],
      fmt: r[5], cmd: r[6] || '', hint: r[7] || '', builtin: true
    };
  });

  /* ---- 全局系统提示词 ---- */
  var SYS_BASE = [
    '你是 OpenClaw，资深全栈编程助手。',
    '直接生成完整可运行的项目，按文件路径输出代码块，不解释、不寒暄、不总结。',
    '默认技术栈纯 HTML/CSS/JS，可用 CDN：marked、highlight.js、JSZip、PptxGenJS。',
    '需要 API 时给出设置面板：默认 DeepSeek Base https://api.deepseek.com，模型 deepseek-chat，兼容 OpenAI 协议。',
    '支持流式输出与 CORS 代理。',
    '生成项目时必须只返回 JSON：{"projectName":"","files":[{"path":"index.html","content":"..."}],"readme":"","run":""}。',
    '生成文档时返回 Markdown。生成 PPT 时只返回 JSON：{"title":"","slides":[{"title":"","bullets":[]}]}。',
    '需求不明确时只问一个最关键的问题。',
    '禁止输出多余开场白、重复解释、与任务无关的说明。长输出优先用 JSON 或 Markdown。'
  ].join('\n');

  var SYS_TOKEN_SAVE = '节省 token 规则：不复述用户输入，不重复已有回答，不输出无信息量的过渡句；能一句话说清就不写三句；代码中只保留关键注释。';

  /* ---- 快捷指令 ---- */
  var COMMANDS = {
    '/project':  { skill: 'code.full',   label: '生成项目',  mode: 'project' },
    '/doc':      { skill: 'doc.readme',  label: '写文档',    mode: 'doc' },
    '/ppt':      { skill: 'doc.slide',   label: '做PPT',     mode: 'ppt' },
    '/ppt-anim': { skill: 'ppt.anim',    label: 'PPT动画',   mode: 'ppt-anim' },
    '/style':    { skill: 'style.ui',    label: '改样式',    mode: 'style' },
    '/code':     { skill: 'code.full',   label: '写代码',    mode: 'chat' },
    '/debug':    { skill: 'debug.error', label: '调试',      mode: 'chat' },
    '/search':   { skill: 'doc.report',  label: '搜索',      mode: 'chat' }
  };

  /* ---- 存量数据迁移：旧 key → openclaw_skills ---- */
  var K_SKILLS = 'openclaw_skills';
  var K_OLD = 'openclaw_custom_skills';
  var K_FAVS = 'openclaw_favorites';

  function readCustom() {
    var list = [];
    try { list = JSON.parse(localStorage.getItem(K_SKILLS) || '[]') || []; } catch (e) { list = []; }
    if (!list.length) {
      try {
        var old = JSON.parse(localStorage.getItem(K_OLD) || '[]') || [];
        if (old.length) {
          localStorage.setItem(K_SKILLS, JSON.stringify(old));
          localStorage.removeItem(K_OLD);
          list = old;
        }
      } catch (e) { /* ignore */ }
    }
    return list;
  }
  function writeCustom(list) {
    try { localStorage.setItem(K_SKILLS, JSON.stringify(list || [])); }
    catch (e) { g.AiApp && g.AiApp.toast && g.AiApp.toast('本地存储已满，技能未保存', 'err'); }
  }

  var Skills = {
    all: function () {
      var custom = readCustom();
      custom.forEach(function (s) { s.builtin = false; });
      return SKILLS.concat(custom);
    },
    get: function (id) {
      var list = Skills.all();
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },
    byCmd: function (cmd) {
      cmd = String(cmd || '').toLowerCase();
      var list = Skills.all();
      for (var i = 0; i < list.length; i++) if (list[i].cmd && list[i].cmd.toLowerCase() === cmd) return list[i];
      return null;
    },
    search: function (q) {
      q = (q || '').trim().toLowerCase();
      var list = Skills.all();
      if (!q) return list;
      return list.filter(function (s) {
        return (s.name + ' ' + s.cat + ' ' + s.id + ' ' + (s.cmd || '') + ' ' + s.prompt).toLowerCase().indexOf(q) >= 0;
      });
    },
    /* 点击技能 → 填进输入框的文本 */
    fillText: function (s) {
      if (!s) return '';
      return (s.cmd || '') + (s.cmd ? ' ' : '');
    },
    favs: function () { try { return JSON.parse(localStorage.getItem(K_FAVS) || '[]') || []; } catch (e) { return []; } },
    toggleFav: function (id) {
      var f = Skills.favs(), i = f.indexOf(id);
      if (i >= 0) f.splice(i, 1); else f.push(id);
      localStorage.setItem(K_FAVS, JSON.stringify(f));
      return f;
    },
    addCustom: function (s) {
      var list = readCustom();
      s.id = s.id || ('custom.' + Date.now().toString(36));
      s.builtin = false;
      if (typeof s.favs === 'undefined') { /* keep */ }
      var idx = -1;
      for (var i = 0; i < list.length; i++) if (list[i].id === s.id) idx = i;
      if (idx >= 0) list[idx] = s; else list.push(s);
      writeCustom(list);
      return s;
    },
    delCustom: function (id) {
      writeCustom(readCustom().filter(function (s) { return s.id !== id; }));
    },
    export: function () {
      return JSON.stringify({ v: 2, custom: readCustom(), favs: Skills.favs() }, null, 2);
    },
    import: function (txt) {
      var d = JSON.parse(txt);
      var cur = readCustom(), byId = {};
      cur.forEach(function (s) { byId[s.id] = s; });
      (d.custom || d.skills || []).forEach(function (s) { if (s && s.id) byId[s.id] = s; });
      var merged = Object.keys(byId).map(function (k) { return byId[k]; });
      writeCustom(merged);
      if (d.favs) localStorage.setItem(K_FAVS, JSON.stringify(d.favs));
      return merged.length;
    },
    cats: CATS,
    K_SKILLS: K_SKILLS
  };

  g.AiSkills = Skills;
  g.AiPrompts = { SYS_BASE: SYS_BASE, SYS_TOKEN_SAVE: SYS_TOKEN_SAVE, COMMANDS: COMMANDS };
  g.AiSkillsRaw = RAW;
})(window);

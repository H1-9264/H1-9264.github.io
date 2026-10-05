/* markdown.js — 极简 Markdown 渲染器（零依赖，足够渲染 about.md）
   支持：标题、段落、粗体/斜体/删除线、行内代码、链接、图片、围栏代码块、
        引用、有序/无序列表（含嵌套）、分隔线、表格（带对齐）、自动链接化。 */
import { escapeHtml } from './dom.js';

/* 内联语法 */
export function inline(src) {
  let text = String(src ?? '');
  const store = [];
  const keep = (html) => {
    store.push(html);
    return '\u0000' + (store.length - 1) + '\u0000';
  };

  text = escapeHtml(text);
  // 行内代码优先
  text = text.replace(/`([^`]+)`/g, (m, code) => keep('<code>' + code + '</code>'));
  // 图片
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, alt, src2, title) =>
    keep('<img src="' + src2 + '" alt="' + alt + '"' + (title ? ' title="' + title + '"' : '') + ' loading="lazy">'));
  // 链接
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (m, label, href, title) => {
    const ext = /^https?:/i.test(href);
    return keep('<a href="' + href + '"' + (title ? ' title="' + title + '"' : '') + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>');
  });
  // 粗体 / 斜体 / 删除线
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // 裸链接
  text = text.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, href) =>
    pre + '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + href + '</a>');
  // 邮箱
  text = text.replace(/([\w.+-]+@[\w-]+\.[\w.]+)/g, '<a href="mailto:$1">$1</a>');

  return text.replace(/\u0000(\d+)\u0000/g, (m, i) => store[Number(i)]);
}

function table(rows, aligns) {
  const head = rows[0];
  const body = rows.slice(1);
  const th = head.map((c, i) => '<th' + (aligns[i] ? ' style="text-align:' + aligns[i] + '"' : '') + '>' + inline(c) + '</th>').join('');
  const trs = body.map((r) => '<tr>' + head.map((_, i) => '<td' + (aligns[i] ? ' style="text-align:' + aligns[i] + '"' : '') + '>' + inline(r[i] ?? '') + '</td>').join('') + '</tr>').join('');
  return '<div class="md-table-wrap"><table class="table"><thead><tr>' + th + '</tr></thead><tbody>' + trs + '</tbody></table></div>';
}

const splitRow = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

export function renderMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').split('\n');
  const out = [];
  let i = 0;
  const listStack = [];

  const closeLists = (toDepth = 0) => {
    while (listStack.length > toDepth) {
      out.push(listStack.pop() === 'ol' ? '</ol>' : '</ul>');
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // 围栏代码块
    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      const lang = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      closeLists();
      out.push('<pre class="md-code' + (lang ? ' lang-' + lang : '') + '"><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
      continue;
    }

    // 标题
    const head = line.match(/^(#{1,6})\s+(.*)$/);
    if (head) {
      closeLists();
      const lvl = head[1].length;
      const id = head[2].toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
      out.push('<h' + lvl + ' id="' + id + '">' + inline(head[2]) + '</h' + lvl + '>');
      i++;
      continue;
    }

    // 分隔线
    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      closeLists();
      out.push('<hr>');
      i++;
      continue;
    }

    // 引用
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      closeLists();
      out.push('<blockquote>' + renderMarkdown(buf.join('\n')) + '</blockquote>');
      continue;
    }

    // 表格
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const rows = [splitRow(line)];
      const aligns = splitRow(lines[i + 1]).map((c) => {
        const left = c.startsWith(':'), right = c.endsWith(':');
        return left && right ? 'center' : right ? 'right' : left ? 'left' : '';
      });
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      closeLists();
      out.push(table(rows, aligns));
      continue;
    }

    // 列表
    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2) + 1;
      const kind = /\d/.test(li[2]) ? 'ol' : 'ul';
      while (listStack.length > depth) out.push(listStack.pop() === 'ol' ? '</ol>' : '</ul>');
      if (listStack.length < depth) {
        // 嵌套时补一层
        while (listStack.length < depth) { out.push(kind === 'ol' ? '<ol>' : '<ul>'); listStack.push(kind); }
      } else if (listStack[listStack.length - 1] !== kind) {
        out.push(listStack.pop() === 'ol' ? '</ol>' : '</ul>');
        out.push(kind === 'ol' ? '<ol>' : '<ul>');
        listStack.push(kind);
      }
      let content = li[3];
      // 任务列表
      let cls = '';
      const task = content.match(/^\[([ xX])\]\s*(.*)$/);
      if (task) {
        cls = ' class="task"';
        content = '<span class="md-task">' + (task[1].toLowerCase() === 'x' ? '☑' : '☐') + '</span> ' + task[2];
      }
      out.push('<li' + cls + '>' + inline(content) + '</li>');
      i++;
      continue;
    }
    if (/^\s*$/.test(line)) { closeLists(); i++; continue; }

    // 段落
    const buf = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|\s*>|\s*```|\s*\|)/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    closeLists();
    out.push('<p>' + inline(buf.join(' ')) + '</p>');
  }
  closeLists();
  return out.join('\n');
}

/* 把渲染结果挂到容器里 */
export function mountMarkdown(container, src) {
  if (!container) return;
  container.classList.add('markdown-body');
  container.innerHTML = renderMarkdown(src);
}

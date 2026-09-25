# aiweb

纯静态网页版编程助手。无需构建、无需后端、无需框架，双击 `index.html` 就能跑。

三栏工作台：左侧会话/技能/产出，中间对话，右侧工作台（📦 项目 / 📘 文档 / 🖼️ PPT / 👁 预览 四个 Tab，默认隐藏，生成时自动滑出）。

生成结果**直接落成文件**：文档出 `.docx`，演示出 `.pptx`，项目出 `.zip`，不用再手动复制粘贴。

对话里不会出现原始 JSON 或 Markdown 源码，只显示一句「📦 项目已生成，请在右侧查看并下载。」

---

## 打开方式

1. 双击 `index.html`（Chrome / Edge 最新版）。
2. 或起个本地服务：`python -m http.server 8080`，打开 `http://localhost:8080`。

## 填 API

右上角 ⚙️ 设置：

- Base URL：`https://api.deepseek.com`
- API Key：在 platform.deepseek.com 创建
- 模型：`deepseek-chat`，可手填 `deepseek-reasoner` 或其他 OpenAI 兼容模型
- `max_tokens` 默认 **8000**（长 JSON 别调低，否则会被截断导致空回复）
- 用 `deepseek-reasoner` 时思考过程会自动过滤，不会出现在对话里（可在设置里关闭过滤）

兼容任何 OpenAI 格式接口（OpenAI、Moonshot、硅基流动、本地 Ollama 等）：会自动拼 `/chat/completions`，也兼容 Base URL 以 `/v1` 结尾。

勾「本次会话不保存 Key」后，Key 只留在当前标签页内存里，关掉即消失。

## 直接出文件（重点）

设置里的 **生成后直接下载文件** 默认开启。生成完成即自动下载，无需点任何按钮：

| 你说 | 你拿到 |
|---|---|
| `/doc 帮我做一个中秋月圆的文档` | `中秋月圆.docx` —— 真 Word 文件：标题层级、表格、代码块灰色底纹、引用左侧竖线、项目符号，全部排好版 |
| `/ppt 主题：…` | `xxx.pptx` —— 真实 PowerPoint 文件，封面 + 正文页 |
| `/project 做一个番茄钟` | `todo.zip` —— 解压即用的多文件项目，同时右侧有文件树与 iframe 实时预览 |

没自动下载（浏览器拦截 / 关了开关）也没关系，每条回复下面都有 `⬇ .docx`、`⬇ .pptx`、`🗜 下载 ZIP` 按钮，右侧 📦 产出里也留了历史记录。

### 关于文件存到哪

浏览器出于安全限制**只能写进「下载」目录**，不能指定桌面。想让文件直接落到桌面：

> Chrome → 设置 → 下载内容 → 位置 → 改成桌面

改完以后，aiweb 生成的文件就直接出现在桌面了。

## CORS 注意

浏览器直连第三方 API 时，对方必须允许跨域。若报 `Failed to fetch` / CORS 错误，在设置里填「代理 URL」：

- `https://api.allorigins.win/raw?url={url}`
- `https://corsproxy.io/?{url}`
- 自建：`https://your-proxy.workers.dev/?url={url}`

`{url}` 会替换成编码后的真实地址；没有 `{url}` 时直接前缀拼接。

也可用本地 Ollama（`http://localhost:11434/v1`）从根本上绕开 CORS。

⚠️ 用公共代理意味着 API Key 会经过第三方，敏感场景请自建代理。

## CDN

页面用到 5 个 CDN 库：`marked`、`DOMPurify`、`highlight.js`、`JSZip`、`PptxGenJS`。

- `.docx` 生成**不依赖额外库**（只借用已有的 JSZip，OOXML 是内置实现的），离线时仍可用。
- 离线打开时 `.pptx` 导出、ZIP 打包、Markdown 渲染会降级，页面顶部会弹提示；联网刷新即恢复。

## 部署到 GitHub Pages / Vercel

GitHub Pages：

```bash
cd Aiweb
git init && git add . && git commit -m "init"
git remote add origin https://github.com/<你>/<仓库>.git
git push -u origin main
```

仓库 Settings → Pages → Source 选 `main` / `root`，等 1 分钟。

Vercel：导入仓库，Framework Preset 选 **Other**，Build Command 留空，Output Directory 留空。

部署后依然是纯静态，API Key 只存在访客自己的浏览器里。

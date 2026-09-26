#!/usr/bin/env node
/**
 * BZD CubeTimer — 基于 csTimer 修改 (GPL-3.0, Copyright (C) cs0x7f)
 * 修改日期: 2026-09-26
 * 修改内容: 新增文件。交付包内置的零依赖静态服务器。
 *           用 http://localhost 提供本目录，使页面处于安全上下文，
 *           从而启用 Web Bluetooth（蓝牙魔方）与麦克风（Stackmat 音频）。
 *
 * 用法：node server.mjs [--port 8080] [--open]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

const argv = process.argv.slice(2);
const portArg = argv.indexOf('--port');
const port = Number(portArg >= 0 ? argv[portArg + 1] : process.env.PORT || 8080) || 8080;
const shouldOpen = argv.includes('--open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  const rel = normalize(clean).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  let target = join(ROOT, rel);
  if (!target.startsWith(ROOT)) return null;
  try {
    const st = await stat(target);
    if (st.isDirectory()) target = join(target, 'index.html');
  } catch {
    return null;
  }
  return target;
}

const server = createServer(async (req, res) => {
  const target = await resolveFile(req.url ?? '/');
  if (!target) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用。换个端口：node server.mjs --port 8081 --open`);
  } else {
    console.error('启动失败：', e);
  }
  process.exit(1);
});

server.listen(port, () => {
  const url = `http://localhost:${port}/`;
  console.log('BZD CubeTimer 已启动（安全上下文：蓝牙魔方与 Stackmat 可用）');
  console.log(`  请在浏览器打开：${url}`);
  console.log('  关闭本窗口即停止服务。');
  if (shouldOpen) {
    const cmd =
      process.platform === 'win32'
        ? `start "" "${url}"`
        : process.platform === 'darwin'
          ? `open "${url}"`
          : `xdg-open "${url}"`;
    exec(cmd, () => {
      /* 打不开也不影响手动访问 */
    });
  }
});

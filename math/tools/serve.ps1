# tools/serve.ps1 — 极简静态文件服务器（无 Python 时的后备方案）
param(
  [int]$Port = 8000,
  [string]$Root = (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
)

$ErrorActionPreference = 'Stop'
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
  '.csv'  = 'text/csv; charset=utf-8'
  '.md'   = 'text/plain; charset=utf-8'
  '.woff2' = 'font/woff2'
}

$listener = New-Object System.Net.HttpListener
$prefix = 'http://127.0.0.1:' + $Port + '/'
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "  [错误] 端口 $Port 无法监听：$($_.Exception.Message)"
  exit 1
}

Write-Host "  [就绪] $prefix  根目录: $Root"
Write-Host "  按 Ctrl+C 停止。"
Write-Host ""

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
  } catch {
    break
  }
  $request = $context.Request
  $response = $context.Response
  try {
    $rel = [System.Uri]::UnescapeDataString($request.Url.LocalPath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $full = Join-Path $Root $rel
    $resolved = [System.IO.Path]::GetFullPath($full)
    $rootFull = [System.IO.Path]::GetFullPath($Root)

    if (-not $resolved.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
      $response.StatusCode = 403
      $response.Close()
      continue
    }
    if (Test-Path -LiteralPath $resolved -PathType Container) {
      $resolved = Join-Path $resolved 'index.html'
    }
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
      $body = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found: ' + $rel)
      $response.StatusCode = 404
      $response.ContentType = 'text/plain; charset=utf-8'
      $response.ContentLength64 = $body.Length
      $response.OutputStream.Write($body, 0, $body.Length)
      $response.Close()
      continue
    }
    $ext = [System.IO.Path]::GetExtension($resolved).ToLowerInvariant()
    $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    $bytes = [System.IO.File]::ReadAllBytes($resolved)
    $response.StatusCode = 200
    $response.ContentType = $type
    $response.ContentLength64 = $bytes.Length
    $response.Headers.Add('Cache-Control', 'no-cache')
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
    Write-Host ("  200  " + $rel)
  } catch {
    try { $response.StatusCode = 500; $response.Close() } catch { }
  }
}
$listener.Stop()

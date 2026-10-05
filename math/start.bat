@echo off
chcp 65001 >nul
setlocal EnableExtensions

title Buzhidao Math - 本地服务器
cd /d "%~dp0"

set "PORT=8000"
if not "%~1"=="" set "PORT=%~1"

echo.
echo   ============================================
echo     Buzhidao Math  ·  数学可视化实验室
echo   ============================================
echo.
echo   正在启动本地静态服务器（端口 %PORT%）...
echo   关闭本窗口即可停止服务器。
echo.

REM ---------- 1) 优先使用 Python ----------
where py >nul 2>nul
if %errorlevel%==0 (
  echo   [启动] py -m http.server %PORT%
  start "" "http://127.0.0.1:%PORT%/index.html"
  py -m http.server %PORT% --bind 127.0.0.1
  goto :done
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo   [启动] python -m http.server %PORT%
  start "" "http://127.0.0.1:%PORT%/index.html"
  python -m http.server %PORT% --bind 127.0.0.1
  goto :done
)

REM ---------- 2) 退回 PowerShell 内置服务器 ----------
where pwsh >nul 2>nul
if %errorlevel%==0 (
  echo   [启动] PowerShell (pwsh) 内置静态服务器
  start "" "http://127.0.0.1:%PORT%/index.html"
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port %PORT%
  goto :done
)

where powershell >nul 2>nul
if %errorlevel%==0 (
  echo   [启动] Windows PowerShell 内置静态服务器
  start "" "http://127.0.0.1:%PORT%/index.html"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port %PORT%
  goto :done
)

echo.
echo   [错误] 没有找到 Python 或 PowerShell，无法启动本地服务器。
echo   你也可以直接双击 index.html（部分浏览器会拦截 ES Module）。
echo.
pause
exit /b 1

:done
echo.
echo   服务器已停止。
pause
endlocal

@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "ROOT=%~dp0"

echo ============================================
echo   AI 全托管小店 · 一键启动
echo ============================================
echo [*] 当前目录: %~dp0

REM ===== 自动把常见 node / python 路径补进【本进程】PATH（无需系统配置）=====
set "PATH_INJECTED="
REM 兜底：常见 Node / Python 安装位置（如本机路径不同，请在此补充或自行加入系统 PATH）
for %%D in (
  "C:\Program Files\nodejs"
  "%LOCALAPPDATA%\Programs\Python\Launcher"
  "%LOCALAPPDATA%\Programs\Python"
  "C:\Python311\Scripts"
  "C:\Python312\Scripts"
  "C:\Python313\Scripts"
) do (
  if exist "%%~D" (
    set "PATH=%%~D;%PATH%"
    set "PATH_INJECTED=1"
  )
)
if defined PATH_INJECTED (
  echo [*] 已将 node/python 路径注入本进程 PATH（不影响系统设置）
) else (
  echo [警告] 未找到常见 Node/Python 目录，将依赖系统 PATH
)

REM ---------- 诊断信息（排错用）----------
where python >nul 2>&1
if errorlevel 1 echo [diag] python : MISSING
if not errorlevel 1 echo [diag] python : OK
where npm >nul 2>&1
if errorlevel 1 echo [diag] npm : MISSING
if not errorlevel 1 echo [diag] npm : OK
where node >nul 2>&1
if errorlevel 1 echo [diag] node : MISSING
if not errorlevel 1 echo [diag] node : OK

REM ---------- 后端环境 ----------
if not exist "%ROOT%backend\.venv" (
  echo [1/5] 首次创建 Python 虚拟环境并安装依赖（稍候）...
  python -m venv "%ROOT%backend\.venv"
  if errorlevel 1 (
    echo [错误] 无法创建虚拟环境：系统未找到 python。请确认 Python 已安装。
    pause
    goto :end
  )
  call "%ROOT%backend\.venv\Scripts\activate.bat"
  pip install -r "%ROOT%backend\requirements.txt"
) else (
  call "%ROOT%backend\.venv\Scripts\activate.bat"
)

if not exist "%ROOT%backend\.env" (
  echo [2/5] 生成 .env（含随机 SECRET_KEY）...
  copy /Y "%ROOT%backend\.env".example "%ROOT%backend\.env"
)
findstr /C:"SECRET_KEY=replace-with" "%ROOT%backend\.env" >nul
if %errorlevel%==0 (
  powershell -NoProfile -Command "$k=(-join((48..57)+(65..90)+(97..122)|Get-Random -Count 40|%{[char]$_}));$c=Get-Content "%ROOT%backend\.env" -Raw;$c=$c -replace 'SECRET_KEY=.*','SECRET_KEY='+$k;Set-Content "%ROOT%backend\.env" $c"
)

if not exist "%ROOT%backend\ai_shop.db" (
  echo [3/5] 初始化数据库与演示数据...
  pushd "%ROOT%backend"
  python -m app.core.seed
  popd
)

REM ---------- 前端环境 ----------
if not exist "%ROOT%frontend\node_modules" (
  echo [4/5] 首次安装前端依赖（稍候）...
  pushd "%ROOT%frontend"
  call npm install
  if errorlevel 1 (
    echo [错误] npm install 失败，请确认 Node.js 已安装。
    pause
    goto :end
  )
  popd
)

REM ---------- 启动服务 ----------
echo [5/5] 启动服务...
where curl.exe >nul 2>&1
set HAVE_CURL=0
if not errorlevel 1 set HAVE_CURL=1

set BACKEND_UP=0
netstat -ano 2>nul | findstr ":8000" >nul && set BACKEND_UP=1
if %BACKEND_UP%==1 (
  if %HAVE_CURL%==1 (
    curl.exe --noproxy * -s -o nul -m 3 http://127.0.0.1:8000/api/auth/me >nul 2>&1
    if errorlevel 1 (
      set BACKEND_UP=0
      echo [提示] :8000 被占用但后端无响应，清理残留进程后重启...
      for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
    )
  )
)
set FRONTEND_UP=0
netstat -ano 2>nul | findstr ":5173" >nul && set FRONTEND_UP=1
if %FRONTEND_UP%==1 (
  if %HAVE_CURL%==1 (
    curl.exe --noproxy * -s -o nul -m 3 http://127.0.0.1:5173/ >nul 2>&1
    if errorlevel 1 (
      set FRONTEND_UP=0
      echo [提示] :5173 被占用但前端无响应，清理残留进程后重启...
      for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
    )
  )
)

if %BACKEND_UP%==0 (
  if defined NO_LAUNCH (
    echo [mock] 将启动后端: uvicorn app.main:app --reload --port 8000
  ) else (
    start "AI小店-后端" cmd /k "cd /d %ROOT%backend && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
  )
) else (
  echo 后端已在运行（:8000），跳过。
)
if %FRONTEND_UP%==0 (
  where npm >nul 2>&1
  if errorlevel 1 (
    where node >nul 2>&1
    if errorlevel 1 (
      echo [错误] 未找到 npm 与 node，请确认 Node.js 已安装。
      pause
      goto :end
    ) else (
      if defined NO_LAUNCH (
        echo [mock] 将启动前端: node node_modules\vite\bin\vite.js
      ) else (
        start "AI小店-前端" cmd /k "cd /d %ROOT%frontend && node node_modules\vite\bin\vite.js"
      )
    )
    ) else (
      if defined NO_LAUNCH (
        echo [mock] 将启动前端: npm run dev
      ) else (
        start "AI小店-前端" cmd /k "cd /d %ROOT%frontend && npm run dev"
      )
    )
) else (
  echo 前端已在运行（:5173），跳过。
)

echo 稍候，浏览器将打开 http://localhost:5173 ...
if not defined NO_LAUNCH (
  timeout /t 10 >nul
  start http://localhost:5173
)
echo 完成。关闭弹出的"后端/前端"窗口即可停止服务。

:end
echo ------------------------------------------------------------
echo 本窗口将保持打开，便于查看日志。按任意键关闭本窗口。
echo 服务由上方弹出的 后端或前端 窗口承载，与本窗口无关
echo ------------------------------------------------------------
pause

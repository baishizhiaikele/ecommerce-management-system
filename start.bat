@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ============================================
echo   AI 全托管小店 · 一键启动
echo ============================================
echo [*] 当前目录: %~dp0

REM ===== 自动把 node / python 路径补进【本进程】PATH（无需系统配置）=====
set "PATH_INJECTED="
if exist "D:\computer" (
  set "PATH=D:\computer;%PATH%"
  set "PATH_INJECTED=1"
)
if exist "D:\computer\Python" (
  set "PATH=D:\computer\Python;%PATH%"
  set "PATH_INJECTED=1"
)
if exist "D:\computer\Python\Scripts" (
  set "PATH=D:\computer\Python\Scripts;%PATH%"
  set "PATH_INJECTED=1"
)
REM 兜底：常见 Node / Python 安装位置
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
  echo [警告] 未找到 D:\computer 或常见 Node/Python 目录，将依赖系统 PATH
)

REM ---------- 诊断信息（排错用）----------
where python >nul 2>&1 && echo [diag] python : OK || echo [diag] python : 未找到
where npm   >nul 2>&1 && echo [diag] npm    : OK || echo [diag] npm    : 未找到
where node  >nul 2>&1 && echo [diag] node   : OK || echo [diag] node   : 未找到

REM ---------- 后端环境 ----------
if not exist backend\.venv (
  echo [1/5] 首次创建 Python 虚拟环境并安装依赖（稍候）...
  python -m venv backend\.venv
  if errorlevel 1 (
    echo [错误] 无法创建虚拟环境：系统未找到 python。请确认 Python 已安装。
    pause
    goto :end
  )
  call backend\.venv\Scripts\activate.bat
  pip install -r backend\requirements.txt
) else (
  call backend\.venv\Scripts\activate.bat
)

if not exist backend\.env (
  echo [2/5] 生成 .env（含随机 SECRET_KEY）...
  copy /Y backend\.env.example backend\.env
)
findstr /C:"SECRET_KEY=replace-with" backend\.env >nul
if %errorlevel%==0 (
  powershell -NoProfile -Command "$k=(-join((48..57)+(65..90)+(97..122)|Get-Random -Count 40|%%{[char]$_}));$c=Get-Content backend\.env -Raw;$c=$c -replace 'SECRET_KEY=.*','SECRET_KEY='+$k;Set-Content backend\.env $c"
)

if not exist backend\ai_shop.db (
  echo [3/5] 初始化数据库与演示数据...
  cd backend
  python -m app.core.seed
  cd ..
)

REM ---------- 前端环境 ----------
if not exist frontend\node_modules (
  echo [4/5] 首次安装前端依赖（稍候）...
  cd frontend
  call npm install
  if errorlevel 1 (
    echo [错误] npm install 失败，请确认 Node.js 已安装。
    pause
    goto :end
  )
  cd ..
)

REM ---------- 启动服务 ----------
echo [5/5] 启动服务...
set BACKEND_UP=0
netstat -ano 2>nul | findstr ":8000" >nul && set BACKEND_UP=1
set FRONTEND_UP=0
netstat -ano 2>nul | findstr ":5173" >nul && set FRONTEND_UP=1

if %BACKEND_UP%==0 (
  if defined NO_LAUNCH (
    echo [mock] 将启动后端: uvicorn app.main:app --reload --port 8000
  ) else (
    start "AI小店-后端" cmd /k "cd /d %~dp0backend && call .venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"
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
        start "AI小店-前端" cmd /k "cd /d %~dp0frontend && node node_modules\vite\bin\vite.js"
      )
    )
  ) else (
    if defined NO_LAUNCH (
      echo [mock] 将启动前端: npm run dev
    ) else (
      start "AI小店-前端" cmd /k "cd /d %~dp0frontend && npm run dev"
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
echo 完成。关闭弹出的“后端/前端”窗口即可停止服务。

:end
echo ------------------------------------------------------------
echo 本窗口将保持打开，便于查看日志。按任意键关闭本窗口。
echo （服务由上面弹出的“后端/前端”窗口承载，与本窗口无关）
echo ------------------------------------------------------------
pause

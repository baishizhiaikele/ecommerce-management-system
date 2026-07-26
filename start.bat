@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   AI 全托管小店 · 一键启动
echo ============================================

REM ---------- 诊断信息（排错用，可忽略）----------
where python >nul 2>&1 && echo [diag] python : 已在 PATH 中 || echo [diag] python : 未在 PATH 中（将使用 venv 内置 python）
where npm   >nul 2>&1 && echo [diag] npm    : 已在 PATH 中 || echo [diag] npm    : 未在 PATH 中
where node  >nul 2>&1 && echo [diag] node   : 已在 PATH 中 || echo [diag] node   : 未在 PATH 中

REM ---------- 后端环境 ----------
if not exist backend\.venv (
  echo [1/5] 首次创建 Python 虚拟环境并安装依赖（稍候）...
  python -m venv backend\.venv
  if errorlevel 1 (
    echo [错误] 无法创建虚拟环境：系统未找到 python。请将 Python 加入 PATH 后重试。
    pause
    exit /b 1
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
    echo [错误] npm install 失败，请确认 Node.js/npm 已在 PATH 中。
    pause
    exit /b 1
  )
  cd ..
)

REM ---------- 启动服务 ----------
echo [5/5] 启动服务...
set BACKEND_UP=0
netstat -ano | findstr ":8000" >nul && set BACKEND_UP=1
set FRONTEND_UP=0
netstat -ano | findstr ":5173" >nul && set FRONTEND_UP=1

if %BACKEND_UP%==0 (
  start "AI小店-后端" cmd /k "cd /d %~dp0backend && call .venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"
) else (
  echo 后端已在运行（:8000），跳过。
)
if %FRONTEND_UP%==0 (
  where npm >nul 2>&1
  if errorlevel 1 (
    where node >nul 2>&1
    if errorlevel 1 (
      echo [错误] 未找到 npm 与 node，请安装 Node.js 并加入系统 PATH 后重试。
      pause
    ) else (
      start "AI小店-前端" cmd /k "cd /d %~dp0frontend && node node_modules\vite\bin\vite.js"
    )
  ) else (
    start "AI小店-前端" cmd /k "cd /d %~dp0frontend && npm run dev"
  )
) else (
  echo 前端已在运行（:5173），跳过。
)

echo 稍候，浏览器将打开 http://localhost:5173 ...
timeout /t 10 >nul
start http://localhost:5173
echo 完成。关闭弹出的后端/前端窗口即可停止服务。

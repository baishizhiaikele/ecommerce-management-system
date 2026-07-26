@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   AI 全托管小店 · 一键启动
echo ============================================

REM ---------- 后端环境 ----------
if not exist backend\.venv (
  echo [1/5] 首次创建 Python 虚拟环境并安装依赖（稍候）...
  python -m venv backend\.venv
)
call backend\.venv\Scripts\activate.bat

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
  start "AI小店-前端" cmd /k "cd /d %~dp0frontend && npm run dev"
) else (
  echo 前端已在运行（:5173），跳过。
)

echo 稍候，浏览器将打开 http://localhost:5173 ...
timeout /t 10 >nul
start http://localhost:5173
echo 完成。关闭弹出的后端/前端窗口即可停止服务。

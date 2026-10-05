@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 LTS first.
  pause
  exit /b 1
)
if not exist "node_modules\hexo\bin\hexo" (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Open http://127.0.0.1:4000/ after the server starts.
echo Press Ctrl+C to stop.
call npm.cmd run dev
if errorlevel 1 pause

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
call npm.cmd run build
if errorlevel 1 (
  pause
  exit /b 1
)
call npm.cmd run check
if errorlevel 1 (
  pause
  exit /b 1
)
echo Build complete. Website files are in public.
pause

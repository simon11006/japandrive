@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
echo Japan Drive: http://127.0.0.1:8000  (close this window to stop the game server)
start "" http://127.0.0.1:8000
node server.mjs
pause

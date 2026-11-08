@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
rem Classroom mode: other PCs on the same network can open the address shown below.
set HOST=0.0.0.0
node server.mjs --open
pause

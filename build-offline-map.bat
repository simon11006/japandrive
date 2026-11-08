@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
rem Downloads the whole island road map once (about 30-60 minutes). Re-run to resume.
node scripts\build-offline-pack.mjs
pause

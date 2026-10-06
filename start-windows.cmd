@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org/
  pause
  exit /b 1
)
if not exist .env (
  copy /y .env.ark.example .env >nul
  echo Fill ARK_API_KEY in .env, save it, then close Notepad to continue.
  start /wait notepad.exe .env
)
echo Open http://localhost:3000 after the server starts. Keep this window open.
call npm start
pause

@echo off
setlocal
cd /d "%~dp0"

echo Starting Intellify HRMS...
echo.

REM ---- Backend ----
if not exist "backend\.venv\Scripts\uvicorn.exe" (
  echo Backend venv not found. Creating and installing dependencies...
  pushd backend
  python -m venv .venv
  call .venv\Scripts\activate.bat
  python -m pip install --upgrade pip
  pip install -r requirements.txt
  popd
)

REM ---- Frontend ----
if not exist "frontend\node_modules\" (
  echo Frontend dependencies not found. Running npm install...
  pushd frontend
  call npm install --legacy-peer-deps
  popd
)

echo Launching backend on http://127.0.0.1:8000
start "HRMS Backend" cmd /k "cd /d "%~dp0backend" && call .venv\Scripts\activate.bat && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo Launching frontend on http://localhost:3000
start "HRMS Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Both servers are starting in separate windows.
echo Backend:  http://127.0.0.1:8000/docs
echo Frontend: http://localhost:3000
echo.
echo Close those windows to stop the servers.
pause
endlocal

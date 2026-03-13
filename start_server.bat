@echo off
REM Stock Study Tool - Development Environment Startup Script
REM Uses Anaconda marketing_system environment

echo ============================================
echo  Stock AI Filter PRO - Start Dev Environment
echo ============================================
echo.

REM ── Step 0: Detect and auto-start Docker Desktop ──────────────────────
echo [0/3] Checking Docker Desktop status...

REM Check if docker command is available
docker info >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Docker is ready, skipping startup steps.
    goto :docker_ready
)

REM Docker daemon not responding, check if Docker Desktop process exists
tasklist /FI "IMAGENAME eq Docker Desktop.exe" 2>nul | find /I "Docker Desktop.exe" >nul
if %errorlevel% neq 0 (
    echo [INFO] Docker Desktop is not running, starting...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
) else (
    echo [INFO] Docker Desktop is already running, waiting for daemon to be ready...
)

REM Poll waiting for Docker daemon to be ready (Max wait 90 seconds, check every 3 secs)
set /a WAIT_COUNT=0
set /a MAX_WAIT=30

:wait_docker
if %WAIT_COUNT% geq %MAX_WAIT% (
    echo.
    echo [ERROR] Timeout waiting for Docker Desktop (Waited 90 seconds)
    echo [INFO] Please open Docker Desktop manually and retry this script
    pause
    exit /b 1
)

timeout /t 3 /nobreak >nul
docker info >nul 2>&1
if %errorlevel% neq 0 (
    set /a WAIT_COUNT+=1
    set /a ELAPSED=WAIT_COUNT*3
    echo [WAIT] Docker daemon is not ready yet... (%ELAPSED% seconds)
    goto :wait_docker
)

echo [OK] Docker Desktop is ready!

:docker_ready
echo.

REM ── Step 1: Start MySQL (Docker) ────────────────────────────────
echo [1/3] Starting MySQL container...
docker compose up -d mysql
if %errorlevel% neq 0 (
    echo [ERROR] Cannot start MySQL, please ensure Docker Desktop is running
    pause
    exit /b 1
)

REM Wait for MySQL to be healthy
echo [2/3] Waiting for MySQL to be ready...
timeout /t 10 /nobreak >nul

REM Start FastAPI (Anaconda environment - Use full path initialization)
echo [3/3] Starting FastAPI development server...

REM Initialize Anaconda (use full path, do not rely on PATH)
SET CONDA_ROOT=%USERPROFILE%\anaconda3
CALL "%CONDA_ROOT%\Scripts\activate.bat" "%CONDA_ROOT%\envs\marketing_system"
if %errorlevel% neq 0 (
    echo [ERROR] Cannot activate conda environment 'marketing_system', check if it exists
    echo [INFO] You can run manually: conda activate marketing_system
    pause
    exit /b 1
)

cd /d %~dp0
uvicorn App.app:app --host 0.0.0.0 --port 8000 --reload --reload-dir App

pause

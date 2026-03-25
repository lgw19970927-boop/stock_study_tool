@echo off
setlocal enabledelayedexpansion

REM Stock Study Tool - Development Environment Startup Script

title Stock AI Filter PRO - Docker Startup

echo.
echo ============================================
echo  Stock AI Filter PRO - Docker Startup
echo ============================================
echo.

REM ── Check Docker status ─────────────────────────────
echo Checking Docker Desktop...
docker version >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Docker Desktop is not available
    echo Please start Docker Desktop and try again
    echo.
    pause
    exit /b 1
)
echo [OK] Docker is running
echo.

echo.
echo ============================================
echo Preparing Environment...
echo ============================================
echo.

REM Change to project directory
cd /d "%~dp0"

if !errorlevel! neq 0 (
    echo [ERROR] Cannot change to project directory
    pause
    exit /b 1
)

echo Stopping and removing existing containers (docker-compose down)...
docker-compose down
echo.

echo ============================================
echo Building CSS (Tailwind)...
echo ============================================
echo (Using temporary Node.js Docker container - no local Node.js required)
echo.
docker run --rm -v "%cd%:/app" -w /app node:18-alpine sh -c "npm install && npm run build:css"
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] CSS build failed
    echo Please check the error messages above
    echo.
    pause
    exit /b 1
)
echo [OK] CSS built successfully (App/Static/css/tailwind.output.css)
echo.

echo Starting docker-compose...
echo (Building images if needed and starting in background)
echo.
echo This may take 1-2 minutes on first run...
echo.

REM 這裡整合了你想要的 up -d，並保留 --build 以確保抓到最新程式碼
docker-compose up --build -d

if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Failed to start docker-compose
    echo Please check the error messages above
    echo.
    pause
    exit /b 1
)

echo [OK] docker-compose command executed
echo.
echo Waiting 45 seconds for containers to initialize...
echo   - Building/verifying images (if needed)
echo   - MySQL database
echo   - FastAPI server
echo   - Nginx proxy
echo.
timeout /t 45 /nobreak >nul

echo.
echo ============================================
echo Container Status:
echo ============================================
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo.
echo Expected containers (all should show "Up"):
echo   ✓ stock-mysql     - Database server
echo   ✓ stock-fastapi  - Application server
echo   ✓ stock-nginx    - Web server (port 80)
echo   ✓ stock-data-sync - Background scheduler
echo.
echo ============================================
echo SUCCESS!
echo ============================================
echo.
echo Open your browser and visit:
echo   http://localhost/
echo.
echo If page doesn't load immediately:
echo   - Wait 10-15 more seconds (FastAPI initializing)
echo   - Check logs: docker-compose logs -f fastapi
echo.
echo Useful commands:
echo   docker-compose logs -f              All logs
echo   docker-compose logs -f fastapi      FastAPI only
echo   docker-compose logs -f nginx        Nginx only
echo   docker-compose down                 Stop all containers
echo   docker-compose up --build -d        Restart with rebuild
echo.
pause
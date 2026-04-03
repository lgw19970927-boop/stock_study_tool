@echo off
setlocal enabledelayedexpansion

REM Data Sync Observer Launcher
REM Usage examples:
REM   observe_data_sync.bat
REM   observe_data_sync.bat --limit 20
REM   observe_data_sync.bat --watch --interval 2

cd /d "%~dp0"

set OBS_ARGS=%*
if "%OBS_ARGS%"=="" set OBS_ARGS=--watch --interval 2

set "COMPOSE_CMD="
docker compose version >nul 2>&1
if !errorlevel! equ 0 (
    set "COMPOSE_CMD=docker compose"
) else (
    docker-compose version >nul 2>&1
    if !errorlevel! equ 0 (
        set "COMPOSE_CMD=docker-compose"
    )
)

if not defined COMPOSE_CMD (
    echo [ERROR] Cannot find Docker Compose command.
    echo Please install Docker Desktop and ensure docker compose is available.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Data Sync Observer
echo ============================================
echo Arguments: %OBS_ARGS%
echo.

for /f %%i in ('!COMPOSE_CMD! ps -q data_sync 2^>nul') do set DATA_SYNC_CID=%%i

if not defined DATA_SYNC_CID (
    echo [INFO] data_sync container is not running.
    echo [INFO] Starting temporary observer container...
    call !COMPOSE_CMD! run --rm --no-deps -e PYTHONUNBUFFERED=1 data_sync python3 -u /workspace/tools/data_sync_observer.py %OBS_ARGS%
    set "EXIT_CODE=!errorlevel!"
    if !EXIT_CODE! neq 0 (
        echo.
        echo [ERROR] observer exited with code !EXIT_CODE!.
        pause
    )
    exit /b !EXIT_CODE!
)

echo [OK] Using running data_sync container.
set "OBS_ARGS_FINAL=%OBS_ARGS%"
set "EXEC_TTY_FLAG=-T"
echo %OBS_ARGS% | findstr /I /C:"--watch" >nul
if !errorlevel! equ 0 (
    echo %OBS_ARGS% | findstr /I /C:"--no-ansi" >nul
    if !errorlevel! neq 0 (
        set "OBS_ARGS_FINAL=%OBS_ARGS% --no-ansi"
    )
)

if defined EXEC_TTY_FLAG (
    call !COMPOSE_CMD! exec !EXEC_TTY_FLAG! -e PYTHONUNBUFFERED=1 data_sync python3 -u /workspace/tools/data_sync_observer.py !OBS_ARGS_FINAL!
) else (
    call !COMPOSE_CMD! exec -e PYTHONUNBUFFERED=1 data_sync python3 -u /workspace/tools/data_sync_observer.py !OBS_ARGS_FINAL!
)
set "EXIT_CODE=!errorlevel!"
if !EXIT_CODE! neq 0 (
    echo.
    echo [ERROR] observer exited with code !EXIT_CODE!.
    pause
)
exit /b !EXIT_CODE!

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

echo.
echo ============================================
echo  Data Sync Observer
echo ============================================
echo Arguments: %OBS_ARGS%
echo.

for /f %%i in ('docker-compose ps -q data_sync 2^>nul') do set DATA_SYNC_CID=%%i

if not defined DATA_SYNC_CID (
    echo [INFO] data_sync container is not running.
    echo [INFO] Starting temporary observer container...
    docker-compose run --rm data_sync python3 /workspace/tools/data_sync_observer.py %OBS_ARGS%
    goto :eof
)

echo [OK] Using running data_sync container.
docker-compose exec data_sync python3 /workspace/tools/data_sync_observer.py %OBS_ARGS%

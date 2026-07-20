@echo off
REM Docker-only production launcher (see launch-hidden.vbs / Startup rate-backend.vbs).
REM Waits for the Docker engine to come up at logon, then ensures the backend
REM container is (re)built and running. `restart: unless-stopped` keeps it alive
REM afterwards, so this only needs to run once per boot.
cd /d "%~dp0"

REM Wait up to ~4 minutes for the Docker engine (Docker Desktop starts at logon
REM but the Linux engine takes a while to be ready).
set /a tries=0
:waitdocker
docker info >nul 2>&1
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% GEQ 40 goto ready
timeout /t 6 /nobreak >nul
goto waitdocker

:ready
docker compose up -d --build

@echo off
REM Starts the rate backend HTTP server (GET /rates) on port 8787.
cd /d "%~dp0"
node server.mjs
pause

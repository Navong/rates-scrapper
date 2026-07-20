@echo off
REM Compatibility wrapper. The production host now runs the Next.js app, not the
REM legacy node server. Delegate to the real launcher, which frees port 8787,
REM builds, and restarts the Next server.
cd /d "%~dp0"
call "%~dp0start-host-next.bat"

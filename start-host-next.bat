@echo off
REM Runs the Next.js app on the host (no Docker), so the cloudflared Windows
REM service can reach it on 127.0.0.1:8787. Frees the port first (in case the
REM legacy server or a stale instance still holds it), builds once, then loops
REM with auto-restart. This is the production launcher (see launch-hidden.vbs).
cd /d "%~dp0"
REM Set your real RATES_TOKEN here (or export it in the environment before launch).
set RATES_TOKEN=REPLACE_WITH_YOUR_TOKEN
set ACCESS_PASSWORD=gme
REM Admin defaults match docker-compose.yml (user "admin", password "admin-test-2026").
REM For production, set ADMIN_USER / ADMIN_PASSWORD_HASH / ADMIN_TOKEN in the environment
REM before launching. Generate new values with:
REM   node scripts/hash-password.mjs "your-strong-password"
if "%ADMIN_USER%"=="" set ADMIN_USER=admin
if "%ADMIN_PASSWORD_HASH%"=="" set ADMIN_PASSWORD_HASH=362187a34c27f358b24f720ccc501603:20d82f1e9f343b18fd59e45709faf67474747e561b0aa7f106afc3170a862787
if "%ADMIN_TOKEN%"=="" set ADMIN_TOKEN=09ee42f06e25717f9d1f8aaf89490d5ef8dd6fd41250bf5f
REM identical request served from cache for 4 minutes
set CACHE_TTL=240
set GME_TTL=240
set STATE_DIR=%~dp0data
set TZ=Asia/Seoul
set PORT=8787

REM Free port 8787 if the legacy server (or a previous instance) still holds it,
REM so the two never collide on startup.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8787 " ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1

REM Production build (App Router). Safe to re-run; only rebuilds what changed.
call npm run build

:loop
call npm run start
timeout /t 5 /nobreak >nul
goto loop

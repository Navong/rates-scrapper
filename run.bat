@echo off
REM Double-click to scrape rates and update rates.xlsx.
cd /d "%~dp0"
node scrape.mjs
echo.
pause

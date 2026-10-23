@echo off
title Stop EduCore
echo Stopping EduCore service...
net stop EduCore 2>nul
if errorlevel 1 (
    echo Service not running or not installed as service.
    echo Killing any Node.js processes on port 3000...
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000"') do (
        taskkill /F /PID %%a 2>nul
    )
)
echo Done.
pause

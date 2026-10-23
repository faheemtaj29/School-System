@echo off
title EduCore School System
color 0A
echo.
echo  ==========================================
echo   EduCore School Management System
echo  ==========================================
echo.
echo  Starting server on all network interfaces...
echo  Local:  http://localhost:3000
echo.

cd /d "%~dp0.."
set NODE_ENV=production

:: Check if .next build exists
if not exist ".next" (
    echo  App is not built. Building now...
    echo  This may take a few minutes on first run.
    call npm run build
    if errorlevel 1 (
        echo  Build failed! Check errors above.
        pause
        exit /b 1
    )
)

:: Get this computer's IP
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4"') do (
    set IP=%%i
    goto :found_ip
)
:found_ip
if defined IP (
    set IP=%IP: =%
    echo  LAN:    http://%IP%:3000
)

echo.
echo  Press Ctrl+C to stop the server.
echo.

node node_modules\.bin\next start -H 0.0.0.0 -p 3000

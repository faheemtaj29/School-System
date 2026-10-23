@echo off
title Build EduCore Installer
color 0E
echo.
echo  ================================================
echo   EduCore — Build and Package Installer
echo  ================================================
echo.
echo  This will:
echo    1. Build the app  (npm run build)
echo    2. Stamp version into the .iss file
echo    3. Compile EduCore-Setup.exe with Inno Setup
echo.
echo  Make sure Inno Setup 6 is installed from:
echo  https://jrsoftware.org/isdl.php
echo.
pause

PowerShell -ExecutionPolicy Bypass -File "%~dp0build-installer.ps1"
pause

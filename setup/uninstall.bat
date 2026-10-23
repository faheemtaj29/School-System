@echo off
title Uninstall EduCore
echo.
echo  This will stop and remove the EduCore Windows service.
echo  Your data in MongoDB will NOT be deleted.
echo.
set /p confirm=Type YES to continue:
if /i not "%confirm%"=="YES" (
    echo Cancelled.
    pause
    exit /b
)

echo Stopping EduCore service...
net stop EduCore 2>nul
C:\nssm\nssm.exe remove EduCore confirm 2>nul

echo Stopping EduCoreDB service...
net stop EduCoreDB 2>nul
C:\nssm\nssm.exe remove EduCoreDB confirm 2>nul

echo Removing firewall rule...
netsh advfirewall firewall delete rule name="EduCore School System" 2>nul

echo Removing desktop shortcut...
del "%PUBLIC%\Desktop\EduCore.lnk" 2>nul

echo.
echo Done. EduCore service removed. Your data is intact.
pause

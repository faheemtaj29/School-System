@echo off
:: Create .env.local if it does not already exist
set ENVFILE=%~dp0..\.env.local
if exist "%ENVFILE%" goto :done

:: Generate a random secret using PowerShell
for /f %%i in ('powershell -command "[System.Guid]::NewGuid().ToString('N') + [System.Guid]::NewGuid().ToString('N')"') do set JWT_SECRET=%%i
for /f %%i in ('powershell -command "[System.Guid]::NewGuid().ToString('N')"') do set NEXTAUTH_SECRET=%%i

(
echo MONGODB_URI=mongodb://127.0.0.1:27017/educore
echo JWT_SECRET=%JWT_SECRET%
echo NEXTAUTH_SECRET=%NEXTAUTH_SECRET%
echo PORT=3000
echo NODE_ENV=production
) > "%ENVFILE%"

:done

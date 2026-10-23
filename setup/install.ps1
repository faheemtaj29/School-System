#Requires -RunAsAdministrator
<#
.SYNOPSIS
    EduCore School System — One-click Windows Installer
.DESCRIPTION
    Installs Node.js LTS, MongoDB Community, builds EduCore, creates a
    Windows service (via NSSM) that starts automatically on boot, and
    opens a firewall port so LAN users can connect.

    Run as Administrator:
        PowerShell -ExecutionPolicy Bypass -File install.ps1
#>

param(
    [string]$InstallDir   = "C:\EduCore",
    [int]   $Port         = 3000,
    [string]$MongoDbPath  = "C:\data\db",
    [string]$ServiceName  = "EduCore",
    [string]$MongoService = "EduCoreDB"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$AppDir    = Split-Path -Parent $ScriptDir      # parent of setup\

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  EduCore School System Installer" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Helper: check if a command exists ────────────────────────────────────────
function Test-Command([string]$name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# ── 1. Node.js ────────────────────────────────────────────────────────────────
Write-Host "[1/7] Checking Node.js..." -ForegroundColor Yellow
if (Test-Command "node") {
    $ver = node --version
    Write-Host "      Node.js already installed: $ver" -ForegroundColor Green
} else {
    Write-Host "      Installing Node.js LTS via winget..." -ForegroundColor Yellow
    try {
        winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    } catch {
        Write-Host "      winget failed. Please install Node.js manually from https://nodejs.org" -ForegroundColor Red
        Write-Host "      Then re-run this script." -ForegroundColor Red
        exit 1
    }
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    if (-not (Test-Command "node")) {
        Write-Host "      Node.js not found after install — please restart PowerShell and try again." -ForegroundColor Red
        exit 1
    }
    Write-Host "      Node.js installed: $(node --version)" -ForegroundColor Green
}

# ── 2. MongoDB ────────────────────────────────────────────────────────────────
Write-Host "[2/7] Checking MongoDB..." -ForegroundColor Yellow
$mongodPath = "$env:ProgramFiles\MongoDB\Server\7.0\bin\mongod.exe"
if (-not (Test-Path $mongodPath)) {
    $mongodPath = "$env:ProgramFiles\MongoDB\Server\8.0\bin\mongod.exe"
}
if (Test-Path $mongodPath) {
    Write-Host "      MongoDB already installed." -ForegroundColor Green
} else {
    Write-Host "      Installing MongoDB Community via winget..." -ForegroundColor Yellow
    try {
        winget install --id MongoDB.Server --silent --accept-package-agreements --accept-source-agreements
    } catch {
        Write-Host "      winget failed. Please install MongoDB from https://www.mongodb.com/try/download/community" -ForegroundColor Red
        exit 1
    }
    Write-Host "      MongoDB installed." -ForegroundColor Green
}

# ── 3. Data directory ────────────────────────────────────────────────────────
Write-Host "[3/7] Creating MongoDB data directory..." -ForegroundColor Yellow
if (-not (Test-Path $MongoDbPath)) {
    New-Item -ItemType Directory -Force -Path $MongoDbPath | Out-Null
}
Write-Host "      Data dir: $MongoDbPath" -ForegroundColor Green

# ── 4. NSSM (service manager) ────────────────────────────────────────────────
Write-Host "[4/7] Checking NSSM service manager..." -ForegroundColor Yellow
$nssmPath = "C:\nssm\nssm.exe"
if (-not (Test-Path $nssmPath)) {
    Write-Host "      Downloading NSSM..." -ForegroundColor Yellow
    $nssmZip = "$env:TEMP\nssm.zip"
    try {
        Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $nssmZip -UseBasicParsing
        Expand-Archive -Path $nssmZip -DestinationPath "$env:TEMP\nssm" -Force
        New-Item -ItemType Directory -Force -Path "C:\nssm" | Out-Null
        $nssmBin = Get-ChildItem "$env:TEMP\nssm" -Recurse -Filter "nssm.exe" | Where-Object { $_.DirectoryName -match "win64" } | Select-Object -First 1
        if (-not $nssmBin) {
            $nssmBin = Get-ChildItem "$env:TEMP\nssm" -Recurse -Filter "nssm.exe" | Select-Object -First 1
        }
        Copy-Item $nssmBin.FullName -Destination $nssmPath
    } catch {
        Write-Host "      Could not download NSSM. Creating .bat startup instead." -ForegroundColor Yellow
        $nssmPath = $null
    }
}
if ($nssmPath -and (Test-Path $nssmPath)) {
    Write-Host "      NSSM ready at $nssmPath" -ForegroundColor Green
}

# ── 5. Install app dependencies & build ──────────────────────────────────────
Write-Host "[5/7] Building EduCore app..." -ForegroundColor Yellow
Set-Location $AppDir
if (-not (Test-Path "node_modules")) {
    Write-Host "      Running npm install (first time — may take a few minutes)..." -ForegroundColor Yellow
    npm install --legacy-peer-deps
}
Write-Host "      Running npm run build..." -ForegroundColor Yellow
npm run build
Write-Host "      Build complete." -ForegroundColor Green

# ── 6. Create .env.local if not exists ───────────────────────────────────────
Write-Host "[6/7] Configuring environment..." -ForegroundColor Yellow
$envFile = Join-Path $AppDir ".env.local"
if (-not (Test-Path $envFile)) {
    @"
MONGODB_URI=mongodb://127.0.0.1:27017/educore
JWT_SECRET=$(New-Guid)-$(New-Guid)
NEXTAUTH_SECRET=$(New-Guid)
PORT=$Port
NODE_ENV=production
"@ | Set-Content -Path $envFile -Encoding utf8
    Write-Host "      Created .env.local with local MongoDB connection." -ForegroundColor Green
} else {
    Write-Host "      .env.local already exists — keeping existing configuration." -ForegroundColor Green
}

# ── 7. Create Windows services ───────────────────────────────────────────────
Write-Host "[7/7] Creating Windows services..." -ForegroundColor Yellow

$nodePath = (Get-Command node).Source

if ($nssmPath -and (Test-Path $nssmPath)) {
    # MongoDB service
    if (-not (Get-Service $MongoService -ErrorAction SilentlyContinue)) {
        $mongodExe = Get-ChildItem "$env:ProgramFiles\MongoDB" -Recurse -Filter "mongod.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($mongodExe) {
            & $nssmPath install $MongoService $mongodExe.FullName "--dbpath $MongoDbPath --port 27017" | Out-Null
            & $nssmPath set $MongoService DisplayName "EduCore Database (MongoDB)" | Out-Null
            & $nssmPath set $MongoService Start SERVICE_AUTO_START | Out-Null
            Start-Service $MongoService -ErrorAction SilentlyContinue
            Write-Host "      MongoDB service '$MongoService' created and started." -ForegroundColor Green
        }
    } else {
        Write-Host "      MongoDB service already exists." -ForegroundColor Green
    }

    # EduCore app service
    if (Get-Service $ServiceName -ErrorAction SilentlyContinue) {
        & $nssmPath stop $ServiceName | Out-Null
        & $nssmPath remove $ServiceName confirm | Out-Null
    }
    & $nssmPath install $ServiceName $nodePath "$AppDir\node_modules\.bin\next start -H 0.0.0.0 -p $Port" | Out-Null
    & $nssmPath set $ServiceName AppDirectory $AppDir | Out-Null
    & $nssmPath set $ServiceName DisplayName "EduCore School System" | Out-Null
    & $nssmPath set $ServiceName Description "EduCore School Management System — web server" | Out-Null
    & $nssmPath set $ServiceName Start SERVICE_AUTO_START | Out-Null
    & $nssmPath set $ServiceName AppStdout "$AppDir\logs\service.log" | Out-Null
    & $nssmPath set $ServiceName AppStderr "$AppDir\logs\service-err.log" | Out-Null
    & $nssmPath set $ServiceName AppEnvironmentExtra "NODE_ENV=production" | Out-Null
    New-Item -ItemType Directory -Force "$AppDir\logs" | Out-Null
    Start-Service $ServiceName
    Write-Host "      EduCore service created and started." -ForegroundColor Green
} else {
    # Fallback: create a startup batch file
    $startBat = "$AppDir\start-educore.bat"
    @"
@echo off
title EduCore School System
cd /d "$AppDir"
set NODE_ENV=production
node node_modules\.bin\next start -H 0.0.0.0 -p $Port
"@ | Set-Content -Path $startBat -Encoding ascii
    Write-Host "      Created $startBat — run this to start EduCore." -ForegroundColor Yellow
}

# ── Firewall rule ─────────────────────────────────────────────────────────────
try {
    $existingRule = Get-NetFirewallRule -DisplayName "EduCore School System" -ErrorAction SilentlyContinue
    if (-not $existingRule) {
        New-NetFirewallRule -DisplayName "EduCore School System" `
            -Direction Inbound -Protocol TCP -LocalPort $Port `
            -Action Allow -Profile Any | Out-Null
        Write-Host "      Firewall rule added for port $Port." -ForegroundColor Green
    }
} catch {
    Write-Host "      Could not add firewall rule — add port $Port manually if LAN access fails." -ForegroundColor Yellow
}

# ── Desktop shortcut ──────────────────────────────────────────────────────────
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut("$env:PUBLIC\Desktop\EduCore.lnk")
$shortcut.TargetPath = "http://localhost:$Port"
$shortcut.Description = "EduCore School Management System"
$shortcut.Save()
Write-Host "      Desktop shortcut created." -ForegroundColor Green

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  EduCore installed successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Local URL  : http://localhost:$Port" -ForegroundColor Cyan
Write-Host "  LAN URL    : http://<your-ip>:$Port" -ForegroundColor Cyan
Write-Host "  Service    : $ServiceName (starts on boot)" -ForegroundColor Cyan
Write-Host "  Data dir   : $MongoDbPath" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Default admin login: admin / admin123" -ForegroundColor Yellow
Write-Host "  Change the password after first login!" -ForegroundColor Yellow
Write-Host ""

# Open browser
Start-Process "http://localhost:$Port"

#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Build EduCore and compile a fresh EduCore-Setup.exe installer.
.DESCRIPTION
    1. Runs  npm run build   so all latest code changes go into .next/
    2. Stamps the version + build date into EduCore-Setup.iss
    3. Compiles the .iss with Inno Setup Compiler (ISCC.exe)
    Output: setup\Output\EduCore-Setup.exe

    Run:
        PowerShell -ExecutionPolicy Bypass -File setup\build-installer.ps1
#>

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$AppDir    = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  EduCore — Build & Package Installer" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Read version from package.json ─────────────────────────────────────────
$pkgJson = Get-Content "$AppDir\package.json" | ConvertFrom-Json
$version = $pkgJson.version
if (-not $version) { $version = "1.0.0" }
$buildDate = Get-Date -Format "yyyy-MM-dd HH:mm"
Write-Host "[1/4] Version: $version  (built $buildDate)" -ForegroundColor Yellow

# ── 2. Run npm run build ───────────────────────────────────────────────────────
Write-Host "[2/4] Building Next.js app (npm run build)..." -ForegroundColor Yellow
Set-Location $AppDir
$buildResult = & npm run build 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  BUILD FAILED — fix errors above before packaging." -ForegroundColor Red
    $buildResult | Select-Object -Last 30 | ForEach-Object { Write-Host "  $_" }
    exit 1
}
Write-Host "  Build successful." -ForegroundColor Green

# ── 3. Stamp version into the .iss file ───────────────────────────────────────
Write-Host "[3/4] Updating installer version to $version..." -ForegroundColor Yellow
$issPath = "$ScriptDir\EduCore-Setup.iss"
$issContent = Get-Content $issPath -Raw

# Replace the #define AppVersion line
$issContent = $issContent -replace '#define AppVersion\s+"[^"]*"', "#define AppVersion `"$version`""

# Replace/add a BuildDate define
if ($issContent -match '#define BuildDate') {
    $issContent = $issContent -replace '#define BuildDate\s+"[^"]*"', "#define BuildDate `"$buildDate`""
} else {
    $issContent = $issContent -replace '(#define AppVersion\s+"[^"]*")', "`$1`r`n#define BuildDate `"$buildDate`""
}

Set-Content -Path $issPath -Value $issContent -Encoding utf8
Write-Host "  Version stamped." -ForegroundColor Green

# ── 4. Find Inno Setup Compiler (ISCC.exe) and compile ───────────────────────
Write-Host "[4/4] Compiling installer with Inno Setup..." -ForegroundColor Yellow

$isccPaths = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 5\ISCC.exe",
    "C:\Program Files\Inno Setup 5\ISCC.exe"
)

$iscc = $isccPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
    Write-Host ""
    Write-Host "  Inno Setup not found. Download from https://jrsoftware.org/isdl.php" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Once installed, run this script again — OR compile manually:" -ForegroundColor Yellow
    Write-Host "  Open '$issPath' in Inno Setup Compiler → Build → Compile" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  (The Next.js app was already built in step 2 — that part is done.)" -ForegroundColor Green
    exit 0
}

Write-Host "  Using: $iscc" -ForegroundColor Gray
$outputDir = "$ScriptDir\Output"
New-Item -ItemType Directory -Force $outputDir | Out-Null

& $iscc /O"$outputDir" "$issPath"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Inno Setup compilation failed." -ForegroundColor Red
    exit 1
}

# ── Done ──────────────────────────────────────────────────────────────────────
$exePath = "$outputDir\EduCore-Setup.exe"
if (Test-Path $exePath) {
    $size = [math]::Round((Get-Item $exePath).Length / 1MB, 1)
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  Installer ready!" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  File    : $exePath" -ForegroundColor Cyan
    Write-Host "  Size    : ${size} MB" -ForegroundColor Cyan
    Write-Host "  Version : $version" -ForegroundColor Cyan
    Write-Host "  Built   : $buildDate" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Share this .exe with users — it installs everything." -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "  Could not find output .exe — check Inno Setup output above." -ForegroundColor Red
    exit 1
}

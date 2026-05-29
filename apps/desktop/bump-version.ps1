# 66Claw 版本号管理
# 用法:
#   powershell -ExecutionPolicy Bypass -File bump-version.ps1 1.0.2
#   powershell -ExecutionPolicy Bypass -File bump-version.ps1 patch   # 1.0.1 → 1.0.2
#   powershell -ExecutionPolicy Bypass -File bump-version.ps1 minor   # 1.0.1 → 1.1.0
#   powershell -ExecutionPolicy Bypass -File bump-version.ps1 major   # 1.0.1 → 2.0.0
#
# 同步更新: version.json → tauri.conf.json → Cargo.toml → desktop/package.json

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$ROOT = "D:\newopenclaw"

$versionJsonPath = Join-Path $ROOT "apps\desktop\version.json"
$tauriConfPath = Join-Path $ROOT "apps\desktop\src-tauri\tauri.conf.json"
$cargoTomlPath = Join-Path $ROOT "apps\desktop\src-tauri\Cargo.toml"

# 读取当前版本
$current = (Get-Content $versionJsonPath -Raw | ConvertFrom-Json).version
$parts = $current.Split(".")
if ($parts.Length -ne 3) {
    Write-Host "ERROR: Current version '$current' is not semver" -ForegroundColor Red
    exit 1
}

# 计算新版本号
switch ($Version) {
    "patch" { $newVersion = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)" }
    "minor" { $newVersion = "$($parts[0]).$([int]$parts[1] + 1).0" }
    "major" { $newVersion = "$([int]$parts[0] + 1).0.0" }
    default {
        if ($Version -notmatch '^\d+\.\d+\.\d+$') {
            Write-Host "ERROR: '$Version' is not a valid semver or bump type (patch/minor/major)" -ForegroundColor Red
            exit 1
        }
        $newVersion = $Version
    }
}

Write-Host "Version: $current -> $newVersion" -ForegroundColor Cyan

# 1. version.json
$vj = Get-Content $versionJsonPath -Raw | ConvertFrom-Json
$vj.version = $newVersion
$vj | ConvertTo-Json | Set-Content $versionJsonPath -Encoding UTF8
Write-Host "  Updated: version.json" -ForegroundColor Green

# 2. tauri.conf.json
$tc = Get-Content $tauriConfPath -Raw | ConvertFrom-Json
$tc.version = $newVersion
$tc | ConvertTo-Json -Depth 10 | Set-Content $tauriConfPath -Encoding UTF8
Write-Host "  Updated: tauri.conf.json" -ForegroundColor Green

# 3. Cargo.toml
$cargo = Get-Content $cargoTomlPath -Raw
$cargo = $cargo -replace "version = `"$current`"", "version = `"$newVersion`""
[System.IO.File]::WriteAllText($cargoTomlPath, $cargo)
Write-Host "  Updated: Cargo.toml" -ForegroundColor Green

# 4. desktop/package.json
$desktopPkgPath = Join-Path $ROOT "apps\desktop\package.json"
if (Test-Path $desktopPkgPath) {
    $dpkg = Get-Content $desktopPkgPath -Raw | ConvertFrom-Json
    $dpkg.version = $newVersion
    $dpkg | ConvertTo-Json -Depth 10 | Set-Content $desktopPkgPath -Encoding UTF8
    Write-Host "  Updated: desktop/package.json" -ForegroundColor Green
}

Write-Host ""
Write-Host "Next: Run build-release.ps1 to build v$newVersion" -ForegroundColor Yellow

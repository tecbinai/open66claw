$ErrorActionPreference = "Continue"

$ROOT = "D:\newopenclaw"

Write-Host "=== OpenClawCN Tauri Build (MSVC + Rust stable, JOBS=1) ===" -ForegroundColor Cyan
Write-Host "  Free virtual memory: $([math]::Round((Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory/1024))MB" -ForegroundColor Gray

$tempBat = Join-Path $env:TEMP "vcvars-tauri-build.bat"
@"
@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to initialize MSVC environment
    exit /b 1
)
REM Remove Git paths to prevent link.exe conflict
set PATH=%PATH:E:\Program Files\Git\usr\bin;=%
set PATH=%PATH:C:\Program Files\Git\usr\bin;=%
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
set RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc
set CARGO_BUILD_JOBS=1
echo LINK: && where link.exe 2>nul | findstr /i /v git | findstr /i link
echo RUSTC: && rustc --version
echo JOBS: %CARGO_BUILD_JOBS%
cd /d "$ROOT\apps\desktop\src-tauri"
cargo clean --release
cd /d "$ROOT\apps\desktop"
pnpm tauri build
exit /b %ERRORLEVEL%
"@ | Out-File -FilePath $tempBat -Encoding ASCII

$proc = Start-Process cmd.exe -ArgumentList "/c `"$tempBat`"" -NoNewWindow -PassThru -Wait
$exitCode = if ($proc.HasExited -and $null -ne $proc.ExitCode) { $proc.ExitCode } else { -1 }
Remove-Item $tempBat -Force -ErrorAction SilentlyContinue

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "=== BUILD SUCCESS ===" -ForegroundColor Green
    $nsisExe = Get-ChildItem "$ROOT\apps\desktop\src-tauri\target\release\bundle\nsis\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($nsisExe) {
        $size = [math]::Round($nsisExe.Length / 1MB, 2)
        Write-Host "  Installer: $($nsisExe.FullName)" -ForegroundColor Green
        Write-Host "  Size: ${size}MB" -ForegroundColor Green
    }
} else {
    Write-Host "=== BUILD FAILED (exit: $exitCode) ===" -ForegroundColor Red
}
exit $exitCode

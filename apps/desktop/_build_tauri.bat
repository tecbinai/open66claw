@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to initialize MSVC environment
    exit /b 1
)
REM Ensure MSVC link.exe takes priority over Git's /usr/bin/link.exe
REM by putting cargo\bin AFTER vcvars64 has set up MSVC paths
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
REM Use latest stable Rust (1.93.1)
set RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc
REM Verify we're using MSVC link.exe, not Git's
where link.exe
cd /d "D:\newopenclaw\apps\desktop\src-tauri"
cargo clean --release
cd /d "D:\newopenclaw\apps\desktop"
pnpm tauri build
exit /b %ERRORLEVEL%

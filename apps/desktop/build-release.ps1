# 66Claw Windows 鏈湴鏋勫缓鑴氭湰
# 鐢ㄦ硶:
#   powershell -ExecutionPolicy Bypass -File build-release.ps1               # 榛樿鍖?(66Claw)
#   powershell -ExecutionPolicy Bypass -File build-release.ps1 -OemId xiaoyuan  # OEM 鍖?
#
# 鍓嶇疆鏉′欢:
#   1. MSVC Build Tools 2022 宸插畨瑁?
#   2. Rust stable 宸插畨瑁?

param(
    [string]$OemId = ""   # 鐣欑┖ = 鏍囧噯鍖咃紱浼犲叆 "xiaoyuan" 绛?= OEM 鍖?
)

$ErrorActionPreference = "Continue"
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

# 杈呭姪鍑芥暟锛氭鏌ュ閮ㄥ懡浠?exit code
function Assert-ExitCode {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: $Step failed (exit: $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

$isOem = ($OemId -ne "")
$buildLabel = if ($isOem) { "OEM [$OemId]" } else { "Standard" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  66Claw Local Build ($buildLabel)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 鈹€鈹€ Step 1: 鏈湴鏋勫缓妯″紡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

Write-Host "[1/6] Local package build (no updater, no signing key required)" -ForegroundColor Green

# 鈹€鈹€ Step 2: 鍔犺浇 OEM 閰嶇疆 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

$tauriConfPath   = Join-Path $ROOT "apps\desktop\src-tauri\tauri.conf.json"
$nsisHooksPath   = Join-Path $ROOT "apps\desktop\src-tauri\nsis\hooks.nsh"
# 澶囦唤鍘熷鏂囦欢锛圤EM 鏋勫缓鏃朵复鏃舵浛鎹紝鏋勫缓瀹岃繕鍘燂級
$tauriConfOrig   = $null
$nsisHooksOrig   = $null

$oemProductName  = ""
$oemDisplayName  = ""
$oemIconDir      = ""
$oemShortcut     = ""
$oemExeName      = ""
# 涓存椂鍥炬爣鏇挎崲澶囦唤锛圤EM 鏋勫缓涓撶敤锛岃繕鍘熸椂浣跨敤锛?
$origIconPngBytes = $null
$origIcon44Bytes  = $null
$origIconPng      = ""
$origIcon44       = ""

if ($isOem) {
    $oemConfigPath = Join-Path $ROOT "apps\desktop\oem\$OemId.json"
    if (-not (Test-Path $oemConfigPath)) {
        Write-Host "ERROR: OEM config not found: $oemConfigPath" -ForegroundColor Red
        exit 1
    }
    $oemCfg = Get-Content $oemConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $oemProductName = $oemCfg.productName
    $oemDisplayName = $oemCfg.displayName
    $oemIconDir     = $oemCfg.iconDir       # 濡?"icons/xiaoyuan"
    $oemShortcut    = $oemCfg.shortcutName
    $oemExeName     = $oemCfg.exeName
    Write-Host "[2/6] OEM config loaded: $oemDisplayName ($oemProductName)" -ForegroundColor Green
    Write-Host "       iconDir=$oemIconDir  shortcut=$oemShortcut" -ForegroundColor Gray
} else {
    Write-Host "[2/6] Standard build (no OEM)" -ForegroundColor Green
}

# 鈹€鈹€ Step 3: pnpm build 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

Write-Host "[3/6] Running pnpm build..." -ForegroundColor Yellow

Push-Location $ROOT
$env:VITE_EDITION = "cn"
# OEM 鏍囧織浼犵粰 Vite锛宻etup-page 杩愯鏃跺彲璇伙紙env var 娉ㄥ叆锛?
if ($isOem) { $env:VITE_OEM_ID = $OemId } else { Remove-Item Env:\VITE_OEM_ID -ErrorAction SilentlyContinue }
pnpm build
Assert-ExitCode "pnpm build"
Pop-Location
$uiDist = Join-Path $ROOT "dist\control-ui\index.html"
if (-not (Test-Path $uiDist)) {
    Write-Host "ERROR: build failed - dist/control-ui/index.html not found" -ForegroundColor Red
    exit 1
}
Write-Host "[3/6] build done" -ForegroundColor Green

# 鈹€鈹€ Step 4: 鐗堟湰鍚屾 + OEM 琛ヤ竵 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

$versionJsonPath = Join-Path $ROOT "apps\desktop\version.json"
$cargoTomlPath   = Join-Path $ROOT "apps\desktop\src-tauri\Cargo.toml"

$versionJson = Get-Content $versionJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $versionJson.version

# 璇诲彇鍘熷 tauri.conf.json
$tauriConf = Get-Content $tauriConfPath -Raw -Encoding UTF8 | ConvertFrom-Json
$tauriConfOrig = Get-Content $tauriConfPath -Raw -Encoding UTF8   # 澶囦唤鍘熸枃鏈?

$tauriConf.version = $version

if ($isOem) {
    # 鏇挎崲 productName
    $tauriConf.productName = $oemProductName

    # 鏇挎崲鍥炬爣锛堜富鍥炬爣鍒楄〃 + NSIS 瀹夎鍥炬爣锛?
    $iconPng   = "$oemIconDir/icon.png"
    $iconIco   = "$oemIconDir/icon.ico"
    $icon32    = "icons/32x32.png"       # 灏忓昂瀵镐繚鎸佸師濮嬶紙OEM 鐩綍鍙€夋彁渚涳級
    $icon128   = "icons/128x128.png"
    $icon128x2 = "icons/128x128@2x.png"

    # 濡傛灉 OEM 鐩綍鏈?32x32/128x128锛屼紭鍏堜娇鐢?
    $oemIconDirAbs = Join-Path $ROOT "apps\desktop\src-tauri\$oemIconDir"
    if (Test-Path "$oemIconDirAbs\32x32.png")       { $icon32    = "$oemIconDir/32x32.png" }
    if (Test-Path "$oemIconDirAbs\128x128.png")     { $icon128   = "$oemIconDir/128x128.png" }
    if (Test-Path "$oemIconDirAbs\128x128@2x.png")  { $icon128x2 = "$oemIconDir/128x128@2x.png" }

    $tauriConf.bundle.icon = @($icon32, $icon128, $icon128x2, $iconPng, $iconIco)
    $tauriConf.bundle.windows.nsis.installerIcon = $iconIco

    # 涓存椂鏇挎崲 include_bytes! 纭紪鐮佺殑鍥炬爣鏂囦欢锛堢獥鍙ｅ浘鏍?+ 鎵樼洏鍥炬爣锛?
    # Rust 缂栬瘧鏃剁敤 include_bytes!("../icons/icon.png") 鍜?"../icons/44x44.png"
    $iconsDir = Join-Path $ROOT "apps\desktop\src-tauri\icons"
    $origIconPng = Join-Path $iconsDir "icon.png"
    $origIcon44  = Join-Path $iconsDir "44x44.png"
    $oemIconPng  = Join-Path $oemIconDirAbs "icon.png"
    $oemIcon44   = if (Test-Path "$oemIconDirAbs\44x44.png") { "$oemIconDirAbs\44x44.png" } else { $oemIconPng }

    # 澶囦唤鍘熷鏂囦欢
    $origIconPngBytes = [System.IO.File]::ReadAllBytes($origIconPng)
    $origIcon44Bytes  = [System.IO.File]::ReadAllBytes($origIcon44)

    # 鏇挎崲涓?OEM 鍥炬爣
    if (Test-Path $oemIconPng) {
        Copy-Item $oemIconPng $origIconPng -Force
        Write-Host "       OEM: Replaced icons/icon.png with $OemId version" -ForegroundColor Gray
    }
    if (Test-Path $oemIcon44) {
        Copy-Item $oemIcon44 $origIcon44 -Force
        Write-Host "       OEM: Replaced icons/44x44.png with $OemId version" -ForegroundColor Gray
    }

    # Cargo 澧為噺缂栬瘧涓?track include_bytes! 鏂囦欢鍙樻洿锛岄渶瑕?touch rs 鏂囦欢瑙﹀彂閲嶇紪璇?
    $srcDir = Join-Path $ROOT "apps\desktop\src-tauri\src"
    (Get-Item "$srcDir\main.rs").LastWriteTime = Get-Date
    (Get-Item "$srcDir\tray.rs").LastWriteTime = Get-Date
    Write-Host "       OEM: Touched main.rs + tray.rs to force Rust recompile" -ForegroundColor Gray

    # 灏?oem.json 鍔犲叆 Tauri resources锛岀‘淇濇墦杩涘畨瑁呭寘
    $resList = [System.Collections.ArrayList]@($tauriConf.bundle.resources)
    if (-not $resList.Contains("_dist/oem.json")) {
        $resList.Add("_dist/oem.json") | Out-Null
        $tauriConf.bundle.resources = $resList.ToArray()
        Write-Host "       OEM: Added _dist/oem.json to Tauri resources" -ForegroundColor Gray
    }
}

$jsonOut = $tauriConf | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($tauriConfPath, $jsonOut, (New-Object System.Text.UTF8Encoding $false))

# 鍚屾 Cargo.toml
$cargoContent = Get-Content $cargoTomlPath -Raw -Encoding UTF8
if ($cargoContent -match 'version = "([^"]+)"') {
    $cargoVer = $Matches[1]
    if ($cargoVer -ne $version) {
        $cargoContent = $cargoContent -replace "version = `"$cargoVer`"", "version = `"$version`""
        [System.IO.File]::WriteAllText($cargoTomlPath, $cargoContent, (New-Object System.Text.UTF8Encoding $false))
    }
}

# 鍚屾 desktop/package.json
$desktopPkgPath = Join-Path $ROOT "apps\desktop\package.json"
if (Test-Path $desktopPkgPath) {
    $dpkg = Get-Content $desktopPkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($dpkg.version -ne $version) {
        $dpkg.version = $version
        $jsonOut2 = $dpkg | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($desktopPkgPath, $jsonOut2, (New-Object System.Text.UTF8Encoding $false))
    }
}

Write-Host "[4/6] Version: $version  productName: $($tauriConf.productName)" -ForegroundColor Green

# OEM: 鏇挎崲 NSIS hooks锛堝揩鎹锋柟寮忓悕绉?+ exe 鍚嶏級
if ($isOem -and $oemShortcut -and $oemExeName) {
    $nsisHooksOrig = Get-Content $nsisHooksPath -Raw -Encoding UTF8
    $nsisNew = @"
; $oemDisplayName NSIS Installer Hooks (OEM: $OemId)
; Auto-generated by build-release.ps1 -OemId $OemId

!macro NSIS_HOOK_PREINSTALL
  ; Pre-install hook
!macroend

!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut `"`$DESKTOP\$oemShortcut.lnk`" `"`$INSTDIR\$oemExeName.exe`" `"`" `"`$INSTDIR\$oemExeName.exe`" 0
  EnVar::SetHKLM
  EnVar::AddValue `"Path`" `"`$INSTDIR`"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Pre-uninstall hook
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete `"`$DESKTOP\$oemShortcut.lnk`"
  EnVar::SetHKLM
  EnVar::DeleteValue `"Path`" `"`$INSTDIR`"
!macroend
"@
    [System.IO.File]::WriteAllText($nsisHooksPath, $nsisNew, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "       OEM NSIS hooks applied: shortcut=$oemShortcut  exe=$oemExeName" -ForegroundColor Gray
}

# OEM: 璁剧疆鐜鍙橀噺锛岃 stage-dist.sh 璐熻矗鏇挎崲 splash.html 骞跺啓鍏?_dist/oem.json
# 锛坰tage-dist 鍦?beforeBuildCommand 閲岃窇锛屾椂鏈烘纭紝涓旂敤 Node.js 涓嶄細鏈夌紪鐮侀棶棰橈級
$oemDistJson = Join-Path $ROOT "apps\desktop\src-tauri\_dist\oem.json"
if ($isOem) {
    $env:OPENCLAW_OEM_ID = $OemId
    Write-Host "       OEM: OPENCLAW_OEM_ID=$OemId (stage-dist will patch splash + write oem.json)" -ForegroundColor Gray
} else {
    Remove-Item Env:\OPENCLAW_OEM_ID -ErrorAction SilentlyContinue
    Remove-Item $oemDistJson -ErrorAction SilentlyContinue
}

# 鈹€鈹€ Step 5: 鏋勫缓鏈湴瀹夎鍖?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

Write-Host "[5/6] Building Tauri package..." -ForegroundColor Yellow
Write-Host "  Free memory: $([math]::Round((Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory/1024))MB" -ForegroundColor Gray

# 娓呯悊娈嬬暀鐨?cargo 閿佹枃浠?
$cargoLock = Join-Path $ROOT "apps\desktop\src-tauri\target\release\.cargo-lock"
if (Test-Path $cargoLock) {
    Remove-Item $cargoLock -Force -ErrorAction SilentlyContinue
    Write-Host "  Cleaned stale cargo lock file" -ForegroundColor Yellow
}

# Find MSVC vcvars64.bat
$vcvars = $null
@(
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat",
    "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat"
) | ForEach-Object { if (-not $vcvars -and (Test-Path $_)) { $vcvars = $_ } }
if (-not $vcvars) {
    Write-Host "ERROR: Cannot find vcvars64.bat" -ForegroundColor Red
    exit 1
}

$tmpEnvBat = Join-Path $env:TEMP "get-msvc-env.bat"
$tmpEnvOut = Join-Path $env:TEMP "msvc-env.txt"
$batContent = "@echo off`r`ncall `"$vcvars`" > nul 2>&1`r`nset > `"$tmpEnvOut`""
[System.IO.File]::WriteAllText($tmpEnvBat, $batContent, [System.Text.Encoding]::ASCII)
cmd.exe /c "`"$tmpEnvBat`"" | Out-Null
Get-Content $tmpEnvOut | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
    }
}
Remove-Item $tmpEnvBat, $tmpEnvOut -Force -ErrorAction SilentlyContinue

$env:PATH = $env:PATH -replace [regex]::Escape('E:\Program Files\Git\usr\bin;'), ''
$env:PATH = $env:PATH -replace [regex]::Escape('C:\Program Files\Git\usr\bin;'), ''
$env:PATH = "E:\Program Files\Git\bin;$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:RUSTUP_TOOLCHAIN = "stable-x86_64-pc-windows-msvc"
$env:CARGO_BUILD_JOBS = "8"

Push-Location "$ROOT\apps\desktop"
# OEM 鏋勫缓锛氬垹闄?.version-stamp 瑙﹀彂閲嶆柊 stage锛圲I 璧勬簮宸插彉浣嗙増鏈彿鏈彉锛?
# stage-dist.sh 宸蹭慨鏀逛负娓呯悊鏃朵繚鐣?node/ 鐩綍锛屼笉浼氶噸鏂颁笅杞?Node.js
$stampFile = Join-Path $ROOT "apps\desktop\src-tauri\_dist\.version-stamp"
if (Test-Path $stampFile) {
    Remove-Item $stampFile -Force -ErrorAction SilentlyContinue
    Write-Host "  Cleared _dist/.version-stamp to force re-stage" -ForegroundColor Gray
}
$env:FORCE_STAGE = "1"
# Tauri 2.x 鍦ㄨ繍琛?beforeBuildCommand 涔嬪墠浼氶妫€ frontendDist 鏄惁瀛樺湪銆?
# stage-dist.sh 鐨?beforeBuildCommand 浼氭竻绌哄苟閲嶅缓 _dist锛屼絾 Tauri 鐨勯妫€鏃╀簬姝ゃ€?
# 鍥犳锛屾瘡娆℃瀯寤哄墠閮界‘淇?_dist/dist/control-ui 瀛樺湪锛坰tage-dist 浼氬湪 beforeBuildCommand
# 閲岀敤鏈€鏂板唴瀹硅鐩栧畠锛岃繖閲屽彧鏄‘淇?Tauri 棰勬鏃剁洰褰曞凡瀛樺湪锛夈€?
$controlUiDst = Join-Path $ROOT "apps\desktop\src-tauri\_dist\dist\control-ui"
$controlUiSrc = Join-Path $ROOT "dist\control-ui"
if (Test-Path $controlUiSrc) {
    New-Item -ItemType Directory -Path (Join-Path $ROOT "apps\desktop\src-tauri\_dist\dist") -Force -ErrorAction SilentlyContinue | Out-Null
    Copy-Item -Path $controlUiSrc -Destination $controlUiDst -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Pre-staged control-ui to _dist for Tauri frontendDist pre-check" -ForegroundColor Gray
} else {
    Write-Host "  WARN: dist\control-ui not found, run pnpm build first" -ForegroundColor Yellow
}
pnpm tauri build
$exitCode = $LASTEXITCODE
Pop-Location

# 鈹€鈹€ 杩樺師琚?OEM 淇敼鐨勬枃浠?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

if ($isOem) {
    if ($tauriConfOrig) {
        [System.IO.File]::WriteAllText($tauriConfPath, $tauriConfOrig, (New-Object System.Text.UTF8Encoding $false))
        Write-Host "  Restored tauri.conf.json" -ForegroundColor Gray
    }
    if ($nsisHooksOrig) {
        [System.IO.File]::WriteAllText($nsisHooksPath, $nsisHooksOrig, (New-Object System.Text.UTF8Encoding $false))
        Write-Host "  Restored nsis/hooks.nsh" -ForegroundColor Gray
    }
    # 杩樺師涓存椂鏇挎崲鐨勫浘鏍囨枃浠?
    if ($origIconPngBytes) {
        [System.IO.File]::WriteAllBytes($origIconPng, $origIconPngBytes)
        Write-Host "  Restored icons/icon.png" -ForegroundColor Gray
    }
    if ($origIcon44Bytes) {
        [System.IO.File]::WriteAllBytes($origIcon44, $origIcon44Bytes)
        Write-Host "  Restored icons/44x44.png" -ForegroundColor Gray
    }
    # oem.json 淇濈暀鍦?_dist/ 涓紙宸叉墦鍏ュ畨瑁呭寘锛宻tage-dist 缂撳瓨鍛戒腑鏃堕渶瑕侀噸鍐欙級
}

if ($exitCode -ne 0) {
    Write-Host "ERROR: Tauri build failed (exit: $exitCode)" -ForegroundColor Red
    exit $exitCode
}
Write-Host "[5/6] Build completed" -ForegroundColor Green

# 鈹€鈹€ Step 6: 閲嶅懡鍚嶄骇鐗╋紙鍔犳椂闂存埑锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

$bundleDir = Join-Path $ROOT "apps\desktop\src-tauri\target\release\bundle\nsis"
$timestamp = Get-Date -Format "yyyyMMddHHmmss"

function Rename-WithTimestamp {
    param([System.IO.FileInfo]$File, [string]$Ts)
    if (-not $File) { return $null }
    $name = $File.Name
    $dir  = $File.DirectoryName
    if ($name -match '^(.+?)(\.nsis\.zip\.sig)$') {
        $newName = "$($Matches[1])-$Ts$($Matches[2])"
    } elseif ($name -match '^(.+?)(\.nsis\.zip)$') {
        $newName = "$($Matches[1])-$Ts$($Matches[2])"
    } elseif ($name -match '^(.+?)(\.exe)$') {
        $newName = "$($Matches[1])-$Ts$($Matches[2])"
    } else {
        return $File
    }
    $newPath = Join-Path $dir $newName
    Rename-Item $File.FullName $newPath
    return Get-Item $newPath
}

# 鍙彇娌℃湁鏃堕棿鎴冲悗缂€鐨勬枃浠讹紙Tauri 鍒氱敓鎴愮殑锛夛紝宸插姞鏃堕棿鎴崇殑鏃ф枃浠剁洿鎺ュ垹鎺夐伩鍏嶅彔鍔?
Get-ChildItem "$bundleDir" -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '-\d{14}\.'
} | Remove-Item -Force -ErrorAction SilentlyContinue

$nsisZipSigOrig = Get-ChildItem "$bundleDir\*.nsis.zip.sig" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch '-\d{14}\.' } | Select-Object -First 1
$nsisZipOrig    = Get-ChildItem "$bundleDir\*.nsis.zip"     -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch '-\d{14}\.' } | Select-Object -First 1
$nsisExeOrig    = Get-ChildItem "$bundleDir\*setup.exe"     -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch '-\d{14}\.' } | Select-Object -First 1

$nsisZipSig = Rename-WithTimestamp $nsisZipSigOrig $timestamp
$nsisZip    = Rename-WithTimestamp $nsisZipOrig    $timestamp
$nsisExe    = Rename-WithTimestamp $nsisExeOrig    $timestamp

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  BUILD SUCCESS - v$version ($buildLabel)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

if ($nsisZip)    { Write-Host "  Update package : $($nsisZip.Name) ($([math]::Round($nsisZip.Length/1MB,2))MB)" -ForegroundColor White }
if ($nsisZipSig) { Write-Host "  Signature      : $($nsisZipSig.Name)" -ForegroundColor White }
if ($nsisExe)    { Write-Host "  Installer      : $($nsisExe.Name) ($([math]::Round($nsisExe.Length/1MB,2))MB)" -ForegroundColor White }

$buildOutDir = Join-Path $ROOT "build"
New-Item -ItemType Directory -Path $buildOutDir -Force | Out-Null
foreach ($artifact in @($nsisExe, $nsisZip, $nsisZipSig)) {
    if ($artifact) {
        Copy-Item -LiteralPath $artifact.FullName -Destination (Join-Path $buildOutDir $artifact.Name) -Force
    }
}
Write-Host "  Copied artifacts to: $buildOutDir" -ForegroundColor White
Write-Host ""
Write-Host "Next: test the generated installer locally." -ForegroundColor Yellow

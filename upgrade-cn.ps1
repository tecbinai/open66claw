#Requires -Version 5.1
# OpenClawCN 升级脚本 (Windows)
# 用法: powershell -ExecutionPolicy Bypass -File upgrade-cn.ps1
param(
    [switch]$SkipPatches,
    [switch]$SkipBuild,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# === 配置 ===
$MIN_NODE_VERSION = 22

# === 颜色输出 ===
function Write-Info  { param($Msg) Write-Host "[OpenClawCN] $Msg" -ForegroundColor Cyan }
function Write-Ok    { param($Msg) Write-Host "[OpenClawCN] $Msg" -ForegroundColor Green }
function Write-Warn  { param($Msg) Write-Host "[OpenClawCN] $Msg" -ForegroundColor Yellow }
function Write-Fail  { param($Msg) Write-Host "[OpenClawCN] $Msg" -ForegroundColor Red; exit 1 }

# === 帮助 ===
if ($Help) {
    Write-Host "Usage: upgrade-cn.ps1 [-SkipPatches] [-SkipBuild]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -SkipPatches   跳过补丁撤销/重新应用"
    Write-Host "  -SkipBuild     跳过构建步骤"
    Write-Host "  -Help          显示帮助"
    exit 0
}

# === Step 1: 检查前置条件 ===
Write-Info "检查前置条件..."

try {
    $nodeVersion = (node -v) -replace 'v', ''
    $nodeMajor = [int]($nodeVersion.Split('.')[0])
    if ($nodeMajor -lt $MIN_NODE_VERSION) {
        Write-Fail "Node.js 版本太低 (v$nodeVersion)。需要 >= v$MIN_NODE_VERSION。"
    }
    Write-Ok "Node.js v$nodeVersion ✓"
} catch {
    Write-Fail "未找到 Node.js。请安装 Node.js >= $MIN_NODE_VERSION`: https://nodejs.org/"
}

try {
    $pnpmVersion = pnpm -v
    Write-Ok "pnpm v$pnpmVersion ✓"
} catch {
    Write-Fail "未找到 pnpm。请先运行 install-cn.ps1 安装。"
}

try {
    $gitVersionOutput = git --version
    Write-Ok "git $($gitVersionOutput -replace 'git version ', '') ✓"
} catch {
    Write-Fail "未找到 git。请安装 git: https://git-scm.com/"
}

# === Step 2: 读取当前版本 ===
Write-Info "读取当前版本信息..."

if (Test-Path ".openclaw-version") {
    $versionContent = (Get-Content ".openclaw-version" -Raw).Trim().Split(' ')
    $oldCommit = $versionContent[0]
    $oldVersion = if ($versionContent.Length -ge 2) { $versionContent[1] } else { "unknown" }
} else {
    Write-Warn "未找到 .openclaw-version 文件，将以当前 HEAD 为基准"
    $oldCommit = (git rev-parse --short HEAD 2>$null)
    if (-not $oldCommit) { $oldCommit = "unknown" }
    $oldVersion = "unknown"
}
Write-Info "当前版本: $oldVersion ($oldCommit)"

# === Step 3: 检查更新 ===
Write-Info "检查远程更新..."
git fetch origin
if ($LASTEXITCODE -ne 0) { Write-Fail "git fetch 失败，请检查网络连接" }

$localHead = (git rev-parse HEAD)
$remoteHead = (git rev-parse origin/main 2>$null)
if ($LASTEXITCODE -ne 0) {
    $remoteHead = (git rev-parse origin/master 2>$null)
    if ($LASTEXITCODE -ne 0) { Write-Fail "无法获取远程分支 HEAD" }
}

if ($localHead -eq $remoteHead) {
    Write-Ok "已是最新版本，无需升级 ✓"
    exit 0
}

Write-Info "发现新版本，开始升级..."

# === Step 4: 撤销补丁 ===
if (-not $SkipPatches -and (Test-Path "scripts/apply-patches.sh")) {
    Write-Info "撤销现有补丁..."
    bash scripts/apply-patches.sh --reverse 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Warn "补丁撤销遇到问题，继续升级..." }
    else { Write-Ok "补丁已撤销 ✓" }
} else {
    Write-Warn "跳过补丁撤销"
}

# === Step 5: 合并更新 ===
Write-Info "合并远程更新 (fast-forward)..."
git merge origin/main --ff-only 2>$null
if ($LASTEXITCODE -ne 0) {
    git merge origin/master --ff-only 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "无法 fast-forward 合并。本地有未合并的提交，请手动解决。"
    }
}
Write-Ok "代码更新完成 ✓"

# === Step 6: 重新应用补丁 ===
if (-not $SkipPatches -and (Test-Path "scripts/apply-patches.sh")) {
    Write-Info "重新应用 CN 补丁..."
    bash scripts/apply-patches.sh 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Warn "补丁应用遇到问题，请手动检查" }
    else { Write-Ok "补丁已重新应用 ✓" }
} else {
    Write-Warn "跳过补丁应用"
}

# === Step 7: 安装依赖 ===
Write-Info "安装依赖..."
pnpm install --frozen-lockfile 2>$null
if ($LASTEXITCODE -ne 0) {
    pnpm install
    if ($LASTEXITCODE -ne 0) { Write-Fail "依赖安装失败" }
}
Write-Ok "依赖安装完成 ✓"

# === Step 8: 构建 ===
if (-not $SkipBuild) {
    Write-Info "构建项目..."
    pnpm build
    if ($LASTEXITCODE -ne 0) { Write-Fail "构建失败" }
    Write-Ok "构建完成 ✓"
} else {
    Write-Warn "跳过构建步骤"
}

# === Step 9: 更新版本记录 ===
$newCommit = (git rev-parse --short HEAD)
$newVersion = (node -p "require('./package.json').version" 2>$null)
if (-not $newVersion) { $newVersion = "unknown" }
"$newCommit $newVersion" | Out-File -FilePath ".openclaw-version" -Encoding utf8 -NoNewline
Write-Ok "版本记录已更新 ✓"

# === 完成 ===
Write-Host ""
Write-Ok "╔═══════════════════════════════════════╗"
Write-Ok "║   OpenClawCN 升级完成！               ║"
Write-Ok "║                                       ║"
Write-Ok "║   $oldVersion ($oldCommit)"
Write-Ok "║     ↓"
Write-Ok "║   $newVersion ($newCommit)"
Write-Ok "╚═══════════════════════════════════════╝"

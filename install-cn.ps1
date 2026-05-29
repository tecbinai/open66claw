#Requires -Version 5.1
# OpenClawCN 中国区安装脚本 (Windows)
# 用法: powershell -ExecutionPolicy Bypass -File install-cn.ps1
param(
    [switch]$SkipPatches,
    [switch]$SkipSetup,
    [switch]$Upgrade,
    [string]$InstallDir = "$env:USERPROFILE\.openclaw-install"
)

$ErrorActionPreference = "Stop"

# === 配置 ===
$MIN_NODE_VERSION = 22
$NPM_MIRROR = "https://registry.npmmirror.com"
$REPO_URL = "https://github.com/nicepkg/openclaw.git"  # TODO: 替换为正确仓库

# === 颜色输出 ===
function Write-Info  { param($Msg) Write-Host "[OpenClawCN] $Msg" -ForegroundColor Cyan }
function Write-Ok    { param($Msg) Write-Host "[OpenClawCN] $Msg" -ForegroundColor Green }
function Write-Warn  { param($Msg) Write-Host "[OpenClawCN] $Msg" -ForegroundColor Yellow }
function Write-Fail  { param($Msg) Write-Host "[OpenClawCN] $Msg" -ForegroundColor Red; exit 1 }

# === 升级模式 ===
if ($Upgrade -and (Test-Path $InstallDir)) {
    Write-Info "检测到 -Upgrade 参数，切换到升级模式..."
    Push-Location $InstallDir
    $upgradeScript = "upgrade-cn.ps1"
    if (Test-Path $upgradeScript) {
        $upgradeArgs = @()
        if ($SkipPatches) { $upgradeArgs += "-SkipPatches" }
        & powershell -ExecutionPolicy Bypass -File $upgradeScript @upgradeArgs
        Pop-Location
        exit $LASTEXITCODE
    } else {
        Pop-Location
        Write-Fail "升级脚本 $upgradeScript 不存在，请先完成安装"
    }
} elseif ($Upgrade) {
    Write-Fail "安装目录 $InstallDir 不存在，请先运行安装"
}

# === Step 1: 检查 Node.js ===
Write-Info "检查 Node.js 版本..."
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

# === Step 2: 检查 pnpm ===
Write-Info "检查 pnpm..."
try {
    $pnpmVersion = pnpm -v
    Write-Ok "pnpm v$pnpmVersion ✓"
} catch {
    Write-Info "正在安装 pnpm..."
    npm install -g pnpm
    if ($LASTEXITCODE -ne 0) { Write-Fail "pnpm 安装失败" }
}

# === Step 3: 配置国内镜像 ===
Write-Info "配置 npm 国内镜像: $NPM_MIRROR"
npm config set registry $NPM_MIRROR 2>$null
Write-Ok "npm 镜像已配置 ✓"

# === Step 4: 克隆仓库 ===
if (Test-Path $InstallDir) {
    Write-Info "安装目录已存在: $InstallDir"
    Write-Info "拉取最新代码..."
    Push-Location $InstallDir
    git pull --ff-only 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Warn "git pull 失败，使用现有代码" }
} else {
    Write-Info "克隆仓库到: $InstallDir"
    git clone --depth 1 $REPO_URL $InstallDir
    if ($LASTEXITCODE -ne 0) { Write-Fail "克隆失败" }
    Push-Location $InstallDir
}

# === Step 5: 安装依赖 ===
Write-Info "安装依赖 (pnpm install)..."
pnpm install --frozen-lockfile 2>$null
if ($LASTEXITCODE -ne 0) {
    pnpm install
    if ($LASTEXITCODE -ne 0) { Write-Fail "依赖安装失败" }
}
Write-Ok "依赖安装完成 ✓"

# === Step 6: 应用补丁 ===
if (-not $SkipPatches -and (Test-Path "scripts/apply-patches.sh")) {
    Write-Info "应用 CN 补丁..."
    bash scripts/apply-patches.sh 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Warn "补丁应用遇到问题，继续安装..." }
    else { Write-Ok "补丁已应用 ✓" }
} else {
    Write-Warn "跳过补丁应用"
}

# === Step 7: 构建 ===
Write-Info "构建项目..."
pnpm build
if ($LASTEXITCODE -ne 0) { Write-Fail "构建失败" }
Write-Ok "构建完成 ✓"

# === Step 7.5: 记录版本 ===
$commitHash = (git rev-parse --short HEAD)
$pkgVersion = (node -p "require('./package.json').version" 2>$null)
if (-not $pkgVersion) { $pkgVersion = "unknown" }
"$commitHash $pkgVersion" | Out-File -FilePath ".openclaw-version" -Encoding utf8 -NoNewline
Write-Ok "版本记录: $commitHash $pkgVersion ✓"

# === Step 8: 首次设置 ===
if (-not $SkipSetup) {
    Write-Info "运行配置迁移..."
    # 使用 node 直接调用，避免依赖 openclaw CLI 可用
    try {
        $migrateResult = node -e "const { migrateConfig } = require('./extensions/cn-adapter/cn-defaults/migration.js'); console.log('CN config migration engine loaded');" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "配置迁移引擎就绪 ✓"
        } else {
            Write-Warn "配置迁移引擎尚不可用，跳过"
        }
    } catch {
        Write-Warn "配置迁移引擎尚不可用，跳过"
    }
}

Pop-Location

# === 完成 ===
Write-Host ""
Write-Ok "╔═══════════════════════════════════════╗"
Write-Ok "║   OpenClawCN 安装完成！               ║"
Write-Ok "║                                       ║"
Write-Ok "║   启动: cd $InstallDir; pnpm dev      ║"
Write-Ok "╚═══════════════════════════════════════╝"

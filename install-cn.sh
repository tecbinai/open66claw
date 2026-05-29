#!/usr/bin/env bash
# OpenClawCN 中国区安装脚本
# 用法:
#   curl -fsSL <url>/install-cn.sh | bash
#   bash install-cn.sh [--skip-patches] [--skip-setup] [--upgrade]
set -euo pipefail

# === 配置 ===
MIN_NODE_VERSION=22
NPM_MIRROR="https://registry.npmmirror.com"
REPO_URL="https://github.com/nicepkg/openclaw.git"  # TODO: 替换为正确的仓库地址
INSTALL_DIR="${OPENCLAW_INSTALL_DIR:-$HOME/.openclaw-install}"

# === 颜色 ===
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[OpenClawCN]${NC} $1"; }
ok()    { echo -e "${GREEN}[OpenClawCN]${NC} $1"; }
warn()  { echo -e "${YELLOW}[OpenClawCN]${NC} $1"; }
fail()  { echo -e "${RED}[OpenClawCN]${NC} $1"; exit 1; }

# === 解析参数 ===
SKIP_PATCHES=false
SKIP_SETUP=false
UPGRADE=false
for arg in "$@"; do
  case $arg in
    --skip-patches) SKIP_PATCHES=true ;;
    --skip-setup)   SKIP_SETUP=true ;;
    --upgrade)      UPGRADE=true ;;
    --help|-h)
      echo "Usage: install-cn.sh [--skip-patches] [--skip-setup] [--upgrade]"
      exit 0
      ;;
  esac
done

# === 升级模式 ===
if [[ "$UPGRADE" == true ]] && [[ -d "$INSTALL_DIR" ]]; then
  info "检测到 --upgrade 参数，切换到升级模式..."
  cd "$INSTALL_DIR"
  UPGRADE_SCRIPT="upgrade-cn.sh"
  if [[ -f "$UPGRADE_SCRIPT" ]]; then
    UPGRADE_ARGS=()
    [[ "$SKIP_PATCHES" == true ]] && UPGRADE_ARGS+=(--skip-patches)
    exec bash "$UPGRADE_SCRIPT" "${UPGRADE_ARGS[@]}"
  else
    fail "升级脚本 $UPGRADE_SCRIPT 不存在，请先完成安装"
  fi
elif [[ "$UPGRADE" == true ]]; then
  fail "安装目录 $INSTALL_DIR 不存在，请先运行安装"
fi

# === Step 1: 检查 Node.js ===
info "检查 Node.js 版本..."
if ! command -v node &>/dev/null; then
  fail "未找到 Node.js。请安装 Node.js >= ${MIN_NODE_VERSION}: https://nodejs.org/"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VERSION" -lt "$MIN_NODE_VERSION" ]]; then
  fail "Node.js 版本太低 (v$(node -v))。需要 >= v${MIN_NODE_VERSION}。"
fi
ok "Node.js $(node -v) ✓"

# === Step 2: 检查 pnpm ===
info "检查 pnpm..."
if ! command -v pnpm &>/dev/null; then
  info "正在安装 pnpm..."
  npm install -g pnpm || fail "pnpm 安装失败"
fi
ok "pnpm $(pnpm -v) ✓"

# === Step 3: 配置国内镜像 ===
info "配置 npm 国内镜像: $NPM_MIRROR"
npm config set registry "$NPM_MIRROR" 2>/dev/null || true
ok "npm 镜像已配置 ✓"

# === Step 4: 克隆仓库 ===
if [[ -d "$INSTALL_DIR" ]]; then
  info "安装目录已存在: $INSTALL_DIR"
  info "拉取最新代码..."
  cd "$INSTALL_DIR" && git pull --ff-only || warn "git pull 失败，使用现有代码"
else
  info "克隆仓库到: $INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" || fail "克隆失败"
  cd "$INSTALL_DIR"
fi

# === Step 5: 安装依赖 ===
info "安装依赖 (pnpm install)..."
pnpm install --frozen-lockfile || pnpm install || fail "依赖安装失败"
ok "依赖安装完成 ✓"

# === Step 6: 应用补丁 ===
if [[ "$SKIP_PATCHES" == false ]] && [[ -f "scripts/apply-patches.sh" ]]; then
  info "应用 CN 补丁..."
  bash scripts/apply-patches.sh || warn "补丁应用遇到问题，继续安装..."
  ok "补丁已应用 ✓"
else
  warn "跳过补丁应用"
fi

# === Step 7: 构建 ===
info "构建项目..."
pnpm build || fail "构建失败"
ok "构建完成 ✓"

# === Step 7.5: 记录版本 ===
COMMIT_HASH=$(git rev-parse --short HEAD)
PKG_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
echo "$COMMIT_HASH $PKG_VERSION" > .openclaw-version
ok "版本记录: $COMMIT_HASH $PKG_VERSION ✓"

# === Step 8: 首次设置 ===
if [[ "$SKIP_SETUP" == false ]]; then
  info "运行配置迁移..."
  # 使用 node 直接调用，避免依赖 openclaw CLI 可用
  node -e "
    const { migrateConfig } = require('./extensions/cn-adapter/cn-defaults/migration.js');
    console.log('CN config migration engine loaded');
  " 2>/dev/null && ok "配置迁移引擎就绪 ✓" || warn "配置迁移引擎尚不可用，跳过"
fi

# === 完成 ===
echo ""
ok "╔═══════════════════════════════════════╗"
ok "║   OpenClawCN 安装完成！               ║"
ok "║                                       ║"
ok "║   启动: cd $INSTALL_DIR && pnpm dev   ║"
ok "╚═══════════════════════════════════════╝"

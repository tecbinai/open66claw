#!/usr/bin/env bash
# OpenClawCN 升级脚本
# 用法:
#   bash upgrade-cn.sh [--skip-patches] [--skip-build]
set -euo pipefail

# === 配置 ===
MIN_NODE_VERSION=22

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
SKIP_BUILD=false
for arg in "$@"; do
  case $arg in
    --skip-patches) SKIP_PATCHES=true ;;
    --skip-build)   SKIP_BUILD=true ;;
    --help|-h)
      echo "Usage: upgrade-cn.sh [--skip-patches] [--skip-build]"
      echo ""
      echo "Options:"
      echo "  --skip-patches   跳过补丁撤销/重新应用"
      echo "  --skip-build     跳过构建步骤"
      echo "  --help, -h       显示帮助"
      exit 0
      ;;
  esac
done

# === Step 1: 检查前置条件 ===
info "检查前置条件..."

if ! command -v node &>/dev/null; then
  fail "未找到 Node.js。请安装 Node.js >= ${MIN_NODE_VERSION}: https://nodejs.org/"
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VERSION" -lt "$MIN_NODE_VERSION" ]]; then
  fail "Node.js 版本太低 (v$(node -v))。需要 >= v${MIN_NODE_VERSION}。"
fi
ok "Node.js $(node -v) ✓"

if ! command -v pnpm &>/dev/null; then
  fail "未找到 pnpm。请先运行 install-cn.sh 安装。"
fi
ok "pnpm $(pnpm -v) ✓"

if ! command -v git &>/dev/null; then
  fail "未找到 git。请安装 git: https://git-scm.com/"
fi
ok "git $(git --version | awk '{print $3}') ✓"

# === Step 2: 读取当前版本 ===
info "读取当前版本信息..."

if [[ ! -f ".openclaw-version" ]]; then
  warn "未找到 .openclaw-version 文件，将以当前 HEAD 为基准"
  OLD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  OLD_VERSION="unknown"
else
  OLD_COMMIT=$(awk '{print $1}' .openclaw-version)
  OLD_VERSION=$(awk '{print $2}' .openclaw-version)
fi
info "当前版本: $OLD_VERSION ($OLD_COMMIT)"

# === Step 3: 检查更新 ===
info "检查远程更新..."
git fetch origin || fail "git fetch 失败，请检查网络连接"

LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null || fail "无法获取远程分支 HEAD")

if [[ "$LOCAL_HEAD" == "$REMOTE_HEAD" ]]; then
  ok "已是最新版本，无需升级 ✓"
  exit 0
fi

info "发现新版本，开始升级..."

# === Step 4: 撤销补丁 ===
if [[ "$SKIP_PATCHES" == false ]] && [[ -f "scripts/apply-patches.sh" ]]; then
  info "撤销现有补丁..."
  bash scripts/apply-patches.sh --reverse || warn "补丁撤销遇到问题，继续升级..."
  ok "补丁已撤销 ✓"
else
  warn "跳过补丁撤销"
fi

# === Step 5: 合并更新 ===
info "合并远程更新 (fast-forward)..."
if ! git merge origin/main --ff-only 2>/dev/null; then
  if ! git merge origin/master --ff-only 2>/dev/null; then
    fail "无法 fast-forward 合并。本地有未合并的提交，请手动解决。"
  fi
fi
ok "代码更新完成 ✓"

# === Step 6: 重新应用补丁 ===
if [[ "$SKIP_PATCHES" == false ]] && [[ -f "scripts/apply-patches.sh" ]]; then
  info "重新应用 CN 补丁..."
  bash scripts/apply-patches.sh || warn "补丁应用遇到问题，请手动检查"
  ok "补丁已重新应用 ✓"
else
  warn "跳过补丁应用"
fi

# === Step 7: 安装依赖 ===
info "安装依赖..."
pnpm install --frozen-lockfile || pnpm install || fail "依赖安装失败"
ok "依赖安装完成 ✓"

# === Step 8: 构建 ===
if [[ "$SKIP_BUILD" == false ]]; then
  info "构建项目..."
  pnpm build || fail "构建失败"
  ok "构建完成 ✓"
else
  warn "跳过构建步骤"
fi

# === Step 9: 更新版本记录 ===
NEW_COMMIT=$(git rev-parse --short HEAD)
NEW_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
echo "$NEW_COMMIT $NEW_VERSION" > .openclaw-version
ok "版本记录已更新 ✓"

# === 完成 ===
echo ""
ok "╔═══════════════════════════════════════╗"
ok "║   OpenClawCN 升级完成！               ║"
ok "║                                       ║"
ok "║   $OLD_VERSION ($OLD_COMMIT)"
ok "║     ↓"
ok "║   $NEW_VERSION ($NEW_COMMIT)"
ok "╚═══════════════════════════════════════╝"

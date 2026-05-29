#!/bin/bash
# 66Claw macOS 一键发版（完整流程）
# 用法:
#   ./release-macos.sh --notes "修复了xxx"
#   ./release-macos.sh --bump patch --notes "小修复"
#   ./release-macos.sh --bump 1.2.0 --notes "大版本"
#   ./release-macos.sh --target mac-x64 --notes "Intel版"
#   ./release-macos.sh --target all-mac --notes "双架构"  # arm64 + x64，build 只跑 1 次
#   ./release-macos.sh --skip-publish              # 只构建不发布
#   ./release-macos.sh --dry-run --notes "测试"     # 构建+模拟发布
#   ./release-macos.sh --direct --notes "xxx"       # 直连模式（macOS 能上网时用）
#
# 完整流程:
#   1. 清理旧缓存（build/ + ui-cn/dist/ + bundle产物）
#   2. 升版本号（可选）
#   3. Build, sign, and package.
#   4. 发布：SCP 产物到 Windows → Windows 中转发布到服务器+Gitee
#      （或 --direct 模式直接从 macOS 发布，需要 macOS 能访问外网）
#   5. 复制安装包到桌面

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RELEASES_DIR="$SCRIPT_DIR/releases"
TOTAL_STEPS=5

# ═══════════════════════════════════════════════════════════════════
# Windows 中转配置（macOS 无法访问外网，通过局域网 Windows 发布）
# ═══════════════════════════════════════════════════════════════════
WIN_HOST="192.168.0.105"
WIN_USER="72793"
WIN_REPO="D:/newopenclaw"

# 解析参数
BUMP=""
NOTES=""
TARGET="mac-arm64"
SKIP_PUBLISH=false
DRY_RUN=false
SKIP_SERVER=false
SKIP_GITEE=false
SKIP_CLEAN=false
SKIP_COPY_DESKTOP=false
DIRECT_MODE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --bump|-b)         BUMP="$2"; shift 2 ;;
    --notes|-n)        NOTES="$2"; shift 2 ;;
    --target|-t)       TARGET="$2"; shift 2 ;;
    --skip-publish)    SKIP_PUBLISH=true; shift ;;
    --dry-run)         DRY_RUN=true; shift ;;
    --skip-server)     SKIP_SERVER=true; shift ;;
    --skip-gitee)      SKIP_GITEE=true; shift ;;
    --skip-clean)      SKIP_CLEAN=true; shift ;;
    --skip-copy-desktop) SKIP_COPY_DESKTOP=true; shift ;;
    --direct)          DIRECT_MODE=true; shift ;;
    --win-host)        WIN_HOST="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  66Claw macOS 一键发版                   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

START_TIME=$(date +%s)

# ═══════════════════════════════════════════════════════════════════
# Step 1: 清理旧缓存
# ═══════════════════════════════════════════════════════════════════

if $SKIP_CLEAN; then
  echo "[Step 1/$TOTAL_STEPS] Skipping clean (--skip-clean)"
else
  echo "[Step 1/$TOTAL_STEPS] Cleaning old artifacts..."

  # Clean generated build artifacts
  if [ -d "$REPO_ROOT/build" ]; then
    rm -rf "$REPO_ROOT/build"
    echo "  Cleaned: build/"
  fi

  # 清理 ui-cn 前端构建
  if [ -d "$REPO_ROOT/ui-cn/dist" ]; then
    rm -rf "$REPO_ROOT/ui-cn/dist"
    echo "  Cleaned: ui-cn/dist/"
  fi

  # 清理 stage-dist 临时目录
  if [ -d "$SCRIPT_DIR/_dist" ]; then
    rm -rf "$SCRIPT_DIR/_dist"
    echo "  Cleaned: apps/desktop/_dist/"
  fi

  # 清理旧 bundle 产物（保留 Rust 编译缓存加速增量编译）
  local_bundle_dmg="$SCRIPT_DIR/src-tauri/target/release/bundle/dmg"
  local_bundle_macos="$SCRIPT_DIR/src-tauri/target/release/bundle/macos"
  [ -d "$local_bundle_dmg" ] && rm -rf "$local_bundle_dmg" && echo "  Cleaned: bundle/dmg/"
  [ -d "$local_bundle_macos" ] && rm -rf "$local_bundle_macos" && echo "  Cleaned: bundle/macos/"

  # x64 交叉编译 bundle 也清理
  local_bundle_dmg_x64="$SCRIPT_DIR/src-tauri/target/x86_64-apple-darwin/release/bundle/dmg"
  local_bundle_macos_x64="$SCRIPT_DIR/src-tauri/target/x86_64-apple-darwin/release/bundle/macos"
  [ -d "$local_bundle_dmg_x64" ] && rm -rf "$local_bundle_dmg_x64" && echo "  Cleaned: bundle/dmg/ (x64)"
  [ -d "$local_bundle_macos_x64" ] && rm -rf "$local_bundle_macos_x64" && echo "  Cleaned: bundle/macos/ (x64)"

  # 清理旧 releases（当前架构或双架构）
  if [ "$TARGET" = "all-mac" ]; then
    for arch in mac-arm64 mac-x64; do
      [ -d "$RELEASES_DIR/$arch" ] && rm -rf "$RELEASES_DIR/$arch" && echo "  Cleaned: releases/$arch/"
    done
  elif [ -d "$RELEASES_DIR/$TARGET" ]; then
    rm -rf "$RELEASES_DIR/$TARGET"
    echo "  Cleaned: releases/$TARGET/"
  fi

  echo "[Step 1/$TOTAL_STEPS] Clean done"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════
# Step 2: 升版本号（可选）
# ═══════════════════════════════════════════════════════════════════

if [ -n "$BUMP" ]; then
  echo "[Step 2/$TOTAL_STEPS] Bumping version: $BUMP"
  VERSION_FILE="$SCRIPT_DIR/version.json"
  CURRENT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$VERSION_FILE','utf-8')).version)")
  PARTS=(${CURRENT//./ })

  case "$BUMP" in
    patch) NEW_VERSION="${PARTS[0]}.${PARTS[1]}.$((${PARTS[2]} + 1))" ;;
    minor) NEW_VERSION="${PARTS[0]}.$((${PARTS[1]} + 1)).0" ;;
    major) NEW_VERSION="$((${PARTS[0]} + 1)).0.0" ;;
    *)
      if echo "$BUMP" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
        NEW_VERSION="$BUMP"
      else
        echo "ERROR: '$BUMP' is not valid (use patch/minor/major or x.y.z)"
        exit 1
      fi
      ;;
  esac

  echo "  $CURRENT -> $NEW_VERSION"
  echo "{\"version\": \"$NEW_VERSION\"}" | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
    require('fs').writeFileSync('$VERSION_FILE', JSON.stringify(d, null, 2) + '\n');
  "
else
  CURRENT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SCRIPT_DIR/version.json','utf-8')).version)")
  echo "[Step 2/$TOTAL_STEPS] Version: $CURRENT (no bump)"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════
# Step 3: Build, sign, package, and test
# release.sh 内部已包含：build + tauri build + 功能测试
# ═══════════════════════════════════════════════════════════════════

echo "[Step 3/$TOTAL_STEPS] Building (build + sign + package + test)..."
echo ""

if [ -n "$BUMP" ]; then
  bash "$SCRIPT_DIR/release.sh" "$TARGET" --version "$NEW_VERSION"
else
  bash "$SCRIPT_DIR/release.sh" "$TARGET"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════
# Step 4: 发布（通过 Windows 中转，或 --direct 直连）
# ═══════════════════════════════════════════════════════════════════

if $SKIP_PUBLISH; then
  echo "[Step 4/$TOTAL_STEPS] Skipping publish (--skip-publish)"
elif $DIRECT_MODE; then
  # 直连模式：macOS 能上网时直接发布
  echo "[Step 4/$TOTAL_STEPS] Publishing (direct mode)..."
  echo ""

  PUBLISH_ARGS=""
  [ -n "$NOTES" ] && PUBLISH_ARGS="$PUBLISH_ARGS --notes \"$NOTES\""
  $DRY_RUN && PUBLISH_ARGS="$PUBLISH_ARGS --dry-run"
  $SKIP_SERVER && PUBLISH_ARGS="$PUBLISH_ARGS --skip-server"
  $SKIP_GITEE && PUBLISH_ARGS="$PUBLISH_ARGS --skip-gitee"

  eval bash "$SCRIPT_DIR/publish-release-mac.sh" $PUBLISH_ARGS
else
  # 中转模式：SCP 到 Windows → Windows 发布
  echo "[Step 4/$TOTAL_STEPS] Publishing via Windows relay ($WIN_HOST)..."

  # 检查 SSH 连通性
  if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$WIN_USER@$WIN_HOST" "echo ok" >/dev/null 2>&1; then
    echo ""
    echo "  ERROR: Cannot SSH to $WIN_USER@$WIN_HOST" >&2
    echo "  Please setup SSH key first:" >&2
    echo "    ssh-copy-id $WIN_USER@$WIN_HOST" >&2
    echo "" >&2
    echo "  Or use --direct mode if macOS can access the internet." >&2
    exit 1
  fi

  # SCP 产物到 Windows（支持 all-mac 双架构）
  SCP_TARGETS=""
  if [ "$TARGET" = "all-mac" ]; then
    SCP_TARGETS="mac-arm64 mac-x64"
  else
    SCP_TARGETS="$TARGET"
  fi

  for scp_target in $SCP_TARGETS; do
    WIN_RELEASES="$WIN_REPO/apps/desktop/releases/$scp_target"
    ssh "$WIN_USER@$WIN_HOST" "mkdir -p '$WIN_RELEASES'" 2>/dev/null || true

    echo "  SCP artifacts to $WIN_HOST:$WIN_RELEASES/ ..."
    SCP_FILES=""
    for f in "$RELEASES_DIR/$scp_target/"*.app.tar.gz "$RELEASES_DIR/$scp_target/"*.app.tar.gz.sig "$RELEASES_DIR/$scp_target/"*.dmg; do
      [ -f "$f" ] && SCP_FILES="$SCP_FILES $f"
    done

    if [ -z "$SCP_FILES" ]; then
      echo "  ERROR: No artifacts found in $RELEASES_DIR/$scp_target/" >&2
      exit 1
    fi

    if $DRY_RUN; then
      for f in $SCP_FILES; do
        echo "  [DRY RUN] Would SCP $(basename "$f")"
      done
    else
      scp $SCP_FILES "$WIN_USER@$WIN_HOST:$WIN_RELEASES/"
      echo "  SCP done ($scp_target)"
    fi
  done

  # SSH 触发 Windows 发布脚本
  echo "  Triggering Windows publish..."
  WIN_PUBLISH_CMD="powershell -ExecutionPolicy Bypass -File '$WIN_REPO/apps/desktop/publish-from-windows.ps1' -Platform mac"
  [ -n "$NOTES" ] && WIN_PUBLISH_CMD="$WIN_PUBLISH_CMD -Notes '$NOTES'"
  $DRY_RUN && WIN_PUBLISH_CMD="$WIN_PUBLISH_CMD -DryRun"
  $SKIP_SERVER && WIN_PUBLISH_CMD="$WIN_PUBLISH_CMD -SkipServer"
  $SKIP_GITEE && WIN_PUBLISH_CMD="$WIN_PUBLISH_CMD -SkipGitee"

  if $DRY_RUN; then
    echo "  [DRY RUN] Would SSH: $WIN_PUBLISH_CMD"
  else
    ssh "$WIN_USER@$WIN_HOST" "$WIN_PUBLISH_CMD"
    if [ $? -ne 0 ]; then
      echo "  ERROR: Windows publish failed!" >&2
      exit 1
    fi
  fi
fi
echo ""

# ═══════════════════════════════════════════════════════════════════
# Step 5: 复制安装包到桌面
# ═══════════════════════════════════════════════════════════════════

VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SCRIPT_DIR/version.json','utf-8')).version)")

if $SKIP_COPY_DESKTOP; then
  echo "[Step 5/$TOTAL_STEPS] Skipping copy to Desktop (--skip-copy-desktop)"
else
  echo "[Step 5/$TOTAL_STEPS] Copying installer to Desktop..."

  DESKTOP_DIR="$HOME/Desktop"
  COPIED=0

  # all-mac 时复制两个架构，否则只复制当前
  COPY_TARGETS=""
  if [ "$TARGET" = "all-mac" ]; then
    COPY_TARGETS="mac-arm64 mac-x64"
  else
    COPY_TARGETS="$TARGET"
  fi

  for copy_target in $COPY_TARGETS; do
    # 复制 DMG
    DMG_FILE=$(ls "$RELEASES_DIR/$copy_target/"*.dmg 2>/dev/null | head -1 || echo "")
    if [ -n "$DMG_FILE" ]; then
      DST_NAME="66Claw-${copy_target}-v${VERSION}.dmg"
      cp "$DMG_FILE" "$DESKTOP_DIR/$DST_NAME"
      SIZE=$(du -h "$DMG_FILE" | cut -f1)
      echo "  Installer: ~/Desktop/$DST_NAME ($SIZE)"
      COPIED=$((COPIED + 1))
    fi

    # 复制热更新包 (.app.tar.gz)
    TAR_FILE=$(ls "$RELEASES_DIR/$copy_target/"*"${VERSION}.app.tar.gz" 2>/dev/null | head -1 || echo "")
    if [ -n "$TAR_FILE" ]; then
      DST_NAME="66Claw-${copy_target}-v${VERSION}-update.app.tar.gz"
      cp "$TAR_FILE" "$DESKTOP_DIR/$DST_NAME"
      SIZE=$(du -h "$TAR_FILE" | cut -f1)
      echo "  Update:    ~/Desktop/$DST_NAME ($SIZE)"
      COPIED=$((COPIED + 1))
    fi
  done

  if [ $COPIED -eq 0 ]; then
    echo "  WARN: No artifacts found to copy"
  fi
fi

# ═══════════════════════════════════════════════════════════════════
# 完成
# ═══════════════════════════════════════════════════════════════════

END_TIME=$(date +%s)
ELAPSED=$(( (END_TIME - START_TIME) / 60 ))

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ALL DONE - v$VERSION (${ELAPSED}min)  "
echo "╚══════════════════════════════════════════╝"
echo ""

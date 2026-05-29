#!/usr/bin/env bash
###############################################################################
# 66Claw macOS 本地功能测试脚本（直接在 Mac 上运行，无 SSH）
#
# 被 release.sh 自动调用（构建后立即测试），也可手动执行：
#   bash ci/test-macos-local.sh                      # 测最新 DMG
#   bash ci/test-macos-local.sh --dmg /path/to.dmg  # 指定 DMG
#   bash ci/test-macos-local.sh --no-cleanup         # 测后不卸载
#   bash ci/test-macos-local.sh --quick              # 跳过 WebSocket 探测（快速模式）
#
# 测试项：
#   P01 bundled node 版本 >= v20
#   P02 进程启动 + 5s 存活
#   P03 Gateway 端口监听
#   P04 cn-adapter 注册完成
#   P05 OEM 品牌加载
#   P06 License / Voice gateway handlers 注册
#   P08 Gateway unknown method 检测（cn-adapter 关键方法是否注册）
#   P09 memory-core 扩展目录检查
#   P10 运行时缺包检测（ERR_MODULE_NOT_FOUND）
#   P11 关键 node_modules 存在（ws / express / zod）
#   P12 WebSocket 端口连通性（curl）
#   P13 Gateway HTTP /health 探测
#   P14 崩溃报告检测
#   P15 gateway-error.log 无致命错误
###############################################################################

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASES_DIR="$REPO_ROOT/apps/desktop/releases"

DMG_PATH=""
NO_CLEANUP=false
QUICK=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dmg)        DMG_PATH="$2"; shift 2 ;;
    --no-cleanup) NO_CLEANUP=true; shift ;;
    --quick)      QUICK=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# 找最新 DMG
if [ -z "$DMG_PATH" ]; then
  DMG_PATH=$(ls -t "$RELEASES_DIR"/mac-arm64/*.dmg 2>/dev/null | head -1 || echo "")
  if [ -z "$DMG_PATH" ]; then
    # 也尝试 mac-x64
    DMG_PATH=$(ls -t "$RELEASES_DIR"/mac-x64/*.dmg 2>/dev/null | head -1 || echo "")
  fi
  if [ -z "$DMG_PATH" ]; then
    echo "ERROR: No DMG found in $RELEASES_DIR/" >&2; exit 1
  fi
fi

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
PASS=0; FAIL=0; WARN=0
MOUNT_POINT=""; APP_INSTALLED=""; APP_PID=""
BUNDLED_NODE=""

pass()    { echo -e "  ${GREEN}[PASS]${NC} $1"; ((PASS++)); }
fail()    { echo -e "  ${RED}[FAIL]${NC} $1"; ((FAIL++)); }
warn()    { echo -e "  ${YELLOW}[WARN]${NC} $1"; ((WARN++)); }
info()    { echo -e "  ${CYAN}[INFO]${NC} $1"; }
section() { echo ""; echo "── $1 ──────────────────────────────────"; }

cleanup() {
  if [ -n "$APP_PID" ]; then
    kill "$APP_PID" 2>/dev/null || pkill -f "openclawcn-desktop" 2>/dev/null || true
    sleep 2
  fi
  if [ "$NO_CLEANUP" != "true" ]; then
    [ -n "$APP_INSTALLED" ] && rm -rf "$APP_INSTALLED" 2>/dev/null && \
      echo "  [cleanup] 已卸载 $APP_INSTALLED"
  fi
  [ -n "$MOUNT_POINT" ] && hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
}
trap cleanup EXIT

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 66Claw macOS 功能测试（本地）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DMG  : $DMG_PATH"
echo "  Quick: $QUICK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

###############################################################################
# 准备：挂载 DMG，安装 app
###############################################################################
section "准备：安装 app"

MOUNT_POINT=$(mktemp -d /tmp/mac-test-XXXXXX)
hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -nobrowse -quiet 2>/dev/null || {
  fail "DMG 挂载失败: $DMG_PATH"; exit 1
}

APP_IN_DMG=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -type d | head -1)
[ -z "$APP_IN_DMG" ] && { fail "DMG 中无 .app"; exit 1; }
APP_NAME=$(basename "$APP_IN_DMG")
APP_INSTALLED="/Applications/$APP_NAME"

rm -rf "$APP_INSTALLED" 2>/dev/null || true
cp -R "$APP_IN_DMG" /Applications/ 2>/dev/null || { fail ".app 复制失败"; exit 1; }
xattr -dr com.apple.quarantine "$APP_INSTALLED" 2>/dev/null || true
info "已安装: $APP_INSTALLED"

DIST_DIR="$APP_INSTALLED/Contents/Resources/_dist"
LOG_DIR="$HOME/Library/Logs/openclawcn"
mkdir -p "$LOG_DIR"

###############################################################################
# P01: bundled node 版本验证
###############################################################################
section "P01 bundled node 验证"

BUNDLED_NODE="$DIST_DIR/node/bin/node"
if [ -f "$BUNDLED_NODE" ]; then
  NODE_VER=$("$BUNDLED_NODE" --version 2>/dev/null || echo "?")
  NODE_ARCH=$(file "$BUNDLED_NODE" | grep -o 'arm64\|x86_64' || echo "?")
  pass "bundled node 存在: $NODE_VER ($NODE_ARCH)"
  MAJOR=$(echo "$NODE_VER" | grep -o 'v[0-9]*' | head -1 | tr -d 'v')
  if [ "${MAJOR:-0}" -ge 20 ]; then
    pass "node 版本 >= v20"
  else
    fail "node 版本 $NODE_VER < v20（可能不兼容 ESM 扩展）"
  fi
else
  fail "bundled node 不存在 ($BUNDLED_NODE)，用户无 node 时将联网下载，国内失败"
fi

###############################################################################
# 启动 app
###############################################################################
section "启动 app（等待 20s）"

# 清空旧日志
> "$LOG_DIR/sidecar.log"  2>/dev/null || true
> "$LOG_DIR/gateway-error.log" 2>/dev/null || true

CRASH_BEFORE=$(ls -t "$HOME/Library/Logs/DiagnosticReports/"*66Claw*.ips 2>/dev/null | head -1 || echo "")

# 兼容 SSH session（无桌面）
CONSOLE_UID=$(id -u "$(stat -f "%Su" /dev/console 2>/dev/null || echo "")" 2>/dev/null || echo "")
if [ -n "$CONSOLE_UID" ]; then
  launchctl asuser "$CONSOLE_UID" open -g "$APP_INSTALLED" 2>/dev/null || \
    open -g "$APP_INSTALLED" 2>/dev/null || true
else
  open -g "$APP_INSTALLED" 2>/dev/null || true
fi

sleep 20

APP_PID=$(pgrep -f "openclawcn-desktop" 2>/dev/null | head -1 || echo "")
if [ -n "$APP_PID" ]; then
  RSS=$(ps -p "$APP_PID" -o rss= 2>/dev/null | tr -d ' ' || echo "0")
  RSS_MB=$((RSS / 1024))
  pass "进程已启动: PID $APP_PID (${RSS_MB}MB)"
else
  fail "进程未启动"
  info "gateway-error.log:"
  tail -15 "$LOG_DIR/gateway-error.log" 2>/dev/null || true
  exit 1
fi

sleep 5
if ! pgrep -f "openclawcn-desktop" &>/dev/null; then
  fail "进程在 5s 内退出（崩溃？）"
  tail -20 "$LOG_DIR/sidecar.log" 2>/dev/null || true
  exit 1
fi
pass "进程启动后 5s 仍存活"

SIDECAR_LOG="$LOG_DIR/sidecar.log"

###############################################################################
# P03: Gateway 端口检测
###############################################################################
section "P03 Gateway 端口检测"

GW_PORT=$(grep -oE 'port=[0-9]+|localhost:[0-9]+|127\.0\.0\.1:[0-9]+' "$SIDECAR_LOG" 2>/dev/null \
  | grep -oE '[0-9]{4,5}' | tail -1 || echo "")

if [ -z "$GW_PORT" ]; then
  for p in 3666 19002 3000 4000 8080 8888; do
    if nc -z 127.0.0.1 "$p" 2>/dev/null; then
      GW_PORT="$p"; break
    fi
  done
fi

if [ -z "$GW_PORT" ] && [ -n "$APP_PID" ]; then
  GW_PORT=$(lsof -p "$APP_PID" -iTCP -sTCP:LISTEN -n -P 2>/dev/null \
    | awk 'NR>1{print $9}' | grep -oE ':[0-9]+' | tr -d ':' | head -1 || echo "")
fi

if [ -n "$GW_PORT" ]; then
  pass "Gateway 监听端口: $GW_PORT"
else
  warn "未能探测到 Gateway 端口（后续 HTTP/WS 测试将跳过）"
fi

###############################################################################
# P04: cn-adapter 注册
###############################################################################
section "P04 cn-adapter 注册"

sleep 2  # 确保日志写入

# Primary check: /health endpoint (served by cn-adapter HTTP route handler)
# If /health returns {"ok":true}, cn-adapter is loaded and registered.
CN_STATUS_OK=false
if [ -n "$GW_PORT" ]; then
  HEALTH_BODY=$(curl -s --max-time 5 "http://127.0.0.1:$GW_PORT/health" 2>/dev/null || echo "")
  if echo "$HEALTH_BODY" | grep -q '"ok":true' 2>/dev/null; then
    CN_STATUS_OK=true
    pass "cn-adapter 注册成功 (via /health API)"
  fi
fi

# Fallback: check sidecar.log for registration message
if [ "$CN_STATUS_OK" != "true" ]; then
  if grep -q "注册完成\|v0\.1\.0 注册完成" "$SIDECAR_LOG" 2>/dev/null; then
    pass "cn-adapter 注册成功 (via log)"
  else
    fail "cn-adapter 注册失败（/health 不可用且未见日志「注册完成」）"
    info "sidecar.log 末尾:"
    tail -10 "$SIDECAR_LOG" 2>/dev/null || true
  fi
fi

###############################################################################
# P05: OEM 品牌
###############################################################################
section "P05 OEM 品牌"

if grep -q "品牌已加载\|oem.*品牌" "$SIDECAR_LOG" 2>/dev/null; then
  OEM_BRAND=$(grep "品牌已加载" "$SIDECAR_LOG" 2>/dev/null | tail -1 | sed 's/.*品牌已加载: //')
  pass "OEM 品牌: $OEM_BRAND"
else
  warn "OEM 品牌未见加载日志"
fi

###############################################################################
# P06: License / Voice handlers
###############################################################################
section "P06 License & Voice handlers"

if grep -q "License gateway handlers registered" "$SIDECAR_LOG" 2>/dev/null; then
  pass "License gateway handlers 注册成功"
else
  warn "License handlers 未见注册日志"
fi

if grep -q "Voice gateway handlers registered" "$SIDECAR_LOG" 2>/dev/null; then
  pass "Voice gateway handlers 注册成功"
else
  warn "Voice handlers 未见注册日志"
fi

TOOLS_LINE=$(grep "Registered tools:" "$SIDECAR_LOG" 2>/dev/null | tail -1 || echo "")
if [ -n "$TOOLS_LINE" ]; then
  pass "CN tools: $(echo "$TOOLS_LINE" | sed 's/.*Registered tools: //')"
else
  warn "CN tools 未见注册日志"
fi

###############################################################################
# P07: integrity hash
###############################################################################
# P08: unknown method 检测
###############################################################################
section "P08 Gateway unknown method 检测"

UNKNOWN_METHODS=$(grep "unknown method" "$SIDECAR_LOG" 2>/dev/null \
  | grep -oE 'unknown method[: ]+[a-zA-Z0-9._-]+' \
  | sed 's/unknown method[: ]*//' \
  | sort | uniq -c | sort -rn || echo "")

if [ -z "$UNKNOWN_METHODS" ]; then
  pass "无 unknown method（cn-adapter 方法全部注册成功）"
else
  UNKNOWN_COUNT=$(echo "$UNKNOWN_METHODS" | grep -c '[^ ]' || echo 0)
  warn "$UNKNOWN_COUNT 种 unknown method:"
  echo "$UNKNOWN_METHODS" | while read -r line; do echo "    $line"; done

  # cn-adapter ui-bridge.ts 实现的关键方法，若仍 unknown 说明加载失败
  CRITICAL_METHODS="capability_matrix.providers.list capability_matrix.summary update.status asr.status asr.stream.status"
  CRITICAL_FAIL=0
  for m in $CRITICAL_METHODS; do
    if echo "$UNKNOWN_METHODS" | grep -qw "$m"; then
      fail "ui-bridge 方法未注册: $m（ui-bridge.ts 加载失败？）"
      CRITICAL_FAIL=$((CRITICAL_FAIL + 1))
    fi
  done
  [ "$CRITICAL_FAIL" -eq 0 ] && \
    pass "cn-adapter 关键方法全部注册（unknown 均为上游未实现方法）"
fi

###############################################################################
# P09: memory-core 扩展目录
###############################################################################
section "P09 memory-core 扩展"

if grep -q "plugin not found: memory-core\|memory-core.*not found" "$SIDECAR_LOG" 2>/dev/null; then
  fail "memory-core 插件未找到"
else
  pass "memory-core 无加载失败日志"
fi

MEMORY_DIR="$DIST_DIR/extensions/memory-core"
if [ -d "$MEMORY_DIR" ]; then
  PKG="$MEMORY_DIR/package.json"
  if [ -f "$PKG" ]; then
    if [ -n "$BUNDLED_NODE" ] && [ -f "$BUNDLED_NODE" ]; then
      ENTRY=$("$BUNDLED_NODE" -e "
const d=JSON.parse(require('fs').readFileSync('$PKG'));
const oc=d.openclaw||{};
const e=oc.extensions||[];
console.log(e[0]||d.main||'?');
" 2>/dev/null || echo "?")
    else
      ENTRY=$(grep -o '"main"[[:space:]]*:[[:space:]]*"[^"]*"' "$PKG" | head -1 | sed 's/.*"://;s/"//g' || echo "?")
    fi
    pass "memory-core 存在，入口: $ENTRY"
  else
    warn "memory-core/package.json 缺失"
  fi
else
  fail "memory-core 目录不存在: $MEMORY_DIR"
fi

###############################################################################
# P10: 运行时缺包检测
###############################################################################
section "P10 运行时缺包检测"

MISSING_PKGS=$(grep -h "ERR_MODULE_NOT_FOUND\|Cannot find package\|Cannot find module" \
  "$SIDECAR_LOG" "$LOG_DIR/gateway-error.log" 2>/dev/null \
  | grep -oE "'[^']+'" | sort -u || echo "")

if [ -z "$MISSING_PKGS" ]; then
  pass "无 ERR_MODULE_NOT_FOUND 错误"
else
  MISS_COUNT=$(echo "$MISSING_PKGS" | grep -c '[^ ]' || echo 0)
  fail "$MISS_COUNT 个包找不到:"
  echo "$MISSING_PKGS" | while read -r p; do echo "    缺失: $p"; done
fi

###############################################################################
# P11: 关键 node_modules 存在
###############################################################################
section "P11 关键 node_modules"

NM="$DIST_DIR/node_modules"
for pkg in ws express zod @homebridge/ciao; do
  # 处理 scoped 包
  PKG_DIR="$NM/$pkg"
  if [ -d "$PKG_DIR" ]; then
    pass "node_modules/$pkg ✓"
  else
    fail "node_modules/$pkg 不存在（stage-dist.sh 未正确安装）"
  fi
done

###############################################################################
# P12: WebSocket 端口连通性
###############################################################################
section "P12 WebSocket 端口连通性"

if [ -z "$GW_PORT" ]; then
  warn "跳过（未探测到端口）"
elif [ "$QUICK" = "true" ]; then
  warn "跳过（--quick 模式）"
else
  WS_RESP=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Upgrade: websocket" \
    -H "Connection: Upgrade" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    -H "Sec-WebSocket-Version: 13" \
    --max-time 5 \
    "http://127.0.0.1:$GW_PORT/" 2>/dev/null || echo "000")
  WS_STATUS="${WS_RESP:0:3}"

  case "$WS_STATUS" in
    101) pass "WebSocket 握手成功（101 Switching Protocols）" ;;
    200|400) pass "HTTP 端点响应正常（$WS_STATUS）" ;;
    401) pass "Gateway 响应 401（认证保护，行为符合预期）" ;;
    000) fail "连接失败（端口 $GW_PORT 无响应）" ;;
    *)
      if nc -z 127.0.0.1 "$GW_PORT" 2>/dev/null; then
        pass "Gateway 端口 $GW_PORT 开放（响应: $WS_STATUS）"
      else
        warn "非预期响应码: $WS_STATUS"
      fi ;;
  esac
fi

###############################################################################
# P13: Gateway HTTP /health
###############################################################################
section "P13 Gateway HTTP /health"

if [ -z "$GW_PORT" ]; then
  warn "跳过（未探测到端口）"
elif [ "$QUICK" = "true" ]; then
  warn "跳过（--quick 模式）"
else
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 5 "http://127.0.0.1:$GW_PORT/health" 2>/dev/null || echo "000")
  case "$HTTP_CODE" in
    200) pass "Gateway /health 200 OK" ;;
    401) pass "Gateway /health 401（认证保护）" ;;
    000) fail "Gateway /health 无响应" ;;
    *)   warn "Gateway /health 响应 $HTTP_CODE（非预期）" ;;
  esac
fi

###############################################################################
# P14: 崩溃报告检测
###############################################################################
section "P14 崩溃报告"

CRASH_AFTER=$(ls -t "$HOME/Library/Logs/DiagnosticReports/"*66Claw*.ips 2>/dev/null | head -1 || echo "")
if [ -n "$CRASH_AFTER" ] && [ "$CRASH_AFTER" != "$CRASH_BEFORE" ]; then
  CRASH_TIME=$(stat -f "%Sm" "$CRASH_AFTER" 2>/dev/null || echo "?")
  fail "本次测试产生崩溃报告: $(basename "$CRASH_AFTER") ($CRASH_TIME)"
  head -30 "$CRASH_AFTER" 2>/dev/null || true
else
  pass "无新崩溃报告"
fi

###############################################################################
# P15: gateway-error.log 致命错误
###############################################################################
section "P15 gateway-error.log"

FATAL=$(grep -i "fatal\|panic\|SIGABRT\|SIGSEGV\|killed\|out of memory" \
  "$LOG_DIR/gateway-error.log" 2>/dev/null || echo "")
if [ -n "$FATAL" ]; then
  fail "gateway-error.log 含致命错误:"
  echo "$FATAL" | head -10 | while read -r l; do echo "    $l"; done
else
  pass "gateway-error.log 无致命错误"
fi

###############################################################################
# 汇总
###############################################################################
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 功能测试结果汇总"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}PASS${NC}: $PASS"
echo -e "  ${RED}FAIL${NC}: $FAIL"
echo -e "  ${YELLOW}WARN${NC}: $WARN"
echo ""

# sidecar.log 摘要（关键 cn-adapter 行）
echo "── sidecar.log 关键行 ────────────────────────────────"
grep -E "cn-adapter|gateway|license|ERROR|WARN|unknown method|integrity|memory-core" \
  "$SIDECAR_LOG" 2>/dev/null | tail -25 || echo "  (无日志)"
echo ""

echo "── gateway-error.log 末尾 ────────────────────────────"
tail -8 "$LOG_DIR/gateway-error.log" 2>/dev/null || echo "  (无错误日志)"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}✓ 功能测试全部通过 ($PASS PASS, $WARN WARN)${NC}"
  EXIT_CODE=0
else
  echo -e "  ${RED}✗ $FAIL 个功能测试失败${NC}"
  EXIT_CODE=1
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit $EXIT_CODE

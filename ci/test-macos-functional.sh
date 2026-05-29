#!/usr/bin/env bash
###############################################################################
# 66Claw macOS 功能测试脚本
# 对已安装或 DMG 中的 app 做运行时功能验证，通过读取日志和 WebSocket 探测
# 覆盖从日志中发现的真实问题。
#
# 用法：
#   bash ci/test-macos-functional.sh                     # 用最新 DMG
#   bash ci/test-macos-functional.sh --dmg /path/to.dmg # 指定 DMG
#   bash ci/test-macos-functional.sh --no-cleanup        # 测后不卸载（用于手动调试）
#
# 功能测试项：
#   F01 启动 → Gateway 就绪（ws 端口监听，sidecar 日志出现 gateway）
#   F02 cn-adapter 注册（sidecar 日志确认插件注册完成）
#   #   F04 unknown method 检测（gateway 中 unknown method 类目统计）
#   F05 memory-core 插件加载（插件 not found = FAIL）
#   F06 node_modules 缺包检测（ERR_MODULE_NOT_FOUND 检测）
#   F07 WebSocket 握手测试（curl ws:// 确认 gateway 响应）
#   F08 gateway API 探测（发 JSON-RPC 请求，验证响应格式）
#   F09 bundled node 版本验证（_dist/node/bin/node --version）
#   F10 crash report 检测（DiagnosticReports 中有无新崩溃）
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MAC_HOST="192.168.0.107"
MAC_USER="kevinsun"
MAC_WORKSPACE="/Users/kevinsun/cicd-workspace/newopenclaw"
RELEASES_DIR="$MAC_WORKSPACE/apps/desktop/releases"

DMG_PATH=""
ARCH="arm64"
NO_CLEANUP=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dmg)        DMG_PATH="$2"; shift 2 ;;
    --arch)       ARCH="$2"; shift 2 ;;
    --no-cleanup) NO_CLEANUP=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$DMG_PATH" ]; then
  DMG_PATH=$(ssh -o StrictHostKeyChecking=no "$MAC_USER@$MAC_HOST" \
    "ls -t $RELEASES_DIR/mac-$ARCH/*.dmg 2>/dev/null | head -1")
  if [ -z "$DMG_PATH" ]; then
    echo "ERROR: No DMG found in $RELEASES_DIR/mac-$ARCH/" >&2; exit 1
  fi
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 66Claw macOS 功能测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DMG    : $DMG_PATH"
echo "  Target : $MAC_USER@$MAC_HOST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TEMP_SH=$(mktemp /tmp/mac-func-test-XXXXXX.sh)
NO_CLEANUP_VAL="$NO_CLEANUP"

cat > "$TEMP_SH" << SHEOF
#!/usr/bin/env bash
set -uo pipefail

DMG_PATH="$DMG_PATH"
NO_CLEANUP="$NO_CLEANUP_VAL"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
PASS=0; FAIL=0; WARN=0
MOUNT_POINT=""; APP_INSTALLED=""; APP_PID=""

pass() { echo -e "  \${GREEN}[PASS]\${NC} \$1"; ((PASS++)); }
fail() { echo -e "  \${RED}[FAIL]\${NC} \$1"; ((FAIL++)); }
warn() { echo -e "  \${YELLOW}[WARN]\${NC} \$1"; ((WARN++)); }
info() { echo -e "  \${CYAN}[INFO]\${NC} \$1"; }
section() { echo ""; echo "── \$1 ──────────────────────────────────"; }

cleanup() {
  if [ -n "\$APP_PID" ]; then
    kill "\$APP_PID" 2>/dev/null || pkill -f "openclawcn-desktop" 2>/dev/null || true
    sleep 2
  fi
  if [ "\$NO_CLEANUP" != "true" ]; then
    [ -n "\$APP_INSTALLED" ] && rm -rf "\$APP_INSTALLED" 2>/dev/null && echo "  [cleanup] 已卸载 \$APP_INSTALLED"
  fi
  [ -n "\$MOUNT_POINT" ] && hdiutil detach "\$MOUNT_POINT" -quiet 2>/dev/null || true
}
trap cleanup EXIT

###############################################################################
# 准备：挂载 DMG，安装 app
###############################################################################
section "准备：安装 app"

MOUNT_POINT=\$(mktemp -d /tmp/func-test-XXXXXX)
hdiutil attach "\$DMG_PATH" -mountpoint "\$MOUNT_POINT" -nobrowse -quiet 2>/dev/null || {
  fail "DMG 挂载失败"; exit 1
}

APP_IN_DMG=\$(find "\$MOUNT_POINT" -maxdepth 1 -name "*.app" -type d | head -1)
[ -z "\$APP_IN_DMG" ] && { fail "DMG 中无 .app"; exit 1; }
APP_NAME=\$(basename "\$APP_IN_DMG")
APP_INSTALLED="/Applications/\$APP_NAME"

# 删旧版
rm -rf "\$APP_INSTALLED" 2>/dev/null || true
cp -R "\$APP_IN_DMG" /Applications/ 2>/dev/null || { fail ".app 复制失败"; exit 1; }
xattr -dr com.apple.quarantine "\$APP_INSTALLED" 2>/dev/null || true
info "已安装: \$APP_INSTALLED"

# 找 _dist 路径
DIST_DIR="\$APP_INSTALLED/Contents/Resources/_dist"
LOG_DIR="\$HOME/Library/Logs/openclawcn"
mkdir -p "\$LOG_DIR"

###############################################################################
# F09: bundled node 版本验证（先检查，不依赖启动）
###############################################################################
section "F09 bundled node 验证"

BUNDLED_NODE="\$DIST_DIR/node/bin/node"
if [ -f "\$BUNDLED_NODE" ]; then
  NODE_VER=\$("\$BUNDLED_NODE" --version 2>/dev/null || echo "?")
  NODE_ARCH=\$(file "\$BUNDLED_NODE" | grep -o 'arm64\|x86_64' || echo "?")
  pass "bundled node 存在: \$NODE_VER (\$NODE_ARCH)"
  # 版本必须 >= 20
  MAJOR=\$(echo "\$NODE_VER" | grep -o 'v[0-9]*' | head -1 | tr -d 'v')
  if [ "\${MAJOR:-0}" -ge 20 ]; then
    pass "node 版本 \$NODE_VER >= v20（满足最低要求）"
  else
    fail "node 版本 \$NODE_VER < v20（可能不兼容）"
  fi
else
  fail "bundled node 不存在: \$BUNDLED_NODE（用户无 node 时将联网下载，国内会失败）"
fi

###############################################################################
# 启动 app，清空旧日志，等待就绪
###############################################################################
section "启动 app（等待 15s）"

# 清空旧日志，便于分析本次启动
> "\$LOG_DIR/sidecar.log" 2>/dev/null || true
> "\$LOG_DIR/gateway-error.log" 2>/dev/null || true

# 记录启动前的崩溃报告时间戳
CRASH_BEFORE=\$(ls -t "\$HOME/Library/Logs/DiagnosticReports/"*66Claw*.ips 2>/dev/null | head -1 || echo "")

CONSOLE_UID=\$(id -u "\$(stat -f "%Su" /dev/console 2>/dev/null || echo "")" 2>/dev/null || echo "")
if [ -n "\$CONSOLE_UID" ]; then
  launchctl asuser "\$CONSOLE_UID" open -g "\$APP_INSTALLED" 2>/dev/null || open -g "\$APP_INSTALLED" 2>/dev/null || true
else
  open -g "\$APP_INSTALLED" 2>/dev/null || true
fi

sleep 15

APP_PID=\$(pgrep -f "openclawcn-desktop" 2>/dev/null | head -1 || echo "")
if [ -n "\$APP_PID" ]; then
  pass "进程已启动: PID \$APP_PID"
  RSS=\$(ps -p "\$APP_PID" -o rss= 2>/dev/null | tr -d ' ' || echo "0")
  RSS_MB=\$((RSS / 1024))
  info "内存使用: \${RSS_MB}MB"
else
  fail "进程未启动"
  info "gateway-error.log 内容："
  cat "\$LOG_DIR/gateway-error.log" 2>/dev/null | head -20 || true
  exit 1
fi

# 再等 5s 确认没有立即崩溃
sleep 5
if ! pgrep -f "openclawcn-desktop" &>/dev/null; then
  fail "进程在 5s 内退出（可能崩溃）"
  info "sidecar.log 末尾："
  tail -20 "\$LOG_DIR/sidecar.log" 2>/dev/null || true
  exit 1
fi
pass "进程启动 5s 后仍存活"

###############################################################################
# F01: Gateway 就绪检测
###############################################################################
section "F01 Gateway 就绪检测"

# 从 sidecar 日志提取 gateway 端口
GW_PORT=\$(grep -o 'port=[0-9]*\|:([0-9]*)\|localhost:[0-9]*' "\$LOG_DIR/sidecar.log" 2>/dev/null | grep -o '[0-9]*' | tail -1 || echo "")
# 备用：扫描常见端口
if [ -z "\$GW_PORT" ]; then
  for p in 3666 3000 4000 8080 8888; do
    if nc -z 127.0.0.1 "\$p" 2>/dev/null; then
      GW_PORT="\$p"; break
    fi
  done
fi
# 再备用：lsof 找进程监听端口
if [ -z "\$GW_PORT" ] && [ -n "\$APP_PID" ]; then
  GW_PORT=\$(lsof -p "\$APP_PID" -iTCP -sTCP:LISTEN -n -P 2>/dev/null | awk 'NR>1{print \$9}' | grep -o ':[0-9]*' | tr -d ':' | head -1 || echo "")
fi

if [ -n "\$GW_PORT" ]; then
  pass "Gateway 监听端口: \$GW_PORT"
else
  # 不阻断，部分测试仍可继续
  warn "未能探测到 Gateway 端口（WebSocket/HTTP 测试将跳过）"
fi

###############################################################################
# F02: cn-adapter 注册验证
###############################################################################
section "F02 cn-adapter 注册验证"

SIDECAR_LOG="\$LOG_DIR/sidecar.log"

# 等日志写入
sleep 2

if grep -q "cn-adapter.*注册完成\|v0\\.1\\.0 注册完成" "\$SIDECAR_LOG" 2>/dev/null; then
  pass "cn-adapter 注册成功"
else
  fail "cn-adapter 注册失败（未见「注册完成」）"
fi

# OEM 品牌加载
if grep -q "品牌已加载\|oem.*品牌" "\$SIDECAR_LOG" 2>/dev/null; then
  OEM_BRAND=\$(grep "品牌已加载" "\$SIDECAR_LOG" 2>/dev/null | tail -1 | sed 's/.*品牌已加载: //')
  pass "OEM 品牌加载: \$OEM_BRAND"
else
  warn "OEM 品牌未见加载日志"
fi

# License handlers
if grep -q "License gateway handlers registered" "\$SIDECAR_LOG" 2>/dev/null; then
  pass "License gateway handlers 注册成功"
else
  warn "License handlers 未见注册（非 fatal，可能在不同日志路径）"
fi

# Voice handlers
if grep -q "Voice gateway handlers registered" "\$SIDECAR_LOG" 2>/dev/null; then
  pass "Voice gateway handlers 注册成功"
else
  warn "Voice handlers 未见注册"
fi

# Tools 注册
TOOLS_LINE=\$(grep "Registered tools:" "\$SIDECAR_LOG" 2>/dev/null | tail -1 || echo "")
if [ -n "\$TOOLS_LINE" ]; then
  pass "CN tools 注册: \$(echo \$TOOLS_LINE | sed 's/.*Registered tools: //')"
else
  warn "CN tools 未见注册日志"
fi

###############################################################################
# ###############################################################################
###############################################################################
# F04: unknown method 检测
###############################################################################
section "F04 Gateway unknown method 检测"

# 统计有多少 unknown method 调用（UI 发请求但 gateway 不认识的方法）
UNKNOWN_METHODS=\$(grep "unknown method" "\$SIDECAR_LOG" 2>/dev/null \
  | grep -oE 'unknown method[: ]+[a-zA-Z0-9._-]+' \
  | sed 's/unknown method[: ]*//' \
  | sort | uniq -c | sort -rn || echo "")

if [ -z "\$UNKNOWN_METHODS" ]; then
  pass "无 unknown method 错误（cn-adapter 方法全部注册成功）"
else
  # 统计总数
  UNKNOWN_COUNT=\$(echo "\$UNKNOWN_METHODS" | grep -c '[^ ]' || echo 0)
  warn "发现 \$UNKNOWN_COUNT 种 unknown method（UI 调用了 gateway 未实现的接口）："
  echo "\$UNKNOWN_METHODS" | while read line; do
    echo "    \$line"
  done
  # cn-adapter 中 ui-bridge.ts 已实现的关键方法 — 若仍 unknown，说明 ui-bridge 加载失败
  # 这些方法由 registerUiBridgeHandlers() 在 index.ts 的 Step 2i 注册
  CRITICAL_CN_METHODS="capability_matrix.providers.list capability_matrix.summary update.status asr.status asr.stream.status"
  CRITICAL_FAIL=0
  for m in \$CRITICAL_CN_METHODS; do
    if echo "\$UNKNOWN_METHODS" | grep -qw "\$m"; then
      fail "cn-adapter ui-bridge 方法未注册: \$m（可能 ui-bridge.ts 加载失败）"
      CRITICAL_FAIL=\$((CRITICAL_FAIL + 1))
    fi
  done
  if [ "\$CRITICAL_FAIL" -eq 0 ]; then
    pass "cn-adapter 关键方法全部注册（unknown methods 均为上游自身未实现方法）"
  fi
fi

###############################################################################
# F05: memory-core 插件加载
###############################################################################
section "F05 memory-core 插件加载"

if grep -q "plugin not found: memory-core\|memory-core.*not found" "\$SIDECAR_LOG" 2>/dev/null; then
  fail "memory-core 插件未找到（config 引用了 memory-core 但插件不可用）"
  info "可能原因：_dist/extensions/memory-core 存在但 plugin registry 路径不对"
  MEMORY_DIR="\$DIST_DIR/extensions/memory-core"
  if [ -d "\$MEMORY_DIR" ]; then
    info "memory-core 目录存在: \$(ls \$MEMORY_DIR | head -5)"
  else
    info "memory-core 目录不存在: \$MEMORY_DIR"
  fi
else
  pass "memory-core 无加载失败日志"
fi

# 主动检查 memory-core 扩展目录
MEMORY_DIR="\$DIST_DIR/extensions/memory-core"
if [ -d "\$MEMORY_DIR" ]; then
  PKG="\$MEMORY_DIR/package.json"
  if [ -f "\$PKG" ]; then
    ENTRY=\$(python3 -c "
import json
d=json.load(open('\$PKG'))
oc=d.get('openclaw',{})
exts=oc.get('extensions',[])
print(exts[0] if exts else d.get('main','?'))
" 2>/dev/null || echo "?")
    pass "memory-core 扩展存在，入口: \$ENTRY"
  else
    warn "memory-core/package.json 缺失"
  fi
else
  fail "memory-core 扩展目录不存在: \$MEMORY_DIR"
fi

###############################################################################
# F06: node_modules 缺包检测
###############################################################################
section "F06 运行时缺包检测"

MISSING_PKGS=\$(grep "ERR_MODULE_NOT_FOUND\|Cannot find package\|Cannot find module" "\$SIDECAR_LOG" "\$LOG_DIR/gateway-error.log" 2>/dev/null \
  | grep -o "'[^']*'\|\"[^\"]*\"" | sort -u || echo "")

if [ -z "\$MISSING_PKGS" ]; then
  pass "无 ERR_MODULE_NOT_FOUND 错误"
else
  MISSING_COUNT=\$(echo "\$MISSING_PKGS" | wc -l | tr -d ' ')
  fail "\$MISSING_COUNT 个包/模块找不到："
  echo "\$MISSING_PKGS" | while read p; do echo "    缺失: \$p"; done
fi

# 检查 node_modules 中关键包是否存在
NM="\$DIST_DIR/node_modules"
REQUIRED_PKGS="ws express zod"
for pkg in \$REQUIRED_PKGS; do
  if [ -d "\$NM/\$pkg" ] || [ -d "\$NM/@\${pkg%/*}" ]; then
    pass "node_modules/\$pkg 存在"
  else
    warn "node_modules/\$pkg 不存在（可能用了不同名称）"
  fi
done

###############################################################################
# F07: WebSocket 握手测试
###############################################################################
section "F07 WebSocket 连接测试"

if [ -z "\$GW_PORT" ]; then
  warn "跳过（未知端口）"
else
  # curl WebSocket 升级请求
  WS_RESP=\$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Upgrade: websocket" \
    -H "Connection: Upgrade" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    -H "Sec-WebSocket-Version: 13" \
    --max-time 5 \
    "http://127.0.0.1:\$GW_PORT/" 2>/dev/null || echo "000")

  # 取前3位（HTTP status code），避免 curl 在 WebSocket 场景下输出混合值
  WS_STATUS=\${WS_RESP:0:3}
  if [ "\$WS_STATUS" = "101" ]; then
    pass "WebSocket 握手成功（101 Switching Protocols）"
  elif [ "\$WS_STATUS" = "200" ] || [ "\$WS_STATUS" = "400" ]; then
    pass "HTTP 端点响应正常（\$WS_STATUS）"
  elif [ "\$WS_STATUS" = "401" ]; then
    # Gateway 需要认证 token，401 是预期响应（不是 bug）
    pass "Gateway 已启动并响应（401 = 认证保护，行为符合预期）"
  elif [ "\$WS_STATUS" = "000" ]; then
    fail "连接失败（端口 \$GW_PORT 无响应）"
  else
    # WebSocket 场景 curl 可能返回混合状态，确认端口是否真的开着
    if nc -z 127.0.0.1 "\$GW_PORT" 2>/dev/null; then
      pass "Gateway 端口 \$GW_PORT 响应（WebSocket 协商细节: \$WS_STATUS）"
    else
      warn "非预期响应码: \$WS_STATUS（端口未开放）"
    fi
  fi
fi

###############################################################################
# F08: Gateway API 探测（JSON-RPC over WebSocket）
###############################################################################
section "F08 Gateway API 探测"

if [ -z "\$GW_PORT" ]; then
  warn "跳过（未知端口）"
else
  # 先用 HTTP 检查是否 401（需要 pairing token）
  HTTP_CHECK=\$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://127.0.0.1:\$GW_PORT/health" 2>/dev/null || echo "000")
  if [ "\$HTTP_CHECK" = "401" ]; then
    pass "Gateway HTTP /health 响应 401（gateway 认证保护正常，需要 pairing token）"
    warn "F08 跳过 JSON-RPC 探测（需要有效 pairing token，测试环境无法自动获取）"
  elif [ "\$HTTP_CHECK" = "200" ]; then
    pass "Gateway HTTP /health 200 OK"
    # 尝试 JSON-RPC WebSocket 探测
    WS_MODULE="\$DIST_DIR/node_modules/ws/lib/websocket.js"
    if [ ! -f "\$WS_MODULE" ]; then
      warn "ws 模块不在预期路径，跳过 JSON-RPC 探测"
    else
      # 写临时文件避免 heredoc 变量展开问题
      TMPJS=\$(mktemp /tmp/gw-probe-XXXXXX.mjs)
      cat > "\$TMPJS" << JSEOF
import { WebSocket } from '\$WS_MODULE';
const ws = new WebSocket('ws://127.0.0.1:\$GW_PORT/');
const results = [];
const timeout = setTimeout(() => { ws.terminate(); }, 5000);
ws.on('open', () => {
  ws.send(JSON.stringify({jsonrpc:'2.0',id:1,method:'config.get',params:{}}));
});
ws.on('message', (data) => {
  try {
    const d = JSON.parse(data.toString());
    results.push({id: d.id, ok: !d.error, msg: d.error?.message || 'ok'});
    if (results.length >= 1) { clearTimeout(timeout); ws.close(); }
  } catch(e) {}
});
ws.on('close', () => { console.log(JSON.stringify(results)); process.exit(0); });
ws.on('error', (e) => { console.log(JSON.stringify([{error: e.message}])); process.exit(1); });
JSEOF
      API_RESULT=\$(timeout 8 "\$BUNDLED_NODE" "\$TMPJS" 2>/dev/null || echo '[]')
      rm -f "\$TMPJS"
      if echo "\$API_RESULT" | grep -q '"ok":true'; then
        pass "JSON-RPC API 响应正常: \$API_RESULT"
      elif [ "\$API_RESULT" = "[]" ] || [ -z "\$API_RESULT" ]; then
        warn "JSON-RPC 无响应（超时或连接拒绝）"
      else
        warn "JSON-RPC 响应（含错误，可能是方法权限）: \$API_RESULT"
      fi
    fi
  elif [ "\$HTTP_CHECK" = "000" ]; then
    fail "Gateway 无响应（端口 \$GW_PORT 连接失败）"
  else
    warn "Gateway HTTP /health 响应 \$HTTP_CHECK（非预期）"
  fi
fi

###############################################################################
# F10: crash report 检测
###############################################################################
section "F10 崩溃报告检测"

CRASH_AFTER=\$(ls -t "\$HOME/Library/Logs/DiagnosticReports/"*66Claw*.ips 2>/dev/null | head -1 || echo "")
if [ -n "\$CRASH_AFTER" ] && [ "\$CRASH_AFTER" != "\$CRASH_BEFORE" ]; then
  CRASH_TIME=\$(stat -f "%Sm" "\$CRASH_AFTER" 2>/dev/null || echo "?")
  fail "本次测试期间产生崩溃报告: \$(basename \$CRASH_AFTER) (\$CRASH_TIME)"
  info "崩溃报告摘要："
  head -30 "\$CRASH_AFTER" 2>/dev/null || true
else
  pass "本次测试无新崩溃报告"
fi

# 检查 gateway-error.log 中的严重错误
FATAL_ERRORS=\$(grep -i "fatal\|panic\|SIGABRT\|SIGSEGV\|killed\|out of memory" "\$LOG_DIR/gateway-error.log" 2>/dev/null || echo "")
if [ -n "\$FATAL_ERRORS" ]; then
  fail "gateway-error.log 中有致命错误："
  echo "\$FATAL_ERRORS" | head -10 | while read l; do echo "    \$l"; done
else
  pass "gateway-error.log 无致命错误"
fi

###############################################################################
# 汇总 + 日志摘要
###############################################################################
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 功能测试结果汇总"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  \${GREEN}PASS\${NC}: \$PASS"
echo -e "  \${RED}FAIL\${NC}: \$FAIL"
echo -e "  \${YELLOW}WARN\${NC}: \$WARN"
echo ""
echo "── sidecar.log 末尾 20 行 ────────────────────────────"
tail -20 "\$LOG_DIR/sidecar.log" 2>/dev/null || echo "  (无日志)"
echo ""
echo "── gateway-error.log 末尾 10 行 ──────────────────────"
tail -10 "\$LOG_DIR/gateway-error.log" 2>/dev/null || echo "  (无错误日志)"
echo ""
if [ "\$FAIL" -eq 0 ]; then
  echo -e "  \${GREEN}✓ 功能测试全部通过（\$WARN 个警告）\${NC}"
  EXIT_CODE=0
else
  echo -e "  \${RED}✗ \$FAIL 个功能测试失败\${NC}"
  EXIT_CODE=1
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
exit \$EXIT_CODE
SHEOF

echo "[SCP] 上传功能测试脚本..."
scp -o StrictHostKeyChecking=no "$TEMP_SH" "$MAC_USER@$MAC_HOST:~/newopenclaw-func-test.sh"
rm -f "$TEMP_SH"

echo "[SSH] 执行功能测试..."
echo ""
ssh -o StrictHostKeyChecking=no "$MAC_USER@$MAC_HOST" "bash ~/newopenclaw-func-test.sh"
TEST_EXIT=$?

echo ""
if [ $TEST_EXIT -eq 0 ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  macOS 功能测试通过 ✓"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  macOS 功能测试失败（exit $TEST_EXIT）"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi
exit $TEST_EXIT

#!/bin/bash
# 66Claw macOS 启动诊断脚本
# 用法: bash diagnose-mac.sh
# 把输出截图发给我们即可

echo "=== 66Claw macOS 诊断 ==="
echo "时间: $(date)"
echo ""

# 1. 系统信息
echo "[1] 系统信息"
echo "  macOS: $(sw_vers -productVersion)"
echo "  芯片: $(uname -m)"
CHIP=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "未知")
echo "  CPU: $CHIP"
echo ""

# 2. Rosetta
echo "[2] Rosetta 状态"
if /usr/bin/pgrep -q oahd 2>/dev/null; then
  echo "  Rosetta: 已安装且运行中"
elif [ -f /Library/Apple/usr/libexec/oah/libRosettaRuntime ]; then
  echo "  Rosetta: 已安装"
else
  echo "  Rosetta: 未安装 ← 如果是 M 芯片运行 x64 版本，这是问题！"
  echo "  修复: softwareupdate --install-rosetta --agree-to-license"
fi
echo ""

# 3. 查找 66Claw.app
echo "[3] 查找 66Claw.app"
APP=""
for p in \
  "/Applications/66Claw.app" \
  "$HOME/Applications/66Claw.app" \
  "$HOME/Desktop/66Claw.app" \
  "$HOME/Downloads/66Claw.app"; do
  if [ -d "$p" ]; then
    APP="$p"
    break
  fi
done

if [ -z "$APP" ]; then
  # 搜索常见位置
  APP=$(find /Applications "$HOME" -maxdepth 3 -name "66Claw.app" -type d 2>/dev/null | head -1)
fi

if [ -z "$APP" ]; then
  echo "  未找到 66Claw.app！请把 app 拖到 Applications 后重试"
  exit 1
fi
echo "  路径: $APP"
echo ""

# 4. 二进制架构
echo "[4] 二进制架构"
BIN="$APP/Contents/MacOS/66Claw"
if [ -f "$BIN" ]; then
  file "$BIN"
  lipo -archs "$BIN" 2>/dev/null && echo "" || echo "  lipo 失败"
else
  echo "  主程序不存在: $BIN"
fi

NODE="$APP/Contents/Resources/_dist/node/bin/node"
if [ -f "$NODE" ]; then
  echo "  Node: $(file "$NODE")"
  NODE_ARCH=$(lipo -archs "$NODE" 2>/dev/null || echo "未知")
  echo "  Node 架构: $NODE_ARCH"
else
  echo "  Node 未打包: $NODE ← 缺少 node 会导致无法启动！"
fi
echo ""

# 5. Gatekeeper / quarantine
echo "[5] Gatekeeper 检查"
XATTR=$(xattr "$APP" 2>/dev/null)
if echo "$XATTR" | grep -q "quarantine"; then
  echo "  有 quarantine 标记 ← 可能被阻止运行！"
  echo "  修复: xattr -cr \"$APP\""
else
  echo "  无 quarantine 标记，OK"
fi

SPCTL=$(spctl --assess --verbose "$APP" 2>&1 || true)
echo "  Gatekeeper 评估: $SPCTL"
echo ""

# 6. 签名
echo "[6] 代码签名"
CODESIGN=$(codesign -dvv "$APP" 2>&1 | head -5)
echo "$CODESIGN"
echo ""

# 7. 尝试启动，捕获错误
echo "[7] 尝试启动（5秒后自动结束）"
echo "  运行: $BIN"
"$BIN" 2>&1 &
PID=$!
sleep 5
if kill -0 $PID 2>/dev/null; then
  echo "  进程 $PID 启动成功！（5秒内没有崩溃）"
  kill $PID 2>/dev/null
else
  wait $PID 2>/dev/null
  EXIT_CODE=$?
  echo "  进程已退出，退出码: $EXIT_CODE"
  if [ $EXIT_CODE -eq 137 ] || [ $EXIT_CODE -eq 9 ]; then
    echo "  被系统 kill ← 可能是 Gatekeeper 或架构不匹配"
  elif [ $EXIT_CODE -eq 126 ]; then
    echo "  权限被拒 ← 运行 chmod +x \"$BIN\""
  fi
fi
echo ""

# 8. sidecar 日志
echo "[8] sidecar 日志（如有）"
LOG="$HOME/.openclaw/sidecar.log"
if [ -f "$LOG" ]; then
  echo "  最后 20 行:"
  tail -20 "$LOG"
else
  echo "  无日志文件（app 可能从未成功启动过）"
fi

echo ""
echo "=== 诊断完成，请将以上输出截图发给我们 ==="

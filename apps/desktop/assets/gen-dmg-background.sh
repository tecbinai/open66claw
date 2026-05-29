#!/bin/bash
# 生成 DMG 背景图（含安装引导文字）
# 在 macOS 上运行：bash apps/desktop/assets/gen-dmg-background.sh
# 依赖：Python3（macOS 自带）+ Pillow（pip3 install Pillow）
#
# 输出：apps/desktop/assets/dmg-background.png（660x420px）

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$SCRIPT_DIR/dmg-background.png"

python3 - <<'PYEOF'
import sys, os

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("[gen-dmg-background] Installing Pillow...")
    os.system("pip3 install Pillow -q")
    from PIL import Image, ImageDraw, ImageFont

W, H = 660, 420

# 背景色：深灰渐变感（纯色）
img = Image.new("RGB", (W, H), color=(30, 30, 34))
draw = ImageDraw.Draw(img)

# 顶部品牌色条
draw.rectangle([0, 0, W, 6], fill=(99, 102, 241))

# 尝试加载系统中文字体
def get_font(size):
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()

font_title  = get_font(22)
font_body   = get_font(16)
font_small  = get_font(13)

# 标题
draw.text((W//2, 36), "安装 66Claw", font=font_title, fill=(255,255,255), anchor="mm")

# 箭头区域提示（图标在左180，Applications在右480，y=180）
# 在图标下方和Applications下方加标签
draw.text((180, 295), "66Claw", font=font_small, fill=(180,180,190), anchor="mm")
draw.text((480, 295), "应用程序", font=font_small, fill=(180,180,190), anchor="mm")

# 拖拽提示
draw.text((W//2, 330), "← 将左侧图标拖入右侧文件夹完成安装", font=font_body, fill=(160,160,170), anchor="mm")

# 分割线
draw.rectangle([40, 355, W-40, 356], fill=(60, 60, 68))

# 首次打开提示
draw.text((W//2, 378), "⚠  首次打开被拦截？", font=font_body, fill=(250, 200, 80), anchor="mm")
draw.text((W//2, 400), "打开「系统设置」→「隐私与安全性」→ 点击「仍要打开」", font=font_small, fill=(200,200,210), anchor="mm")

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dmg-background.png")
img.save(out_path)
print(f"[gen-dmg-background] Generated: {out_path}")
PYEOF

echo "[gen-dmg-background] Done: $OUT"

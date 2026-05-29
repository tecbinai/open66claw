#!/bin/bash
# ═══════════════════════════════════════════════
# ClawHub Scraper - 香港服务器部署脚本
# 目标: 43.129.194.117
# ═══════════════════════════════════════════════
set -e

echo "=== 1. 系统更新 ==="
apt-get update -qq
apt-get install -y -qq curl git sqlite3 screen unzip

echo "=== 2. 安装 Node.js 20 LTS ==="
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi
echo "Node: $(node -v), npm: $(npm -v)"

echo "=== 3. 部署项目 ==="
mkdir -p /opt/clawhub-scraper
cd /opt/clawhub-scraper

# 如果是首次部署，从本地 scp 过来
if [ ! -f package.json ]; then
    echo "请先 scp 项目文件到 /opt/clawhub-scraper/"
    echo "  scp -r ./clawhub-scraper/* root@43.129.194.117:/opt/clawhub-scraper/"
    exit 1
fi

echo "=== 4. 安装依赖 ==="
npm install --production

echo "=== 5. 初始化 ==="
mkdir -p data output/kimi-batches output/skills-cn
cp -n .env.example .env 2>/dev/null || true

echo "=== 6. 测试连接 ==="
node -e "import('./lib/db.js').then(m => { m.getDb(); console.log('DB OK') })"

echo ""
echo "═══════════════════════════════════════"
echo "  部署完成！运行流程："
echo ""
echo "  # 在 screen 中运行（防断线）"
echo "  screen -S scraper"
echo ""
echo "  # Stage 1: 列表爬取 (~2min)"
echo "  node stages/1-list.js"
echo ""
echo "  # Stage 2: 下载 (~4min, 10并发)"
echo "  node stages/2-download.js"
echo ""
echo "  # Stage 3: 过滤"
echo "  node stages/3-filter.js"
echo ""
echo "  # Stage 4: 准备翻译"
echo "  node stages/4-prepare.js"
echo ""
echo "  # Stage 6: 查看状态"
echo "  node stages/6-stats.js"
echo ""
echo "  # Ctrl+A D 断开 screen"
echo "  # screen -r scraper 重新连接"
echo "═══════════════════════════════════════"

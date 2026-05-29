#!/bin/bash
# ═══════════════════════════════════════════════
# 完整流程：列表 → 下载 → 过滤 → 准备翻译
# 用法: bash scripts/run-pipeline.sh
# ═══════════════════════════════════════════════
set -e
cd "$(dirname "$0")/.."

echo "═══════════════════════════════════════"
echo "  ClawHub Scraper Pipeline"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════"

echo ""
echo ">>> Stage 1: List"
node stages/1-list.js
echo ""

echo ">>> Stage 2: Download"
node stages/2-download.js
echo ""

echo ">>> Stage 3: Filter"
node stages/3-filter.js
echo ""

echo ">>> Stage 4: Prepare"
node stages/4-prepare.js
echo ""

echo ">>> Stats"
node stages/6-stats.js
echo ""

echo "═══════════════════════════════════════"
echo "  Pipeline complete: $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════"

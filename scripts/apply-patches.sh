#!/usr/bin/env bash
# OpenClawCN 补丁应用脚本
# 用法: bash scripts/apply-patches.sh
#       bash scripts/apply-patches.sh --check   (仅检查，不应用)
#       bash scripts/apply-patches.sh --reverse  (撤销补丁)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PATCHES_DIR="$REPO_ROOT/patches"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

MODE="${1:-apply}"

echo "=== OpenClawCN Patch Applicator ==="
echo "Patches directory: $PATCHES_DIR"
echo "Mode: $MODE"
echo ""

# 收集 .patch 文件
shopt -s nullglob
patches=("$PATCHES_DIR"/*.patch)
shopt -u nullglob

if [[ ${#patches[@]} -eq 0 ]]; then
  echo -e "${YELLOW}No patches found in $PATCHES_DIR${NC}"
  exit 0
fi

echo "Found ${#patches[@]} patch(es):"
for p in "${patches[@]}"; do
  echo "  - $(basename "$p")"
done
echo ""

case "$MODE" in
  --check)
    echo "--- Dry-run (--check) ---"
    all_ok=true
    for patch in "${patches[@]}"; do
      name="$(basename "$patch")"
      if git -C "$REPO_ROOT" apply --check "$patch" 2>/dev/null; then
        echo -e "  ${GREEN}OK${NC}      $name"
      else
        echo -e "  ${RED}FAIL${NC}    $name"
        all_ok=false
      fi
    done
    if $all_ok; then
      echo -e "\n${GREEN}All patches can be applied cleanly.${NC}"
    else
      echo -e "\n${RED}Some patches cannot be applied. Check for conflicts.${NC}"
      exit 1
    fi
    ;;

  --reverse)
    echo "--- Reversing patches ---"
    # 逆序撤销
    for ((i=${#patches[@]}-1; i>=0; i--)); do
      patch="${patches[$i]}"
      name="$(basename "$patch")"
      if git -C "$REPO_ROOT" apply --check --reverse "$patch" 2>/dev/null; then
        git -C "$REPO_ROOT" apply --reverse "$patch"
        echo -e "  ${GREEN}Reversed${NC}  $name"
      else
        echo -e "  ${YELLOW}Skip${NC}      $name (not applied or conflict)"
      fi
    done
    echo -e "\n${GREEN}Done.${NC}"
    ;;

  apply|"")
    # Phase 1: Dry-run
    echo "--- Phase 1: Dry-run ---"
    for patch in "${patches[@]}"; do
      name="$(basename "$patch")"
      if git -C "$REPO_ROOT" apply --check "$patch" 2>/dev/null; then
        echo -e "  ${GREEN}OK${NC}      $name"
      else
        # 可能已经应用过了
        if git -C "$REPO_ROOT" apply --check --reverse "$patch" 2>/dev/null; then
          echo -e "  ${YELLOW}SKIP${NC}    $name (already applied)"
        else
          echo -e "  ${RED}FAIL${NC}    $name (cannot apply, check conflicts)"
          exit 1
        fi
      fi
    done

    # Phase 2: Apply
    echo ""
    echo "--- Phase 2: Applying ---"
    for patch in "${patches[@]}"; do
      name="$(basename "$patch")"
      if git -C "$REPO_ROOT" apply --check "$patch" 2>/dev/null; then
        git -C "$REPO_ROOT" apply "$patch"
        echo -e "  ${GREEN}Applied${NC}   $name"
      else
        echo -e "  ${YELLOW}Skipped${NC}   $name (already applied)"
      fi
    done
    echo ""
    echo -e "${GREEN}All patches applied successfully.${NC}"
    ;;

  *)
    echo "Usage: $0 [--check | --reverse | apply]"
    exit 1
    ;;
esac

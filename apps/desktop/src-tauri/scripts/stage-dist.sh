#!/bin/bash
# Copy backend dist files + install required node_modules into src-tauri/_dist
# for Tauri resource bundling. This creates a self-contained backend
# that can run from any directory (e.g. /Applications/).
set -e
trap 'echo "[stage-dist] ERR trap: line $LINENO cmd: $BASH_COMMAND (exit $?)" >&2' ERR

# ── 确保 node/npm 在 PATH 中（macOS 上 Tauri beforeBuildCommand 继承的 PATH 可能不含 node）──
# 按优先级把常见 node 安装路径加进来
for _node_dir in \
  "/usr/local/lib/nodejs/node-v22.16.0-darwin-arm64/bin" \
  "/usr/local/lib/nodejs/node-v22.14.0-darwin-arm64/bin" \
  "/opt/homebrew/bin" \
  "/opt/homebrew/opt/node@22/bin" \
  "/usr/local/bin" \
  "$HOME/.volta/bin" \
  "$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | sort -V | tail -1)/bin"; do
  if [ -d "$_node_dir" ] && [ -x "$_node_dir/node" ]; then
    export PATH="$_node_dir:$PATH"
    break
  fi
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$TAURI_DIR/../../.." && pwd)"
DIST_SRC="$REPO_ROOT/dist"
DIST_DST="$TAURI_DIR/_dist"
NODE_MODULES_SRC="$REPO_ROOT/node_modules"

# ── OEM patch 函数 ── splash.html 品牌替换 + oem.json runtime 配置写入
# 在 cache hit 和 full stage 两种路径中都会调用
_to_native() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  else
    echo "$1"
  fi
}
_apply_oem_patch() {
  if [ -z "${OPENCLAW_OEM_ID:-}" ]; then return 0; fi

  local OEM_JSON_POSIX="$REPO_ROOT/apps/desktop/oem/${OPENCLAW_OEM_ID}.json"
  local SPLASH_HTML_POSIX="$DIST_DST/dist/control-ui/splash.html"
  local OEM_RUNTIME_POSIX="$DIST_DST/oem.json"

  local OEM_JSON_WIN="$(_to_native "$OEM_JSON_POSIX")"
  local SPLASH_HTML_WIN="$(_to_native "$SPLASH_HTML_POSIX")"
  local OEM_RUNTIME_WIN="$(_to_native "$OEM_RUNTIME_POSIX")"

  local INDEX_HTML_POSIX="$DIST_DST/dist/control-ui/index.html"
  local INDEX_HTML_WIN="$(_to_native "$INDEX_HTML_POSIX")"

  if [ -f "$OEM_JSON_POSIX" ] && [ -f "$SPLASH_HTML_POSIX" ]; then
    local OEM_PATCH_SCRIPT="$SCRIPT_DIR/oem-patch.mjs"
    node "$OEM_PATCH_SCRIPT" "$OEM_JSON_WIN" "$SPLASH_HTML_WIN" "$OEM_RUNTIME_WIN" "$INDEX_HTML_WIN"
  else
    echo "[stage-dist] WARN: OEM config not found at $OEM_JSON_POSIX or splash.html missing"
  fi
}

_stage_cn_adapter_marketplace_data() {
  local CN_ADAPTER_SRC="$REPO_ROOT/extensions/cn-adapter"
  local CN_ADAPTER_DST="$DIST_DST/dist/extensions/cn-adapter"
  local MCP_DATA_SRC="$CN_ADAPTER_SRC/mcp-marketplace/data"
  local MCP_DATA_DST="$CN_ADAPTER_DST/data"

  if [ -d "$MCP_DATA_SRC" ] && [ -d "$CN_ADAPTER_DST" ]; then
    rm -rf "$MCP_DATA_DST"
    cp -r "$MCP_DATA_SRC" "$MCP_DATA_DST"
    echo "[stage-dist] Staged cn-adapter MCP marketplace data"
  fi
}

if [ ! -f "$DIST_SRC/entry.js" ]; then
  echo "[stage-dist] ERROR: $DIST_SRC/entry.js not found. Run 'pnpm build' first."
  exit 1
fi

# ── 版本戳缓存 ── 避免多架构构建时重复执行 stage-dist
# 读取 desktop 应用版本（tauri.conf.json 是 release.sh 同步后的最新版本）
TAURI_CONF="$TAURI_DIR/tauri.conf.json"
DESKTOP_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8')).version)" "$TAURI_CONF" 2>/dev/null || echo "unknown")
# stamp 包含 "版本|架构"，架构变化时（如 all-mac 双架构）node binary 需要替换
TAURI_TARGET="${TAURI_ENV_TARGET_TRIPLE:-${TAURI_TARGET:-native}}"
STAMP_KEY="${DESKTOP_VERSION}|${TAURI_TARGET}"
STAMP_FILE="$DIST_DST/.version-stamp"
if [ "${FORCE_STAGE:-}" != "1" ] && [ -f "$STAMP_FILE" ]; then
  CACHED_STAMP=$(cat "$STAMP_FILE")
  if [ "$CACHED_STAMP" = "$STAMP_KEY" ]; then
    if [ ! -d "$DIST_DST/node_modules" ] || [ -z "$(ls -A "$DIST_DST/node_modules" 2>/dev/null)" ]; then
      echo "[stage-dist] Cache stamp matched but node_modules is missing/empty, forcing full re-stage"
    else
    echo "[stage-dist] _dist already staged for v$DESKTOP_VERSION ($TAURI_TARGET), skipping"
    # 即使命中缓存，也确保 CLI wrapper 脚本存在（新增文件不在旧缓存中）
    if [ ! -f "$DIST_DST/openclaw" ] || [ ! -f "$DIST_DST/openclaw.cmd" ]; then
      echo "[stage-dist] CLI wrappers missing from cache, regenerating..."
      # 生成 macOS/Linux shell wrapper
      cat > "$DIST_DST/openclaw" << 'SHEOF'
#!/bin/bash
# readlink 在 macOS 返回绝对或相对路径，需要判断；无 readlink -f
SCRIPT="$0"
while [ -L "$SCRIPT" ]; do
  TARGET="$(readlink "$SCRIPT")"
  case "$TARGET" in
    /*) SCRIPT="$TARGET" ;;
    *)  SCRIPT="$(cd "$(dirname "$SCRIPT")" && pwd)/$TARGET" ;;
  esac
done
APP_DIR="$(cd "$(dirname "$SCRIPT")" && pwd -P)"
NODE_BIN="$APP_DIR/node/bin/node"
ENTRY_JS="$APP_DIR/dist/entry.js"
if [ ! -x "$NODE_BIN" ]; then echo "[ERROR] Node.js not found at $NODE_BIN. Please reinstall 66Claw."; exit 1; fi
if [ ! -f "$ENTRY_JS" ]; then echo "[ERROR] entry.js not found at $ENTRY_JS. Please reinstall 66Claw."; exit 1; fi
exec "$NODE_BIN" "$ENTRY_JS" "$@"
SHEOF
      chmod +x "$DIST_DST/openclaw"
      # 生成 Windows CMD wrapper
      printf '@echo off\r\nsetlocal\r\nset "SCRIPT_DIR=%%~dp0"\r\nset "NODE_EXE=%%SCRIPT_DIR%%node\\node.exe"\r\nset "ENTRY_JS=%%SCRIPT_DIR%%dist\\entry.js"\r\nif not exist "%%NODE_EXE%%" (echo [ERROR] Node.js not found at %%NODE_EXE%%. Please reinstall 66Claw. & exit /b 1)\r\nif not exist "%%ENTRY_JS%%" (echo [ERROR] entry.js not found at %%ENTRY_JS%%. Please reinstall 66Claw. & exit /b 1)\r\n"%%NODE_EXE%%" "%%ENTRY_JS%%" %%*\r\nendlocal\r\n' > "$DIST_DST/openclaw.cmd"
      echo "[stage-dist] CLI wrappers regenerated"
    fi
    # OEM patch 始终执行（即使命中缓存也需要写入 oem.json + patch splash）
    _apply_oem_patch
    _stage_cn_adapter_marketplace_data
    exit 0
    fi
  fi
  # 版本相同但架构不同（all-mac 双架构构建）→ 只需替换 node binary
  CACHED_VER=$(echo "$CACHED_STAMP" | cut -d'|' -f1)
  if [ "$CACHED_VER" = "$DESKTOP_VERSION" ]; then
    echo "[stage-dist] Same version but different target arch, replacing node binary only..."
    # 删除旧 node binary，后续代码会重新 stage 正确架构的 node
    rm -rf "$DIST_DST/node"
    # 跳到 node bundling 阶段（通过设置标志变量）
    SKIP_TO_NODE_ONLY=1
  fi
fi

if [ "${SKIP_TO_NODE_ONLY:-}" = "1" ]; then
  echo "[stage-dist] Skipping full re-stage, only replacing node binary for target arch"
else
echo "[stage-dist] Staging dist files from $DIST_SRC to $DIST_DST"

# Clean previous staging (preserve node/ directory to avoid re-downloading Node.js)
NODE_BACKUP=""
if [ -d "$DIST_DST/node" ]; then
  NODE_BACKUP="$(dirname "$DIST_DST")/.node_backup_$$"
  mv "$DIST_DST/node" "$NODE_BACKUP"
  echo "[stage-dist] Preserved node/ for reuse"
fi
# Use PowerShell on Windows to robustly delete (bash rm -rf fails on deep node_modules)
if command -v powershell.exe >/dev/null 2>&1; then
  DIST_DST_WIN=$(cygpath -w "$DIST_DST" 2>/dev/null || echo "$DIST_DST" | sed 's|/d/|D:/|;s|/|\\|g')
  powershell.exe -NoProfile -Command "Remove-Item -Path '$DIST_DST_WIN' -Recurse -Force -ErrorAction SilentlyContinue" 2>/dev/null || true
else
  rm -rf "$DIST_DST"
fi
mkdir -p "$DIST_DST/dist"
# Restore preserved node/ directory
if [ -n "$NODE_BACKUP" ] && [ -d "$NODE_BACKUP" ]; then
  mv "$NODE_BACKUP" "$DIST_DST/node"
  echo "[stage-dist] Restored node/ from backup"
fi

# Pre-copy control-ui IMMEDIATELY after _dist is cleared.
# Tauri 2.x tauri_build::build() checks frontendDist early (possibly in parallel
# with or before the beforeBuildCommand completes). By copying control-ui first,
# we ensure _dist/dist/control-ui exists before any Tauri/Rust code checks it.
if [ -d "$DIST_SRC/control-ui" ]; then
  cp -r "$DIST_SRC/control-ui" "$DIST_DST/dist/control-ui"
  echo "[stage-dist] Pre-staged control-ui (frontendDist early availability)"
fi

# Copy root JS/JSON files (the gateway backend chunks)
# Use a loop instead of glob expansion to avoid ARG_MAX limits on Windows
# (600+ files * ~35 chars each can exceed Windows shell command line limits)
for f in "$DIST_SRC"/*.js; do
  [ -f "$f" ] && cp "$f" "$DIST_DST/dist/" || true
done
for f in "$DIST_SRC"/*.json; do
  [ -f "$f" ] && cp "$f" "$DIST_DST/dist/" 2>/dev/null || true
done

# Copy dist subdirectories used by runtime imports. plugin-sdk is handled below
# with dependency tracing instead of copying the whole tree.
for subdir_path in "$DIST_SRC"/*/; do
  [ -d "$subdir_path" ] || continue
  subdir=$(basename "$subdir_path")
  if [ "$subdir" = "plugin-sdk" ]; then
    continue
  fi
  rm -rf "$DIST_DST/dist/$subdir"
  cp -r "$subdir_path" "$DIST_DST/dist/$subdir"
done
_stage_cn_adapter_marketplace_data

# --- Copy required plugin-sdk files + their chunk dependencies ---
# Extensions (cn-adapter, memory-core) import from "openclaw/plugin-sdk/core" etc.
# The jiti alias resolver needs these files at dist/plugin-sdk/.
# These JS files import chunk files (e.g. ./logger-xxx.js, ./auth-profiles-xxx.js),
# so we recursively trace imports and copy only what's needed (~2MB vs 142MB total).
PLUGIN_SDK_SRC="$DIST_SRC/plugin-sdk"
PLUGIN_SDK_DST="$DIST_DST/dist/plugin-sdk"
# 动态扫描所有 plugin-sdk 入口文件（有 .d.ts 的就是入口，没有的是 chunk）
# root-alias.cjs 没有 .d.ts 但也是入口，手动加入
SEED_FILES="root-alias.cjs"
if [ -d "$PLUGIN_SDK_SRC" ]; then
  for dts in "$PLUGIN_SDK_SRC"/*.d.ts; do
    [ -f "$dts" ] || continue
    base=$(basename "$dts" .d.ts)
    if [ -f "$PLUGIN_SDK_SRC/$base.js" ]; then
      SEED_FILES="$SEED_FILES $base.js"
    fi
  done
fi
if [ -d "$PLUGIN_SDK_SRC" ]; then
  echo "[stage-dist] Staging plugin-sdk files with dependency tracing..."
  mkdir -p "$PLUGIN_SDK_DST"

  # Trace all relative imports recursively from seed files
  SEEN=""
  QUEUE="$SEED_FILES"
  while [ -n "$QUEUE" ]; do
    NEXT_QUEUE=""
    for f in $QUEUE; do
      # Skip if already seen
      case " $SEEN " in *" $f "*) continue ;; esac
      SEEN="$SEEN $f"
      # Find relative imports: from "./foo.js" or import "./foo.js"
      if [ -f "$PLUGIN_SDK_SRC/$f" ]; then
        DEPS=$(grep -oE 'from "\./[^"]+"|import "\./[^"]+"' "$PLUGIN_SDK_SRC/$f" 2>/dev/null \
          | sed 's/.*"\.\///;s/"//' | sort -u || true)
        for dep in $DEPS; do
          case " $SEEN $NEXT_QUEUE " in *" $dep "*) ;; *)
            NEXT_QUEUE="$NEXT_QUEUE $dep"
          ;; esac
        done
      fi
    done
    QUEUE="$NEXT_QUEUE"
  done

  # Copy all traced files
  SDK_COUNT=0
  for f in $SEEN; do
    if [ -f "$PLUGIN_SDK_SRC/$f" ]; then
      cp "$PLUGIN_SDK_SRC/$f" "$PLUGIN_SDK_DST/$f"
      SDK_COUNT=$((SDK_COUNT + 1))
    fi
  done
  SDK_SIZE=$(du -sh "$PLUGIN_SDK_DST" 2>/dev/null | cut -f1)
  echo "  [stage-dist] Staged $SDK_COUNT plugin-sdk files ($SDK_SIZE)"
else
  echo "[stage-dist] WARNING: plugin-sdk not found at $PLUGIN_SDK_SRC"
fi

# Copy control-ui (CN frontend) if it exists
# Use rm -rf before cp -r to prevent nested copy if destination already exists
# (cp -r src/dir dst/dir will create dst/dir/dir if dst/dir pre-exists)
if [ -d "$DIST_SRC/control-ui" ]; then
  rm -rf "$DIST_DST/dist/control-ui"
  cp -r "$DIST_SRC/control-ui" "$DIST_DST/dist/control-ui"
  echo "[stage-dist] Staged control-ui ($(ls "$DIST_DST/dist/control-ui" | wc -l | tr -d ' ') files)"
fi

fi  # end of SKIP_TO_NODE_ONLY check

# --- Bundle Node.js (Windows & macOS) ---
# sidecar.rs resolve_node_path() 期望：
#   macOS:   app_dir/node/bin/node
#   Windows: app_dir/node/node.exe
# 若包内没有 node，则依次尝试系统 node → 自动下载（nodejs.org，国内无法访问）
# 因此必须在构建时打入 node，避免用户首次启动联网下载失败。
NODE_VERSION="v22.19.0"
# Tauri 2.x sets TAURI_ENV_TARGET_TRIPLE (e.g. x86_64-pc-windows-msvc)
TAURI_TARGET="${TAURI_ENV_TARGET_TRIPLE:-${TAURI_TARGET:-}}"

NODE_DIR="$DIST_DST/node"
mkdir -p "$NODE_DIR"

if echo "$TAURI_TARGET" | grep -qi "windows\|msvc"; then
  # ── Windows：下载 zip，提取 node.exe ──
  NODE_EXE="$NODE_DIR/node.exe"
  if [ -f "$NODE_EXE" ]; then
    NODE_BYTES=$(wc -c < "$NODE_EXE" 2>/dev/null || echo 0)
    if [ "$NODE_BYTES" -lt 50000000 ]; then
      echo "[stage-dist] Existing Windows node.exe is too small ($NODE_BYTES bytes); restaging real Node.js"
      rm -f "$NODE_EXE"
    elif ! "$NODE_EXE" -e 'const [maj,min]=process.versions.node.split(".").map(Number); process.exit(maj > 22 || (maj === 22 && min >= 19) ? 0 : 1)' >/dev/null 2>&1; then
      OLD_NODE_VERSION=$("$NODE_EXE" --version 2>/dev/null || echo "unknown")
      echo "[stage-dist] Existing Windows node.exe is too old ($OLD_NODE_VERSION); restaging Node.js >=22.19.0"
      rm -f "$NODE_EXE"
    fi
  fi
  if [ ! -f "$NODE_EXE" ]; then
    BUILD_NODE="$(command -v node 2>/dev/null || true)"
    if [ -n "$BUILD_NODE" ] && "$BUILD_NODE" -e 'const [maj,min]=process.versions.node.split(".").map(Number); process.exit(maj > 22 || (maj === 22 && min >= 19) ? 0 : 1)' >/dev/null 2>&1; then
      BUILD_NODE_VERSION=$("$BUILD_NODE" --version 2>/dev/null || echo "unknown")
      echo "[stage-dist] Bundling Windows node from build machine: $BUILD_NODE ($BUILD_NODE_VERSION)"
      cp "$BUILD_NODE" "$NODE_EXE"
    else
    NODE_ARCH="x64"
    NODE_ZIP="node-${NODE_VERSION}-win-${NODE_ARCH}.zip"
    NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/${NODE_ZIP}"
    NODE_CACHE="$HOME/.openclaw/cache/$NODE_ZIP"

    mkdir -p "$(dirname "$NODE_CACHE")"

    if [ ! -f "$NODE_CACHE" ]; then
      echo "[stage-dist] Downloading Node.js ${NODE_VERSION} for Windows..."
      curl -fSL "$NODE_URL" -o "$NODE_CACHE" || {
        echo "[stage-dist] ERROR: Failed to download Node.js from $NODE_URL"
        exit 1
      }
    else
      echo "[stage-dist] Using cached Node.js: $NODE_CACHE"
    fi

    TMP_EXTRACT="$DIST_DST/_node_extract"
    mkdir -p "$TMP_EXTRACT"
    unzip -q "$NODE_CACHE" "node-${NODE_VERSION}-win-${NODE_ARCH}/node.exe" -d "$TMP_EXTRACT"
    cp "$TMP_EXTRACT/node-${NODE_VERSION}-win-${NODE_ARCH}/node.exe" "$NODE_EXE"
    rm -rf "$TMP_EXTRACT"
    fi

    NODE_SIZE=$(du -h "$NODE_EXE" | cut -f1)
    echo "[stage-dist] Bundled Node.js for Windows: $NODE_EXE ($NODE_SIZE)"
  else
    echo "[stage-dist] Node.js already staged: $NODE_EXE"
  fi
else
  # ── macOS：根据目标架构选择正确的 node binary ──
  # 交叉编译 x64 时必须下载 x64 版本的 node，不能用构建机的 arm64 node
  BUNDLED_NODE="$NODE_DIR/bin/node"
  if [ ! -f "$BUNDLED_NODE" ]; then
    mkdir -p "$NODE_DIR/bin"

    # 判断目标架构：TAURI_TARGET 包含 x86_64 则是 x64 交叉编译
    TARGET_ARCH="arm64"
    NODE_PLATFORM_ARCH="darwin-arm64"
    if echo "$TAURI_TARGET" | grep -qi "x86_64"; then
      TARGET_ARCH="x64"
      NODE_PLATFORM_ARCH="darwin-x64"
    fi

    # 构建机架构
    BUILD_ARCH=$(uname -m)  # arm64 or x86_64

    if [ "$TARGET_ARCH" = "x64" ] && [ "$BUILD_ARCH" = "arm64" ]; then
      # ── 交叉编译：ARM64 Mac 构建 x64 包，必须下载 x64 node ──
      NODE_TAR="node-${NODE_VERSION}-${NODE_PLATFORM_ARCH}.tar.gz"
      NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/${NODE_TAR}"
      NODE_CACHE="$HOME/.openclaw/cache/$NODE_TAR"

      mkdir -p "$(dirname "$NODE_CACHE")"

      if [ ! -f "$NODE_CACHE" ]; then
        echo "[stage-dist] Downloading Node.js ${NODE_VERSION} for macOS x64 (cross-compile)..."
        curl -fSL "$NODE_URL" -o "$NODE_CACHE" || {
          echo "[stage-dist] ERROR: Failed to download Node.js from $NODE_URL"
          exit 1
        }
      else
        echo "[stage-dist] Using cached Node.js x64: $NODE_CACHE"
      fi

      TMP_EXTRACT="$DIST_DST/_node_extract"
      mkdir -p "$TMP_EXTRACT"
      tar -xzf "$NODE_CACHE" -C "$TMP_EXTRACT" "node-${NODE_VERSION}-${NODE_PLATFORM_ARCH}/bin/node"
      cp "$TMP_EXTRACT/node-${NODE_VERSION}-${NODE_PLATFORM_ARCH}/bin/node" "$BUNDLED_NODE"
      chmod +x "$BUNDLED_NODE"
      rm -rf "$TMP_EXTRACT"

      NODE_SIZE=$(du -h "$BUNDLED_NODE" | cut -f1)
      echo "[stage-dist] Bundled Node.js x64 for macOS (cross-compile): $BUNDLED_NODE ($NODE_SIZE)"

    elif [ "$TARGET_ARCH" = "arm64" ] && [ "$BUILD_ARCH" = "x86_64" ]; then
      # ── 交叉编译：Intel Mac 构建 arm64 包，必须下载 arm64 node ──
      NODE_TAR="node-${NODE_VERSION}-${NODE_PLATFORM_ARCH}.tar.gz"
      NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/${NODE_TAR}"
      NODE_CACHE="$HOME/.openclaw/cache/$NODE_TAR"

      mkdir -p "$(dirname "$NODE_CACHE")"

      if [ ! -f "$NODE_CACHE" ]; then
        echo "[stage-dist] Downloading Node.js ${NODE_VERSION} for macOS arm64 (cross-compile)..."
        curl -fSL "$NODE_URL" -o "$NODE_CACHE" || {
          echo "[stage-dist] ERROR: Failed to download Node.js from $NODE_URL"
          exit 1
        }
      else
        echo "[stage-dist] Using cached Node.js arm64: $NODE_CACHE"
      fi

      TMP_EXTRACT="$DIST_DST/_node_extract"
      mkdir -p "$TMP_EXTRACT"
      tar -xzf "$NODE_CACHE" -C "$TMP_EXTRACT" "node-${NODE_VERSION}-${NODE_PLATFORM_ARCH}/bin/node"
      cp "$TMP_EXTRACT/node-${NODE_VERSION}-${NODE_PLATFORM_ARCH}/bin/node" "$BUNDLED_NODE"
      chmod +x "$BUNDLED_NODE"
      rm -rf "$TMP_EXTRACT"

      NODE_SIZE=$(du -h "$BUNDLED_NODE" | cut -f1)
      echo "[stage-dist] Bundled Node.js arm64 for macOS (cross-compile): $BUNDLED_NODE ($NODE_SIZE)"

    else
      # ── 原生编译：目标架构 = 构建机架构，直接复制构建机的 node ──
      BUILD_NODE=""
      for candidate in \
        "/usr/local/lib/nodejs/node-${NODE_VERSION}-${NODE_PLATFORM_ARCH}/bin/node" \
        "/opt/homebrew/bin/node" \
        "/usr/local/bin/node" \
        "$(which node 2>/dev/null)"; do
        if [ -f "$candidate" ]; then
          BUILD_NODE="$candidate"
          break
        fi
      done

      if [ -n "$BUILD_NODE" ]; then
        DETECTED_VER=$("$BUILD_NODE" --version 2>/dev/null || echo "?")
        echo "[stage-dist] Bundling macOS node from build machine: $BUILD_NODE ($DETECTED_VER)"
        cp "$BUILD_NODE" "$BUNDLED_NODE"
        chmod +x "$BUNDLED_NODE"
        NODE_SIZE=$(du -h "$BUNDLED_NODE" | cut -f1)
        echo "[stage-dist] Bundled Node.js for macOS: $BUNDLED_NODE ($NODE_SIZE)"
      else
        echo "[stage-dist] WARNING: No node found on build machine, _dist/node/bin/node will be missing"
        echo "[stage-dist]   Users without node installed will trigger auto-download at first launch"
      fi
    fi
  else
    echo "[stage-dist] Node.js already staged: $BUNDLED_NODE"
  fi
fi

if [ "${SKIP_TO_NODE_ONLY:-}" != "1" ]; then
# --- Copy ALL extensions (plugins) ---
# Dynamically scan extensions/ and stage every plugin. shared/ is copied as a
# utility library outside the plugin loop, and test-utils is not packaged.
EXTENSIONS_SRC="$REPO_ROOT/extensions"
EXTENSIONS_DST="$DIST_DST/extensions"
SKIP_EXTENSIONS="test-utils shared"

# --- Copy bundled skills ---
# resolveBundledSkillsDir() looks for skills/ under the package root.
# Without these, all 55+ built-in skills (clawhub, github, slack, etc.) are unavailable.
SKILLS_SRC="$REPO_ROOT/skills"
SKILLS_DST="$DIST_DST/skills"
if [ -d "$SKILLS_SRC" ]; then
  echo "[stage-dist] Staging bundled skills..."
  cp -r "$SKILLS_SRC" "$SKILLS_DST"
  SKILLS_COUNT=$(find "$SKILLS_DST" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  echo "  [stage-dist] Staged $SKILLS_COUNT skills"
else
  echo "[stage-dist] WARNING: Skills not found at $SKILLS_SRC"
fi

# --- Copy docs/ directory ---
# resolveOpenClawDocsPath() looks for docs/ at package root. This includes
# workspace templates (AGENTS.md etc.), channel guides, provider docs, and
# reference material. Exclude large image/asset directories to save ~9MB.
DOCS_SRC="$REPO_ROOT/docs"
DOCS_DST="$DIST_DST/docs"
if [ -d "$DOCS_SRC" ]; then
  echo "[stage-dist] Staging docs/ directory..."
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude='images/' --exclude='assets/' "$DOCS_SRC/" "$DOCS_DST/"
  else
    cp -r "$DOCS_SRC" "$DOCS_DST"
    rm -rf "$DOCS_DST/images" "$DOCS_DST/assets" 2>/dev/null || true
  fi
  DOCS_SIZE=$(du -sh "$DOCS_DST" 2>/dev/null | cut -f1)
  echo "  [stage-dist] Staged docs/ ($DOCS_SIZE)"
else
  echo "[stage-dist] WARNING: docs/ not found at $DOCS_SRC"
fi

echo "[stage-dist] Scanning extensions directory: $EXTENSIONS_SRC"
mkdir -p "$EXTENSIONS_DST"

# shared 单独复制（不作插件，只作工具库供其他 extension require('../../shared/...')）
# 必须在 mkdir -p "$EXTENSIONS_DST" 之后执行！
if [ -d "$EXTENSIONS_SRC/shared" ]; then
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude='node_modules' --exclude='*.test.ts' "$EXTENSIONS_SRC/shared/" "$EXTENSIONS_DST/shared/"
  else
    mkdir -p "$EXTENSIONS_DST/shared"
    cp -r "$EXTENSIONS_SRC/shared/." "$EXTENSIONS_DST/shared/"
  fi
  echo "  [stage-dist] Staged shared/ (utility library for extension relative imports)"
fi

EXT_COUNT=0
for ext_dir in "$EXTENSIONS_SRC"/*/; do
  ext=$(basename "$ext_dir")
  SKIP=false

  # 跳过非插件目录
  SKIP=false
  for skip_ext in $SKIP_EXTENSIONS; do
    if [ "$ext" = "$skip_ext" ]; then SKIP=true; break; fi
  done
  if [ "$SKIP" = true ]; then
    echo "  [stage-dist] Skip (not a plugin): $ext"
    continue
  fi
  # Use rsync to exclude node_modules (avoids broken/cyclic symlinks)
    if command -v rsync &>/dev/null; then
      rsync -a --exclude='node_modules' --exclude='*.test.ts' --exclude='__tests__' "$ext_dir/" "$EXTENSIONS_DST/$ext/"
    else
      cp -r "$ext_dir" "$EXTENSIONS_DST/$ext" 2>/dev/null || true
      rm -rf "$EXTENSIONS_DST/$ext/node_modules" 2>/dev/null || true
      find "$EXTENSIONS_DST/$ext" -name "*.test.ts" -delete 2>/dev/null || true
      find "$EXTENSIONS_DST/$ext" -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null || true
    fi
    echo "  [stage-dist] Staged extension (source): $ext"
  EXT_COUNT=$((EXT_COUNT + 1))
done
echo "[stage-dist] Staged $EXT_COUNT extensions total"

# --- 用预编译 bundle 覆盖（如果存在） ---
# build/bundled-extensions/ 由 pnpm bundle:extensions 生成，每个 extension → 1 个 index.js
BUNDLED_DIR="$REPO_ROOT/build/bundled-extensions"
if [ -d "$BUNDLED_DIR" ]; then
  BUNDLED_COUNT=0
  for bext_dir in "$BUNDLED_DIR"/*/; do
    bext_name=$(basename "$bext_dir")
    dst="$EXTENSIONS_DST/$bext_name"
    if [ -d "$dst" ]; then
      rm -rf "$dst"
    fi
    cp -r "$bext_dir" "$dst"
    BUNDLED_COUNT=$((BUNDLED_COUNT + 1))
  done
  echo "[stage-dist] Overlaid $BUNDLED_COUNT extensions with pre-compiled bundles"
else
  echo "[stage-dist] No bundled-extensions found, using source/pre-compiled files"
fi

# --- Fix source extensions: .ts → .js in package.json entries ---
# Extensions kept as source (not bundled) may have "openclaw.extensions": ["./index.ts"]
# in their package.json. The gateway plugin loader rejects .ts entries, so rewrite them.
FIX_COUNT=0
for ext_pkg in "$EXTENSIONS_DST"/*/package.json; do
  if grep -qE '"\.\/[^"]+\.ts"' "$ext_pkg" 2>/dev/null; then
    # macOS sed requires -i '' (no backup), GNU sed uses -i directly
    # Fix ALL .ts entry references: main, setupEntry, any other fields
    if sed --version 2>/dev/null | grep -q GNU; then
      sed -i 's|"\./\([^"]*\)\.ts"|\"\./\1\.js\"|g' "$ext_pkg"
    else
      sed -i '' 's|"\./\([^"]*\)\.ts"|\"\./\1\.js\"|g' "$ext_pkg"
    fi
    FIX_COUNT=$((FIX_COUNT + 1))
  fi
done
if [ "$FIX_COUNT" -gt 0 ]; then
  echo "[stage-dist] Fixed $FIX_COUNT extension package.json entries (.ts → .js)"
fi

# --- Remove setupEntry if the referenced .js file does not exist ---
# Bundled extensions (single index.js) may have setupEntry pointing to setup-entry.js
# which doesn't exist (bundled into index.js). Gateway rejects missing entry files.
SETUP_REMOVED=$(node "$SCRIPT_DIR/fix-extension-entries.mjs" "$(_to_native "$EXTENSIONS_DST")" 2>/dev/null || echo 0)
if [ "${SETUP_REMOVED:-0}" -gt 0 ] 2>/dev/null; then
  echo "[stage-dist] Removed $SETUP_REMOVED missing setupEntry references from bundled extensions"
fi

# --- 注入 plugin-sdk 预加载到 gateway-cli bundle ---
# Jiti 加载 extension 时会 require('openclaw/plugin-sdk')，先用原生 require() 预加载进
# require.cache，Jiti 命中缓存直接返回，跳过 babel 转译（~12s → ~0.1s per extension）
GATEWAY_CLI_BUNDLE=$(find "$DIST_DST/dist" -name "gateway-cli-*.js" 2>/dev/null | head -1)
PLUGIN_SDK_INDEX="$DIST_DST/dist/plugin-sdk/index.js"
if [ -n "$GATEWAY_CLI_BUNDLE" ] && [ -f "$PLUGIN_SDK_INDEX" ]; then
  # 检查是否已注入
  if ! grep -q "__PLUGIN_SDK_PRELOAD__" "$GATEWAY_CLI_BUNDLE" 2>/dev/null; then
    PRELOAD_CODE='// === PLUGIN-SDK PRELOAD (bypass jiti babel transform) ===
// __PLUGIN_SDK_PRELOAD__
import { createRequire as __cr } from "node:module";
import { fileURLToPath as __fu } from "node:url";
import { dirname as __dn, join as __pj } from "node:path";
const __preloadSdk = () => {
  try {
    const __req = __cr(import.meta.url);
    const __sdkPath = __pj(__dn(__fu(import.meta.url)), "plugin-sdk", "index.js");
    __req(__sdkPath);
  } catch {}
};
__preloadSdk();
// === END PLUGIN-SDK PRELOAD ===
'
    # 在第一行 import 之前插入预加载代码
    TMPFILE=$(mktemp)
    printf '%s\n' "$PRELOAD_CODE" > "$TMPFILE"
    cat "$GATEWAY_CLI_BUNDLE" >> "$TMPFILE"
    mv "$TMPFILE" "$GATEWAY_CLI_BUNDLE"
    echo "[stage-dist] Injected plugin-sdk preload into $(basename $GATEWAY_CLI_BUNDLE)"
  else
    echo "[stage-dist] plugin-sdk preload already injected"
  fi
else
  echo "[stage-dist] WARN: gateway-cli bundle or plugin-sdk/index.js not found, skipping preload"
fi

# --- Copy src/ directory for extension runtime imports ---
# Upstream extensions (telegram, discord, slack, whatsapp, etc.) use relative
# imports like "../../../src/config/config.js" (209 unique paths, 3300+ transitive).
# jiti transpiles TypeScript at runtime, so we copy the full src/ directory
# (excluding tests/snapshots) to _dist/src/. This adds ~19MB but ensures all
# extensions work correctly without needing individual shims.
echo "[stage-dist] Staging src/ directory for extension runtime imports..."
SRC_SRC="$REPO_ROOT/src"
SRC_DST="$DIST_DST/src"
if [ -d "$SRC_SRC" ]; then
  # Clean old src/ to avoid stale files and cp conflicts
  rm -rf "$SRC_DST"
  # Use rsync if available, otherwise cp + cleanup
  if command -v rsync >/dev/null 2>&1; then
    mkdir -p "$SRC_DST"
    rsync -a \
      --exclude='*.test.ts' --exclude='*.test.tsx' --exclude='*.spec.ts' \
      --exclude='__tests__/' --exclude='__snapshots__/' \
      --exclude='*.test-d.ts' \
      "$SRC_SRC/" "$SRC_DST/"
  else
    mkdir -p "$SRC_DST"
    cp -r "$SRC_SRC"/. "$SRC_DST/"
    # Remove test files to save space
    find "$SRC_DST" -name "*.test.ts" -delete 2>/dev/null || true
    find "$SRC_DST" -name "*.test.tsx" -delete 2>/dev/null || true
    find "$SRC_DST" -name "*.spec.ts" -delete 2>/dev/null || true
    find "$SRC_DST" -name "__tests__" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$SRC_DST" -name "__snapshots__" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$SRC_DST" -name "*.test-d.ts" -delete 2>/dev/null || true
  fi
  SRC_SIZE=$(du -sh "$SRC_DST" 2>/dev/null | cut -f1)
  SRC_COUNT=$(find "$SRC_DST" -type f | wc -l | tr -d ' ')
  echo "  [stage-dist] Staged $SRC_COUNT src/ files ($SRC_SIZE)"
else
  echo "[stage-dist] WARNING: src/ not found at $SRC_SRC"
fi

# --- Copy cross-directory JSON assets referenced by src/ ---
# src/agents/tool-display.ts imports "../../apps/shared/.../tool-display.json"
# which is outside src/. In _dist the relative path must still resolve.
SHARED_JSON_SRC="$REPO_ROOT/apps/shared/OpenClawKit/Sources/OpenClawKit/Resources/tool-display.json"
if [ -f "$SHARED_JSON_SRC" ]; then
  SHARED_JSON_DST="$DIST_DST/apps/shared/OpenClawKit/Sources/OpenClawKit/Resources"
  mkdir -p "$SHARED_JSON_DST"
  cp "$SHARED_JSON_SRC" "$SHARED_JSON_DST/"
  echo "[stage-dist] Staged cross-directory JSON: tool-display.json"
fi

# --- Compile ALL .ts → .js in src/ for native ESM compatibility ---
# cn-adapter is a pre-bundled .js that uses native ESM imports (not
# jiti). It references ../../src/config/config.js etc., but _dist/src/ only has
# .ts source files. Transpile ALL .ts to .js so every import chain resolves.
# Uses esbuild Node API via helper script (bash xargs/loops have Windows
# encoding issues with 2500+ files; esbuild API handles all in one call).
if [ -d "$SRC_DST" ]; then
  echo "[stage-dist] Transpiling all .ts → .js in src/ for native ESM..."
  # Use --keep-ts to preserve .ts files: extensions (discord, whatsapp, telegram)
  # reference src/ files via .ts import specifiers. These .ts files must exist
  # until all extensions are compiled (transpile-src rewrites .ts→.js in their
  # source). The .ts files are cleaned up after extension compilation below.
  node "$SCRIPT_DIR/transpile-src.mjs" "$SRC_DST" --keep-ts
fi

# --- Pre-compile extensions .ts → .js for faster startup ---
# Without this, Jiti must transpile every extension at runtime (~200ms each).
# Pre-compiling all 48 extensions eliminates ~9s of startup overhead.
# The plugin loader prefers .js over .ts when both exist, so this is safe.
echo "[stage-dist] Pre-compiling extensions .ts → .js for faster startup..."
EXT_COMPILED=0
for ext_dir in "$EXTENSIONS_DST"/*/; do
  ext=$(basename "$ext_dir")
  # Skip pure test dirs
  # NOTE: shared/ must be compiled (not skipped) because other extensions
  # reference it via relative path ../../shared/*.js at runtime.
  if [ "$ext" = "test-utils" ]; then
    continue
  fi
  # Only compile if the extension has .ts files
  if find "$ext_dir" -name "*.ts" -not -name "*.d.ts" -not -name "*.test.ts" | grep -q .; then
    if node "$SCRIPT_DIR/transpile-src.mjs" "$ext_dir" 2>/dev/null; then
      # Remove .ts source files after successful compilation.
      # Plugin loader checks index.ts before index.js (manifest.ts:155-160),
      # so we must remove .ts to ensure the pre-compiled .js is loaded
      # instead of triggering Jiti runtime transpilation.
      find "$ext_dir" -name "*.ts" -not -name "*.d.ts" -delete 2>/dev/null || true
      EXT_COMPILED=$((EXT_COMPILED + 1))
    fi
  fi
done
echo "[stage-dist] Pre-compiled $EXT_COMPILED extensions to .js (source .ts removed)"

# --- Deferred cleanup: remove .ts source files from src/ ---
# src/ .ts files were kept (--keep-ts) so extensions could reference them via
# .ts import specifiers during their compilation. Now that all extensions are
# compiled with .ts→.js rewrites, remove src/ .ts to ensure jiti loads .js.
if [ -d "$SRC_DST" ]; then
  SRC_TS_COUNT=$(find "$SRC_DST" -name "*.ts" -not -name "*.d.ts" 2>/dev/null | wc -l | tr -d ' ')
  find "$SRC_DST" -name "*.ts" -not -name "*.d.ts" -delete 2>/dev/null || true
  echo "[stage-dist] Cleaned up $SRC_TS_COUNT .ts source files from src/ (deferred from --keep-ts)"
fi

# --- Fix .ts import specifiers in all .js files (src/ + extensions/) ---
# Some compiled .js files still contain "from '...foo.ts'" import specifiers.
# jiti resolves .ts before .js, so if both exist jiti loads .ts and native ESM
# fails with "Unknown file extension .ts". Fix: rewrite all .ts specifiers → .js
# in every .js file under _dist/src/ and _dist/extensions/.
echo "[stage-dist] Fixing .ts import specifiers in compiled .js files..."
node "$SCRIPT_DIR/fix-ts-imports.mjs" "$DIST_DST"

# --- Install required node_modules ---
# Extract external package names from the built dist JS files, then use npm
# to install them with proper dependency resolution (handles transitive +
# peer deps correctly, unlike manual copying from pnpm's nested structure).
echo "[stage-dist] Extracting external dependencies from dist..."

# Extract unique package names (handles scoped packages like @foo/bar)
PKGS=$(grep -roh 'from "[a-z@][^"]*"' "$DIST_SRC"/*.js 2>/dev/null \
  | sed 's/from "//;s/"//' \
  | awk -F/ '{if($1~/^@/) print $1"/"$2; else print $1}' \
  | sort -u \
  | grep -v '^node:' \
  | grep -v '^\.' \
  || true)

# Generate a minimal package.json with "type": "module" and the needed deps.
# Must include "name": "openclaw" so resolveOpenClawPackageRoot() can find
# the package root, and "exports" for plugin-sdk alias resolution.
#
# EXTRA_PKGS: 传递依赖中未被自动扫描到但运行时需要的包
# 1. 手动指定的隐式依赖（require() 按需加载，scanner 扫不到）
# 2. 自动扫描所有 extension 的 package.json dependencies（scanner 只扫 dist/*.js）
MANUAL_EXTRA="@homebridge/ciao @larksuiteoapi/node-sdk strtok3 token-types peek-readable uint8array-extras @tokenizer/inflate @clack/core sisteransi"
# 自动收集 extension 的 npm 依赖（排除 openclaw 内部包）
AUTO_EXTRA=$(node -e "
  const fs = require('fs'), path = require('path');
  const extDir = process.argv[1];
  const seen = new Set();
  try {
    for (const d of fs.readdirSync(extDir)) {
      const ep = path.join(extDir, d, 'package.json');
      try {
        const pkg = JSON.parse(fs.readFileSync(ep, 'utf8'));
        for (const dep of Object.keys(pkg.dependencies || {})) {
          if (dep.indexOf('openclaw') === -1) seen.add(dep);
        }
      } catch {}
    }
  } catch {}
  console.log([...seen].join(' '));
" "$EXTENSIONS_SRC" 2>/dev/null || true)
EXTRA_PKGS="$MANUAL_EXTRA $AUTO_EXTRA"
echo "[stage-dist] Extra deps (manual + extension scan): $EXTRA_PKGS"

echo "[stage-dist] Generating package.json with $(echo "$PKGS" | wc -l | tr -d ' ') scanned + extra deps..."
{
  # 从 repo package.json 读取版本号
  OPENCLAW_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1]+'/package.json','utf8')).version || '0.0.0')" "$REPO_ROOT" 2>/dev/null || echo "0.0.0")
  echo '{'
  printf '  "name": "openclaw",\n'
  printf '  "version": "%s",\n' "$OPENCLAW_VERSION"
  echo '  "type": "module",'
  echo '  "private": true,'
  # 动态生成 plugin-sdk exports（从 SEED_FILES 中提取所有入口）
  echo '  "exports": {'
  EXPORT_FIRST=1
  for seed in $SEED_FILES; do
    # 跳过 chunk 文件和 root-alias.cjs
    case "$seed" in root-alias.*) continue ;; esac
    # 去掉扩展名得到模块名
    modname="${seed%.js}"
    modname="${modname%.cjs}"
    [ $EXPORT_FIRST -eq 0 ] && echo ','
    printf '    "./plugin-sdk/%s": "./dist/plugin-sdk/%s"' "$modname" "$seed"
    EXPORT_FIRST=0
  done
  echo ''
  echo '  },'
  echo '  "dependencies": {'
  FIRST=1
  # 先写自动扫描到的包
  for pkg in $PKGS; do
    # Skip packages that don't exist in repo node_modules (build-time aliases etc)
    if [ ! -e "$NODE_MODULES_SRC/$pkg" ]; then
      echo "[stage-dist]   Skipping $pkg (not in node_modules)" >&2
      continue
    fi
    # Get version from repo's package.json (dependencies or devDependencies)
    version=$(node -e "
      const p = JSON.parse(require('fs').readFileSync(process.argv[1]+'/package.json','utf8'));
      const n = process.argv[2];
      console.log((p.dependencies && p.dependencies[n]) || (p.devDependencies && p.devDependencies[n]) || '*');
    " "$REPO_ROOT" "$pkg" 2>/dev/null || echo "*")
    # Strip workspace: prefix
    version="${version#workspace:}"
    [ $FIRST -eq 0 ] && echo ','
    printf '    "%s": "%s"' "$pkg" "$version"
    FIRST=0
  done
  # 再写显式额外依赖（传递依赖 / 运行时动态加载）
  # 版本查找：先查 root package.json，再遍历 extensions/*/package.json
  for pkg in $EXTRA_PKGS; do
    version=$(node -e "
      const fs = require('fs'), path = require('path');
      const pkgName = process.argv[1], repoRoot = process.argv[2], extDir = process.argv[3];
      const root = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'),'utf8'));
      let v = (root.dependencies && root.dependencies[pkgName]) || (root.devDependencies && root.devDependencies[pkgName]);
      if (v === undefined || v === null) {
        try {
          for (const d of fs.readdirSync(extDir)) {
            const ep = path.join(extDir, d, 'package.json');
            try {
              const ext = JSON.parse(fs.readFileSync(ep, 'utf8'));
              const ev = (ext.dependencies && ext.dependencies[pkgName]) || (ext.devDependencies && ext.devDependencies[pkgName]);
              if (ev) { v = ev; break; }
            } catch {}
          }
        } catch {}
      }
      console.log((v || '*').replace(/^workspace:/,''));
    " "$pkg" "$REPO_ROOT" "$EXTENSIONS_SRC" 2>/dev/null || echo "*")
    [ $FIRST -eq 0 ] && echo ','
    printf '    "%s": "%s"' "$pkg" "$version"
    FIRST=0
    echo "[stage-dist]   Extra dep: $pkg@$version" >&2
  done
  # On macOS: add git-hosted packages as file: deps to bypass GitHub network access.
  # libsignal is a transitive dep of @whiskeysockets/baileys, fetched from GitHub git+https.
  # We pre-seed it from pnpm store and add as direct dep with file: path
  # (npm resolves file: in direct deps relative to the package.json location = _dist/).
  if uname -s | grep -qi darwin; then
    [ $FIRST -eq 0 ] && echo ','
    printf '    "libsignal": "file:./_preseed/libsignal"'
    FIRST=0
  fi
  echo ''
  # Close dependencies block. On macOS, add trailing comma for the overrides block.
  if uname -s | grep -qi darwin; then
    echo '  },'
    # Add overrides to prevent npm from trying to re-fetch the git dep.
    # This ensures baileys' transitive `libsignal@git+...` dep is satisfied by our direct dep.
    echo '  "overrides": {'
    echo '    "libsignal": "file:./_preseed/libsignal"'
    echo '  }'
  else
    echo '  }'
  fi
  echo '}'
} > "$DIST_DST/package.json"

# Install node_modules for the _dist self-contained runtime.
# Strategy differs by platform:
#   Windows: copy from pnpm store (fast, no network; pnpm store has all packages hoisted)
#   macOS:   npm install --prefer-offline (uses npm cache to avoid network; correctly
#             resolves full transitive dependency tree that pnpm does not hoist to top-level)
NODE_MODULES_DST="$DIST_DST/node_modules"
mkdir -p "$NODE_MODULES_DST"

if uname -s | grep -qi darwin; then
  # ── macOS: npm install (resolves full dependency tree) ──────────────────
  # Pre-seed packages with git/tarball deps from pnpm store to avoid network fetch.
  # libsignal: @whiskeysockets/baileys depends on libsignal@git+github.com/...
  #   pnpm resolves it as @whiskeysockets/libsignal-node from a GitHub tarball.
  #   We copy it to _preseed/libsignal and use npm overrides to redirect the git dep.
  PNPM_STORE_MAC="$NODE_MODULES_SRC/.pnpm"
  PRESEED_DIR="$DIST_DST/_preseed"
  mkdir -p "$PRESEED_DIR"
  # Format: "dest_name:pnpm_name"
  PRESEED_PKGS="libsignal:@whiskeysockets/libsignal-node"
  for preseed in $PRESEED_PKGS; do
    dst_name="${preseed%%:*}"
    src_name="${preseed##*:}"
    dst_path="$PRESEED_DIR/$dst_name"
    if [ -e "$dst_path" ]; then
      echo "[stage-dist]   Pre-seed: $dst_name already exists, skip"
      continue
    fi
    # Try direct path first, then pnpm virtual store search
    src_path="$NODE_MODULES_SRC/$src_name"
    if [ ! -e "$src_path" ] && [ -d "$PNPM_STORE_MAC" ]; then
      pkg_base=$(basename "$src_name")
      # Search pnpm store for the package (maxdepth 4 covers nested scope dirs)
      src_path=$(find "$PNPM_STORE_MAC" -maxdepth 4 -type d -name "$pkg_base" -path "*/node_modules/$src_name" 2>/dev/null | head -1)
      if [ -z "$src_path" ]; then
        # Also try top-level node_modules (some pnpm setups hoist it)
        src_path=$(find "$PNPM_STORE_MAC" -maxdepth 5 -type d -name "$pkg_base" 2>/dev/null | head -1)
      fi
    fi
    if [ -n "$src_path" ] && [ -e "$src_path" ]; then
      cp -r "$src_path" "$dst_path"
      # Patch package.json name to match the override key so npm accepts it
      if [ -f "$dst_path/package.json" ]; then
        node -e "
          const fs = require('fs');
          const f = process.argv[1], n = process.argv[2];
          const p = JSON.parse(fs.readFileSync(f,'utf8'));
          p.name = n;
          fs.writeFileSync(f, JSON.stringify(p, null, 2));
        " "$dst_path/package.json" "$dst_name" 2>/dev/null || true
      fi
      echo "[stage-dist]   Pre-seeded: $dst_name → $dst_path (from pnpm store)"
    else
      echo "[stage-dist]   Pre-seed MISS: $dst_name (src=$src_name not found, npm will try network)"
    fi
  done

  echo "[stage-dist] Installing node_modules with npm (macOS, --prefer-offline)..."
  cd "$DIST_DST"
  NPM_INSTALL_LOG="$DIST_DST/.npm-install.log"
  if ! npm install --omit=dev --ignore-scripts --no-audit --no-fund --legacy-peer-deps --prefer-offline --loglevel=error > "$NPM_INSTALL_LOG" 2>&1; then
    tail -50 "$NPM_INSTALL_LOG" >&2
    echo "[stage-dist] ERROR: npm install failed" >&2
    exit 1
  fi
  tail -5 "$NPM_INSTALL_LOG" || true
  rm -f "$NPM_INSTALL_LOG"
  cd - > /dev/null
  NM_COUNT=$(ls "$NODE_MODULES_DST" | wc -l | tr -d ' ')
  echo "[stage-dist] npm install done ($NM_COUNT packages)"
  # Replace any symlinks to _preseed/ packages with real copies (Tauri bundler may not follow symlinks)
  for preseed in $PRESEED_PKGS; do
    dst_name="${preseed%%:*}"
    nm_pkg="$NODE_MODULES_DST/$dst_name"
    preseed_src="$PRESEED_DIR/$dst_name"
    if [ -L "$nm_pkg" ] && [ -d "$preseed_src" ]; then
      rm -f "$nm_pkg"
      cp -r "$preseed_src" "$nm_pkg"
      echo "[stage-dist]   Dereferenced symlink: $dst_name → real copy from _preseed/"
    fi
  done
else
  # ── Windows/Linux: npm install --prefer-offline ──────────────────────────
  # Previously used pnpm store copy which only copied 80 direct deps, missing
  # ~450 transitive deps. Switch to npm install (same as macOS) for correctness.
  # npm --prefer-offline uses local npm cache; no network needed if previously run.
  echo "[stage-dist] Installing node_modules with pnpm (Windows/Linux, --prefer-offline)..."
  cd "$DIST_DST"
  PNPM_INSTALL_LOG="$DIST_DST/.pnpm-install.log"
  if ! CI=true pnpm install --prod --ignore-scripts --no-frozen-lockfile --ignore-workspace --config.node-linker=hoisted --prefer-offline > "$PNPM_INSTALL_LOG" 2>&1; then
    tail -80 "$PNPM_INSTALL_LOG" >&2
    echo "[stage-dist] ERROR: pnpm install failed" >&2
    exit 1
  fi
  tail -8 "$PNPM_INSTALL_LOG" || true
  rm -f "$PNPM_INSTALL_LOG"
  NM_COUNT=$(ls "$NODE_MODULES_DST" 2>/dev/null | wc -l | tr -d ' ')
  echo "[stage-dist] pnpm install done ($NM_COUNT packages)"
  cd - > /dev/null
fi

# Verify node_modules was actually created
if [ ! -d "$NODE_MODULES_DST" ] || [ -z "$(ls -A "$NODE_MODULES_DST" 2>/dev/null)" ]; then
  echo "[stage-dist] ERROR: node_modules installation failed!" >&2
  exit 1
fi
# Clean up npm artifacts if present
rm -f "$DIST_DST/package-lock.json"

# --- Bundle matrix-sdk-crypto native binary (cache-first) ---
# npm install uses --ignore-scripts so the postinstall download doesn't run.
# We use a local cache (~/.openclaw/cache/) so the 15MB binary is only
# downloaded once per machine, not on every build.
MATRIX_DIR="$DIST_DST/node_modules/@matrix-org/matrix-sdk-crypto-nodejs"
# Detect platform-specific binary filename
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) _MATRIX_SUFFIX="darwin-arm64" ;;
  Darwin-x86_64) _MATRIX_SUFFIX="darwin-x64" ;;
  Linux-x86_64) _MATRIX_SUFFIX="linux-x64-gnu" ;;
  *) _MATRIX_SUFFIX="win32-x64-msvc" ;;
esac
MATRIX_NODE="$MATRIX_DIR/matrix-sdk-crypto.${_MATRIX_SUFFIX}.node"
MATRIX_CACHE="$HOME/.openclaw/cache/matrix-sdk-crypto.${_MATRIX_SUFFIX}.node"

if [ -d "$MATRIX_DIR" ] && [ ! -s "$MATRIX_NODE" ]; then
  if [ -s "$MATRIX_CACHE" ]; then
    echo "[stage-dist] Using cached matrix-sdk-crypto .node"
    cp "$MATRIX_CACHE" "$MATRIX_NODE"
    SIZE=$(du -sh "$MATRIX_NODE" 2>/dev/null | cut -f1)
    echo "[stage-dist] matrix-sdk-crypto .node staged from cache ($SIZE)"
  else
    echo "[stage-dist] Downloading matrix-sdk-crypto native binary (first time, will cache)..."
    node "$MATRIX_DIR/download-lib.js" 2>&1 || true
    if [ -s "$MATRIX_NODE" ]; then
      SIZE=$(du -sh "$MATRIX_NODE" 2>/dev/null | cut -f1)
      echo "[stage-dist] matrix-sdk-crypto .node downloaded ($SIZE), caching..."
      mkdir -p "$(dirname "$MATRIX_CACHE")"
      cp "$MATRIX_NODE" "$MATRIX_CACHE"
    else
      echo "[stage-dist] WARNING: matrix-sdk-crypto .node download failed" >&2
    fi
  fi
else
  echo "[stage-dist] matrix-sdk-crypto .node already present, skipping"
fi

# --- Fix chalk ESM/CJS compatibility ---
# chalk@5 is ESM-only and has no index.js at package root.
# Node's legacyMainResolve (used by some ESM bundles) expects index.js.
# Create a minimal ESM re-export shim so both resolution paths work.
CHALK_DIR="$DIST_DST/node_modules/chalk"
if [ -d "$CHALK_DIR" ] && [ ! -f "$CHALK_DIR/index.js" ]; then
  echo "// ESM re-export shim for legacyMainResolve compatibility" > "$CHALK_DIR/index.js"
  echo "export { default, Chalk, chalk } from './source/index.js';" >> "$CHALK_DIR/index.js"
  echo "[stage-dist] Created chalk/index.js ESM shim"
fi

NM_SIZE=$(du -sh "$DIST_DST/node_modules" 2>/dev/null | cut -f1)
TOTAL_SIZE=$(du -sh "$DIST_DST" 2>/dev/null | cut -f1)
echo "[stage-dist] Done. node_modules: $NM_SIZE. Total staged: $TOTAL_SIZE"

fi  # end of SKIP_TO_NODE_ONLY extensions/src/node_modules block

# --- Generate CLI wrapper scripts ---
# 两个文件都必须始终生成，因为 tauri.conf.json resources 同时列了两者。
# 跨平台构建时（如 macOS 构建 Windows 包），两个文件仍然都生成，
# 只是实际运行时只有目标平台对应的那个会被用到。
#
# Windows: openclaw.cmd  — NSIS 将安装目录加入 PATH，用户直接运行 `openclaw`
# macOS:   openclaw      — cn-adapter 首次启动时自动 symlink 到 ~/.local/bin/openclaw

# macOS/Linux shell wrapper（始终生成，Windows 上也生成作为占位）
cat > "$DIST_DST/openclaw" << 'SHEOF'
#!/bin/bash
# 66Claw CLI wrapper
# readlink 在 macOS 返回绝对或相对路径，需要判断；无 readlink -f
SCRIPT="$0"
while [ -L "$SCRIPT" ]; do
  TARGET="$(readlink "$SCRIPT")"
  case "$TARGET" in
    /*) SCRIPT="$TARGET" ;;
    *)  SCRIPT="$(cd "$(dirname "$SCRIPT")" && pwd)/$TARGET" ;;
  esac
done
APP_DIR="$(cd "$(dirname "$SCRIPT")" && pwd -P)"
NODE_BIN="$APP_DIR/node/bin/node"
ENTRY_JS="$APP_DIR/dist/entry.js"

if [ ! -x "$NODE_BIN" ]; then
  echo "[ERROR] Node.js not found at $NODE_BIN"
  echo "Please reinstall 66Claw."
  exit 1
fi
if [ ! -f "$ENTRY_JS" ]; then
  echo "[ERROR] entry.js not found at $ENTRY_JS"
  echo "Please reinstall 66Claw."
  exit 1
fi
exec "$NODE_BIN" "$ENTRY_JS" "$@"
SHEOF
chmod +x "$DIST_DST/openclaw"
echo "[stage-dist] Generated openclaw shell wrapper"

# Windows CMD wrapper（始终生成，macOS 上也生成作为占位）
# %~dp0 是脚本所在目录（= 安装目录），无论从哪里调用都能正确定位
cat > "$DIST_DST/openclaw.cmd" << 'CMDEOF'
@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "NODE_EXE=%SCRIPT_DIR%node\node.exe"
set "ENTRY_JS=%SCRIPT_DIR%dist\entry.js"
if not exist "%NODE_EXE%" (
  echo [ERROR] Node.js not found at %NODE_EXE%
  echo Please reinstall 66Claw.
  exit /b 1
)
if not exist "%ENTRY_JS%" (
  echo [ERROR] entry.js not found at %ENTRY_JS%
  echo Please reinstall 66Claw.
  exit /b 1
)
"%NODE_EXE%" "%ENTRY_JS%" %*
endlocal
CMDEOF
echo "[stage-dist] Generated openclaw.cmd Windows wrapper"

# 写入版本戳（包含版本+架构，供下次构建时判断是否需要重新 stage）
echo "$STAMP_KEY" > "$DIST_DST/.version-stamp"
echo "[stage-dist] Version stamp: $STAMP_KEY"

# OEM patch: 调用 _apply_oem_patch 函数（定义在脚本顶部，cache hit 和 full stage 共用）
_apply_oem_patch

#!/usr/bin/env tsx
/**
 * Extensions 预编译 Bundle 脚本
 *
 * 将所有非 cn-adapter 的 extensions 从散装 .ts/.js 文件打成单个 index.js，
 * 减少 require() 次数（400+ → ~50），大幅加速冷启动。
 *
 * 流程：
 *   1. 扫描 extensions/\*\/package.json，发现入口
 *   2. 复制源码到 build/bundled-extensions/{name}/
 *   3. esbuild *.ts → *.js（保持目录结构）
 *   4. esbuild --bundle → 单个 index.js
 *   5. 清理散装文件，保留 index.js + package.json + 资源白名单
 *   6. 修改 package.json 入口 .ts → .js
 *
 * 用法：
 *   pnpm bundle:extensions
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync, build as esbuildAsync } from "esbuild";

// ============================================================================
// Constants
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const BUILD_DIR = path.join(ROOT, "build", "bundled-extensions");

/** 跳过的目录（cn-adapter 单独随桌面包复制，shared/test-utils 非插件） */
const SKIP_EXTENSIONS = new Set([
  "cn-adapter",
  "shared",
  "test-utils",
  // These extensions are directly imported by src/ core files (e.g. src/channels/dock.ts,
  // src/agents/tools/discord-actions.ts, etc.) using subpath imports like
  // "extensions/discord/src/account-inspect.js". Bundling them would remove the src/
  // subdirectory, breaking those cross-imports. Keep them as-is.
  "discord",
  "slack",
  "telegram",
  "whatsapp",
  "signal",
  "imessage",
  "mattermost",
  "voice-call",
  "bluebubbles",
  // Channel extensions with src/ subpath imports from src/plugin-sdk/*.ts
  "feishu",
  "googlechat",
  "irc",
  "line",
  "matrix",
  "nostr",
  "synology-chat",
  "tlon",
  "twitch",
  "zalo",
  "zalouser",
  // Extensions with non-index subpath imports (onboard.js, model-definitions.js, token.js, etc.)
  "cloudflare-ai-gateway",
  "github-copilot",
  "mistral",
  "msteams",
  "nextcloud-talk",
  "openai",
  "opencode",
  "opencode-go",
  "xai",
  "zai",
  // These extensions expose provider-catalog.js imported by src/agents/models-config.providers*.ts
  // via relative paths like "../../extensions/xxx/provider-catalog.js".
  // Bundling them removes provider-catalog.js, breaking those imports at runtime.
  "byteplus",
  "huggingface",
  "kilocode",
  "kimi-coding",
  "minimax",
  "modelstudio",
  "moonshot",
  "nvidia",
  "openrouter",
  "qianfan",
  "qwen-portal-auth",
  "synthetic",
  "together",
  "venice",
  "vercel-ai-gateway",
  "volcengine",
  "xiaomi",
]);

/** extensions/shared/ 源码目录（多个 extension 引用了 ../../shared/xxx.js） */
const SHARED_SRC_DIR = path.join(ROOT, "extensions", "shared");

/** 复制时排除的模式 */
const COPY_EXCLUDE_PATTERNS = ["__tests__", "*.test.ts", "*.test.js", "node_modules", ".turbo"] as const;

/** bundle 时的基础 external 依赖 */
const BASE_EXTERNAL = [
  "openclaw/*",       // 上游 plugin-sdk，运行时 jiti alias 解析
  "node:*",           // Node 内置模块
  "commander",        // 宿主已安装
  "ws",               // 宿主已安装
  "@sinclair/typebox", // 宿主已安装
  "zod",              // 宿主已安装
] as const;

/**
 * 构建 openclaw/plugin-sdk 子路径 alias map
 * openclaw/plugin-sdk/telegram → _dist/dist/plugin-sdk/telegram.js
 */
function buildPluginSdkAliasMap(): Record<string, string> {
  const sdkDir = path.join(ROOT, "apps/desktop/src-tauri/target/release/_dist/dist/plugin-sdk");
  if (!fs.existsSync(sdkDir)) return {};

  const alias: Record<string, string> = {};

  // root-alias: openclaw/plugin-sdk → _dist/dist/plugin-sdk/root-alias.cjs
  alias["openclaw/plugin-sdk"] = path.join(sdkDir, "root-alias.cjs");

  // 子路径: openclaw/plugin-sdk/xxx → _dist/dist/plugin-sdk/xxx.js
  for (const file of fs.readdirSync(sdkDir)) {
    if (file === "root-alias.cjs" || file === "index.js") continue;
    if (!file.endsWith(".js") && !file.endsWith(".cjs")) continue;
    const subpath = file.replace(/\.(js|cjs)$/, "");
    alias[`openclaw/plugin-sdk/${subpath}`] = path.join(sdkDir, file);
  }

  return alias;
}

/** bundle 后需要保留的非 JS 资源目录/文件 */
const BUNDLE_KEEP_ASSETS = [
  "package.json",
  "openclaw.plugin.json",
  "config-templates",
  "templates",
  "oem",
  "assets",
] as const;

// ============================================================================
// Helpers
// ============================================================================

function log(msg: string) {
  console.log(`[bundle-ext] ${msg}`);
}

/**
 * 递归复制目录，排除测试文件和 node_modules
 */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (
      COPY_EXCLUDE_PATTERNS.some((pat) => {
        if (pat.startsWith("*")) {
          return entry.name.endsWith(pat.slice(1));
        }
        return entry.name === pat;
      })
    ) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 递归收集指定扩展名的文件
 */
function collectFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * 从 extension 的 package.json 读取非 openclaw 的 dependencies，标为 external
 */
function getExtensionExternals(pkgJsonPath: string): string[] {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    const deps = pkg.dependencies || {};
    return Object.keys(deps).filter((d) => !d.includes("openclaw"));
  } catch {
    return [];
  }
}

/**
 * 发现所有需要 bundle 的 extensions
 */
function discoverExtensions(): Array<{ name: string; srcDir: string; entry: string }> {
  const extensionsDir = path.join(ROOT, "extensions");
  const results: Array<{ name: string; srcDir: string; entry: string }> = [];

  for (const dirEntry of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
    if (!dirEntry.isDirectory()) continue;
    const name = dirEntry.name;
    if (SKIP_EXTENSIONS.has(name)) continue;

    const extDir = path.join(extensionsDir, name);
    const pkgJsonPath = path.join(extDir, "package.json");

    if (!fs.existsSync(pkgJsonPath)) {
      log(`  SKIP: ${name} (no package.json)`);
      continue;
    }

    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));

    // 入口优先级：openclaw.extensions[0] > main > ./index.ts
    let entry = "./index.ts";
    if (pkg.openclaw?.extensions?.length > 0) {
      entry = pkg.openclaw.extensions[0];
    } else if (pkg.main) {
      entry = pkg.main;
    }

    if (!entry.startsWith("./")) entry = `./${entry}`;

    results.push({ name, srcDir: extDir, entry });
  }

  return results;
}

// ============================================================================
// Main Steps
// ============================================================================

/**
 * Step 1: 复制所有目标 extensions → build/bundled-extensions/
 */
function stepCopy(extensions: Array<{ name: string; srcDir: string }>): void {
  log("Step 1: Copying extensions to build directory...");

  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  for (const ext of extensions) {
    const destDir = path.join(BUILD_DIR, ext.name);
    copyDirSync(ext.srcDir, destDir);
  }
  log(`  Copied ${extensions.length} extensions`);
}

/**
 * Step 2: esbuild 编译 .ts → .js（保持目录结构）
 */
function stepCompile(extensions: Array<{ name: string }>): void {
  log("Step 2: Compiling TS → JS with esbuild...");

  let totalFiles = 0;
  for (const ext of extensions) {
    const extDir = path.join(BUILD_DIR, ext.name);
    if (!fs.existsSync(extDir)) continue;

    const tsFiles = collectFiles(extDir, ".ts").filter(
      (f) => !f.endsWith(".d.ts") && !f.endsWith(".test.ts"),
    );
    if (tsFiles.length === 0) continue;

    buildSync({
      entryPoints: tsFiles,
      outdir: extDir,
      format: "esm",
      platform: "node",
      target: "node22",
      outbase: extDir,
      bundle: false,
      outExtension: { ".js": ".js" },
    });

    totalFiles += tsFiles.length;
  }
  log(`  Compiled ${totalFiles} TS files`);
}

/**
 * Step 3: esbuild --bundle → 单个 index.js
 */
async function stepBundle(
  extensions: Array<{ name: string; srcDir: string; entry: string }>,
): Promise<void> {
  log("Step 3: Bundling each extension into single file...");

  let successCount = 0;
  let skipCount = 0;

  for (const ext of extensions) {
    const extDir = path.join(BUILD_DIR, ext.name);
    if (!fs.existsSync(extDir)) continue;

    // 解析入口文件（可能是 .ts，编译后变成 .js）
    let entryFile = path.join(extDir, ext.entry.replace(/^\.\//, ""));
    if (entryFile.endsWith(".ts") && fs.existsSync(entryFile.replace(/\.ts$/, ".js"))) {
      entryFile = entryFile.replace(/\.ts$/, ".js");
    }

    if (!fs.existsSync(entryFile)) {
      log(`  SKIP: ${ext.name} (entry not found: ${ext.entry})`);
      skipCount++;
      continue;
    }

    // 收集该 extension 的 npm 依赖作为 external
    const pkgJsonPath = path.join(extDir, "package.json");
    const extExternals = getExtensionExternals(pkgJsonPath);
    const allExternals = [...BASE_EXTERNAL, ...extExternals];

    const beforeCount = collectFiles(extDir, ".js").length;
    const bundleOut = path.join(extDir, "_bundle.js");

    try {
      await esbuildAsync({
        entryPoints: [entryFile],
        outfile: bundleOut,
        format: "esm",
        platform: "node",
        target: "node22",
        bundle: true,
        external: allExternals,
        minify: false,
        banner: { js: `/* ${ext.name} bundle | ${new Date().toISOString().slice(0, 10)} */` },
        plugins: [
          {
            name: "resolve-shared",
            setup(build) {
              // ../../shared/xxx.js → extensions/shared/xxx.ts（编译后 .js）
              build.onResolve({ filter: /\.\.\/.*\/shared\// }, (args) => {
                const sharedIdx = args.path.indexOf("/shared/");
                const relFile = args.path.slice(sharedIdx + "/shared/".length);
                // 尝试 .ts 源文件（会被 esbuild 自动编译）
                const tsPath = path.join(SHARED_SRC_DIR, relFile.replace(/\.js$/, ".ts"));
                if (fs.existsSync(tsPath)) {
                  return { path: tsPath };
                }
                // 尝试 .js 文件
                const jsPath = path.join(SHARED_SRC_DIR, relFile);
                if (fs.existsSync(jsPath)) {
                  return { path: jsPath };
                }
                return undefined;
              });
            },
          },
          {
            name: "externalize-upstream-src",
            setup(build) {
              build.onResolve({ filter: /\.\.\/.*\/src\// }, (args) => {
                const srcIdx = args.path.indexOf("/src/");
                const srcRelative = args.path.slice(srcIdx + 1);
                const correctedPath = "../../" + srcRelative;
                return { path: correctedPath, external: true };
              });
            },
          },
        ],
      });
    } catch (err) {
      log(`  WARN: ${ext.name} bundle failed, keeping source files`);
      log(`    ${err}`);
      if (fs.existsSync(bundleOut)) fs.unlinkSync(bundleOut);
      skipCount++;
      continue;
    }

    // 删除所有子目录和散装文件，只保留 bundle + 资源白名单
    const entries = fs.readdirSync(extDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(extDir, entry.name);
      if (entry.name === "_bundle.js") continue;
      if (BUNDLE_KEEP_ASSETS.some((a) => entry.name === a)) continue;
      fs.rmSync(fullPath, { recursive: true, force: true });
    }

    // 重命名 _bundle.js → index.js
    fs.renameSync(bundleOut, path.join(extDir, "index.js"));

    const bundleSize = (fs.statSync(path.join(extDir, "index.js")).size / 1024).toFixed(0);
    log(`  Bundled ${ext.name}: ${beforeCount} files → 1 file (${bundleSize} KB)`);
    successCount++;
  }

  log(`  Total: ${successCount} bundled, ${skipCount} skipped`);
}

/**
 * Step 4: 修改 package.json 入口 .ts → .js
 */
function stepFixPackageJson(extensions: Array<{ name: string }>): void {
  log("Step 4: Updating package.json entries (.ts → .js)...");

  for (const ext of extensions) {
    const pkgJsonPath = path.join(BUILD_DIR, ext.name, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;

    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    let changed = false;

    if (pkg.openclaw?.extensions) {
      pkg.openclaw.extensions = pkg.openclaw.extensions.map((entry: string) => {
        const newEntry = entry.replace(/\.ts$/, ".js");
        if (newEntry !== entry) changed = true;
        return newEntry;
      });
    }

    if (pkg.main && pkg.main.endsWith(".ts")) {
      pkg.main = pkg.main.replace(/\.ts$/, ".js");
      changed = true;
    }

    if (changed) {
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
    }
  }
  log("  Done");
}

// ============================================================================
// Entry
// ============================================================================

async function main() {
  log("Starting extensions pre-compilation bundle");
  log(`Root: ${ROOT}`);
  log(`Build dir: ${BUILD_DIR}`);
  log("");

  const startTime = Date.now();

  const extensions = discoverExtensions();
  log(`Found ${extensions.length} extensions to bundle`);
  log(`Skipping: ${[...SKIP_EXTENSIONS].join(", ")}`);
  log("");

  if (extensions.length === 0) {
    log("No extensions to bundle, exiting.");
    return;
  }

  stepCopy(extensions);
  stepCompile(extensions);
  await stepBundle(extensions);
  stepFixPackageJson(extensions);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log("");
  log(`Done in ${elapsed}s`);
  log(`  Build artifacts: ${BUILD_DIR}`);
  log(`  ${extensions.length} extensions bundled → single index.js each`);
}

main().catch((err) => {
  console.error("[bundle-ext] Fatal:", err);
  process.exit(1);
});

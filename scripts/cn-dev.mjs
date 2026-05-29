#!/usr/bin/env node
// cn-dev.mjs — CN 版本地开发一键启动脚本
//
// 用法:
//   node scripts/cn-dev.mjs              # 启动 gateway + 前端 dev server
//   node scripts/cn-dev.mjs --no-ui      # 只启动 gateway（不启动前端）
//   node scripts/cn-dev.mjs --clean      # 清理配置后重新启动
//   node scripts/cn-dev.mjs --prod       # gateway 使用 ~/.openclaw（非 dev profile）
//
// 解决的问题:
//   1. 自动强制 auth.mode=none（~/.openclaw + ~/.openclaw-dev 两份配置都修复）
//   2. 自动设置 VITE_EDITION=cn（跳过交互选择）
//   3. 自动设置 OPENCLAW_SKIP_CHANNELS=1（本地开发不需要频道）
//   4. gateway 和 vite dev server 并行启动
//   5. 前端自动注入 gatewayUrl 参数
//   6. Ctrl+C 同时停止 gateway 和前端

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const uiCnDir = path.join(repoRoot, "ui-cn");
const controlUiRoot = path.join(repoRoot, "dist", "control-ui");

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);
const isClean = rawArgs.includes("--clean");
const noUi = rawArgs.includes("--no-ui");
const useProd = rawArgs.includes("--prod");
const gatewayArgs = rawArgs.filter(
  (a) => !["--clean", "--no-ui", "--prod"].includes(a),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function log(tag, msg) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  console.log(`${CYAN}[${time}]${RESET} ${BOLD}[${tag}]${RESET} ${msg}`);
}

function warn(tag, msg) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  console.log(`${YELLOW}[${time}]${RESET} ${BOLD}[${tag}]${RESET} ${msg}`);
}

function error(tag, msg) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  console.error(`${RED}[${time}]${RESET} ${BOLD}[${tag}]${RESET} ${msg}`);
}

// ---------------------------------------------------------------------------
// 1. Fix auth in BOTH config files (production + dev)
// ---------------------------------------------------------------------------

function fixAuthConfig(configPath, label) {
  if (!fs.existsSync(configPath)) return;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return;
  }

  let changed = false;

  // Force gateway.mode = "local"
  if (!config.gateway?.mode) {
    config.gateway ??= {};
    config.gateway.mode = "local";
    changed = true;
  }

  // Force gateway.bind = "loopback"
  if (!config.gateway?.bind) {
    config.gateway ??= {};
    config.gateway.bind = "loopback";
    changed = true;
  }

  // Force auth.mode = "none" (核心修复：消除 token mismatch)
  config.gateway ??= {};
  config.gateway.auth ??= {};
  if (config.gateway.auth.mode !== "none") {
    config.gateway.auth.mode = "none";
    // 清理残留的 token/password 字段，避免混淆
    delete config.gateway.auth.token;
    changed = true;
  }

  // Always drop stale shared-secret fields. A lingering token/password can
  // make dev startup fall back into the upstream Control UI auth gate.
  if ("token" in config.gateway.auth) {
    delete config.gateway.auth.token;
    changed = true;
  }
  if ("password" in config.gateway.auth) {
    delete config.gateway.auth.password;
    changed = true;
  }

  config.gateway.controlUi ??= {};
  if (config.gateway.controlUi.enabled !== true) {
    config.gateway.controlUi.enabled = true;
    changed = true;
  }
  if (config.gateway.controlUi.root !== controlUiRoot) {
    config.gateway.controlUi.root = controlUiRoot;
    changed = true;
  }
  if (config.gateway.controlUi.allowInsecureAuth !== true) {
    config.gateway.controlUi.allowInsecureAuth = true;
    changed = true;
  }
  if (config.gateway.controlUi.dangerouslyDisableDeviceAuth !== true) {
    config.gateway.controlUi.dangerouslyDisableDeviceAuth = true;
    changed = true;
  }

  // Ensure CN plugins enabled
  config.plugins ??= {};
  config.plugins.entries ??= {};
  // CN 常用渠道插件：bundled 默认禁用，这里自动启用
  // 未配置凭证的渠道不会建连接，无性能影响
  for (const pluginId of [
    "cn-adapter", "agent-team",
    "feishu", "dingtalk", "wecom",
    "telegram", "discord", "slack",
  ]) {
    if (config.plugins.entries[pluginId]?.enabled == null) {
      config.plugins.entries[pluginId] ??= {};
      config.plugins.entries[pluginId].enabled = true;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    log("config", `已修复 ${label} → auth.mode=none`);
  }
}

function fixAllConfigs() {
  const home = os.homedir();
  // Production config
  const prodConfig = path.join(home, ".openclaw", "openclaw.json");
  fixAuthConfig(prodConfig, "~/.openclaw/openclaw.json");
  // Dev config
  const devConfig = path.join(home, ".openclaw-dev", "openclaw.json");
  fixAuthConfig(devConfig, "~/.openclaw-dev/openclaw.json");
}

// ---------------------------------------------------------------------------
// 2. Clean (optional)
// ---------------------------------------------------------------------------

function cleanAll() {
  const home = os.homedir();
  const stateDir = useProd
    ? path.join(home, ".openclaw")
    : path.join(home, ".openclaw-dev");
  const distDir = path.join(repoRoot, "dist");

  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const lockDirName = uid != null ? `openclaw-${uid}` : "openclaw";
  const lockDir = path.join(os.tmpdir(), lockDirName);

  const targets = [
    { path: lockDir, label: "锁文件目录" },
    { path: path.join(distDir, ".buildstamp"), label: "构建时间戳" },
    { path: path.join(distDir, "control-ui"), label: "UI 构建产物" },
  ];

  log("clean", "清理缓存和锁文件 ...");
  let cleaned = 0;
  for (const { path: p, label } of targets) {
    if (!fs.existsSync(p)) continue;
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        fs.rmSync(p, { recursive: true, force: true });
      } else {
        fs.unlinkSync(p);
      }
      log("clean", `  ${label}: ${p}`);
      cleaned++;
    } catch (err) {
      warn("clean", `  跳过 ${label}: ${err.message}`);
    }
  }
  if (cleaned === 0) log("clean", "  (没有需要清理的内容)");
}

// ---------------------------------------------------------------------------
// 3. Ensure ui-cn built (for gateway's built-in control-ui serving)
// ---------------------------------------------------------------------------

function ensureUiCnBuilt() {
  const controlUiIndex = path.join(repoRoot, "dist", "control-ui", "index.html");
  if (fs.existsSync(controlUiIndex) && !isClean) return;

  log("ui-cn", "构建 dist/control-ui/ ...");

  const viteBin = path.join(uiCnDir, "node_modules", ".bin", "vite");
  const viteInstalled =
    fs.existsSync(viteBin) ||
    fs.existsSync(viteBin + ".cmd") ||
    fs.existsSync(viteBin + ".ps1");
  if (!viteInstalled) {
    log("ui-cn", "安装依赖 ...");
    spawnSync("npm", ["install", "--install-strategy=nested"], {
      cwd: uiCnDir,
      stdio: "inherit",
      shell: true,
    });
  }

  const build = spawnSync("npx", ["vite", "build"], {
    cwd: uiCnDir,
    stdio: "inherit",
    env: { ...process.env, VITE_EDITION: "cn" },
    shell: true,
  });

  if (build.status !== 0) {
    error("ui-cn", "构建失败");
    process.exit(1);
  }
  log("ui-cn", "构建完成 ✓");
}

// ---------------------------------------------------------------------------
// 4. Start gateway
// ---------------------------------------------------------------------------

function startGateway() {
  const devFlag = useProd ? [] : ["--dev"];
  const args = [
    "scripts/run-node.mjs",
    ...devFlag,
    "gateway",
    "--force",
    "--auth",
    "none",
    ...gatewayArgs,
  ];

  const env = {
    ...process.env,
    // OPENCLAW_SKIP_CHANNELS: "1",  // 注释掉以允许渠道连接（飞书等）
    VITE_EDITION: "cn",
    OPENCLAWCN_DEV: "1",           // CN dev mode
    OPENCLAWCN_CONTROL_UI_ROOT: controlUiRoot,
  };

  log("gateway", `启动中 ... (profile: ${useProd ? "production" : "dev"})`);

  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });

  child.on("error", (err) => {
    error("gateway", `启动失败: ${err.message}`);
  });

  return child;
}

// ---------------------------------------------------------------------------
// 5. Start vite dev server for ui-cn
// ---------------------------------------------------------------------------

function startUiDev(gatewayPort) {
  // Windows 下 .bin 脚本需要用 .cmd 后缀，通过 shell: true 让系统自动解析
  const viteBin = path.join(uiCnDir, "node_modules", ".bin", "vite");
  const viteExists =
    fs.existsSync(viteBin) ||
    fs.existsSync(viteBin + ".cmd") ||
    fs.existsSync(viteBin + ".ps1");
  if (!viteExists) {
    warn("ui-dev", "vite 未安装，跳过前端 dev server");
    return null;
  }

  log("ui-dev", "启动 Vite dev server ...");

  const child = spawn("npx", ["vite", "dev", "--host"], {
    cwd: uiCnDir,
    stdio: "inherit",
    env: { ...process.env, VITE_EDITION: "cn" },
    shell: true,
  });

  child.on("error", (err) => {
    error("ui-dev", `启动失败: ${err.message}`);
  });

  // 等 vite 启动后打印使用说明
  setTimeout(() => {
    console.log("");
    console.log(`${GREEN}${BOLD}═══════════════════════════════════════════════════════${RESET}`);
    console.log(`${GREEN}${BOLD}  CN 本地开发环境已就绪${RESET}`);
    console.log(`${GREEN}${BOLD}═══════════════════════════════════════════════════════${RESET}`);
    console.log("");
    console.log(`  ${BOLD}Gateway${RESET}:  ws://127.0.0.1:${gatewayPort}`);
    console.log(`  ${BOLD}控制台${RESET}:   http://127.0.0.1:${gatewayPort}/`);
    console.log(`  ${BOLD}前端Dev${RESET}:  http://localhost:5173/?gatewayUrl=ws://127.0.0.1:${gatewayPort}`);
    console.log("");
    console.log(`  ${YELLOW}提示: 开发时请打开前端Dev地址（支持热更新）${RESET}`);
    console.log(`  ${YELLOW}按 Ctrl+C 停止所有服务${RESET}`);
    console.log("");
  }, 2000);

  return child;
}

// ---------------------------------------------------------------------------
// 6. Resolve gateway port from config
// ---------------------------------------------------------------------------

function resolveGatewayPort() {
  const home = os.homedir();
  const configFile = useProd
    ? path.join(home, ".openclaw", "openclaw.json")
    : path.join(home, ".openclaw-dev", "openclaw.json");

  if (fs.existsSync(configFile)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
      if (cfg.gateway?.port) return cfg.gateway.port;
    } catch { /* ignore */ }
  }

  // dev 模式默认 19001，prod 模式默认 18789
  return useProd ? 18789 : 19001;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const children = [];

function cleanup() {
  log("dev", "正在停止所有服务 ...");
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch { /* ignore */ }
  }
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Step 1: Clean if requested
if (isClean) cleanAll();

// Step 2: Fix auth config (both prod and dev)
fixAllConfigs();

// Step 3: Build ui-cn for gateway's built-in serving
ensureUiCnBuilt();

// Step 4: Resolve port
const gatewayPort = resolveGatewayPort();

// Step 5: Start gateway
const gwChild = startGateway();
children.push(gwChild);

// Step 6: Start ui-cn dev server (unless --no-ui)
if (!noUi) {
  // 延迟 1s 让 gateway 先启动
  setTimeout(() => {
    const uiChild = startUiDev(gatewayPort);
    if (uiChild) children.push(uiChild);
  }, 1000);
}

// 监听子进程退出
gwChild.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    error("gateway", `进程退出 (code=${code})`);
    cleanup();
  }
});

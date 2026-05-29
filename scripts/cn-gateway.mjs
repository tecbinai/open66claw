#!/usr/bin/env node
// cn-gateway.mjs — CN 版 gateway 一键启动脚本
//
// 用法:
//   node scripts/cn-gateway.mjs [gateway args...]        # 保留上次状态，继续调试
//   node scripts/cn-gateway.mjs --clean [gateway args...]  # 清理所有配置，干净启动
//
// 自动完成：
//   1. (--clean) 清理上次的配置、缓存、锁文件、构建产物
//   2. 确保 cn-adapter / agent-team 插件已启用（补全 ~/.openclaw/openclaw.json）
//   3. 确保 ui-cn 已构建到 dist/control-ui/
//   4. 启动 gateway（透传所有参数）

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const uiCnDir = path.join(repoRoot, "ui-cn");
const controlUiIndex = path.join(repoRoot, "dist", "control-ui", "index.html");

// ---------------------------------------------------------------------------
// 0. --clean: 清理所有上次的配置和缓存，从零开始
// ---------------------------------------------------------------------------

function cleanAll() {
  const stateDir = path.join(os.homedir(), ".openclaw");
  const distDir = path.join(repoRoot, "dist");
  const buildStamp = path.join(distDir, ".buildstamp");

  // Determine lock dir (same logic as paths.ts resolveGatewayLockDir)
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  const lockDirName = uid != null ? `openclaw-${uid}` : "openclaw";
  const lockDir = path.join(os.tmpdir(), lockDirName);

  const targets = [
    { path: path.join(stateDir, "openclaw.json"), label: "配置文件" },
    { path: path.join(stateDir, "credentials"),   label: "凭证目录" },
    { path: path.join(stateDir, "workspace"),      label: "工作空间" },
    { path: path.join(stateDir, "cache"),           label: "缓存目录" },
    { path: lockDir,                                label: "锁文件目录" },
    { path: buildStamp,                             label: "构建时间戳" },
    { path: path.join(distDir, "control-ui"),       label: "UI 构建产物" },
  ];

  console.log("[cn-gateway] --clean 模式：清理所有上次配置 ...");

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
      console.log(`  [清理] ${label}: ${p}`);
      cleaned++;
    } catch (err) {
      console.warn(`  [跳过] ${label}: ${err.message}`);
    }
  }

  if (cleaned === 0) {
    console.log("  (没有需要清理的内容)");
  } else {
    console.log(`[cn-gateway] 已清理 ${cleaned} 项，将以全新状态启动\n`);
  }
}

// ---------------------------------------------------------------------------
// 1. Ensure CN defaults in ~/.openclaw/openclaw.json
//    (JS port of sidecar.rs ensure_cn_defaults — fill-empty semantics)
// ---------------------------------------------------------------------------

function ensureCnDefaults() {
  const stateDir = path.join(os.homedir(), ".openclaw");
  const configPath = path.join(stateDir, "openclaw.json");

  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
      config = {};
    }
  }

  let changed = false;

  // gateway.mode = "local"
  if (!config.gateway?.mode) {
    config.gateway ??= {};
    config.gateway.mode = "local";
    changed = true;
  }

  // gateway.bind = "loopback"
  if (!config.gateway?.bind) {
    config.gateway ??= {};
    config.gateway.bind = "loopback";
    changed = true;
  }

  // gateway.auth.mode = "none" (CLI 启动场景无需 token 认证，已绑定 loopback)
  // Force-set: 旧配置可能残留 auth.mode="token"（来自桌面端或其他场景），
  // 会导致浏览器 WebSocket 连接失败。
  {
    config.gateway ??= {};
    config.gateway.auth ??= {};
    if (config.gateway.auth.mode !== "none") {
      config.gateway.auth.mode = "none";
      changed = true;
    }
  }

  // Remove stale controlUi.root override — the gateway's default discovery
  // (dist/control-ui/ relative to repo root) is correct. Old configs may
  // point to ui-cn/dist/ which is no longer the build output directory.
  if (config.gateway?.controlUi?.root) {
    delete config.gateway.controlUi.root;
    // Clean up empty controlUi object
    if (config.gateway.controlUi && Object.keys(config.gateway.controlUi).length === 0) {
      delete config.gateway.controlUi;
    }
    changed = true;
  }

  // CN 常用插件 + 渠道：bundled 默认禁用，这里自动启用
  // 未配置凭证的渠道不会建连接，无性能影响
  config.plugins ??= {};
  config.plugins.entries ??= {};

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
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`[cn-gateway] 已补全 CN 默认配置 → ${configPath}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Ensure ui-cn is built to dist/control-ui/
// ---------------------------------------------------------------------------

/**
 * Get the newest mtime (ms) among all source files in a directory (recursive).
 * Skips node_modules and dot-directories.
 */
function newestMtime(dir) {
  let newest = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return newest;
  }
  for (const entry of entries) {
    const name = entry.name;
    if (name === "node_modules" || name.startsWith(".")) {
      continue;
    }
    const full = path.join(dir, name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(full));
    } else {
      try {
        newest = Math.max(newest, fs.statSync(full).mtimeMs);
      } catch {
        // skip unreadable files
      }
    }
  }
  return newest;
}

/**
 * Check whether the dist is stale (source newer than built output).
 */
function isDistStale() {
  if (!fs.existsSync(controlUiIndex)) {
    return true;
  }

  try {
    const distMtime = fs.statSync(controlUiIndex).mtimeMs;
    const srcMtime = newestMtime(path.join(uiCnDir, "src"));
    const publicMtime = newestMtime(path.join(uiCnDir, "public"));
    const configMtime = (() => {
      try {
        return fs.statSync(path.join(uiCnDir, "vite.config.ts")).mtimeMs;
      } catch {
        return 0;
      }
    })();
    const latestSource = Math.max(srcMtime, publicMtime, configMtime);
    return latestSource > distMtime;
  } catch {
    return true;
  }
}

function ensureUiCnBuilt() {
  const stale = isDistStale();
  if (!stale) {
    return;
  }

  const reason = fs.existsSync(controlUiIndex)
    ? "源码有更新，重新构建"
    : "dist/control-ui/ 不存在，首次构建";
  console.log(`[cn-gateway] ${reason} ui-cn ...`);

  // Ensure ui-cn deps are installed.
  // ui-cn is NOT in the pnpm workspace, so we use npm.
  // --install-strategy=nested avoids npm crashes caused by pnpm's
  // symlinked node_modules layout in the parent directory.
  const viteBin = path.join(uiCnDir, "node_modules", ".bin", "vite");
  if (!fs.existsSync(viteBin)) {
    console.log("[cn-gateway] 安装 ui-cn 依赖 ...");
    const install = spawnSync("npm", ["install", "--install-strategy=nested"], {
      cwd: uiCnDir,
      stdio: "inherit",
      env: process.env,
    });
    if (install.status !== 0) {
      console.error("[cn-gateway] ui-cn npm install 失败");
      process.exit(1);
    }
  }

  const build = spawnSync(viteBin, ["build"], {
    cwd: uiCnDir,
    stdio: "inherit",
    env: { ...process.env, VITE_EDITION: "cn" },
  });

  if (build.status !== 0) {
    console.error("[cn-gateway] ui-cn 构建失败");
    process.exit(1);
  }

  if (!fs.existsSync(controlUiIndex)) {
    console.error("[cn-gateway] 构建完成但 dist/control-ui/index.html 仍不存在");
    process.exit(1);
  }

  console.log("[cn-gateway] ui-cn 构建完成 ✓");
}

// ---------------------------------------------------------------------------
// 3. Start gateway (delegate to run-node.mjs)
// ---------------------------------------------------------------------------

function startGateway(extraArgs) {
  const args = ["scripts/run-node.mjs", "gateway", ...extraArgs];
  const child = spawn(process.execPath, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 1);
    }
  });

  // Forward signals to child
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
      child.kill(sig);
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // 解析参数：提取 --clean，其余透传给 gateway
  const rawArgs = process.argv.slice(2);
  const isClean = rawArgs.includes("--clean");
  const gatewayArgs = rawArgs.filter((a) => a !== "--clean");

  if (isClean) {
    cleanAll();
  }

  ensureCnDefaults();
  ensureUiCnBuilt();
  startGateway(gatewayArgs);
}

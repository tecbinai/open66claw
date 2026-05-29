#!/usr/bin/env node
/**
 * Windows Desktop Smoke Test
 *
 * 测试流程：
 *   1. 静默安装 NSIS setup.exe
 *   2. 预写 openclaw.json（已知 token）
 *   3. 启动 openclawcn-desktop.exe，等待 gateway 就绪
 *   4. 通过 WebSocket 测试所有关键 gateway 方法
 *   5. 输出报告，失败则 exit 1
 *   6. 可选：卸载并清理
 *
 * 用法：
 *   node scripts/e2e/windows-desktop-smoke.mjs [--installer <path>] [--install-dir <dir>] [--no-uninstall] [--skip-install]
 *
 * 认证方案：
 *   - 在启动桌面 app 前，预写 ~/.openclaw/openclaw.json（gateway.auth.token = SMOKE_TOKEN）
 *   - gateway 启动时读 config-first token → token 模式认证
 *   - WS 连接不发 Origin header + client.id="cli" → 跳过 origin check
 *   - connect params 带 auth.token → sharedAuthOk=true → 跳过 device identity 要求
 */

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};
const hasFlag = (name) => args.includes(name);

const NSIS_DIR = path.resolve("apps/desktop/src-tauri/target/release/bundle/nsis");
const DEFAULT_INSTALLER = path.resolve(
  NSIS_DIR,
  (fs.existsSync(NSIS_DIR)
    ? fs.readdirSync(NSIS_DIR).filter((f) => f.endsWith("-setup.exe")).sort().at(-1)
    : null) ?? "66Claw_1.0.1_x64-setup.exe",
);

const INSTALLER_PATH = getArg("--installer") ?? DEFAULT_INSTALLER;
const INSTALL_DIR = getArg("--install-dir") ?? "C:\\66ClawSmokeTest";
const NO_UNINSTALL = hasFlag("--no-uninstall");
const SKIP_INSTALL = hasFlag("--skip-install");
const GATEWAY_PORT = parseInt(getArg("--port") ?? "19002", 10);
const TIMEOUT_INSTALL_MS = 120_000;
const TIMEOUT_GATEWAY_MS = 480_000; // jiti pre-compiles 40+ plugins on first run (~6min on slow machines)
const TIMEOUT_WS_MS = 30_000; // config.get can be slow when cn-adapter pre-warms model catalog

// Known token we inject into openclaw.json before launching the app
const SMOKE_TOKEN = getArg("--token") ?? "openclaw-smoke-test-token-2026";

let appProcess = null;

// ── Utilities ─────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[smoke] ${msg}`);
}

function fail(msg) {
  console.error(`[smoke] FAIL: ${msg}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Pre-configure openclaw.json with known token ───────────────────────────────
// Auth strategy:
//   - gateway.auth.mode = "token" + gateway.auth.token = SMOKE_TOKEN
//     so the smoke test can authenticate with a known secret
//   - gateway.controlUi.dangerouslyDisableDeviceAuth = true
//     so control-ui connects without device identity (smoke test has no device key)
//   - ensure_cn_defaults() only fills gateway.mode and gateway.bind, won't overwrite auth fields
function injectSmokeToken() {
  const stateDir = process.env.OPENCLAW_STATE_DIR
    ? process.env.OPENCLAW_STATE_DIR
    : path.join(os.homedir(), ".openclaw");
  const configPath = path.join(stateDir, "openclaw.json");

  fs.mkdirSync(stateDir, { recursive: true });

  let cfg = {};
  if (fs.existsSync(configPath)) {
    try { cfg = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch {}
  }

  cfg.gateway = cfg.gateway ?? {};
  cfg.gateway.auth = {
    ...(cfg.gateway.auth ?? {}),
    mode: "token",
    token: SMOKE_TOKEN,
  };
  cfg.gateway.controlUi = {
    ...(cfg.gateway.controlUi ?? {}),
    // Allow control-ui connect without device identity from localhost
    dangerouslyDisableDeviceAuth: true,
  };

  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf8");
  log(`Pre-configured ${configPath} with smoke token + dangerouslyDisableDeviceAuth`);
}

// ── Install ───────────────────────────────────────────────────────────────────
function install() {
  if (!fs.existsSync(INSTALLER_PATH)) {
    fail(`Installer not found: ${INSTALLER_PATH}`);
  }
  log(`Installing from: ${INSTALLER_PATH}`);
  log(`Install dir: ${INSTALL_DIR}`);

  // NSIS silent install: /S = silent, /D = destination dir
  try {
    execSync(`"${INSTALLER_PATH}" /S /D=${INSTALL_DIR}`, {
      timeout: TIMEOUT_INSTALL_MS,
      stdio: "inherit",
    });
  } catch (e) {
    fail(`Install failed: ${e.message}`);
  }
  // Wait a bit for installer to finish writing files
  execSync("ping -n 3 127.0.0.1 > nul", { shell: true });
  log("Install complete");
}

// ── Launch app ────────────────────────────────────────────────────────────────
function launchApp() {
  const exePath = path.join(INSTALL_DIR, "openclawcn-desktop.exe");
  if (!fs.existsSync(exePath)) {
    fail(`App binary not found: ${exePath}`);
  }
  log(`Launching: ${exePath}`);
  appProcess = spawn(exePath, [], {
    detached: false,
    stdio: "ignore",
    env: {
      ...process.env,
      // sidecar.rs forces gateway.auth.token = "${OPENCLAW_GATEWAY_TOKEN}" in config,
      // then passes this env var to the gateway process. By setting it here,
      // the Desktop app will use our known smoke token instead of generating a random one.
      OPENCLAW_GATEWAY_TOKEN: SMOKE_TOKEN,
    },
  });
  appProcess.on("error", (err) => {
    log(`App process error: ${err.message}`);
  });
  log(`App PID: ${appProcess.pid}`);
}

// ── Wait for gateway HTTP health ──────────────────────────────────────────────
async function waitForGateway() {
  log(`Waiting for gateway on port ${GATEWAY_PORT}...`);
  const deadline = Date.now() + TIMEOUT_GATEWAY_MS;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(
          `http://127.0.0.1:${GATEWAY_PORT}/health`,
          (res) => {
            res.resume();
            if (res.statusCode < 500) resolve();
            else reject(new Error(`HTTP ${res.statusCode}`));
          },
        );
        req.on("error", reject);
        req.setTimeout(2000, () => {
          req.destroy();
          reject(new Error("timeout"));
        });
      });
      log("Gateway HTTP health OK");
      return;
    } catch {
      await sleep(1000);
    }
  }
  fail(`Gateway did not become ready within ${TIMEOUT_GATEWAY_MS}ms`);
}

// ── Open authenticated WebSocket ──────────────────────────────────────────────
// Auth strategy:
//   - Origin header = http://127.0.0.1:PORT → isLocalClient=true + loopback host → origin check passes
//   - client.id = "openclaw-control-ui" → isControlUi=true
//   - dangerouslyDisableDeviceAuth=true in config → allowBypass=true → no device identity required
//   - auth.token = SMOKE_TOKEN → sharedAuthOk=true → scopes not cleared for control-ui
async function openAuthenticatedWs(token) {
  return new Promise((resolve, reject) => {
    // Origin header passes the local-loopback origin check for control-ui
    const socket = new WebSocket(`ws://127.0.0.1:${GATEWAY_PORT}`, {
      headers: {
        origin: `http://127.0.0.1:${GATEWAY_PORT}`,
      },
    });
    socket.setMaxListeners(30);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
    setTimeout(() => reject(new Error("WS connect timeout")), 10_000);
  });
}

// ── Build connect params ──────────────────────────────────────────────────────
function buildConnectParams(token) {
  return {
    minProtocol: 1,
    maxProtocol: 999,
    client: {
      // Use control-ui so scopes are NOT cleared even without device identity
      // (requires dangerouslyDisableDeviceAuth=true + local-loopback origin)
      id: "openclaw-control-ui",
      version: "1.0.0",
      platform: "win32",
      mode: "ui",
    },
    // Request all operator scopes — preserved because:
    //   dangerouslyDisableDeviceAuth=true → allowBypass=true → decision="allow"
    //   → clearUnboundScopes() NOT called for control-ui on allow path
    scopes: ["operator.admin", "operator.read", "operator.write", "operator.approvals"],
    auth: token ? { token } : undefined,
  };
}

// ── Perform connect handshake ─────────────────────────────────────────────────
function performHandshake(ws, token) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("handshake timeout"));
    }, 10_000);

    let challenged = false;
    let handshakeSent = false;

    const onMsg = (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      // Gateway sends connect.challenge event before any request
      if (msg.type === "event" && msg.event === "connect.challenge" && !challenged) {
        challenged = true;
        if (handshakeSent) return;
        handshakeSent = true;
        ws.send(JSON.stringify({
          type: "req",
          id: "__handshake__",
          method: "connect",
          params: buildConnectParams(token),
        }));
        return;
      }

      if (msg.id === "__handshake__") {
        clearTimeout(timer);
        ws.off("message", onMsg);
        if (msg.ok === false) {
          const errMsg = msg.error?.message ?? msg.errorMessage ?? "ERROR";
          reject(new Error(`connect failed: ${errMsg}`));
        } else {
          resolve(msg.payload ?? msg);
        }
      }
    };

    ws.on("message", onMsg);

    // Fallback: send connect after 500ms if no challenge arrives
    setTimeout(() => {
      if (!handshakeSent) {
        handshakeSent = true;
        ws.send(JSON.stringify({
          type: "req",
          id: "__handshake__",
          method: "connect",
          params: buildConnectParams(token),
        }));
      }
    }, 500);
  });
}

// ── WebSocket RPC test ────────────────────────────────────────────────────────
function wsRequest(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      reject(new Error(`timeout waiting for ${method}`));
    }, TIMEOUT_WS_MS);

    const onMessage = (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.id !== id) return;
      clearTimeout(timer);
      ws.off("message", onMessage);
      if (msg.ok === false) {
        const errMsg = msg.error?.message ?? msg.errorMessage ?? "ERROR";
        reject(new Error(`${method}: ${msg.error?.code ?? "ERROR"} — ${errMsg}`));
      } else {
        resolve(msg.payload ?? msg);
      }
    };

    ws.on("message", onMessage);
    // Gateway protocol: { type: "req", id, method, params }
    ws.send(JSON.stringify({ type: "req", id, method, params }));
  });
}

// ── Methods to test ───────────────────────────────────────────────────────────
const REQUIRED_METHODS = [
  // cn-adapter 核心
  { method: "cn.status", critical: true },
  // UI bridge — 模型设置页
  { method: "capability_matrix.summary", critical: true },
  { method: "capability_matrix.providers.list", critical: true },
  { method: "capability_matrix.providerGroups", critical: true },
  { method: "capability_matrix.health", critical: true },
  { method: "capability_matrix.priority.get", critical: true },
  { method: "capability_matrix.extractionStatus", critical: false },
  // Config
  { method: "config.get", critical: true },
  // Chat history (requires sessionKey param; use a dummy key — may return empty or error)
  { method: "chat.history", params: { sessionKey: "default" }, critical: false },
  // CN branding
  { method: "cn.branding.get", critical: false },
];

async function runWsTests(token) {
  log(`Connecting WebSocket to ws://127.0.0.1:${GATEWAY_PORT}`);

  const ws = await openAuthenticatedWs(token);
  log("WebSocket connected");

  // Perform connect handshake
  try {
    await performHandshake(ws, token);
    log("connect handshake OK");
  } catch (e) {
    log(`connect handshake warning: ${e.message}`);
    // Don't fail — some methods might still work
  }

  const results = [];
  for (const { method, params, critical } of REQUIRED_METHODS) {
    try {
      await wsRequest(ws, method, params ?? {});
      results.push({ method, status: "PASS", critical });
      log(`  [PASS] ${method}`);
    } catch (e) {
      results.push({ method, status: "FAIL", error: e.message, critical });
      log(`  [FAIL] ${method}: ${e.message}`);
    }
  }

  ws.close();
  return results;
}

// ── Poll cn.status until ready ────────────────────────────────────────────────
async function waitForCnAdapter(token) {
  log("Waiting for cn-adapter to register (polling cn.status)...");
  const deadline = Date.now() + 180_000;
  let cnReady = false;

  while (Date.now() < deadline) {
    try {
      const ws = await new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${GATEWAY_PORT}`, {
          headers: { origin: `http://127.0.0.1:${GATEWAY_PORT}` },
        });
        socket.setMaxListeners(30);
        socket.once("open", () => resolve(socket));
        socket.once("error", reject);
        setTimeout(() => {
          socket.removeAllListeners();
          socket.terminate();
          reject(new Error("timeout"));
        }, 5000);
      });

      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          try { ws.terminate(); } catch {}
          reject(new Error("timeout"));
        }, 12_000);

        let challenged = false;
        let handshakeSent = false;
        const reqId = Math.random().toString(36).slice(2);

        ws.on("message", (data) => {
          let msg;
          try { msg = JSON.parse(data.toString()); } catch { return; }

          if (msg.type === "event" && msg.event === "connect.challenge" && !challenged) {
            challenged = true;
            if (handshakeSent) return;
            handshakeSent = true;
            ws.send(JSON.stringify({
              type: "req", id: "__hsk__", method: "connect",
              params: buildConnectParams(token),
            }));
            return;
          }

          if (msg.id === "__hsk__") {
            if (msg.ok === false) {
              clearTimeout(timer);
              try { ws.terminate(); } catch {}
              reject(new Error(`connect failed: ${msg.error?.message ?? "?"}`));
              return;
            }
            ws.send(JSON.stringify({ type: "req", id: reqId, method: "cn.status", params: {} }));
            return;
          }

          if (msg.id === reqId) {
            clearTimeout(timer);
            try { ws.terminate(); } catch {}
            resolve(msg);
          }
        });

        ws.once("error", (err) => { clearTimeout(timer); reject(err); });

        // Fallback: send connect after 500ms if no challenge
        setTimeout(() => {
          if (!handshakeSent) {
            handshakeSent = true;
            ws.send(JSON.stringify({
              type: "req", id: "__hsk__", method: "connect",
              params: buildConnectParams(token),
            }));
          }
        }, 500);
      });

      if (result && result.ok !== false) {
        log("cn-adapter ready (cn.status responded OK)");
        cnReady = true;
        break;
      } else if (result) {
        log(`cn.status returned ok=false: ${result.error?.message ?? "?"}`);
      }
    } catch (e) {
      log(`cn.status poll: ${e.message} — retrying...`);
    }
    await sleep(3000);
  }

  if (!cnReady) {
    log("WARNING: cn.status never responded — proceeding anyway");
  }
}

// ── Uninstall ─────────────────────────────────────────────────────────────────
function uninstall() {
  const uninstaller = path.join(INSTALL_DIR, "uninstall.exe");
  if (fs.existsSync(uninstaller)) {
    log("Uninstalling...");
    try {
      execSync(`"${uninstaller}" /S`, { timeout: 60_000, stdio: "inherit" });
    } catch (e) {
      log(`Uninstall warning: ${e.message}`);
    }
  } else {
    log("No uninstaller found, skipping uninstall");
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
function cleanup() {
  if (appProcess) {
    try {
      execSync(`taskkill /F /PID ${appProcess.pid} /T`, {
        stdio: "ignore",
        shell: true,
      });
    } catch {}
    appProcess = null;
    // Only kill port process if we launched the app ourselves
    try {
      execSync(
        `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${GATEWAY_PORT}') do taskkill /F /PID %a`,
        { shell: true, stdio: "ignore" },
      );
    } catch {}
  }
  // Note: in --skip-install mode (appProcess=null), we don't kill the gateway
  // to avoid disrupting a pre-existing running instance.
}

process.on("exit", () => { try { cleanup(); } catch {} });
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log("=== Windows Desktop Smoke Test ===");
  log(`Installer: ${INSTALLER_PATH}`);
  log(`Install dir: ${INSTALL_DIR}`);
  log(`Gateway port: ${GATEWAY_PORT}`);
  log(`Smoke token: ${SMOKE_TOKEN.substring(0, 12)}...`);

  if (!SKIP_INSTALL) {
    // Step 1: Install
    install();

    // Step 2: Pre-configure openclaw.json with known token (before launching)
    injectSmokeToken();

    // Kill any existing process on the port
    try {
      execSync(
        `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${GATEWAY_PORT}') do taskkill /F /PID %a`,
        { shell: true, stdio: "ignore" },
      );
      log(`Killed any existing process on port ${GATEWAY_PORT}`);
      await sleep(2000);
    } catch {}

    // Step 3: Launch the installed app
    launchApp();
  } else {
    log("Skipping install and launch (--skip-install) — using running gateway");
    log(`Using token: ${SMOKE_TOKEN.substring(0, 12)}...`);
  }

  // Step 4: Wait for gateway HTTP
  await waitForGateway();

  // Step 4b: Wait for cn-adapter to finish registering
  // jiti loads all static imports synchronously; may take 90–120s cold cache.
  await waitForCnAdapter(SMOKE_TOKEN);

  // Step 5: WebSocket tests
  const results = await runWsTests(SMOKE_TOKEN);

  // Step 6: Report
  const passed = results.filter((r) => r.status === "PASS");
  const failed = results.filter((r) => r.status === "FAIL");
  const criticalFailed = failed.filter((r) => r.critical);

  console.log("\n=== Smoke Test Results ===");
  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : "✗";
    const tag = r.critical ? "(critical)" : "(optional)";
    console.log(
      `  [${r.status}] ${icon} ${r.method} ${tag}${r.error ? ` — ${r.error}` : ""}`,
    );
  }
  console.log(
    `\nTotal: ${results.length}, Passed: ${passed.length}, Failed: ${failed.length}`,
  );

  // Step 7: Cleanup
  cleanup();
  if (!NO_UNINSTALL) {
    uninstall();
  }

  if (criticalFailed.length > 0) {
    console.error(
      `\n[smoke] FAILED: ${criticalFailed.length} critical method(s) failed`,
    );
    process.exit(1);
  } else {
    console.log("\n[smoke] All critical checks passed.");
    if (failed.length > 0) {
      console.warn(
        `[smoke] ${failed.length} optional method(s) failed (non-blocking)`,
      );
    }
  }
}

main().catch((err) => {
  console.error(`[smoke] Fatal: ${err.message}`);
  cleanup();
  process.exit(1);
});

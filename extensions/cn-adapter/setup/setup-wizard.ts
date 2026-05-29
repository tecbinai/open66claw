/**
 * Setup Wizard - Main Entry Point (cn-adapter plugin version)
 *
 * 安全模型：
 * 1. Setup 完成后整个 /api/setup/* 路由返回 410 Gone
 * 2. 所有写操作端点强制 loopback-only
 * 3. /browse-directory 限制只能浏览用户主目录及指定安全路径
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../../src/config/config.js";
import { serveSetupPage } from "./setup-page.js";

export type { SetupWizardState, ChannelStartCallback } from "./setup-wizard-types.js";
export { setChannelStartCallback } from "./setup-wizard-state.js";
import { getSetupState } from "./setup-wizard-state.js";

import {
  handleGetState,
  handleGetProviders,
  handleBrowseDirectory,
  handleValidateApiKey,
  handleVerifyApiKey,
  handleValidatePath,
  handleConfigureProvider,
  handleConfigureWorkspace,
  handleConfigureSecurity,
  handleConfigureChannels,
  handleVerifyChannel,
  handleComplete,
  handleRestart,
  handleFetchModels,
  handleDevReset,
} from "./setup-wizard-handlers.js";
import { SETUP_API_PREFIX, SETUP_UI_PATH, sendJson } from "./setup-wizard-utils.js";

// ============================================================================
// Security helpers
// ============================================================================

const SETUP_WRITE_API_PATHS = new Set([
  "/configure-provider",
  "/configure-workspace",
  "/configure-security",
  "/configure-channels",
  "/complete",
  "/restart",
  "/fetch-models",
  "/browse-directory",
]);

function isLoopback(req: IncomingMessage): boolean {
  const remoteIp = req.socket?.remoteAddress ?? "";
  return remoteIp === "127.0.0.1" || remoteIp === "::1" || remoteIp === "::ffff:127.0.0.1";
}

function requireLoopback(req: IncomingMessage, res: ServerResponse): boolean {
  if (isLoopback(req)) return true;
  sendJson(res, 403, { ok: false, error: "此接口仅允许本机访问" });
  return false;
}

// ============================================================================
// Main HTTP Handler
// ============================================================================

export async function handleSetupHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const urlRaw = req.url;
  if (!urlRaw) return false;

  const url = new URL(urlRaw, "http://localhost");
  const pathname = url.pathname;

  // 处理 API 请求
  if (pathname.startsWith(SETUP_API_PREFIX)) {
    const apiPath = pathname.slice(SETUP_API_PREFIX.length);

    // CORS
    const origin = req.headers.origin;
    if (origin) {
      try {
        const isTauri = origin === "tauri://localhost";
        if (isTauri) {
          res.setHeader("Access-Control-Allow-Origin", origin);
        } else {
          const parsed = new URL(origin);
          const reqHost = req.headers.host ?? "";
          const bracketEnd = reqHost.lastIndexOf("]");
          const lastColon = reqHost.lastIndexOf(":");
          const hostPort = lastColon > bracketEnd ? reqHost.slice(lastColon + 1) : "";
          const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
          const isSamePort = parsed.port === hostPort;
          if (isLocal && isSamePort) {
            res.setHeader("Access-Control-Allow-Origin", origin);
          }
        }
      } catch {
        // invalid origin
      }
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return true;
    }

    // Open-source/local builds must keep setup APIs available so users can
    // reconfigure providers from a stale setup page or by revisiting /setup.
    // Write endpoints below are still restricted to loopback.

    // 写操作端点强制 loopback
    if (SETUP_WRITE_API_PATHS.has(apiPath) && !requireLoopback(req, res)) {
      return true;
    }

    // 路由 API 请求
    if (req.method === "GET") {
      switch (apiPath) {
        case "/dev-reset":
          await handleDevReset(req, res);
          return true;
        case "/state":
          await handleGetState(req, res);
          return true;
        case "/providers":
          await handleGetProviders(req, res);
          return true;
        case "/browse-directory":
          await handleBrowseDirectory(req, res);
          return true;
      }
    }

    if (req.method === "POST") {
      switch (apiPath) {
        case "/validate-api-key":
          await handleValidateApiKey(req, res);
          return true;
        case "/verify-apikey":
          await handleVerifyApiKey(req, res);
          return true;
        case "/validate-path":
          await handleValidatePath(req, res);
          return true;
        case "/configure-provider":
          await handleConfigureProvider(req, res);
          return true;
        case "/configure-workspace":
          await handleConfigureWorkspace(req, res);
          return true;
        case "/configure-security":
          await handleConfigureSecurity(req, res);
          return true;
        case "/configure-channels":
          await handleConfigureChannels(req, res);
          return true;
        case "/verify-channel":
          await handleVerifyChannel(req, res);
          return true;
        case "/complete":
          await handleComplete(req, res);
          return true;
        case "/restart":
          await handleRestart(req, res);
          return true;
        case "/fetch-models":
          await handleFetchModels(req, res);
          return true;
        case "/open-url": {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            const body = JSON.parse(Buffer.concat(chunks).toString());
            const rawUrl = body?.url;
            let parsedUrl: URL | undefined;
            try {
              parsedUrl = new URL(rawUrl);
            } catch {
              /* invalid */
            }
            if (
              !rawUrl ||
              typeof rawUrl !== "string" ||
              !parsedUrl ||
              (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
            ) {
              sendJson(res, 400, { ok: false, error: "Invalid URL" });
              return true;
            }
            const SHELL_METACHAR_RE = /[|;<>`$(){}!\x00-\x1f]/;
            if (SHELL_METACHAR_RE.test(rawUrl)) {
              sendJson(res, 400, { ok: false, error: "URL contains forbidden characters" });
              return true;
            }
            const { execFile } = await import("node:child_process");
            if (process.platform === "win32") {
              execFile("cmd", ["/c", "start", "", parsedUrl.href]);
            } else if (process.platform === "darwin") {
              execFile("open", [rawUrl]);
            } else {
              execFile("xdg-open", [rawUrl]);
            }
            sendJson(res, 200, { ok: true });
          } catch (e) {
            sendJson(res, 500, { ok: false, error: String(e) });
          }
          return true;
        }
      }
    }

    sendJson(res, 404, { ok: false, error: "未知的 API 端点" });
    return true;
  }

  // 处理 Setup UI 页面请求
  if (pathname === SETUP_UI_PATH || pathname === `${SETUP_UI_PATH}/`) {
    const config = loadConfig() as any;
    const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN ?? config.gateway?.auth?.token;
    serveSetupPage(res, gatewayToken);
    return true;
  }

  return false;
}

// ============================================================================
// shouldShowSetupWizard
// ============================================================================

export function shouldShowSetupWizard(): boolean {
  try {
    // completedAt 存在 setup 状态文件中，不写入上游主 config
    const setupCompleted = Boolean(getSetupState().completed);
    if (setupCompleted) return false;
    const config = loadConfig() as any;
    const hasProvider = Boolean(
      config.models?.providers && Object.keys(config.models.providers).length > 0,
    );
    if (!hasProvider) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * 是否有历史配置（有 provider 但 setup 未标记完成）
 * 用于在重定向到 /setup 时携带 ?hasHistory=1，以显示"欢迎回来"页面
 */
export function hasHistoryConfig(): boolean {
  try {
    if (Boolean(getSetupState().completed)) return false;
    const config = loadConfig() as any;
    return Boolean(
      config.models?.providers && Object.keys(config.models.providers).length > 0,
    );
  } catch {
    return false;
  }
}

export function getSetupWizardUrl(port: number): string {
  return `http://localhost:${port}/setup`;
}

// ============================================================================
// /browse-directory 路径安全边界
// ============================================================================

export function isPathAllowedForBrowse(targetPath: string): boolean {
  const normalized = path.resolve(targetPath);
  const homedir = os.homedir();

  if (normalized === homedir || normalized.startsWith(homedir + path.sep)) {
    return true;
  }

  if (os.platform() === "win32") {
    if (/^[A-Za-z]:\\$/.test(normalized)) {
      return true;
    }
  }

  if (os.platform() !== "win32") {
    const blockedPrefixes = ["/etc", "/sys", "/proc", "/dev", "/boot", "/root"];
    for (const blocked of blockedPrefixes) {
      if (normalized === blocked || normalized.startsWith(blocked + "/")) {
        return false;
      }
    }
    if (normalized === "/" || normalized.startsWith("/home/") || normalized.startsWith("/tmp/")) {
      return true;
    }
    return false;
  }

  return false;
}

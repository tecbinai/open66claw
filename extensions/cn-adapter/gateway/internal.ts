import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { extractCnConfig } from "../hooks/index.js";
import { safeGateway } from "../utils/index.js";
import { requireScope, ADMIN_SCOPE } from "./auth-guard.js";

const CN_API_VERSION = 1;

/**
 * K1: 脱敏配置快照，将所有含 key/token/secret/password 字段名的字符串值
 * 替换为 xxx***...xxxx 格式，防止明文 API Key 通过 gateway 泄露。
 */
function maskSensitiveConfig(obj: unknown): unknown {
  const SENSITIVE = /key|token|secret|password/i;
  if (Array.isArray(obj)) return obj.map(maskSensitiveConfig);
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE.test(k) && typeof v === "string" && v.length > 8) {
        result[k] = `${v.slice(0, 3)}***...${v.slice(-4)}`;
      } else {
        result[k] = maskSensitiveConfig(v);
      }
    }
    return result;
  }
  return obj;
}

/**
 * 注册 cn.internal.* 命名空间的 gateway methods。
 * 用于插件间通信（agent-team / orchestrator 查询 cn-adapter 状态）。
 *
 * @param version - 插件版本号，从 index.ts 传入避免重复定义
 */
export function registerInternalHandlers(api: OpenClawPluginApi, version: string): void {
  api.registerGatewayMethod(
    "cn.internal.adapter.version",
    safeGateway("cn.internal.adapter.version", async ({ respond }) => {
      respond(true, { version, apiVersion: CN_API_VERSION });
    }),
  );

  api.registerGatewayMethod(
    "cn.internal.adapter.health",
    safeGateway("cn.internal.adapter.health", async ({ respond }) => {
      respond(true, { status: "ok", uptime: process.uptime() });
    }),
  );

  api.registerGatewayMethod(
    "cn.internal.config.snapshot",
    safeGateway("cn.internal.config.snapshot", async ({ client, respond }) => {
      // G2: 内部配置快照需要 ADMIN 权限
      if (!requireScope(client, respond, ADMIN_SCOPE)) return;
      const config = extractCnConfig(api.pluginConfig);
      respond(true, maskSensitiveConfig(config));
    }),
  );
}

/**
 * Gateway method 模板 — 替换 "my-method" 为你的方法名称
 *
 * 使用方法：
 * 1. 在 gateway/handlers.ts 或 gateway/internal.ts 中添加方法
 * 2. 用 safeGateway 包装
 *
 * 命名规范：cn.<模块>.<操作>
 *   cn.voice.list / cn.support.qrcode
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { safeGateway } from "../utils/index.js";

/**
 * 注册 my-module 相关的 gateway methods。
 *
 * 在 index.ts 中调用：
 *   import { registerMyModuleHandlers } from "./gateway/my-module.js";
 *   registerMyModuleHandlers(api);
 */
export function registerMyModuleHandlers(api: OpenClawPluginApi): void {
  // ── 查询类（无参数） ──

  api.registerGatewayMethod(
    "cn.my-module.status", // ← 替换方法名
    safeGateway("cn.my-module.status", async ({ respond }) => {
      // ← 替换为实际逻辑
      respond(true, { status: "ok" });
    }),
  );

  // ── 操作类（有参数） ──

  api.registerGatewayMethod(
    "cn.my-module.action", // ← 替换方法名
    safeGateway("cn.my-module.action", async ({ params, respond }) => {
      // 参数校验
      const input = (params as Record<string, unknown>)?.input;
      if (!input || typeof input !== "string") {
        respond(false, undefined, {
          code: "CN_INVALID_PARAMS",
          message: "cn.my-module.action: missing or invalid 'input' parameter",
        });
        return;
      }

      // ← 替换为实际逻辑
      const result = { ok: true, input };

      respond(true, result);
    }),
  );
}

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { saveChatImage } from "../media/chat-image-store.js";
import { createCnLogger } from "../utils/logger.js";
import { safeGateway } from "../utils/index.js";

const log = createCnLogger("gateway:handlers");

/**
 * 注册 CN 业务 gateway methods。
 * - cn.marketplace.* is implemented by the local-only marketplace bridge.
 */
export function registerGatewayHandlers(api: OpenClawPluginApi): void {
  // --- Support ---

  api.registerGatewayMethod(
    "cn.support.qrcode",
    safeGateway("cn.support.qrcode", async ({ respond }) => {
      respond(true, { url: null });
    }),
  );

  // --- Chat image persistence ---
  // UI 发送图片后调用此方法，将用户上传的图片持久化到磁盘 + SQLite。
  // 不侵入上游 chat.send 流程。

  api.registerGatewayMethod(
    "cn.chat.saveImages",
    safeGateway("cn.chat.saveImages", async ({ params, respond }) => {
      const p = params as {
        sessionKey?: string;
        images?: Array<{ base64: string; mimeType: string }>;
        messageText?: string;
      };
      if (!p.sessionKey || !p.images || p.images.length === 0) {
        respond(true, { saved: 0 });
        return;
      }

      const now = Date.now();
      let saved = 0;
      const urls: string[] = [];
      const safeSession = p.sessionKey.replace(/[^a-zA-Z0-9_\-.]/g, "_");
      for (const img of p.images) {
        if (!img.base64 || !img.mimeType) continue;
        try {
          const entry = await saveChatImage({
            sessionKey: p.sessionKey,
            base64: img.base64,
            mimeType: img.mimeType,
            timestamp: now,
            messageText: p.messageText,
          });
          if (entry) {
            saved++;
            urls.push(`/api/media/chat-images/${safeSession}/${entry.file}`);
          }
        } catch (err) {
          log.warn(`saveImages: failed for session ${p.sessionKey}: ${String(err).slice(0, 100)}`);
        }
      }

      log.debug(`saveImages: saved ${saved}/${p.images.length} for session ${p.sessionKey}`);
      respond(true, { saved, urls });
    }),
  );

  // --- MCP/Skills 安全检查（工信部合规：安装前风险提示）---
  // UI 在展示 Skills/MCP 安装按钮前调用此方法，获取安全警告文案。
  // 不阻断安装，仅提供 fail-open 警告（用户确认后仍可继续）。
  // 对应工信部"六要六不要"中：要审查 Skill 代码、不要来源不明的插件。

  api.registerGatewayMethod(
    "cn.security.mcpInstallCheck",
    safeGateway("cn.security.mcpInstallCheck", async ({ params, respond }) => {
      const p = params as { name?: string; source?: string; url?: string };
      const name = typeof p?.name === "string" ? p.name : "未知插件";
      const source = typeof p?.source === "string" ? p.source : "未知来源";
      const url = typeof p?.url === "string" ? p.url : "";

      // 判断是否为已知安全来源
      const TRUSTED_SOURCES = ["openclaw-hub", "woclaw-marketplace", "cn-adapter-builtin"];
      const isTrusted = TRUSTED_SOURCES.includes(source);

      // 判断高风险特征
      const HIGH_RISK_PATTERNS = [/shell/i, /exec/i, /spawn/i, /eval/i, /cmd/i, /bash/i];
      const isHighRisk = HIGH_RISK_PATTERNS.some((re) => re.test(name));

      const warnings: string[] = [];
      if (!isTrusted) {
        warnings.push("⚠️ 此插件来自非官方来源，请确认您信任该来源的代码");
      }
      if (isHighRisk) {
        warnings.push("🔴 插件名称包含高风险关键词，可能请求系统命令执行权限");
      }
      if (url && !url.startsWith("https://")) {
        warnings.push("⚠️ 插件地址不使用 HTTPS，传输过程可能不安全");
      }
      warnings.push("📋 工信部合规提示：安装前请审查插件代码，确认不包含数据外传或提权操作");

      log.info(`mcpInstallCheck: name=${name} source=${source} trusted=${isTrusted} highRisk=${isHighRisk}`);
      respond(true, {
        name,
        source,
        isTrusted,
        isHighRisk,
        warnings,
        requireConfirm: !isTrusted || isHighRisk,
      });
    }),
  );

  // --- Channel restart ---
  // 上游没有 channels.restart 方法，UI 需要在保存配置后重启渠道。
  // 实现：stop → start，让渠道用新的 config 重新初始化。

  api.registerGatewayMethod(
    "channels.restart",
    safeGateway("channels.restart", async ({ params, respond, context }) => {
      const p = params as { channel?: string; accountId?: string; action?: string };
      const channel = typeof p?.channel === "string" ? p.channel.trim() : "";
      if (!channel) {
        respond(false, undefined, { code: "INVALID_PARAMS", message: "channel is required" });
        return;
      }
      const accountId = typeof p?.accountId === "string" ? p.accountId.trim() || undefined : undefined;
      const action = p?.action ?? "restart";

      try {
        if (action === "stop") {
          await context.stopChannel(channel as any, accountId);
          log.info(`channels.restart: stopped ${channel}${accountId ? `/${accountId}` : ""}`);
          respond(true, { ok: true, action: "stop" });
        } else {
          // restart = stop + start
          try {
            await context.stopChannel(channel as any, accountId);
          } catch {
            // Channel may not be running — ignore stop errors
          }
          await context.startChannel(channel as any, accountId);
          log.info(`channels.restart: restarted ${channel}${accountId ? `/${accountId}` : ""}`);
          respond(true, { ok: true, action: "restart" });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`channels.restart: failed for ${channel}: ${msg}`);
        respond(false, undefined, { code: "RESTART_FAILED", message: msg });
      }
    }),
  );
}

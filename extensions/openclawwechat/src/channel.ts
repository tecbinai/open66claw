import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/core";
import { sendWechatMessage } from "./send.js";
import type { WechatAccount, WechatConfig } from "./types.js";
import { CHANNEL_ID } from "./types.js";

function resolveWechatConfig(cfg: OpenClawConfig): WechatConfig | undefined {
  return (cfg.channels as Record<string, unknown> | undefined)?.openclawwechat as
    | WechatConfig
    | undefined;
}

function resolveAccount(cfg: OpenClawConfig, accountId?: string | null): WechatAccount {
  const wxCfg = resolveWechatConfig(cfg);
  const id = accountId ?? "default";
  const account = wxCfg?.accounts?.[id];
  return account ?? { apiKey: "" };
}

function listAccountIds(cfg: OpenClawConfig): string[] {
  const wxCfg = resolveWechatConfig(cfg);
  return wxCfg?.accounts ? Object.keys(wxCfg.accounts) : [];
}

function defaultAccountId(cfg: OpenClawConfig): string {
  const ids = listAccountIds(cfg);
  return ids[0] ?? "default";
}

function isConfigured(account: WechatAccount): boolean {
  return Boolean(account.apiKey?.trim());
}

export const openclawwechatPlugin: ChannelPlugin<WechatAccount> = {
  id: CHANNEL_ID,

  meta: {
    id: CHANNEL_ID,
    label: "微信",
    selectionLabel: "个人微信 (WeChat Personal)",
    docsPath: "/channels/openclawwechat",
    blurb: "个人微信渠道 - 通过 ClawChat 桥接服务接入",
    order: 100,
    aliases: ["wechat", "wx", "personal-wechat"],
  },

  capabilities: {
    chatTypes: ["direct"],
    media: false,
    polls: false,
    threads: false,
    reactions: false,
  },

  configSchema: {
    schema: {
      type: "object",
      properties: {
        enabled: { type: "boolean", description: "启用个人微信渠道" },
        apiKey: { type: "string", description: "ClawChat 桥接 API Key" },
        accounts: {
          type: "object",
          description: "多账号配置",
          additionalProperties: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              apiKey: { type: "string", description: "ClawChat 桥接 API Key" },
            },
          },
        },
      },
    },
    uiHints: {
      apiKey: { sensitive: true },
    },
  },

  config: {
    listAccountIds: (cfg) => listAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAccount(cfg, accountId),
    defaultAccountId: (cfg) => defaultAccountId(cfg),
    isConfigured: (account) => isConfigured(account),
  },

  outbound: {
    deliveryMode: "gateway" as const,
    sendText: async (ctx) => {
      const account = resolveAccount(ctx.cfg, ctx.accountId);
      await sendWechatMessage(account.apiKey, ctx.to, ctx.text);
      return { ok: true, channel: CHANNEL_ID, messageId: "" } as any;
    },
  },

  gateway: {
    startAccount: async (ctx) => {
      ctx.log?.info?.(`[openclawwechat] Starting account "${ctx.accountId}"...`);
      ctx.log?.info?.("[openclawwechat] Polling gateway mode — waiting for inbound messages.");

      await new Promise<void>((resolve) => {
        if (ctx.abortSignal.aborted) {
          resolve();
          return;
        }
        ctx.abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });

      ctx.log?.info?.(`[openclawwechat] Account "${ctx.accountId}" stopped.`);
    },
  },
};

export default openclawwechatPlugin;

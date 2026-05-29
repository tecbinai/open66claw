import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/core";
import { sendDingtalkMessage } from "./send.js";
import type { DingtalkAccount, DingtalkConfig } from "./types.js";

function resolveDingtalkConfig(cfg: OpenClawConfig): DingtalkConfig | undefined {
  return (cfg.channels as Record<string, unknown> | undefined)?.dingtalk as
    | DingtalkConfig
    | undefined;
}

function resolveAccount(cfg: OpenClawConfig, accountId?: string | null): DingtalkAccount {
  const dtCfg = resolveDingtalkConfig(cfg);
  const id = accountId ?? "default";
  const account = dtCfg?.accounts?.[id];
  return account ?? { botToken: "", appSecret: "" };
}

function listAccountIds(cfg: OpenClawConfig): string[] {
  const dtCfg = resolveDingtalkConfig(cfg);
  return dtCfg?.accounts ? Object.keys(dtCfg.accounts) : [];
}

function defaultAccountId(cfg: OpenClawConfig): string {
  const ids = listAccountIds(cfg);
  return ids[0] ?? "default";
}

function isConfigured(account: DingtalkAccount): boolean {
  return Boolean(account.botToken && account.appSecret);
}

export const dingtalkPlugin: ChannelPlugin<DingtalkAccount> = {
  id: "dingtalk",

  meta: {
    id: "dingtalk",
    label: "DingTalk",
    selectionLabel: "DingTalk (钉钉)",
    docsPath: "/channels/dingtalk",
    blurb: "钉钉企业应用机器人",
    order: 100,
    aliases: ["dd", "ding", "钉钉"],
  },

  capabilities: {
    chatTypes: ["direct", "group"],
    media: false,
    polls: false,
    threads: false,
    reactions: false,
  },

  configSchema: {
    schema: {
      type: "object",
      properties: {
        enabled: { type: "boolean", description: "启用钉钉渠道" },
        appKey: { type: "string", description: "钉钉应用 AppKey" },
        appSecret: { type: "string", description: "钉钉应用 AppSecret" },
        robotToken: { type: "string", description: "机器人 Webhook access_token" },
        accounts: {
          type: "object",
          description: "多账号配置",
          additionalProperties: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              botToken: { type: "string", description: "机器人 Webhook access_token" },
              appSecret: { type: "string", description: "签名密钥" },
            },
          },
        },
      },
    },
    uiHints: {
      appSecret: { sensitive: true },
      robotToken: { sensitive: true },
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
      const to = ctx.to;
      await sendDingtalkMessage(to, ctx.text);
      return { ok: true, channel: "dingtalk", messageId: "" } as any;
    },
  },

  gateway: {
    startAccount: async (ctx) => {
      ctx.log?.info?.(`[dingtalk] Starting account "${ctx.accountId}"...`);
      ctx.log?.info?.("[dingtalk] Webhook gateway mode — waiting for inbound requests.");

      await new Promise<void>((resolve) => {
        if (ctx.abortSignal.aborted) {
          resolve();
          return;
        }
        ctx.abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });

      ctx.log?.info?.(`[dingtalk] Account "${ctx.accountId}" stopped.`);
    },
  },
};

export default dingtalkPlugin;

import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/core";
import { getWecomAccessToken, sendWecomMessage } from "./send.js";
import type { WecomAccount } from "./types.js";

const DEFAULT_ACCOUNT_ID = "default";

// ── Types ────────────────────────────────────────────────────────────

type WecomChannelConfig = {
  enabled?: boolean;
  accounts?: Record<string, WecomAccount>;
};

type ResolvedWecomAccount = WecomAccount & {
  accountId: string;
  enabled: boolean;
  configured: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────

function getWecomConfig(cfg: OpenClawConfig): WecomChannelConfig | undefined {
  return (cfg.channels as Record<string, unknown> | undefined)?.wecom as
    | WecomChannelConfig
    | undefined;
}

function listWecomAccountIds(cfg: OpenClawConfig): string[] {
  const wecom = getWecomConfig(cfg);
  if (!wecom) return [];
  const ids: string[] = [];
  if (wecom.enabled !== false) ids.push(DEFAULT_ACCOUNT_ID);
  if (wecom.accounts) {
    for (const id of Object.keys(wecom.accounts)) {
      ids.push(id);
    }
  }
  return ids;
}

function resolveWecomAccount(cfg: OpenClawConfig, accountId?: string | null): ResolvedWecomAccount {
  const wecom = getWecomConfig(cfg);
  const id = accountId ?? DEFAULT_ACCOUNT_ID;
  const raw =
    id === DEFAULT_ACCOUNT_ID ? (wecom as WecomAccount | undefined) : wecom?.accounts?.[id];

  return {
    accountId: id,
    enabled: raw?.enabled !== false,
    configured: Boolean(raw?.corpId && raw?.appSecret && raw?.agentId),
    corpId: raw?.corpId ?? "",
    appSecret: raw?.appSecret ?? "",
    agentId: raw?.agentId ?? 0,
    token: raw?.token,
    encodingAesKey: raw?.encodingAesKey,
  };
}

// ── Plugin ───────────────────────────────────────────────────────────

export const wecomPlugin: ChannelPlugin<ResolvedWecomAccount> = {
  id: "wecom",

  meta: {
    id: "wecom",
    label: "WeCom",
    selectionLabel: "WeCom (企业微信)",
    docsPath: "/channels/wecom",
    blurb: "企业微信应用消息",
    order: 101,
    aliases: ["企微", "企业微信", "wxwork"],
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
        enabled: { type: "boolean", description: "启用企业微信渠道" },
        corpId: { type: "string", description: "企业 ID" },
        agentId: { type: "number", description: "应用 AgentId" },
        secret: { type: "string", description: "应用密钥 (Secret)" },
        token: { type: "string", description: "接收消息 Token" },
        encodingAESKey: { type: "string", description: "消息加解密密钥 (EncodingAESKey)" },
        accounts: {
          type: "object",
          description: "多账号配置",
          additionalProperties: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              corpId: { type: "string", description: "企业 ID" },
              appSecret: { type: "string", description: "应用密钥" },
              agentId: { type: "number", description: "应用 AgentId" },
              token: { type: "string", description: "接收消息 Token" },
              encodingAesKey: { type: "string", description: "消息加解密密钥" },
            },
          },
        },
      },
    },
    uiHints: {
      secret: { sensitive: true },
      token: { sensitive: true },
      encodingAESKey: { sensitive: true },
    },
  },

  config: {
    listAccountIds: (cfg) => listWecomAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveWecomAccount(cfg, accountId),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account) => account.configured,
  },

  outbound: {
    deliveryMode: "gateway" as const,
    sendText: async (ctx) => {
      const account = resolveWecomAccount(ctx.cfg, ctx.accountId);
      const accessToken = await getWecomAccessToken(account.corpId, account.appSecret);
      if (!accessToken) {
        return { ok: false, error: new Error("[wecom] Failed to get access token") } as any;
      }
      const to = ctx.to ?? "";
      const ok = await sendWecomMessage(accessToken, to, account.agentId, ctx.text);
      if (!ok) {
        return { ok: false, error: new Error("[wecom] Failed to send message") } as any;
      }
      return { ok: true } as any;
    },
  },

  gateway: {
    startAccount: async (ctx) => {
      ctx.log?.info?.(`[wecom] Starting gateway for account: ${ctx.accountId}`);

      await new Promise<void>((resolve) => {
        if (ctx.abortSignal.aborted) {
          resolve();
          return;
        }
        ctx.abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });

      ctx.log?.info?.(`[wecom] Gateway stopped for account: ${ctx.accountId}`);
    },
  },
};

/**
 * Channel Plugin 模板 — 替换 "my-channel" 为你的通道名称
 *
 * 完整开发流程请参考 dev/doc/CHANNEL-EXTENSION-SPEC.md
 *
 * 目录结构：
 *   extensions/my-channel/
 *   ├── index.ts               ← 插件入口（参考下方）
 *   ├── openclaw.plugin.json   ← 插件清单
 *   ├── package.json
 *   └── src/
 *       ├── channel.ts         ← 本文件（ChannelPlugin 实现）
 *       ├── runtime.ts         ← 运行时引用
 *       ├── types.ts           ← 类型定义
 *       ├── webhook.ts         ← Webhook 验签
 *       └── send.ts            ← 消息发送
 *
 * index.ts 入口示例：
 *   import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
 *   import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/core";
 *   import { myChannelPlugin } from "./src/channel.js";
 *   import { setMyChannelRuntime } from "./src/runtime.js";
 *
 *   const plugin = {
 *     id: "my-channel",
 *     name: "My Channel",
 *     description: "我的通道插件",
 *     configSchema: emptyPluginConfigSchema(),
 *     register(api: OpenClawPluginApi) {
 *       setMyChannelRuntime(api.runtime);
 *       api.registerChannel({ plugin: myChannelPlugin });
 *     },
 *   };
 *   export default plugin;
 */

// ============================================================================
// types.ts — 账号类型定义
// ============================================================================

export type MyChannelAccount = {
  accountId: string;
  appKey: string;
  appSecret: string;
  // ← 添加平台特有字段
  enabled?: boolean;
};

// ============================================================================
// channel.ts — ChannelPlugin 实现
// ============================================================================

// import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/core";

/**
 * 替换 "my-channel" 为你的通道 ID。
 * 以下为最小可用实现，更多适配器参考 CHANNEL-EXTENSION-SPEC.md 第五节。
 */
export const myChannelPlugin = {
  id: "my-channel" as const, // ← 替换通道 ID

  meta: {
    id: "my-channel" as const, // ← 替换
    label: "My Channel",
    selectionLabel: "My Channel (我的通道)", // ← 替换
    docsPath: "/channels/my-channel",
    blurb: "我的通道插件", // ← 替换
    order: 100,
    aliases: ["mc", "我的通道"], // ← 替换别名
  },

  capabilities: {
    chatTypes: ["direct" as const, "group" as const],
    media: false,
    threads: false,
    reactions: false,
    edit: false,
    unsend: false,
    reply: true,
  },

  config: {
    listAccountIds(cfg: any): string[] {
      return Object.keys(cfg.channels?.["my-channel"]?.accounts ?? {});
    },

    resolveAccount(cfg: any, accountId?: string | null): MyChannelAccount {
      const id = accountId ?? "default";
      const raw = cfg.channels?.["my-channel"]?.accounts?.[id];
      if (!raw) {
        return { accountId: id, appKey: "", appSecret: "" };
      }
      return { accountId: id, ...raw };
    },

    defaultAccountId(_cfg: any): string {
      return "default";
    },

    isConfigured(account: MyChannelAccount): boolean {
      return Boolean(account.appKey && account.appSecret);
    },

    unconfiguredReason(_account: MyChannelAccount): string {
      return "请配置 appKey 和 appSecret";
    },
  },

  // ── 消息发送（推荐实现） ──
  outbound: {
    deliveryMode: "direct" as const,
    textChunkLimit: 2000, // ← 替换为平台限制

    async sendText(_ctx: any) {
      // ← 替换为平台 API 调用
      // const { text, target, account } = ctx;
      // await platformApi.sendMessage(account.appKey, target, text);
      return { success: true };
    },
  },

  // ── 网关生命周期（推荐实现） ──
  gateway: {
    async startAccount(_ctx: any) {
      // ← 替换为 WebSocket/长轮询/Webhook 监听逻辑
      // const { account, channelRuntime, abortSignal, log } = ctx;
      // 参考 dingtalk/src/channel.ts 的实现
    },

    async stopAccount(_ctx: any) {
      // ← 清理资源
    },
  },
};

// ============================================================================
// runtime.ts — 运行时引用
// ============================================================================

// import type { PluginRuntime } from "openclaw/plugin-sdk/core";
//
// let runtime: PluginRuntime | undefined;
//
// export function setMyChannelRuntime(r: PluginRuntime) {
//   runtime = r;
// }
//
// export function getMyChannelRuntime(): PluginRuntime {
//   if (!runtime) throw new Error("my-channel runtime not initialized");
//   return runtime;
// }

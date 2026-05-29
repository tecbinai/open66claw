import type {
  ChannelAccountSnapshot,
  ChannelsStatusSnapshot,
  ConfigUiHints,
  DiscordStatus,
  GoogleChatStatus,
  IMessageStatus,
  NostrProfile,
  NostrStatus,
  SignalStatus,
  SlackStatus,
  TelegramStatus,
  WhatsAppStatus,
  TeamProjectBinding,
} from "../types";
import type { NostrProfileFormState } from "./channels.nostr-profile-form";

export type ChannelKey = string;

// 飞书渠道状态类型
export type FeishuStatus = {
  configured?: boolean;
  running?: boolean;
  connected?: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  lastProbeAt?: number | null;
  probe?: {
    ok?: boolean;
    status?: string;
    error?: string;
    tenant?: {
      name?: string;
    };
  } | null;
};

// 钉钉渠道状态类型
export type DingtalkStatus = {
  configured?: boolean;
  running?: boolean;
  connected?: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  lastProbeAt?: number | null;
  probe?: {
    ok?: boolean;
    status?: string;
    error?: string;
    corp?: {
      name?: string;
    };
  } | null;
};

// 企业微信渠道状态类型
export type WecomStatus = {
  configured?: boolean;
  running?: boolean;
  connected?: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  lastProbeAt?: number | null;
  probe?: {
    ok?: boolean;
    status?: string;
    error?: string;
    corp?: {
      name?: string;
    };
  } | null;
};

// QQ 机器人渠道状态类型
export type QqbotStatus = {
  configured?: boolean;
  running?: boolean;
  connected?: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  lastProbeAt?: number | null;
  probe?: {
    ok?: boolean;
    status?: string;
    error?: string;
    botInfo?: {
      id?: string;
      username?: string;
    };
  } | null;
};

// 个人微信渠道状态类型（通过 ClawChat 桥接）
export type OpenclawwechatStatus = {
  configured?: boolean;
  running?: boolean;
  connected?: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
};

// ── Channel Route Types ──────────────────────────────────────────────────

export type ChannelRouteEntry = {
  channel: string;
  accountId?: string;
  targetType: "project" | "agent";
  targetId: string;
  targetName: string;
};

export type ChannelRouteProjectOption = {
  projectId: string;
  name: string;
  supervisorId: string;
  bindings?: TeamProjectBinding[];
  description?: string;
  status?: string;
  memberCount?: number;
  memberIds?: string[];
};

export type ChannelRouteAgentOption = {
  agentId: string;
  name: string;
};

export type ChannelsProps = {
  connected: boolean;
  loading: boolean;
  snapshot: ChannelsStatusSnapshot | null;
  lastError: string | null;
  lastSuccessAt: number | null;
  whatsappMessage: string | null;
  whatsappQrDataUrl: string | null;
  whatsappConnected: boolean | null;
  whatsappBusy: boolean;
  configSchema: unknown | null;
  configSchemaLoading: boolean;
  configForm: Record<string, unknown> | null;
  configUiHints: ConfigUiHints;
  configSaving: boolean;
  configFormDirty: boolean;
  configLastError: string | null;
  nostrProfileFormState: NostrProfileFormState | null;
  nostrProfileAccountId: string | null;
  // Channel-to-agent/project route binding
  routeSummary: ChannelRouteEntry[] | null;
  routeProjects: ChannelRouteProjectOption[] | null;
  routeAgents: ChannelRouteAgentOption[] | null;
  routeSaving: boolean;
  routeSavedHint: boolean;
  onRefresh: (probe: boolean) => void;
  onWhatsAppStart: (force: boolean) => void;
  onWhatsAppWait: () => void;
  onWhatsAppLogout: () => void;
  onConfigPatch: (path: Array<string | number>, value: unknown) => void;
  onConfigSave: () => void;
  onConfigReload: () => void;
  onNostrProfileEdit: (accountId: string, profile: NostrProfile | null) => void;
  onNostrProfileCancel: () => void;
  onNostrProfileFieldChange: (field: keyof NostrProfile, value: string) => void;
  onNostrProfileSave: () => void;
  onNostrProfileImport: () => void;
  onNostrProfileToggleAdvanced: () => void;
  onRouteChange: (
    channel: string,
    accountId: string | undefined,
    targetId: string | null,
    targetType: "project" | "agent",
  ) => void;
  onDeleteBot: (channelId: string, accountId: string) => void;
  deletingBotId: string | null;
  // Master-detail layout state
  channelsSelectedKey: ChannelKey | null;
  onSelectChannel: (key: ChannelKey) => void;
  // Config wizard state
  channelsWizardOpen: boolean;
  channelsWizardAccountId: string | null;
  channelsWizardIsNew: boolean;
  onWizardOpen: (accountId?: string) => void;
  onWizardClose: () => void;
};

export type ChannelsChannelData = {
  feishu?: FeishuStatus;
  dingtalk?: DingtalkStatus;
  wecom?: WecomStatus;
  qqbot?: QqbotStatus;
  openclawwechat?: OpenclawwechatStatus;
  whatsapp?: WhatsAppStatus;
  telegram?: TelegramStatus;
  discord?: DiscordStatus | null;
  googlechat?: GoogleChatStatus | null;
  slack?: SlackStatus | null;
  signal?: SignalStatus | null;
  imessage?: IMessageStatus | null;
  nostr?: NostrStatus | null;
  channelAccounts?: Record<string, ChannelAccountSnapshot[]> | null;
};

// ── Channel labels (shared between channels.ts and channels.wizard.ts) ──

export const CHANNEL_LABELS: Record<string, string> = {
  feishu: "飞书",
  dingtalk: "钉钉",
  wecom: "企业微信",
  qqbot: "QQ",
  openclawwechat: "微信 (个人号)",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  googlechat: "Google Chat",
  slack: "Slack",
  signal: "Signal",
  imessage: "iMessage",
  nostr: "Nostr",
};

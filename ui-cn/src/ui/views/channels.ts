import { html, nothing } from "lit";
import { editionVisible } from "../edition";
import { formatAgo } from "../format";
import { t } from "../i18n/index.js";
import type { ChannelAccountSnapshot, ChannelUiMetaEntry, ChannelsStatusSnapshot } from "../types";
import { channelEnabled, isUnconfiguredError } from "./channels.shared";
import type { ChannelKey, ChannelsProps } from "./channels.types";
import { CHANNEL_LABELS } from "./channels.types";
import { renderChannelWizard } from "./channels.wizard";

// ── Channel registry ────────────────────────────────────────────────────────

export const ALL_SUPPORTED_CHANNELS: ChannelKey[] = [
  "feishu",
  "dingtalk",
  "wecom",
  "qqbot",
  "openclawwechat",
  "whatsapp",
  "telegram",
  "discord",
  "googlechat",
  "slack",
  "signal",
  "imessage",
  "nostr",
];

export const DOMESTIC_CHANNELS = new Set([
  "feishu",
  "dingtalk",
  "wecom",
  "qqbot",
  "openclawwechat",
]);

// Re-export from types to preserve existing import paths
export { CHANNEL_LABELS } from "./channels.types";

// 渠道描述映射
const CHANNEL_DESCRIPTIONS: Record<string, string> = {
  feishu: "飞书机器人，适用于企业内部沟通和协作",
  dingtalk: "钉钉机器人，适用于企业办公和团队协作",
  wecom: "企业微信机器人，适用于企业内部通讯",
  qqbot: "QQ 机器人，支持 QQ 开放平台官方机器人",
  openclawwechat: "个人微信渠道，通过 ClawChat 桥接服务接入",
  whatsapp: "WhatsApp Web 连接",
  telegram: "Telegram 机器人",
  discord: "Discord 机器人",
  googlechat: "Google Chat API",
  slack: "Slack 应用",
  signal: "Signal 消息",
  imessage: "iMessage (仅 macOS)",
  nostr: "Nostr 去中心化协议",
};

// 渠道头像缩写（用于 sidebar + detail 的方块头像）
const CHANNEL_AVATARS: Record<string, string> = {
  feishu: "飞",
  dingtalk: "钉",
  wecom: "企",
  qqbot: "Q",
  openclawwechat: "微",
  whatsapp: "W",
  telegram: "T",
  discord: "D",
  googlechat: "G",
  slack: "S",
  signal: "Si",
  imessage: "iM",
  nostr: "N",
};

// Feature tag 分类：根据关键词决定颜色
function featureTagClass(_feature: string): string {
  return ""; // Unified neutral tag style per Figma design
}

// 渠道特性列表
const CHANNEL_FEATURES: Record<string, string[]> = {
  feishu: ["私聊消息", "群聊 @机器人", "图片/文件收发", "Markdown 卡片", "无需公网 IP", "文档读写"],
  dingtalk: ["私聊消息", "群聊 @机器人", "图片/文件收发", "Markdown 卡片", "无需公网 IP"],
  wecom: ["私聊消息", "群聊 @机器人", "图片/文件收发", "Markdown 消息"],
  qqbot: ["私聊消息", "群聊 @机器人", "图片收发", "Markdown 消息"],
  openclawwechat: ["私聊消息", "群聊", "图片/视频/文档", "无需企业认证"],
  whatsapp: ["私聊消息", "群聊", "图片/文件收发", "已读回执"],
  telegram: [
    "私聊消息",
    "群聊 @机器人",
    "图片/文件收发",
    "Markdown",
    "Inline 按钮",
    "Webhook/轮询",
  ],
  discord: ["私聊消息", "群聊 @机器人", "图片/文件收发", "Markdown", "Reaction", "语音状态"],
  googlechat: ["私聊消息", "群聊 @机器人", "卡片消息"],
  slack: ["私聊消息", "频道消息", "图片/文件收发", "Markdown", "Slash 命令", "Thread"],
  signal: ["私聊消息", "群聊", "图片/文件收发", "端到端加密"],
  imessage: ["私聊消息", "群聊", "图片/文件收发"],
  nostr: ["私聊消息", "去中心化", "抗审查"],
};

// ── Helper functions ────────────────────────────────────────────────────────

function resolveChannelOrder(snapshot: ChannelsStatusSnapshot | null): ChannelKey[] {
  let backendOrder: string[] = [];
  if (snapshot?.channelMeta?.length) {
    backendOrder = snapshot.channelMeta.map((entry) => entry.id);
  } else if (snapshot?.channelOrder?.length) {
    backendOrder = snapshot.channelOrder;
  }
  const seen = new Set<string>(backendOrder);
  const result: ChannelKey[] = [...backendOrder] as ChannelKey[];
  for (const key of ALL_SUPPORTED_CHANNELS) {
    if (!seen.has(key)) {
      result.push(key);
      seen.add(key);
    }
  }
  return result;
}

function resolveChannelMetaMap(
  snapshot: ChannelsStatusSnapshot | null,
): Record<string, ChannelUiMetaEntry> {
  if (!snapshot?.channelMeta?.length) return {};
  return Object.fromEntries(snapshot.channelMeta.map((entry) => [entry.id, entry]));
}

function resolveChannelLabel(snapshot: ChannelsStatusSnapshot | null, key: string): string {
  const meta = resolveChannelMetaMap(snapshot)[key];
  return meta?.label ?? snapshot?.channelLabels?.[key] ?? key;
}

function getChannelStatus(
  key: string,
  props: ChannelsProps,
): {
  configured: boolean;
  running: boolean;
  connected: boolean;
  lastError: string | null;
} {
  const channels = props.snapshot?.channels as Record<string, unknown> | null;
  const status = channels?.[key] as Record<string, unknown> | undefined;
  return {
    configured: status?.configured === true,
    running: status?.running === true,
    connected: status?.connected === true,
    lastError: typeof status?.lastError === "string" ? status.lastError : null,
  };
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

function renderSidebarItem(key: ChannelKey, props: ChannelsProps) {
  const label = CHANNEL_LABELS[key] ?? resolveChannelLabel(props.snapshot, key);
  const status = getChannelStatus(key, props);
  const isActive = props.channelsSelectedKey === key;
  const avatar = CHANNEL_AVATARS[key] ?? key.charAt(0).toUpperCase();
  const avatarRunning = status.running ? " ch-sidebar-avatar--running" : "";

  const statusText = status.running
    ? t("common.running")
    : status.configured
      ? t("channels.configured")
      : t("channels.notConfigured");
  const statusClass = status.running
    ? "ch-sidebar-status ch-sidebar-status--running"
    : status.configured
      ? "ch-sidebar-status ch-sidebar-status--configured"
      : "ch-sidebar-status ch-sidebar-status--unconfigured";

  return html`
    <button
      class="ch-sidebar-item ${isActive ? "ch-sidebar-item--active" : ""}"
      @click=${() => props.onSelectChannel(key)}
    >
      <span class="ch-sidebar-avatar${avatarRunning}">${avatar}</span>
      <span class="ch-sidebar-info">
        <span class="ch-sidebar-name">${label}</span>
        <span class="${statusClass}">${statusText}</span>
      </span>
    </button>
  `;
}

function renderChannelSidebar(props: ChannelsProps) {
  const channelOrder = resolveChannelOrder(props.snapshot);
  const ordered = channelOrder.map((key, index) => ({
    key,
    enabled: channelEnabled(key, props),
    order: index,
  }));

  const domestic = ordered.filter((c) => DOMESTIC_CHANNELS.has(c.key));
  const international = ordered.filter((c) => !DOMESTIC_CHANNELS.has(c.key));

  // Sort: enabled channels first
  const sortFn = (a: (typeof ordered)[0], b: (typeof ordered)[0]) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.order - b.order;
  };
  domestic.sort(sortFn);
  international.sort(sortFn);

  const domesticActive = domestic.filter((c) => c.enabled).length;
  const internationalActive = international.filter((c) => c.enabled).length;

  return html`
    <div class="ch-sidebar__header">
      <h3 class="ch-sidebar__title">${t("channels.sidebar.title")}</h3>
    </div>
    ${
      editionVisible("channels.domestic")
        ? html`
      <div class="ch-sidebar-group">
        <div class="ch-sidebar-group__title">
          ${t("channels.sidebar.domestic")}
          ${
            domesticActive > 0
              ? html`<span class="ch-sidebar-group__count">${domesticActive}/${domestic.length}</span>`
              : nothing
          }
        </div>
        ${domestic.map((c) => renderSidebarItem(c.key, props))}
      </div>
    `
        : nothing
    }
    ${
      editionVisible("channels.international")
        ? html`
      <div class="ch-sidebar-group">
        <div class="ch-sidebar-group__title">
          ${t("channels.sidebar.international")}
          ${
            internationalActive > 0
              ? html`<span class="ch-sidebar-group__count">${internationalActive}/${international.length}</span>`
              : nothing
          }
        </div>
        ${international.map((c) => renderSidebarItem(c.key, props))}
      </div>
    `
        : nothing
    }
  `;
}

// ── Welcome panel ───────────────────────────────────────────────────────────

function renderChannelWelcome(props: ChannelsProps) {
  const channels = props.snapshot?.channels as Record<string, unknown> | null;
  let runningCount = 0;
  let configuredCount = 0;
  for (const key of ALL_SUPPORTED_CHANNELS) {
    const s = channels?.[key] as { configured?: boolean; running?: boolean } | undefined;
    if (s?.running) runningCount++;
    if (s?.configured) configuredCount++;
  }

  return html`
    <div class="ch-welcome">
      <div class="ch-welcome__header">
        <div class="ch-welcome__header-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent)">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div class="ch-welcome__header-title">${t("channels.welcome.title") || "渠道管理"}</div>
        <div class="ch-welcome__header-desc">${t("channels.welcome.desc") || "选择左侧渠道开始配置"}</div>
      </div>

      <div class="ch-welcome__stats-row">
        <div class="ch-welcome__stat-card ch-welcome__stat-card--ok">
          <div class="ch-welcome__stat-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div class="ch-welcome__stat-value">${runningCount}</div>
          <div class="ch-welcome__stat-label">${t("common.running")}</div>
        </div>
        <div class="ch-welcome__stat-card ch-welcome__stat-card--accent">
          <div class="ch-welcome__stat-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
          <div class="ch-welcome__stat-value">${configuredCount}</div>
          <div class="ch-welcome__stat-label">${t("channels.configured")}</div>
        </div>
        <div class="ch-welcome__stat-card">
          <div class="ch-welcome__stat-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div class="ch-welcome__stat-value">${ALL_SUPPORTED_CHANNELS.length}</div>
          <div class="ch-welcome__stat-label">${t("channels.available") ?? "可用渠道"}</div>
        </div>
      </div>

      ${
        configuredCount === 0
          ? html`
          <div class="ch-welcome__guide">
            <div class="ch-welcome__guide-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--muted)">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </div>
            <div class="ch-welcome__guide-title">${t("channels.welcome.title")}</div>
            <p class="ch-welcome__guide-desc">${t("channels.welcome.desc")}</p>
          </div>
        `
          : nothing
      }
    </div>
  `;
}

// ── Detail panel ────────────────────────────────────────────────────────────

const RECENT_ACTIVITY_THRESHOLD_MS = 10 * 60 * 1000;

function hasRecentActivity(account: ChannelAccountSnapshot): boolean {
  if (!account.lastInboundAt) return false;
  return Date.now() - account.lastInboundAt < RECENT_ACTIVITY_THRESHOLD_MS;
}

function renderBotCard(account: ChannelAccountSnapshot, channelId: string, props: ChannelsProps) {
  const isRunning = account.running || hasRecentActivity(account);
  const statusLabel = account.running
    ? t("common.running")
    : account.configured
      ? t("common.stopped")
      : t("channels.notConfigured");
  const dotClass = isRunning
    ? "status-dot--running"
    : account.configured
      ? "status-dot--configured"
      : "status-dot--unconfigured";

  // Find route binding for this account
  const route = props.routeSummary?.find(
    (r) => r.channel === channelId && r.accountId === account.accountId,
  );

  // Resolve bound project details
  const boundProject = route
    ? props.routeProjects?.find((p) => p.projectId === route.targetId)
    : null;

  const isDeleting = props.deletingBotId === account.accountId;

  return html`
    <div
      class="ch-bot-card ch-bot-card--clickable ${account.lastError && !isUnconfiguredError(account.lastError) ? "ch-bot-card--error" : ""}"
      @click=${() => props.onWizardOpen(account.accountId)}
      role="button"
      tabindex="0"
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onWizardOpen(account.accountId);
        }
      }}
    >
      <button
        class="ch-bot-card__delete"
        title="${t("channels.detail.deleteBot")}"
        ?disabled=${isDeleting}
        @click=${(e: Event) => {
          e.stopPropagation();
          props.onDeleteBot(channelId, account.accountId);
        }}
      >
        ${
          isDeleting
            ? html`
                <span
                  class="btn-spinner"
                  style="
                    width: 12px;
                    height: 12px;
                    border: 2px solid currentColor;
                    border-top-color: transparent;
                    border-radius: 50%;
                    animation: spin 0.6s linear infinite;
                    display: inline-block;
                  "
                ></span>
              `
            : html`
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              `
        }
      </button>
      <div class="ch-bot-card__header">
        <span class="ch-bot-card__name">${account.name || account.accountId}</span>
        <span class="status-dot ${dotClass}"></span>
      </div>
      <div class="ch-bot-card__status">${statusLabel}</div>
      ${
        account.lastInboundAt
          ? html`<div class="ch-bot-card__activity">${t("sessions.lastActivity")}: ${formatAgo(account.lastInboundAt)}</div>`
          : nothing
      }
      ${
        boundProject
          ? html`
          <div class="ch-bot-card__binding">
            <div class="ch-bot-card__binding-project">
              <span class="ch-bot-card__route">${boundProject.name}</span>
            </div>
          </div>
        `
          : route
            ? html`<div class="ch-bot-card__binding"><div class="ch-bot-card__route">${route.targetName}</div></div>`
            : nothing
      }
      ${
        account.lastError && !isUnconfiguredError(account.lastError)
          ? html`<div class="ch-bot-card__error">${account.lastError}</div>`
          : nothing
      }
    </div>
  `;
}

function renderChannelDetail(key: ChannelKey, props: ChannelsProps) {
  const label = CHANNEL_LABELS[key] ?? resolveChannelLabel(props.snapshot, key);
  const description = CHANNEL_DESCRIPTIONS[key] ?? "";
  const features = CHANNEL_FEATURES[key] ?? [];
  const status = getChannelStatus(key, props);
  // Filter out phantom "default" accounts that are not actually configured.
  // Upstream channel plugins (e.g. feishu) return ["default"] even when no
  // accounts exist, for backward compatibility. Hide them so new users see
  // the clean onboarding flow ("尚未配置任何 Bot") instead of a confusing
  // "default / 未配置" card.
  const rawAccounts = props.snapshot?.channelAccounts?.[key] ?? [];
  const accounts = rawAccounts.filter(
    (a) => a.configured || a.accountId !== "default",
  );
  const avatar = CHANNEL_AVATARS[key] ?? key.charAt(0).toUpperCase();

  // Status badge (dot indicator is rendered via CSS ::before)
  const statusBadge = status.running
    ? html`<span class="ch-detail__badge ch-detail__badge--running">${t("common.running")}</span>`
    : status.configured
      ? html`<span class="ch-detail__badge ch-detail__badge--configured">${t("common.stopped")}</span>`
      : html`<span class="ch-detail__badge ch-detail__badge--unconfigured">${t("channels.notConfigured")}</span>`;

  return html`
    <div class="ch-detail">
      <!-- Panel header -->
      <div class="ch-detail__panel-header">
        <h3 class="ch-detail__panel-title">${t("channels.detail.title")}</h3>
      </div>
      <!-- Hero header -->
      <div class="ch-detail__hero">
        <span class="ch-sidebar-avatar ch-sidebar-avatar--lg${status.running ? " ch-sidebar-avatar--running" : ""}">${avatar}</span>
        <div class="ch-detail__hero-body">
          <div class="ch-detail__title-row">
            <h2 class="ch-detail__title">${label}</h2>
            ${statusBadge}
          </div>
          <p class="ch-detail__desc">${description}</p>
        </div>
      </div>

      <!-- Features -->
      ${
        features.length > 0
          ? html`
          <div class="ch-detail__features">
            ${features.map((f) => html`<span class="ch-detail__feature-tag ${featureTagClass(f)}">${f}</span>`)}
          </div>
        `
          : nothing
      }

      <!-- Bot cards -->
      <div class="ch-detail__section">
        <div class="ch-detail__section-header">
          <h3 class="ch-detail__section-title">${t("channels.detail.bots")}</h3>
          <button class="btn" ?disabled=${props.loading} @click=${(e: Event) => {
            e.stopPropagation();
            props.onRefresh(true);
          }}>
            ${
              props.loading
                ? html`
                    <span
                      class="btn-spinner"
                      style="
                        display: inline-block;
                        width: 12px;
                        height: 12px;
                        border: 2px solid currentColor;
                        border-top-color: transparent;
                        border-radius: 50%;
                        animation: spin 0.6s linear infinite;
                        margin-right: 4px;
                        vertical-align: -2px;
                      "
                    ></span>
                  `
                : html`
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      style="margin-right: 4px; vertical-align: -2px"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  `
            }
            ${props.loading ? t("channels.probing") : t("channels.detail.probeAll")}
          </button>
        </div>
        ${
          accounts.length > 0
            ? html`
            <div class="ch-bot-grid">
              ${accounts.map((account) => renderBotCard(account, key, props))}
              <button class="ch-bot-card ch-bot-card--add" @click=${() => props.onWizardOpen()}>
                <span class="ch-bot-card--add__icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </span>
                <span>${t("channels.detail.addBot")}</span>
              </button>
            </div>
          `
            : html`
            <div class="ch-detail__onboard">
              <div class="ch-detail__onboard-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <h4 class="ch-detail__onboard-title">${t("channels.detail.noBots")}</h4>
              <p class="ch-detail__onboard-desc">${t("channels.welcome.desc")}</p>
              <button class="btn primary" @click=${() => props.onWizardOpen()}>
                ${t("channels.detail.addBot")}
              </button>
            </div>
          `
        }
      </div>

      <!-- Error -->
      ${
        status.lastError && !isUnconfiguredError(status.lastError)
          ? html`<div class="callout danger" style="margin-top: 12px;">${status.lastError}</div>`
          : nothing
      }

      <!-- Probe error -->
      ${
        props.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.lastError}</div>`
          : nothing
      }
    </div>
  `;
}

// ── Main export ─────────────────────────────────────────────────────────────

export function renderChannels(props: ChannelsProps) {
  return html`
    <div class="ch-layout">
      <div class="ch-sidebar">
        ${renderChannelSidebar(props)}
      </div>
      <div class="ch-main">
        ${
          props.channelsSelectedKey
            ? renderChannelDetail(props.channelsSelectedKey, props)
            : renderChannelWelcome(props)
        }
      </div>
    </div>
    ${props.channelsWizardOpen ? renderChannelWizard(props) : nothing}
  `;
}

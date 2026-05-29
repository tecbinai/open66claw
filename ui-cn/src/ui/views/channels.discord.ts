import { html, nothing } from "lit";
import { formatAgo } from "../format";
import { t } from "../i18n/index.js";
import type { DiscordStatus } from "../types";
import { renderChannelConfigSection } from "./channels.config";
import {
  isUnconfiguredError,
  errorCalloutClass,
  renderChannelRouteSection,
} from "./channels.shared";
import type { ChannelsProps } from "./channels.types";

export function renderDiscordTutorial() {
  return html`
    <div class="config-steps">
      <div class="config-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>Create Application</strong>
          <p>
            Go to
            <a href="https://discord.com/developers/applications" target="_blank"
              >Discord Developer Portal</a
            >
            &rarr; New Application
          </p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <strong>Create Bot</strong>
          <p>In your application, go to Bot tab &rarr; Add Bot &rarr; Copy Token</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <strong>Invite Bot to Server</strong>
          <p>
            Go to OAuth2 &rarr; URL Generator &rarr; Select bot scope &rarr; Copy and open invite URL
          </p>
        </div>
      </div>
    </div>
  `;
}

export function renderDiscordCard(params: {
  props: ChannelsProps;
  discord?: DiscordStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, discord, accountCountLabel } = params;

  // 状态徽章
  const statusBadge = discord?.running
    ? html`<span class="channel-card__badge channel-card__badge--ok">
        <span class="status-dot status-dot--running"></span>
        ${t("common.running")}
      </span>`
    : discord?.configured
      ? html`<span class="channel-card__badge channel-card__badge--warn">
          <span class="status-dot status-dot--configured"></span>
          ${t("common.stopped")}
        </span>`
      : html`<span class="channel-card__badge">
          <span class="status-dot status-dot--unconfigured"></span>
          ${t("channels.notConfigured")}
        </span>`;

  // 箭头图标
  const chevronIcon = html`
    <svg
      class="channel-card__chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;

  // 根据状态决定卡片样式类
  const cardClasses = [
    "channel-card",
    discord?.running ? "channel-card--running" : "",
    discord?.configured && !discord?.running ? "channel-card--configured" : "",
    discord?.lastError
      ? isUnconfiguredError(discord.lastError)
        ? "channel-card--unconfigured"
        : "channel-card--error"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 自动展开：运行中 或 有真实错误
  const shouldOpen =
    discord?.running || (discord?.lastError != null && !isUnconfiguredError(discord.lastError));

  return html`
    <details class="${cardClasses}" ?open=${shouldOpen}>
      <summary class="channel-card__header">
        <div class="channel-card__left">
          <span class="channel-card__icon">🎮</span>
          <span class="channel-card__title">Discord</span>
          <div class="channel-card__status">
            ${statusBadge}
          </div>
        </div>
        ${chevronIcon}
      </summary>
      <div class="channel-card__body">
        <div class="channel-card__desc">${t("channels.discord.description")}</div>
        ${accountCountLabel}

        <div class="status-list">
          <div>
            <span class="label">${t("channels.configured")}</span>
            <span>${discord?.configured ? t("common.yes") : t("common.no")}</span>
          </div>
          <div>
            <span class="label">${t("common.running")}</span>
            <span>${discord?.running ? t("common.yes") : t("common.no")}</span>
          </div>
          ${
            discord?.configured || discord?.running
              ? html`
          <div>
            <span class="label">${t("channels.lastStart")}</span>
            <span>${discord?.lastStartAt ? formatAgo(discord.lastStartAt) : t("common.na")}</span>
          </div>
          <div>
            <span class="label">${t("channels.lastProbe")}</span>
            <span>${discord?.lastProbeAt ? formatAgo(discord.lastProbeAt) : t("common.na")}</span>
          </div>
          `
              : nothing
          }
        </div>

        ${
          !(discord?.configured || discord?.running)
            ? html`
                <div class="connection-hint">
                  <div class="connection-hint__title">💡 配置指引</div>
                  <div class="connection-hint__desc">
                    在下方配置表单中填写 Discord Bot Token 即可启用。需要先在 Discord Developer Portal 创建 Bot。
                  </div>
                </div>
              `
            : nothing
        }

        ${
          discord?.lastError
            ? html`<div class="${errorCalloutClass(discord.lastError)}" style="margin-top: 12px;">
              ${discord.lastError}
            </div>`
            : nothing
        }

        ${
          discord?.probe
            ? html`<div class="callout" style="margin-top: 12px;">
              ${t("channels.probe")} ${discord.probe.ok ? t("common.success") : t("common.failed")} ·
              ${discord.probe.status ?? ""} ${discord.probe.error ?? ""}
            </div>`
            : nothing
        }

        ${renderChannelConfigSection({ channelId: "discord", props })}

        <div class="row" style="margin-top: 12px;">
          <button class="btn" @click=${() => props.onRefresh(true)}>
            ${t("channels.probe")}
          </button>
        </div>

        ${renderChannelRouteSection({ channelId: "discord", props, accounts: props.snapshot?.channelAccounts?.["discord"] ?? [] })}
      </div>
    </details>
  `;
}

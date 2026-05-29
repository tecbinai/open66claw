import { html, nothing } from "lit";
import { formatAgo } from "../format";
import { t } from "../i18n/index.js";
import type { SlackStatus } from "../types";
import { renderChannelConfigSection } from "./channels.config";
import {
  isUnconfiguredError,
  errorCalloutClass,
  renderChannelRouteSection,
} from "./channels.shared";
import type { ChannelsProps } from "./channels.types";

export function renderSlackTutorial() {
  return html`
    <div class="config-steps">
      <div class="config-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>Create Slack App</strong>
          <p>
            Go to <a href="https://api.slack.com/apps" target="_blank">api.slack.com/apps</a> &rarr;
            Create New App
          </p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <strong>Enable Socket Mode</strong>
          <p>
            Settings &rarr; Socket Mode &rarr; Enable. Copy the <strong>App Token</strong> (starts with
            <code>xapp-</code>)
          </p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <strong>Get Bot Token</strong>
          <p>
            OAuth &amp; Permissions &rarr; Install to Workspace &rarr; Copy
            <strong>Bot User OAuth Token</strong> (starts with <code>xoxb-</code>)
          </p>
        </div>
      </div>
    </div>
  `;
}

export function renderSlackCard(params: {
  props: ChannelsProps;
  slack?: SlackStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, slack, accountCountLabel } = params;

  // 状态徽章
  const statusBadge = slack?.running
    ? html`<span class="channel-card__badge channel-card__badge--ok">
        <span class="status-dot status-dot--running"></span>
        ${t("common.running")}
      </span>`
    : slack?.configured
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
    slack?.running ? "channel-card--running" : "",
    slack?.configured && !slack?.running ? "channel-card--configured" : "",
    slack?.lastError
      ? isUnconfiguredError(slack.lastError)
        ? "channel-card--unconfigured"
        : "channel-card--error"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 自动展开：运行中 或 有真实错误
  const shouldOpen =
    slack?.running || (slack?.lastError != null && !isUnconfiguredError(slack.lastError));

  return html`
    <details class="${cardClasses}" ?open=${shouldOpen}>
      <summary class="channel-card__header">
        <div class="channel-card__left">
          <span class="channel-card__icon">📋</span>
          <span class="channel-card__title">${t("channels.slack.title")}</span>
          <div class="channel-card__status">
            ${statusBadge}
          </div>
        </div>
        ${chevronIcon}
      </summary>
      <div class="channel-card__body">
        <div class="channel-card__desc">${t("channels.slack.description")}</div>
        ${accountCountLabel}

        <div class="status-list">
          <div>
            <span class="label">${t("channels.configured")}</span>
            <span>${slack?.configured ? t("common.yes") : t("common.no")}</span>
          </div>
          <div>
            <span class="label">${t("common.running")}</span>
            <span>${slack?.running ? t("common.yes") : t("common.no")}</span>
          </div>
          ${
            slack?.configured || slack?.running
              ? html`
          <div>
            <span class="label">${t("channels.lastStart")}</span>
            <span>${slack?.lastStartAt ? formatAgo(slack.lastStartAt) : t("common.na")}</span>
          </div>
          <div>
            <span class="label">${t("channels.lastProbe")}</span>
            <span>${slack?.lastProbeAt ? formatAgo(slack.lastProbeAt) : t("common.na")}</span>
          </div>
          `
              : nothing
          }
        </div>

        ${
          !(slack?.configured || slack?.running)
            ? html`
                <div class="connection-hint">
                  <div class="connection-hint__title">💡 配置指引</div>
                  <div class="connection-hint__desc">
                    在下方配置表单中填写 Slack Bot Token 和 App Token 即可启用。需要先在 Slack API 创建应用。
                  </div>
                </div>
              `
            : nothing
        }

        ${
          slack?.lastError
            ? html`<div class="${errorCalloutClass(slack.lastError)}" style="margin-top: 12px;">
              ${slack.lastError}
            </div>`
            : nothing
        }

        ${
          slack?.probe
            ? html`<div class="callout" style="margin-top: 12px;">
              ${t("channels.probe")} ${slack.probe.ok ? t("common.success") : t("common.failed")} ·
              ${slack.probe.status ?? ""} ${slack.probe.error ?? ""}
            </div>`
            : nothing
        }

        ${renderChannelConfigSection({ channelId: "slack", props })}

        <div class="row" style="margin-top: 12px;">
          <button class="btn" @click=${() => props.onRefresh(true)}>
            ${t("channels.probe")}
          </button>
        </div>

        ${renderChannelRouteSection({ channelId: "slack", props, accounts: props.snapshot?.channelAccounts?.["slack"] ?? [] })}
      </div>
    </details>
  `;
}

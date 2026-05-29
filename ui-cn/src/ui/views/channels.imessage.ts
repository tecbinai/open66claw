import { html, nothing } from "lit";
import { formatAgo } from "../format";
import { t } from "../i18n/index.js";
import type { IMessageStatus } from "../types";
import { renderChannelConfigSection } from "./channels.config";
import {
  isUnconfiguredError,
  errorCalloutClass,
  renderChannelRouteSection,
} from "./channels.shared";
import type { ChannelsProps } from "./channels.types";

export function renderImessageTutorial() {
  return html`
    <div class="config-steps">
      <div class="config-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>macOS Required</strong>
          <p>iMessage integration requires a Mac logged into an iMessage account.</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <strong>Install CLI Tool</strong>
          <p>Install the iMessage CLI binary or configure the database path.</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <strong>Grant Permissions</strong>
          <p>Allow Full Disk Access for the CLI tool in System Preferences &rarr; Security.</p>
        </div>
      </div>
    </div>
  `;
}

export function renderIMessageCard(params: {
  props: ChannelsProps;
  imessage?: IMessageStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, imessage, accountCountLabel } = params;

  // 状态徽章
  const statusBadge = imessage?.running
    ? html`<span class="channel-card__badge channel-card__badge--ok">
        <span class="status-dot status-dot--running"></span>
        ${t("channel.running")}
      </span>`
    : imessage?.configured
      ? html`<span class="channel-card__badge channel-card__badge--warn">
          <span class="status-dot status-dot--configured"></span>
          ${t("channel.stopped")}
        </span>`
      : html`<span class="channel-card__badge">
          <span class="status-dot status-dot--unconfigured"></span>
          ${t("channel.notConfigured")}
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
    imessage?.running ? "channel-card--running" : "",
    imessage?.configured && !imessage?.running ? "channel-card--configured" : "",
    imessage?.lastError
      ? isUnconfiguredError(imessage.lastError)
        ? "channel-card--unconfigured"
        : "channel-card--error"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 自动展开：运行中 或 有真实错误
  const shouldOpen =
    imessage?.running || (imessage?.lastError != null && !isUnconfiguredError(imessage.lastError));

  return html`
    <details class="${cardClasses}" ?open=${shouldOpen}>
      <summary class="channel-card__header">
        <div class="channel-card__left">
          <span class="channel-card__icon">🍎</span>
          <span class="channel-card__title">iMessage</span>
          <div class="channel-card__status">
            ${statusBadge}
          </div>
        </div>
        ${chevronIcon}
      </summary>
      <div class="channel-card__body">
        <div class="channel-card__desc">${t("channel.imessageDesc")}</div>
        ${accountCountLabel}

        <div class="status-list">
          <div>
            <span class="label">${t("channel.configured")}</span>
            <span>${imessage?.configured ? t("channel.yes") : t("channel.no")}</span>
          </div>
          <div>
            <span class="label">${t("channel.running")}</span>
            <span>${imessage?.running ? t("channel.yes") : t("channel.no")}</span>
          </div>
          ${
            imessage?.configured || imessage?.running
              ? html`
          <div>
            <span class="label">${t("channel.lastStart")}</span>
            <span>${imessage?.lastStartAt ? formatAgo(imessage.lastStartAt) : "n/a"}</span>
          </div>
          <div>
            <span class="label">${t("channel.lastProbe")}</span>
            <span>${imessage?.lastProbeAt ? formatAgo(imessage.lastProbeAt) : "n/a"}</span>
          </div>
          `
              : nothing
          }
        </div>

        ${
          !(imessage?.configured || imessage?.running)
            ? html`
                <div class="connection-hint">
                  <div class="connection-hint__title">💡 配置指引</div>
                  <div class="connection-hint__desc">
                    仅支持 macOS。在下方配置表单中启用即可。需要 macOS 登录 iMessage 账号。
                  </div>
                </div>
              `
            : nothing
        }

        ${
          imessage?.lastError
            ? html`<div class="${errorCalloutClass(imessage.lastError)}" style="margin-top: 12px;">
              ${imessage.lastError}
            </div>`
            : nothing
        }

        ${
          imessage?.probe
            ? html`<div class="callout" style="margin-top: 12px;">
              Probe ${imessage.probe.ok ? "ok" : "failed"} ·
              ${imessage.probe.error ?? ""}
            </div>`
            : nothing
        }

        ${renderChannelConfigSection({ channelId: "imessage", props })}

        <div class="row" style="margin-top: 12px;">
          <button class="btn" @click=${() => props.onRefresh(true)}>
            ${t("channel.probe")}
          </button>
        </div>

        ${renderChannelRouteSection({ channelId: "imessage", props, accounts: props.snapshot?.channelAccounts?.["imessage"] ?? [] })}
      </div>
    </details>
  `;
}

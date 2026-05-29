import { html, nothing } from "lit";
import { formatAgo } from "../format";
import { t } from "../i18n/index.js";
import type { GoogleChatStatus } from "../types";
import { renderChannelConfigSection } from "./channels.config";
import {
  isUnconfiguredError,
  errorCalloutClass,
  renderChannelRouteSection,
} from "./channels.shared";
import type { ChannelsProps } from "./channels.types";

export function renderGooglechatTutorial() {
  return html`
    <div class="config-steps">
      <div class="config-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>Create Google Cloud Project</strong>
          <p>
            Go to
            <a href="https://console.cloud.google.com" target="_blank">Google Cloud Console</a> &rarr;
            Create or select a project
          </p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <strong>Enable Chat API</strong>
          <p>APIs &amp; Services &rarr; Enable Google Chat API &rarr; Configure Chat app</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <strong>Create Service Account</strong>
          <p>IAM &amp; Admin &rarr; Service Accounts &rarr; Create &rarr; Download JSON key file</p>
        </div>
      </div>
    </div>
  `;
}

export function renderGoogleChatCard(params: {
  props: ChannelsProps;
  googlechat?: GoogleChatStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, googlechat, accountCountLabel } = params;

  // 状态徽章
  const statusBadge = googlechat?.running
    ? html`<span class="channel-card__badge channel-card__badge--ok">
        <span class="status-dot status-dot--running"></span>
        ${t("common.running")}
      </span>`
    : googlechat?.configured
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
    googlechat?.running ? "channel-card--running" : "",
    googlechat?.configured && !googlechat?.running ? "channel-card--configured" : "",
    googlechat?.lastError
      ? isUnconfiguredError(googlechat.lastError)
        ? "channel-card--unconfigured"
        : "channel-card--error"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 自动展开：运行中 或 有真实错误
  const shouldOpen =
    googlechat?.running ||
    (googlechat?.lastError != null && !isUnconfiguredError(googlechat.lastError));

  return html`
    <details class="${cardClasses}" ?open=${shouldOpen}>
      <summary class="channel-card__header">
        <div class="channel-card__left">
          <span class="channel-card__icon">💭</span>
          <span class="channel-card__title">${t("channels.googlechat.title")}</span>
          <div class="channel-card__status">
            ${statusBadge}
          </div>
        </div>
        ${chevronIcon}
      </summary>
      <div class="channel-card__body">
        <div class="channel-card__desc">${t("channels.googlechat.description")}</div>
        ${accountCountLabel}

        <div class="status-list">
          <div>
            <span class="label">${t("channels.configured")}</span>
            <span>${googlechat ? (googlechat.configured ? t("common.yes") : t("common.no")) : t("common.no")}</span>
          </div>
          <div>
            <span class="label">${t("common.running")}</span>
            <span>${googlechat ? (googlechat.running ? t("common.yes") : t("common.no")) : t("common.no")}</span>
          </div>
          ${
            googlechat?.configured || googlechat?.running
              ? html`
          <div>
            <span class="label">${t("channels.googlechat.credential")}</span>
            <span>${googlechat?.credentialSource ?? t("common.na")}</span>
          </div>
          <div>
            <span class="label">${t("channels.googlechat.audience")}</span>
            <span>
              ${
                googlechat?.audienceType
                  ? `${googlechat.audienceType}${googlechat.audience ? ` · ${googlechat.audience}` : ""}`
                  : t("common.na")
              }
            </span>
          </div>
          <div>
            <span class="label">${t("channels.lastStart")}</span>
            <span>${googlechat?.lastStartAt ? formatAgo(googlechat.lastStartAt) : t("common.na")}</span>
          </div>
          <div>
            <span class="label">${t("channels.lastProbe")}</span>
            <span>${googlechat?.lastProbeAt ? formatAgo(googlechat.lastProbeAt) : t("common.na")}</span>
          </div>
          `
              : nothing
          }
        </div>

        ${
          !(googlechat?.configured || googlechat?.running)
            ? html`
                <div class="connection-hint">
                  <div class="connection-hint__title">💡 配置指引</div>
                  <div class="connection-hint__desc">
                    在下方配置表单中填写 Google Chat API 凭证即可启用。需要在 Google Cloud Console 创建服务账号。
                  </div>
                </div>
              `
            : nothing
        }

        ${
          googlechat?.lastError
            ? html`<div class="${errorCalloutClass(googlechat.lastError)}" style="margin-top: 12px;">
              ${googlechat.lastError}
            </div>`
            : nothing
        }

        ${
          googlechat?.probe
            ? html`<div class="callout" style="margin-top: 12px;">
              ${t("channels.probe")} ${googlechat.probe.ok ? t("common.success") : t("common.failed")} ·
              ${googlechat.probe.status ?? ""} ${googlechat.probe.error ?? ""}
            </div>`
            : nothing
        }

        ${renderChannelConfigSection({ channelId: "googlechat", props })}

        <div class="row" style="margin-top: 12px;">
          <button class="btn" @click=${() => props.onRefresh(true)}>
            ${t("channels.probe")}
          </button>
        </div>

        ${renderChannelRouteSection({ channelId: "googlechat", props, accounts: props.snapshot?.channelAccounts?.["googlechat"] ?? [] })}
      </div>
    </details>
  `;
}

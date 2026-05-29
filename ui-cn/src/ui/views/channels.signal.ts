import { html, nothing } from "lit";
import { formatAgo } from "../format";
import { t } from "../i18n/index.js";
import type { SignalStatus } from "../types";
import { renderChannelConfigSection } from "./channels.config";
import {
  isUnconfiguredError,
  errorCalloutClass,
  renderChannelRouteSection,
} from "./channels.shared";
import type { ChannelsProps } from "./channels.types";

export function renderSignalTutorial() {
  return html`
    <div class="config-steps">
      <div class="config-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>Deploy signal-cli REST API</strong>
          <p>
            Deploy
            <a href="https://github.com/bbernhard/signal-cli-rest-api" target="_blank"
              >signal-cli-rest-api</a
            >
            service via Docker
          </p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <strong>Register/Link Account</strong>
          <p>Register a new Signal account or link to an existing one via the REST API</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <strong>Configure Connection</strong>
          <p>Enter the phone number (account) and the REST API URL in the form</p>
        </div>
      </div>
    </div>
  `;
}

export function renderSignalCard(params: {
  props: ChannelsProps;
  signal?: SignalStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, signal, accountCountLabel } = params;

  // 状态徽章
  const statusBadge = signal?.running
    ? html`<span class="channel-card__badge channel-card__badge--ok">
        <span class="status-dot status-dot--running"></span>
        ${t("common.running")}
      </span>`
    : signal?.configured
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
    signal?.running ? "channel-card--running" : "",
    signal?.configured && !signal?.running ? "channel-card--configured" : "",
    signal?.lastError
      ? isUnconfiguredError(signal.lastError)
        ? "channel-card--unconfigured"
        : "channel-card--error"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 自动展开：运行中 或 有真实错误
  const shouldOpen =
    signal?.running || (signal?.lastError != null && !isUnconfiguredError(signal.lastError));

  return html`
    <details class="${cardClasses}" ?open=${shouldOpen}>
      <summary class="channel-card__header">
        <div class="channel-card__left">
          <span class="channel-card__icon">🔒</span>
          <span class="channel-card__title">${t("channels.signal.title")}</span>
          <div class="channel-card__status">
            ${statusBadge}
          </div>
        </div>
        ${chevronIcon}
      </summary>
      <div class="channel-card__body">
        <div class="channel-card__desc">${t("channels.signal.description")}</div>
        ${accountCountLabel}

        <div class="status-list">
          <div>
            <span class="label">${t("channels.configured")}</span>
            <span>${signal?.configured ? t("common.yes") : t("common.no")}</span>
          </div>
          <div>
            <span class="label">${t("common.running")}</span>
            <span>${signal?.running ? t("common.yes") : t("common.no")}</span>
          </div>
          ${
            signal?.configured || signal?.running
              ? html`
          <div>
            <span class="label">${t("channels.signal.baseUrl")}</span>
            <span>${signal?.baseUrl ?? t("common.na")}</span>
          </div>
          <div>
            <span class="label">${t("channels.lastStart")}</span>
            <span>${signal?.lastStartAt ? formatAgo(signal.lastStartAt) : t("common.na")}</span>
          </div>
          <div>
            <span class="label">${t("channels.lastProbe")}</span>
            <span>${signal?.lastProbeAt ? formatAgo(signal.lastProbeAt) : t("common.na")}</span>
          </div>
          `
              : nothing
          }
        </div>

        ${
          !(signal?.configured || signal?.running)
            ? html`
                <div class="connection-hint">
                  <div class="connection-hint__title">💡 配置指引</div>
                  <div class="connection-hint__desc">
                    在下方配置表单中填写 Signal CLI REST API 地址即可启用。需要先部署 signal-cli-rest-api 服务。
                  </div>
                </div>
              `
            : nothing
        }

        ${
          signal?.lastError
            ? html`<div class="${errorCalloutClass(signal.lastError)}" style="margin-top: 12px;">
              ${signal.lastError}
            </div>`
            : nothing
        }

        ${
          signal?.probe
            ? html`<div class="callout" style="margin-top: 12px;">
              ${t("channels.probe")} ${signal.probe.ok ? t("common.success") : t("common.failed")} ·
              ${signal.probe.status ?? ""} ${signal.probe.error ?? ""}
            </div>`
            : nothing
        }

        ${renderChannelConfigSection({ channelId: "signal", props })}

        <div class="row" style="margin-top: 12px;">
          <button class="btn" @click=${() => props.onRefresh(true)}>
            ${t("channels.probe")}
          </button>
        </div>

        ${renderChannelRouteSection({ channelId: "signal", props, accounts: props.snapshot?.channelAccounts?.["signal"] ?? [] })}
      </div>
    </details>
  `;
}

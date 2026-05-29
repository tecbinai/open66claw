import { html, nothing } from "lit";
import { formatAgo } from "../format";
import { t } from "../i18n/index.js";
import type { ChannelAccountSnapshot, TelegramStatus } from "../types";
import { renderChannelConfigSection } from "./channels.config";
import {
  isUnconfiguredError,
  errorCalloutClass,
  renderChannelRouteSection,
} from "./channels.shared";
import type { ChannelsProps } from "./channels.types";

export function renderTelegramTutorial() {
  return html`
    <div class="config-steps">
      <div class="config-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>Create Bot via @BotFather</strong>
          <p>
            Open Telegram, search for <a href="https://t.me/BotFather" target="_blank">@BotFather</a>,
            send <code>/newbot</code>
          </p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <strong>Copy Bot Token</strong>
          <p>BotFather will send you a token like <code>123456:ABC-DEF...</code>. Copy it.</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <strong>Paste Token</strong>
          <p>Paste the bot token into the config form on the right.</p>
        </div>
      </div>
    </div>
  `;
}

export function renderTelegramCard(params: {
  props: ChannelsProps;
  telegram?: TelegramStatus;
  telegramAccounts: ChannelAccountSnapshot[];
  accountCountLabel: unknown;
}) {
  const { props, telegram, telegramAccounts } = params;
  const hasMultipleAccounts = telegramAccounts.length > 1;

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const probe = account.probe as { bot?: { username?: string } } | undefined;
    const botUsername = probe?.bot?.username;
    const label = account.name || account.accountId;
    return html`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">
            ${botUsername ? `@${botUsername}` : label}
          </div>
          <div class="account-card-id">${account.accountId}</div>
        </div>
        <div class="status-list account-card-status">
          <div>
            <span class="label">${t("common.running")}</span>
            <span>${account.running ? t("common.yes") : t("common.no")}</span>
          </div>
          <div>
            <span class="label">${t("channels.configured")}</span>
            <span>${account.configured ? t("common.yes") : t("common.no")}</span>
          </div>
          <div>
            <span class="label">${t("sessions.lastActivity")}</span>
            <span>${account.lastInboundAt ? formatAgo(account.lastInboundAt) : t("common.na")}</span>
          </div>
          ${
            account.lastError
              ? html`
                <div class="${isUnconfiguredError(account.lastError) ? "account-card-muted" : "account-card-error"}">
                  ${account.lastError}
                </div>
              `
              : nothing
          }
        </div>
      </div>
    `;
  };

  // 状态徽章
  const statusBadge = telegram?.running
    ? html`<span class="channel-card__badge channel-card__badge--ok">
        <span class="status-dot status-dot--running"></span>
        ${t("common.running")}
      </span>`
    : telegram?.configured
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
    telegram?.running ? "channel-card--running" : "",
    telegram?.configured && !telegram?.running ? "channel-card--configured" : "",
    telegram?.lastError
      ? isUnconfiguredError(telegram.lastError)
        ? "channel-card--unconfigured"
        : "channel-card--error"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 自动展开：运行中 或 有真实错误
  const shouldOpen =
    telegram?.running || (telegram?.lastError != null && !isUnconfiguredError(telegram.lastError));

  return html`
    <details class="${cardClasses}" ?open=${shouldOpen}>
      <summary class="channel-card__header">
        <div class="channel-card__left">
          <span class="channel-card__icon">✈️</span>
          <span class="channel-card__title">Telegram</span>
          <div class="channel-card__status">
            ${statusBadge}
          </div>
        </div>
        ${chevronIcon}
      </summary>
      <div class="channel-card__body">
        <div class="channel-card__desc">${t("channels.telegram.description")}</div>

        ${
          hasMultipleAccounts
            ? html`
              <div class="account-card-list">
                ${telegramAccounts.map((account) => renderAccountCard(account))}
              </div>
            `
            : html`
              <div class="status-list">
                <div>
                  <span class="label">${t("channels.configured")}</span>
                  <span>${telegram?.configured ? t("common.yes") : t("common.no")}</span>
                </div>
                <div>
                  <span class="label">${t("common.running")}</span>
                  <span>${telegram?.running ? t("common.yes") : t("common.no")}</span>
                </div>
                ${
                  telegram?.configured || telegram?.running
                    ? html`
                    <div>
                      <span class="label">${t("channels.telegram.mode")}</span>
                      <span>${telegram?.mode ?? t("common.na")}</span>
                    </div>
                    <div>
                      <span class="label">${t("channels.lastStart")}</span>
                      <span>${telegram?.lastStartAt ? formatAgo(telegram.lastStartAt) : t("common.na")}</span>
                    </div>
                    <div>
                      <span class="label">${t("channels.lastProbe")}</span>
                      <span>${telegram?.lastProbeAt ? formatAgo(telegram.lastProbeAt) : t("common.na")}</span>
                    </div>
                  `
                    : nothing
                }
              </div>
            `
        }

        ${
          !(hasMultipleAccounts || telegram?.configured || telegram?.running)
            ? html`
                <div class="connection-hint">
                  <div class="connection-hint__title">💡 配置指引</div>
                  <div class="connection-hint__desc">
                    在下方配置表单中填写 Telegram Bot Token 即可启用。需要先通过 @BotFather 创建 Bot。
                  </div>
                </div>
              `
            : nothing
        }

        ${
          telegram?.lastError
            ? html`<div class="${errorCalloutClass(telegram.lastError)}" style="margin-top: 12px;">
              ${telegram.lastError}
            </div>`
            : nothing
        }

        ${
          telegram?.probe
            ? html`<div class="callout" style="margin-top: 12px;">
              ${t("channels.probe")} ${telegram.probe.ok ? t("common.success") : t("common.failed")} ·
              ${telegram.probe.status ?? ""} ${telegram.probe.error ?? ""}
            </div>`
            : nothing
        }

        ${renderChannelConfigSection({ channelId: "telegram", props })}

        <div class="row" style="margin-top: 12px;">
          <button class="btn" @click=${() => props.onRefresh(true)}>
            ${t("channels.probe")}
          </button>
        </div>

        ${renderChannelRouteSection({ channelId: "telegram", props, accounts: telegramAccounts })}
      </div>
    </details>
  `;
}

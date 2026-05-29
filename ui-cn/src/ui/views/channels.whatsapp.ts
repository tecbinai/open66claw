import { html, nothing } from "lit";
import { formatAgo } from "../format";
import { t } from "../i18n/index.js";
import type { WhatsAppStatus } from "../types";
import { renderChannelConfigSection } from "./channels.config";
import {
  isUnconfiguredError,
  errorCalloutClass,
  formatDuration,
  renderChannelRouteSection,
} from "./channels.shared";
import type { ChannelsProps } from "./channels.types";

export function renderWhatsappTutorial() {
  return html`
    <div class="config-steps">
      <div class="config-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>Show QR Code</strong>
          <p>Click "Show QR" below to generate a WhatsApp Web QR code.</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <strong>Scan with WhatsApp</strong>
          <p>Open WhatsApp on your phone &rarr; Settings &rarr; Linked Devices &rarr; Scan QR code</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <strong>Wait for Connection</strong>
          <p>After scanning, the connection will establish automatically. No credentials needed.</p>
        </div>
      </div>
    </div>
  `;
}

export function renderWhatsAppCard(params: {
  props: ChannelsProps;
  whatsapp?: WhatsAppStatus;
  accountCountLabel: unknown;
}) {
  const { props, whatsapp } = params;

  // 状态徽章
  const statusBadge = whatsapp?.running
    ? html`<span class="channel-card__badge channel-card__badge--ok">
        <span class="status-dot status-dot--running"></span>
        ${t("common.running")}
      </span>`
    : whatsapp?.configured
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
    whatsapp?.running ? "channel-card--running" : "",
    whatsapp?.configured && !whatsapp?.running ? "channel-card--configured" : "",
    whatsapp?.lastError
      ? isUnconfiguredError(whatsapp.lastError)
        ? "channel-card--unconfigured"
        : "channel-card--error"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 自动展开：运行中 或 有真实错误
  const shouldOpen =
    whatsapp?.running || (whatsapp?.lastError != null && !isUnconfiguredError(whatsapp.lastError));

  return html`
    <details class="${cardClasses}" ?open=${shouldOpen}>
      <summary class="channel-card__header">
        <div class="channel-card__left">
          <span class="channel-card__icon">💬</span>
          <span class="channel-card__title">WhatsApp</span>
          <div class="channel-card__status">
            ${statusBadge}
          </div>
        </div>
        ${chevronIcon}
      </summary>
      <div class="channel-card__body">
        <div class="channel-card__desc">${t("channels.whatsapp.description")}</div>

        <div class="status-list">
          <div>
            <span class="label">${t("channels.configured")}</span>
            <span>${whatsapp?.configured ? t("common.yes") : t("common.no")}</span>
          </div>
          <div>
            <span class="label">${t("common.running")}</span>
            <span>${whatsapp?.running ? t("common.yes") : t("common.no")}</span>
          </div>
          ${
            whatsapp?.configured || whatsapp?.running || whatsapp?.linked
              ? html`
              <div>
                <span class="label">${t("channels.whatsapp.linked")}</span>
                <span>${whatsapp?.linked ? t("common.yes") : t("common.no")}</span>
              </div>
              <div>
                <span class="label">${t("common.connected")}</span>
                <span>${whatsapp?.connected ? t("common.yes") : t("common.no")}</span>
              </div>
              <div>
                <span class="label">${t("channels.whatsapp.lastConnect")}</span>
                <span>
                  ${
                    whatsapp?.lastConnectedAt ? formatAgo(whatsapp.lastConnectedAt) : t("common.na")
                  }
                </span>
              </div>
              <div>
                <span class="label">${t("channels.whatsapp.lastMessage")}</span>
                <span>
                  ${whatsapp?.lastMessageAt ? formatAgo(whatsapp.lastMessageAt) : t("common.na")}
                </span>
              </div>
              <div>
                <span class="label">${t("channels.whatsapp.authAge")}</span>
                <span>
                  ${
                    whatsapp?.authAgeMs != null
                      ? formatDuration(whatsapp.authAgeMs)
                      : t("common.na")
                  }
                </span>
              </div>
            `
              : nothing
          }
        </div>

        ${
          !(whatsapp?.configured || whatsapp?.running || whatsapp?.linked)
            ? html`
                <div class="connection-hint">
                  <div class="connection-hint__title">💡 配置指引</div>
                  <div class="connection-hint__desc">点击下方「显示二维码」扫码绑定 WhatsApp Web 即可启用。</div>
                </div>
              `
            : nothing
        }

        ${
          whatsapp?.lastError
            ? html`<div class="${errorCalloutClass(whatsapp.lastError)}" style="margin-top: 12px;">
              ${whatsapp.lastError}
            </div>`
            : nothing
        }

        ${
          props.whatsappMessage
            ? html`<div class="callout" style="margin-top: 12px;">
              ${props.whatsappMessage}
            </div>`
            : nothing
        }

        ${
          props.whatsappQrDataUrl
            ? html`<div class="qr-wrap">
              <img src=${props.whatsappQrDataUrl} alt="WhatsApp QR" />
            </div>`
            : nothing
        }

        <div class="row" style="margin-top: 14px; flex-wrap: wrap;">
          <button
            class="btn primary"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppStart(false)}
          >
            ${props.whatsappBusy ? t("common.working") : t("channels.whatsapp.showQR")}
          </button>
          <button
            class="btn"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppStart(true)}
          >
            ${t("channels.whatsapp.relink")}
          </button>
          <button
            class="btn"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppWait()}
          >
            ${t("channels.whatsapp.waitForScan")}
          </button>
          <button
            class="btn danger"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppLogout()}
          >
            ${t("channels.whatsapp.logout")}
          </button>
          <button class="btn" @click=${() => props.onRefresh(true)}>
            ${t("common.refresh")}
          </button>
        </div>

        ${renderChannelConfigSection({ channelId: "whatsapp", props })}

        ${renderChannelRouteSection({ channelId: "whatsapp", props, accounts: props.snapshot?.channelAccounts?.["whatsapp"] ?? [] })}
      </div>
    </details>
  `;
}

/**
 * QQ 机器人渠道 UI 视图
 * QQ Bot Channel UI View
 */

import { html, nothing } from "lit";
import { formatAgo } from "../format";
import { t } from "../i18n/index.js";
import type { ChannelAccountSnapshot } from "../types";
import { renderChannelConfigSection } from "./channels.config";
import {
  isUnconfiguredError,
  errorCalloutClass,
  renderChannelRouteSection,
} from "./channels.shared";
import type { ChannelsProps, QqbotStatus } from "./channels.types";

// 重新导出类型以保持向后兼容
export type { QqbotStatus } from "./channels.types";

export function renderQqbotTutorial() {
  return html`
    <div class="config-steps">
      <div class="config-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>登录 QQ 开放平台</strong>
          <p>访问 <a href="https://q.qq.com" target="_blank">q.qq.com</a>，登录开发者账号</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <strong>创建机器人应用</strong>
          <p>点击「创建机器人」&rarr; 填写基本信息 &rarr; 提交创建</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <strong>获取凭证</strong>
          <p>在应用设置页面获取：</p>
          <ul>
            <li><strong>AppID</strong> 和 <strong>AppSecret</strong></li>
            <li><strong>Token</strong>（回调验证令牌）</li>
            <li><strong>Public Key</strong>（Ed25519 公钥，十六进制）</li>
          </ul>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">4</div>
        <div class="step-content">
          <strong>配置回调地址</strong>
          <p>在「开发设置」中填写回调 URL，确保服务器可访问</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">5</div>
        <div class="step-content">
          <strong>发布应用</strong>
          <p>完成配置后提交审核 &rarr; 审核通过后即可使用</p>
        </div>
      </div>
    </div>
  `;
}

export function renderQqbotCard(params: {
  props: ChannelsProps;
  qqbot?: QqbotStatus;
  qqbotAccounts: ChannelAccountSnapshot[];
  accountCountLabel: unknown;
}) {
  const { props, qqbot, qqbotAccounts } = params;
  const hasMultipleAccounts = qqbotAccounts.length > 1;

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const probe = account.probe as { botInfo?: { username?: string } } | undefined;
    const botName = probe?.botInfo?.username;
    const label = account.name || account.accountId;
    return html`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">
            ${botName ? botName : label}
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

  // 状态徽章 - 使用视觉指示器
  const statusBadge = qqbot?.running
    ? html`<span class="channel-card__badge channel-card__badge--ok">
        <span class="status-dot status-dot--running"></span>
        ${t("common.running")}
      </span>`
    : qqbot?.configured
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
    qqbot?.running ? "channel-card--running" : "",
    qqbot?.configured && !qqbot?.running ? "channel-card--configured" : "",
    qqbot?.lastError
      ? isUnconfiguredError(qqbot.lastError)
        ? "channel-card--unconfigured"
        : "channel-card--error"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 自动展开：运行中 或 有真实错误
  const shouldOpen =
    qqbot?.running || (qqbot?.lastError != null && !isUnconfiguredError(qqbot.lastError));

  return html`
    <details class="${cardClasses}" ?open=${shouldOpen}>
      <summary class="channel-card__header">
        <div class="channel-card__left">
          <span class="channel-card__icon">🐧</span>
          <span class="channel-card__title">${t("channels.qqbot")}</span>
          <div class="channel-card__status">
            ${statusBadge}
          </div>
        </div>
        ${chevronIcon}
      </summary>
      <div class="channel-card__body">
        <div class="channel-card__desc">${t("channels.qqbot.description")}</div>

        ${
          hasMultipleAccounts
            ? html`
              <div class="account-card-list">
                ${qqbotAccounts.map((account) => renderAccountCard(account))}
              </div>
            `
            : qqbot?.configured || qqbot?.running
              ? html`
              <div class="status-list">
                <div>
                  <span class="label">${t("channels.configured")}</span>
                  <span class="status-value ${qqbot?.configured ? "status-value--yes" : "status-value--no"}">
                    ${qqbot?.configured ? t("common.yes") : t("common.no")}
                  </span>
                </div>
                <div>
                  <span class="label">${t("common.running")}</span>
                  <span class="status-value ${qqbot?.running ? "status-value--yes" : "status-value--no"}">
                    ${qqbot?.running ? t("common.yes") : t("common.no")}
                  </span>
                </div>
                <div>
                  <span class="label">${t("channels.lastStart")}</span>
                  <span>${qqbot?.lastStartAt ? formatAgo(qqbot.lastStartAt) : t("common.na")}</span>
                </div>
                <div>
                  <span class="label">${t("channels.lastProbe")}</span>
                  <span>${qqbot?.lastProbeAt ? formatAgo(qqbot.lastProbeAt) : t("common.na")}</span>
                </div>
              </div>
            `
              : nothing
        }

        ${
          qqbot?.lastError
            ? html`<div class="${errorCalloutClass(qqbot.lastError)}" style="margin-top: 12px;">
              ${qqbot.lastError}
            </div>`
            : nothing
        }

        ${
          qqbot?.probe
            ? html`<div class="callout" style="margin-top: 12px;">
              ${t("channels.probe")} ${qqbot.probe.ok ? t("common.success") : t("common.failed")} ·
              ${qqbot.probe.status ?? ""} ${qqbot.probe.error ?? ""}
              ${qqbot.probe.botInfo?.username ? html`<br/>机器人: ${qqbot.probe.botInfo.username}` : nothing}
            </div>`
            : nothing
        }

        <!-- 配置帮助 - 详细指南 -->
        <details class="channel-card__help" style="margin-top: 16px;">
          <summary class="channel-card__help-title">
            📖 ${t("channels.qqbot.configTitle")}
            <span class="help-badge">详细教程</span>
          </summary>
          <div class="channel-card__help-content">
            <!-- 注意事项 -->
            <div class="callout warning" style="margin-bottom: 16px;">
              <strong>⚠️ 注意：</strong>QQ 机器人需要公网 IP 或域名来接收消息回调。请确保你的服务器可以被 QQ 开放平台访问。
            </div>

            <p>${t("channels.qqbot.configDesc")}</p>
            
            <div class="config-steps">
              <div class="config-step">
                <div class="step-number">1</div>
                <div class="step-content">
                  <strong>登录 QQ 开放平台</strong>
                  <p>访问 <a href="https://q.qq.com" target="_blank">q.qq.com</a>，使用 QQ 登录开发者账号</p>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">2</div>
                <div class="step-content">
                  <strong>创建机器人应用</strong>
                  <p>进入「应用管理」→「创建应用」→ 选择「机器人」类型</p>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">3</div>
                <div class="step-content">
                  <strong>获取应用凭证</strong>
                  <p>在应用详情页获取以下信息：</p>
                  <ul>
                    <li><strong>AppID</strong>：应用唯一标识</li>
                    <li><strong>AppSecret (ClientSecret)</strong>：应用密钥</li>
                    <li><strong>Token</strong>：回调验证 Token（可选）</li>
                  </ul>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">4</div>
                <div class="step-content">
                  <strong>配置 IP 白名单</strong>
                  <p>在「开发设置」中添加你的服务器公网 IP 到白名单</p>
                  <div class="callout danger" style="margin-top: 8px; padding: 8px 12px;">
                    🔐 必须配置 IP 白名单，否则无法调用 API
                  </div>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">5</div>
                <div class="step-content">
                  <strong>配置消息接收地址</strong>
                  <p>在「开发设置」→「消息接收配置」中填写你的 Webhook 地址：</p>
                  <code>https://your-domain.com/qqbot/webhook</code>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">6</div>
                <div class="step-content">
                  <strong>发布机器人</strong>
                  <p>完成配置后，提交审核并发布机器人</p>
                </div>
              </div>
            </div>

            <a href="https://q.qq.com/wiki/develop/api-v2/" target="_blank" rel="noreferrer" class="btn btn--link" style="margin-top: 12px;">
              查看 QQ 机器人开发文档 →
            </a>
          </div>
        </details>

        ${renderChannelConfigSection({ channelId: "qqbot", props })}

        <div class="row" style="margin-top: 12px;">
          <button class="btn" @click=${() => props.onRefresh(true)}>
            ${t("channels.probe")}
          </button>
        </div>

        ${renderChannelRouteSection({ channelId: "qqbot", props, accounts: qqbotAccounts })}
      </div>
    </details>
  `;
}

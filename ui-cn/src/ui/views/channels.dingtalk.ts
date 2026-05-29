/**
 * 钉钉渠道 UI 视图
 * DingTalk Channel UI View
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
import type { ChannelsProps, DingtalkStatus } from "./channels.types";

// 重新导出类型以保持向后兼容
export type { DingtalkStatus } from "./channels.types";

export function renderDingtalkTutorial() {
  return html`
    <div class="callout success" style="margin-bottom: 16px;">
      <strong>推荐使用 Stream 模式：</strong>无需公网 IP，无需配置回调地址，本地即可接收消息！
    </div>
    <p>${t("channels.dingtalk.configDesc")}</p>
    <div class="config-steps">
      <div class="config-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>登录钉钉开放平台</strong>
          <p>访问 <a href="https://open-dev.dingtalk.com" target="_blank">open-dev.dingtalk.com</a>，点击右上角「登录」按钮，用钉钉 App 扫码</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <strong>创建企业内部应用</strong>
          <p>左侧菜单点击「应用开发」&rarr;「企业内部开发」&rarr; 点击「创建应用」</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <strong>获取 AppKey 和 AppSecret</strong>
          <p>创建成功后，左侧菜单点击「凭证与基础信息」：</p>
          <ul>
            <li><strong>Client ID (AppKey)</strong>：直接复制</li>
            <li><strong>Client Secret (AppSecret)</strong>：点击「查看」&rarr; 扫码验证 &rarr; 立即复制！</li>
          </ul>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">4</div>
        <div class="step-content">
          <strong>添加机器人能力</strong>
          <p>左侧菜单点击「添加应用能力」&rarr; 找到「机器人」卡片 &rarr; 点击「添加」</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">5</div>
        <div class="step-content">
          <strong>配置 Stream 模式（最关键！）</strong>
          <p>左侧菜单点击「机器人」&rarr; 找到「消息接收模式」&rarr; 选择「Stream 模式」</p>
          <div class="callout warning" style="margin-top: 8px; padding: 8px 12px;">
            必须选择 Stream 模式！不要选 HTTP 模式！选了 Stream 模式就不需要公网 IP
          </div>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">6</div>
        <div class="step-content">
          <strong>发布应用</strong>
          <p>左侧菜单点击「版本管理与发布」&rarr;「创建新版本」&rarr; 填写版本号 &rarr; 点击「发布」</p>
        </div>
      </div>
    </div>
    <a href="${t("channels.dingtalk.docsUrl")}" target="_blank" rel="noreferrer" class="btn btn--link" style="margin-top: 12px;">
      ${t("channels.dingtalk.docsLabel")} &rarr;
    </a>
  `;
}

export function renderDingtalkCard(params: {
  props: ChannelsProps;
  dingtalk?: DingtalkStatus;
  dingtalkAccounts: ChannelAccountSnapshot[];
  accountCountLabel: unknown;
}) {
  const { props, dingtalk, dingtalkAccounts } = params;
  const hasMultipleAccounts = dingtalkAccounts.length > 1;

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const probe = account.probe as { corp?: { name?: string } } | undefined;
    const corpName = probe?.corp?.name;
    const label = account.name || account.accountId;
    return html`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">
            ${corpName ? corpName : label}
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
  const statusBadge = dingtalk?.running
    ? html`<span class="channel-card__badge channel-card__badge--ok">
        <span class="status-dot status-dot--running"></span>
        ${t("common.running")}
      </span>`
    : dingtalk?.configured
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
    dingtalk?.running ? "channel-card--running" : "",
    dingtalk?.configured && !dingtalk?.running ? "channel-card--configured" : "",
    dingtalk?.lastError
      ? isUnconfiguredError(dingtalk.lastError)
        ? "channel-card--unconfigured"
        : "channel-card--error"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 自动展开：运行中 或 有真实错误
  const shouldOpen =
    dingtalk?.running || (dingtalk?.lastError != null && !isUnconfiguredError(dingtalk.lastError));

  return html`
    <details class="${cardClasses}" ?open=${shouldOpen}>
      <summary class="channel-card__header">
        <div class="channel-card__left">
          <span class="channel-card__icon">📱</span>
          <span class="channel-card__title">${t("channels.dingtalk")}</span>
          <div class="channel-card__status">
            ${statusBadge}
          </div>
        </div>
        ${chevronIcon}
      </summary>
      <div class="channel-card__body">
        <div class="channel-card__desc">${t("channels.dingtalk.description")}</div>

        ${
          hasMultipleAccounts
            ? html`
              <div class="account-card-list">
                ${dingtalkAccounts.map((account) => renderAccountCard(account))}
              </div>
            `
            : dingtalk?.configured || dingtalk?.running
              ? html`
              <div class="status-list">
                <div>
                  <span class="label">${t("channels.configured")}</span>
                  <span class="status-value ${dingtalk?.configured ? "status-value--yes" : "status-value--no"}">
                    ${dingtalk?.configured ? t("common.yes") : t("common.no")}
                  </span>
                </div>
                <div>
                  <span class="label">${t("common.running")}</span>
                  <span class="status-value ${dingtalk?.running ? "status-value--yes" : "status-value--no"}">
                    ${dingtalk?.running ? t("common.yes") : t("common.no")}
                  </span>
                </div>
                <div>
                  <span class="label">${t("channels.lastStart")}</span>
                  <span>${dingtalk?.lastStartAt ? formatAgo(dingtalk.lastStartAt) : t("common.na")}</span>
                </div>
                <div>
                  <span class="label">${t("channels.lastProbe")}</span>
                  <span>${dingtalk?.lastProbeAt ? formatAgo(dingtalk.lastProbeAt) : t("common.na")}</span>
                </div>
              </div>
            `
              : nothing
        }

        ${
          dingtalk?.lastError
            ? html`<div class="${errorCalloutClass(dingtalk.lastError)}" style="margin-top: 12px;">
              ${dingtalk.lastError}
            </div>`
            : nothing
        }

        ${
          dingtalk?.probe
            ? html`<div class="callout" style="margin-top: 12px;">
              ${t("channels.probe")} ${dingtalk.probe.ok ? t("common.success") : t("common.failed")} ·
              ${dingtalk.probe.status ?? ""} ${dingtalk.probe.error ?? ""}
              ${dingtalk.probe.corp?.name ? html`<br/>${t("channels.dingtalk.corp")}: ${dingtalk.probe.corp.name}` : nothing}
            </div>`
            : nothing
        }

        <!-- 配置帮助 - 详细指南 -->
        <details class="channel-card__help" style="margin-top: 16px;">
          <summary class="channel-card__help-title">
            📖 ${t("channels.dingtalk.configTitle")}
            <span class="help-badge">详细教程</span>
          </summary>
          <div class="channel-card__help-content">
            <!-- 优势提示 -->
            <div class="callout success" style="margin-bottom: 16px;">
              <strong>✨ 推荐使用 Stream 模式：</strong>无需公网 IP，无需配置回调地址，本地即可接收消息！
            </div>

            <p>${t("channels.dingtalk.configDesc")}</p>
            
            <div class="config-steps">
              <div class="config-step">
                <div class="step-number">1</div>
                <div class="step-content">
                  <strong>登录钉钉开放平台</strong>
                  <p>访问 <a href="https://open-dev.dingtalk.com" target="_blank">open-dev.dingtalk.com</a>，点击<strong>右上角</strong>「<strong>登录</strong>」按钮，用钉钉 App 扫码</p>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">2</div>
                <div class="step-content">
                  <strong>创建企业内部应用</strong>
                  <p>左侧菜单点击「<strong>应用开发</strong>」→「<strong>企业内部开发</strong>」→ 点击「<strong>创建应用</strong>」</p>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">3</div>
                <div class="step-content">
                  <strong>获取 AppKey 和 AppSecret</strong>
                  <p>创建成功后，左侧菜单点击「<strong>凭证与基础信息</strong>」：</p>
                  <ul>
                    <li><strong>Client ID (AppKey)</strong>：直接复制</li>
                    <li><strong>Client Secret (AppSecret)</strong>：点击「查看」→ 扫码验证 → <strong>立即复制！</strong></li>
                  </ul>
                  <div class="callout danger" style="margin-top: 8px; padding: 8px 12px;">
                    🔐 Secret 只显示一次！请立即复制保存
                  </div>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">4</div>
                <div class="step-content">
                  <strong>添加机器人能力</strong>
                  <p>左侧菜单点击「<strong>添加应用能力</strong>」→ 找到「<strong>机器人</strong>」卡片 → 点击「<strong>添加</strong>」</p>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">5</div>
                <div class="step-content">
                  <strong>配置 Stream 模式（最关键！）</strong>
                  <p>左侧菜单点击「<strong>机器人</strong>」→ 找到「<strong>消息接收模式</strong>」→ <strong>选择「Stream 模式」</strong></p>
                  <div class="callout warning" style="margin-top: 8px; padding: 8px 12px;">
                    ⭐ 必须选择 Stream 模式！不要选 HTTP 模式！选了 Stream 模式就不需要公网 IP
                  </div>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">6</div>
                <div class="step-content">
                  <strong>发布应用</strong>
                  <p>左侧菜单点击「<strong>版本管理与发布</strong>」→「<strong>创建新版本</strong>」→ 填写版本号 <code>1.0.0</code> → 点击「<strong>发布</strong>」</p>
                </div>
              </div>
            </div>

            <a href="${t("channels.dingtalk.docsUrl")}" target="_blank" rel="noreferrer" class="btn btn--link" style="margin-top: 12px;">
              ${t("channels.dingtalk.docsLabel")} →
            </a>
          </div>
        </details>

        ${renderChannelConfigSection({ channelId: "dingtalk", props })}

        <div class="row" style="margin-top: 12px;">
          <button class="btn" @click=${() => props.onRefresh(true)}>
            ${t("channels.probe")}
          </button>
        </div>

        ${renderChannelRouteSection({ channelId: "dingtalk", props, accounts: dingtalkAccounts })}
      </div>
    </details>
  `;
}

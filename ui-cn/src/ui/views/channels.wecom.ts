/**
 * 企业微信渠道 UI 视图
 * WeChat Work (WeCom) Channel UI View
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
import type { ChannelsProps, WecomStatus } from "./channels.types";

// 重新导出类型以保持向后兼容
export type { WecomStatus } from "./channels.types";

export function renderWecomTutorial() {
  return html`
    <div class="callout success" style="margin-bottom: 16px">
      <strong>推荐使用回调模式：</strong>需要公网 IP 或内网穿透工具（如 ngrok、frp）。
    </div>
    <div class="config-steps">
      <div class="config-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>登录企业微信管理后台</strong>
          <p>
            访问 <a href="https://work.weixin.qq.com" target="_blank">work.weixin.qq.com</a>，用企业微信
            App 扫码登录
          </p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <strong>创建自建应用</strong>
          <p>进入「应用管理」&rarr;「自建」&rarr; 点击「创建应用」&rarr; 填写基本信息</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <strong>获取凭证</strong>
          <p>进入应用详情页获取以下信息：</p>
          <ul>
            <li><strong>CorpID</strong>：「我的企业」&rarr; 页面底部「企业ID」</li>
            <li><strong>AgentID</strong>：应用详情页「AgentId」</li>
            <li><strong>Secret</strong>：应用详情页「Secret」</li>
          </ul>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">4</div>
        <div class="step-content">
          <strong>配置回调地址</strong>
          <p>在应用详情页「接收消息」&rarr; 设置 API 接收 &rarr; 填写回调 URL</p>
          <p>记下 <strong>Token</strong> 和 <strong>EncodingAESKey</strong></p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">5</div>
        <div class="step-content">
          <strong>设置可信 IP</strong>
          <p>在应用详情页「企业可信IP」中添加服务器公网 IP</p>
        </div>
      </div>
    </div>
  `;
}

export function renderWecomCard(params: {
  props: ChannelsProps;
  wecom?: WecomStatus;
  wecomAccounts: ChannelAccountSnapshot[];
  accountCountLabel: unknown;
}) {
  const { props, wecom, wecomAccounts } = params;
  const hasMultipleAccounts = wecomAccounts.length > 1;

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const probe = account.probe as { corp?: { name?: string } } | undefined;
    const corpName = probe?.corp?.name;
    const label = account.name || account.accountId;
    // 获取账户特定的 webhookPath
    const webhookPath = (account as unknown as { webhookPath?: string }).webhookPath;
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
          ${
            webhookPath
              ? html`
                <div>
                  <span class="label">Webhook</span>
                  <span><code>${webhookPath}</code></span>
                </div>
              `
              : nothing
          }
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
  const statusBadge = wecom?.running
    ? html`<span class="channel-card__badge channel-card__badge--ok">
        <span class="status-dot status-dot--running"></span>
        ${t("common.running")}
      </span>`
    : wecom?.configured
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
    wecom?.running ? "channel-card--running" : "",
    wecom?.configured && !wecom?.running ? "channel-card--configured" : "",
    wecom?.lastError
      ? isUnconfiguredError(wecom.lastError)
        ? "channel-card--unconfigured"
        : "channel-card--error"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 自动展开：运行中 或 有真实错误
  const shouldOpen =
    wecom?.running || (wecom?.lastError != null && !isUnconfiguredError(wecom.lastError));

  return html`
    <details class="${cardClasses}" ?open=${shouldOpen}>
      <summary class="channel-card__header">
        <div class="channel-card__left">
          <span class="channel-card__icon">💼</span>
          <span class="channel-card__title">${t("channels.wecom")}</span>
          <div class="channel-card__status">
            ${statusBadge}
          </div>
        </div>
        ${chevronIcon}
      </summary>
      <div class="channel-card__body">
        <div class="channel-card__desc">${t("channels.wecom.description")}</div>

        ${
          hasMultipleAccounts
            ? html`
              <div class="account-card-list">
                ${wecomAccounts.map((account) => renderAccountCard(account))}
              </div>
            `
            : wecom?.configured || wecom?.running
              ? html`
              <div class="status-list">
                <div>
                  <span class="label">${t("channels.configured")}</span>
                  <span class="status-value ${wecom?.configured ? "status-value--yes" : "status-value--no"}">
                    ${wecom?.configured ? t("common.yes") : t("common.no")}
                  </span>
                </div>
                <div>
                  <span class="label">${t("common.running")}</span>
                  <span class="status-value ${wecom?.running ? "status-value--yes" : "status-value--no"}">
                    ${wecom?.running ? t("common.yes") : t("common.no")}
                  </span>
                </div>
                <div>
                  <span class="label">${t("channels.lastStart")}</span>
                  <span>${wecom?.lastStartAt ? formatAgo(wecom.lastStartAt) : t("common.na")}</span>
                </div>
                <div>
                  <span class="label">${t("channels.lastProbe")}</span>
                  <span>${wecom?.lastProbeAt ? formatAgo(wecom.lastProbeAt) : t("common.na")}</span>
                </div>
              </div>
            `
              : nothing
        }

        ${
          wecom?.lastError
            ? html`<div class="${errorCalloutClass(wecom.lastError)}" style="margin-top: 12px;">
              ${wecom.lastError}
            </div>`
            : nothing
        }

        ${
          wecom?.probe
            ? html`<div class="callout" style="margin-top: 12px;">
              ${t("channels.probe")} ${wecom.probe.ok ? t("common.success") : t("common.failed")} ·
              ${wecom.probe.status ?? ""} ${wecom.probe.error ?? ""}
              ${wecom.probe.corp?.name ? html`<br/>${t("channels.wecom.corp")}: ${wecom.probe.corp.name}` : nothing}
            </div>`
            : nothing
        }

        <!-- 配置帮助 - 详细指南 -->
        <details class="channel-card__help" style="margin-top: 16px;">
          <summary class="channel-card__help-title">
            📖 ${t("channels.wecom.configTitle")}
            <span class="help-badge">详细教程</span>
          </summary>
          <div class="channel-card__help-content">
            <!-- 重要提示 -->
            <div class="callout warning" style="margin-bottom: 16px;">
              <strong>⚠️ 重要：</strong>企业微信与钉钉/飞书不同，<strong>必须配置公网回调地址</strong>才能接收消息。
              如果没有公网服务器，推荐使用 <a href="https://ngrok.com" target="_blank">ngrok</a> 或 
              <a href="https://github.com/fatedier/frp" target="_blank">frp</a> 进行内网穿透。
            </div>

            <p>${t("channels.wecom.configDesc")}</p>
            
            <div class="config-steps">
              <div class="config-step">
                <div class="step-number">1</div>
                <div class="step-content">
                  <strong>登录企业微信管理后台</strong>
                  <p>访问 <a href="https://work.weixin.qq.com/wework_admin/frame" target="_blank">work.weixin.qq.com</a>，用<strong>微信 App</strong> 扫码登录</p>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">2</div>
                <div class="step-content">
                  <strong>获取企业 ID (CorpID)</strong>
                  <p>点击顶部「<strong>我的企业</strong>」→ 滚动到页面最底部 → 复制「<strong>企业ID</strong>」</p>
                  <code class="hint">格式：ww 开头，共 18 位字符</code>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">3</div>
                <div class="step-content">
                  <strong>创建自建应用</strong>
                  <p>点击顶部「<strong>应用管理</strong>」→ 找到「<strong>自建</strong>」区域 → 点击「<strong>创建应用</strong>」</p>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">4</div>
                <div class="step-content">
                  <strong>获取 AgentId 和 Secret</strong>
                  <p>创建成功后在应用详情页：</p>
                  <ul>
                    <li><strong>AgentId</strong>：纯数字，如 <code>1000002</code></li>
                    <li><strong>Secret</strong>：点击「查看」→ 扫码验证 → <strong>立即复制！</strong></li>
                  </ul>
                  <div class="callout danger" style="margin-top: 8px; padding: 8px 12px;">
                    🔐 Secret 只显示一次！请立即复制保存
                  </div>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">5</div>
                <div class="step-content">
                  <strong>配置接收消息（最关键！）</strong>
                  <p>在应用详情页往下滚动 → 找到「<strong>接收消息</strong>」→ 点击「<strong>设置API接收</strong>」</p>
                  <ul>
                    <li><strong>URL</strong>：<code>https://你的域名/api/wecom/callback</code>（必须 HTTPS）</li>
                    <li><strong>Token</strong>：点击「随机获取」→ 复制</li>
                    <li><strong>EncodingAESKey</strong>：点击「随机获取」→ 复制</li>
                  </ul>
                  <div class="callout warning" style="margin-top: 8px; padding: 8px 12px;">
                    ⚠️ 先<strong>不要点保存</strong>！先把 Token 和 EncodingAESKey 填到下方，启动 Gateway 后再保存
                  </div>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">6</div>
                <div class="step-content">
                  <strong>内网穿透（无公网服务器时）</strong>
                  <p><strong>ngrok（推荐新手）：</strong></p>
                  <code style="display: block; margin: 8px 0;">ngrok http 18789</code>
                  <p>复制生成的 HTTPS 地址作为回调 URL</p>
                </div>
              </div>
            </div>

            <a href="${t("channels.wecom.docsUrl")}" target="_blank" rel="noreferrer" class="btn btn--link" style="margin-top: 12px;">
              ${t("channels.wecom.docsLabel")} →
            </a>
          </div>
        </details>

        <!-- 多账户配置说明 -->
        <details class="channel-card__help" style="margin-top: 12px;">
          <summary class="channel-card__help-title">
            📦 ${t("channels.wecom.multiAccount")}
            <span class="help-badge">高级</span>
          </summary>
          <div class="channel-card__help-content">
            <p>${t("channels.wecom.multiAccountDesc")}</p>

            <div class="config-steps" style="margin-top: 12px;">
              <div class="config-step">
                <div class="step-number">1</div>
                <div class="step-content">
                  <strong>多应用场景</strong>
                  <p>如果需要同时接入多个企业微信应用（如客服机器人、内部助手），可以使用多账户配置。</p>
                </div>
              </div>

              <div class="config-step">
                <div class="step-number">2</div>
                <div class="step-content">
                  <strong>配置示例</strong>
                  <pre style="background: var(--bg-secondary); padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px;"><code>{
  "channels": {
    "wecom": {
      "enabled": true,
      "defaultAccount": "customer-service",
      "accounts": {
        "customer-service": {
          "name": "客服机器人",
          "webhookPath": "/wecom/cs",
          "app": {
            "corpId": "ww...",
            "agentId": 1000002,
            "agentSecret": "..."
          }
        },
        "internal": {
          "name": "内部助手",
          "webhookPath": "/wecom/internal",
          "app": {
            "corpId": "ww...",
            "agentId": 1000003,
            "agentSecret": "..."
          }
        }
      }
    }
  }
}</code></pre>
                </div>
              </div>

              <div class="config-step">
                <div class="step-number">3</div>
                <div class="step-content">
                  <strong>每个账户独立配置</strong>
                  <ul>
                    <li><strong>webhookPath</strong>: 独立的回调路径</li>
                    <li><strong>app</strong>: 独立的应用凭证</li>
                    <li><strong>allowFrom / groupAllowFrom</strong>: 独立的白名单</li>
                    <li><strong>dmPolicy / groupPolicy</strong>: 独立的策略</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </details>

        ${renderChannelConfigSection({ channelId: "wecom", props })}

        <div class="row" style="margin-top: 12px;">
          <button class="btn" @click=${() => props.onRefresh(true)}>
            ${t("channels.probe")}
          </button>
        </div>

        ${renderChannelRouteSection({ channelId: "wecom", props, accounts: wecomAccounts })}
      </div>
    </details>
  `;
}

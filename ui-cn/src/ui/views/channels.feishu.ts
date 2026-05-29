/**
 * 飞书渠道 UI 视图
 * Feishu Channel UI View
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
import type { ChannelsProps, FeishuStatus } from "./channels.types";

// 重新导出类型以保持向后兼容
export type { FeishuStatus } from "./channels.types";

export function renderFeishuTutorial() {
  return html`
    <div class="callout success" style="margin-bottom: 16px;">
      <strong>推荐使用长连接模式：</strong>无需公网 IP，无需配置回调地址，本地即可接收消息！
    </div>
    <p>${t("channels.feishu.configDesc")}</p>
    <div class="config-steps">
      <div class="config-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>登录飞书开放平台</strong>
          <p>访问 <a href="https://open.feishu.cn/app" target="_blank">open.feishu.cn/app</a>，点击<strong>右上角</strong>「<strong>登录</strong>」按钮，用飞书 App 扫码</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <strong>创建企业自建应用</strong>
          <p>点击「<strong>创建企业自建应用</strong>」按钮 &rarr; 填写应用名称和描述 &rarr; 点击「<strong>创建</strong>」</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <strong>添加机器人能力</strong>
          <p>左侧菜单点击「<strong>添加应用能力</strong>」&rarr; 找到「<strong>机器人</strong>」卡片 &rarr; 点击「<strong>+ 添加</strong>」</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">4</div>
        <div class="step-content">
          <strong>获取 App ID 和 App Secret</strong>
          <p>左侧菜单点击「<strong>凭证与基础信息</strong>」：</p>
          <ul>
            <li><strong>App ID</strong>：以 <code>cli_</code> 开头，直接复制</li>
            <li><strong>App Secret</strong>：点击「显示」&rarr; <strong>立即复制！</strong></li>
          </ul>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">5</div>
        <div class="step-content">
          <strong>获取 Encrypt Key 和 Verification Token</strong>
          <p>左侧菜单「<strong>开发配置</strong>」&rarr;「<strong>事件与回调</strong>」&rarr; 点击「<strong>加密策略</strong>」&rarr; 点击小眼睛显示密钥</p>
          <div class="callout" style="margin-top: 8px; padding: 8px 12px;">
            第一次创建的应用需点击「刷新」生成 Encrypt Key。WebSocket 模式下可选填
          </div>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">6</div>
        <div class="step-content">
          <strong>配置长连接模式（最关键！）</strong>
          <p>还是在「<strong>事件与回调</strong>」&rarr; 找到「<strong>事件配置方式</strong>」&rarr; <strong>选择「使用长连接接收事件」</strong></p>
          <div class="callout warning" style="margin-top: 8px; padding: 8px 12px;">
            必须选择长连接模式！不要选"发送至开发者服务器"！选了长连接就不需要公网 IP
          </div>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">7</div>
        <div class="step-content">
          <strong>添加接收消息事件（必须！）</strong>
          <p>在「事件与回调」页面点击「<strong>添加事件</strong>」&rarr; 搜索「<strong>接收消息</strong>」&rarr; 勾选 <code>im.message.receive_v1</code> &rarr; 点击「<strong>确认添加</strong>」</p>
          <div class="callout danger" style="margin-top: 8px; padding: 8px 12px;">
            不添加这个事件，机器人就收不到消息！
          </div>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">8</div>
        <div class="step-content">
          <strong>添加权限（必须！）</strong>
          <p>左侧菜单点击「<strong>权限管理</strong>」&rarr; 搜索以下标识符并开通权限：</p>
          <ul>
            <li>搜索 <code>im:message</code> &rarr; 「<strong>获取与发送单聊、群组消息</strong>」（必须）</li>
            <li>搜索 <code>im:message:send_as_bot</code> &rarr; 「<strong>以应用的身份发消息</strong>」（必须）</li>
            <li>搜索 <code>im:message.group_at_msg</code> &rarr; 「<strong>接收群聊中@机器人消息事件</strong>」（群聊）</li>
            <li>搜索 <code>im:resource</code> &rarr; 「<strong>获取与上传图片或文件资源</strong>」（推荐）</li>
          </ul>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">9</div>
        <div class="step-content">
          <strong>发布应用</strong>
          <p>左侧菜单点击「<strong>版本管理与发布</strong>」&rarr;「<strong>创建版本</strong>」&rarr; 填写版本号 &rarr; 点击「<strong>申请发布</strong>」</p>
        </div>
      </div>
    </div>
    <a href="${t("channels.feishu.docsUrl")}" target="_blank" rel="noreferrer" class="btn btn--link" style="margin-top: 12px;">
      ${t("channels.feishu.docsLabel")} &rarr;
    </a>
  `;
}

export function renderFeishuCard(params: {
  props: ChannelsProps;
  feishu?: FeishuStatus;
  feishuAccounts: ChannelAccountSnapshot[];
  accountCountLabel: unknown;
}) {
  const { props, feishu, feishuAccounts } = params;
  const hasMultipleAccounts = feishuAccounts.length > 1;

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const probe = account.probe as { tenant?: { name?: string } } | undefined;
    const tenantName = probe?.tenant?.name;
    const label = account.name || account.accountId;
    return html`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">
            ${tenantName ? tenantName : label}
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
  const statusBadge = feishu?.running
    ? html`<span class="channel-card__badge channel-card__badge--ok">
        <span class="status-dot status-dot--running"></span>
        ${t("common.running")}
      </span>`
    : feishu?.configured
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
    feishu?.running ? "channel-card--running" : "",
    feishu?.configured && !feishu?.running ? "channel-card--configured" : "",
    feishu?.lastError
      ? isUnconfiguredError(feishu.lastError)
        ? "channel-card--unconfigured"
        : "channel-card--error"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 自动展开：运行中 或 有真实错误
  const shouldOpen =
    feishu?.running || (feishu?.lastError != null && !isUnconfiguredError(feishu.lastError));

  return html`
    <details class="${cardClasses}" ?open=${shouldOpen}>
      <summary class="channel-card__header">
        <div class="channel-card__left">
          <span class="channel-card__icon">🪶</span>
          <span class="channel-card__title">${t("channels.feishu")}</span>
          <div class="channel-card__status">
            ${statusBadge}
          </div>
        </div>
        ${chevronIcon}
      </summary>
      <div class="channel-card__body">
        <div class="channel-card__desc">${t("channels.feishu.description")}</div>

        <!-- 支持能力 -->
        <div class="channel-card__features">
          <div class="channel-card__features-title">✨ 支持能力</div>
          <div class="channel-card__features-grid">
            <span>✅ 私聊消息</span>
            <span>✅ 群聊 @机器人</span>
            <span>✅ 图片/文件收发</span>
            <span>✅ Markdown 卡片</span>
            <span>✅ 无需公网 IP</span>
            <span>✅ 文档读写</span>
            <span>✅ 知识库访问</span>
            <span>✅ 多维表格操作</span>
          </div>
        </div>

        ${
          hasMultipleAccounts
            ? html`
              <div class="account-card-list">
                ${feishuAccounts.map((account) => renderAccountCard(account))}
              </div>
            `
            : feishu?.configured || feishu?.running
              ? html`
              <div class="status-list">
                <div>
                  <span class="label">${t("channels.configured")}</span>
                  <span class="status-value ${feishu?.configured ? "status-value--yes" : "status-value--no"}">
                    ${feishu?.configured ? t("common.yes") : t("common.no")}
                  </span>
                </div>
                <div>
                  <span class="label">${t("common.running")}</span>
                  <span class="status-value ${feishu?.running ? "status-value--yes" : "status-value--no"}">
                    ${feishu?.running ? t("common.yes") : t("common.no")}
                  </span>
                </div>
                <div>
                  <span class="label">${t("channels.lastStart")}</span>
                  <span>${feishu?.lastStartAt ? formatAgo(feishu.lastStartAt) : t("common.na")}</span>
                </div>
                <div>
                  <span class="label">${t("channels.lastProbe")}</span>
                  <span>${feishu?.lastProbeAt ? formatAgo(feishu.lastProbeAt) : t("common.na")}</span>
                </div>
              </div>
            `
              : nothing
        }

        ${
          feishu?.lastError
            ? html`<div class="${errorCalloutClass(feishu.lastError)}" style="margin-top: 12px;">
              ${feishu.lastError}
            </div>`
            : nothing
        }

        ${
          feishu?.probe
            ? html`<div class="callout" style="margin-top: 12px;">
              ${t("channels.probe")} ${feishu.probe.ok ? t("common.success") : t("common.failed")} ·
              ${feishu.probe.status ?? ""} ${feishu.probe.error ?? ""}
              ${feishu.probe.tenant?.name ? html`<br/>${t("channels.feishu.tenant")}: ${feishu.probe.tenant.name}` : nothing}
            </div>`
            : nothing
        }

        <!-- 配置帮助 - 详细指南 -->
        <details class="channel-card__help" style="margin-top: 16px;">
          <summary class="channel-card__help-title">
            📖 ${t("channels.feishu.configTitle")}
            <span class="help-badge">详细教程</span>
          </summary>
          <div class="channel-card__help-content">
            <!-- 优势提示 -->
            <div class="callout success" style="margin-bottom: 16px;">
              <strong>✨ 推荐使用长连接模式：</strong>无需公网 IP，无需配置回调地址，本地即可接收消息！
            </div>

            <p>${t("channels.feishu.configDesc")}</p>
            
            <div class="config-steps">
              <div class="config-step">
                <div class="step-number">1</div>
                <div class="step-content">
                  <strong>登录飞书开放平台</strong>
                  <p>访问 <a href="https://open.feishu.cn/app" target="_blank">open.feishu.cn/app</a>，点击<strong>右上角</strong>「<strong>登录</strong>」按钮，用飞书 App 扫码</p>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">2</div>
                <div class="step-content">
                  <strong>创建企业自建应用</strong>
                  <p>点击「<strong>创建企业自建应用</strong>」按钮 → 填写应用名称和描述 → 点击「<strong>创建</strong>」</p>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">3</div>
                <div class="step-content">
                  <strong>添加机器人能力</strong>
                  <p>左侧菜单点击「<strong>添加应用能力</strong>」→ 找到「<strong>机器人</strong>」卡片 → 点击「<strong>+ 添加</strong>」</p>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">4</div>
                <div class="step-content">
                  <strong>获取 App ID 和 App Secret</strong>
                  <p>左侧菜单点击「<strong>凭证与基础信息</strong>」：</p>
                  <ul>
                    <li><strong>App ID</strong>：以 <code>cli_</code> 开头，直接复制</li>
                    <li><strong>App Secret</strong>：点击「显示」→ <strong>立即复制！</strong></li>
                  </ul>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">5</div>
                <div class="step-content">
                  <strong>获取 Encrypt Key 和 Verification Token</strong>
                  <p>左侧菜单「<strong>开发配置</strong>」→「<strong>事件与回调</strong>」→ 点击「<strong>加密策略</strong>」→ 点击小眼睛显示密钥</p>
                  <div class="callout" style="margin-top: 8px; padding: 8px 12px;">
                    💡 第一次创建的应用需点击「刷新」生成 Encrypt Key。WebSocket 模式下可选填
                  </div>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">6</div>
                <div class="step-content">
                  <strong>配置长连接模式（最关键！）</strong>
                  <p>还是在「<strong>事件与回调</strong>」→ 找到「<strong>事件配置方式</strong>」→ <strong>选择「使用长连接接收事件」</strong></p>
                  <div class="callout warning" style="margin-top: 8px; padding: 8px 12px;">
                    ⭐ 必须选择长连接模式！不要选"发送至开发者服务器"！选了长连接就不需要公网 IP
                  </div>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">7</div>
                <div class="step-content">
                  <strong>添加接收消息事件（必须！）</strong>
                  <p>在「事件与回调」页面点击「<strong>添加事件</strong>」→ 搜索「<strong>接收消息</strong>」→ 勾选 <code>im.message.receive_v1</code> → 点击「<strong>确认添加</strong>」</p>
                  <div class="callout danger" style="margin-top: 8px; padding: 8px 12px;">
                    ⚠️ 不添加这个事件，机器人就收不到消息！
                  </div>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">8</div>
                <div class="step-content">
                  <strong>添加权限（必须！）</strong>
                  <p>左侧菜单点击「<strong>权限管理</strong>」→ 搜索以下标识符并开通权限：</p>
                  <ul>
                    <li>搜索 <code>im:message</code> → 「<strong>获取与发送单聊、群组消息</strong>」（必须）</li>
                    <li>搜索 <code>im:message:send_as_bot</code> → 「<strong>以应用的身份发消息</strong>」（必须）</li>
                    <li>搜索 <code>im:message.group_at_msg</code> → 「<strong>接收群聊中@机器人消息事件</strong>」（群聊）</li>
                    <li>搜索 <code>im:resource</code> → 「<strong>获取与上传图片或文件资源</strong>」（推荐）</li>
                  </ul>
                </div>
              </div>
              
              <div class="config-step">
                <div class="step-number">9</div>
                <div class="step-content">
                  <strong>发布应用</strong>
                  <p>左侧菜单点击「<strong>版本管理与发布</strong>」→「<strong>创建版本</strong>」→ 填写版本号 → 点击「<strong>申请发布</strong>」</p>
                </div>
              </div>
            </div>

            <a href="${t("channels.feishu.docsUrl")}" target="_blank" rel="noreferrer" class="btn btn--link" style="margin-top: 12px;">
              ${t("channels.feishu.docsLabel")} →
            </a>
          </div>
        </details>

        ${renderChannelConfigSection({ channelId: "feishu", props })}

        <div class="row" style="margin-top: 12px;">
          <button class="btn" @click=${() => props.onRefresh(true)}>
            ${t("channels.probe")}
          </button>
        </div>

        ${renderChannelRouteSection({ channelId: "feishu", props, accounts: feishuAccounts })}
      </div>
    </details>
  `;
}

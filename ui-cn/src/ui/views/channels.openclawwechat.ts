/**
 * 个人微信渠道 UI 视图
 * Personal WeChat Channel UI View (via ClawChat Bridge)
 *
 * 通过 ClawChat 桥接服务接入个人微信
 */

import { html, nothing } from "lit";
import { formatAgo } from "../format";
import { t } from "../i18n/index.js";
import { brand } from "../brand.js";
import type { ChannelAccountSnapshot } from "../types";
import { renderChannelConfigSection } from "./channels.config";
import {
  isUnconfiguredError,
  errorCalloutClass,
  renderChannelRouteSection,
} from "./channels.shared";
import type { ChannelsProps, OpenclawwechatStatus } from "./channels.types";

// 重新导出类型以保持向后兼容
export type { OpenclawwechatStatus } from "./channels.types";

export function renderOpenclawwechatTutorial() {
  return html`
    <div class="callout success" style="margin-bottom: 16px">
      <strong>无需企业认证：</strong>通过 ClawChat 桥接服务接入个人微信号，支持文本、图片、视频、文档。
    </div>
    <div class="config-steps">
      <div class="config-step">
        <div class="step-number">1</div>
        <div class="step-content">
          <strong>准备 ClawChat 服务</strong>
          <p>确保 ClawChat 桥接服务已启动并运行</p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">2</div>
        <div class="step-content">
          <strong>获取 API Key</strong>
          <p>从 ClawChat 服务获取 API Key，格式为 <code>bot_id:secret</code></p>
        </div>
      </div>
      <div class="config-step">
        <div class="step-number">3</div>
        <div class="step-content">
          <strong>填写 API Key</strong>
          <p>将获取的 API Key 填入右侧配置表单</p>
        </div>
      </div>
    </div>
  `;
}

export function renderOpenclawwechatCard(params: {
  props: ChannelsProps;
  openclawwechat?: OpenclawwechatStatus;
  openclawwechatAccounts: ChannelAccountSnapshot[];
  accountCountLabel: unknown;
}) {
  const { props, openclawwechat, openclawwechatAccounts } = params;
  const hasMultipleAccounts = openclawwechatAccounts.length > 1;

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const label = account.name || account.accountId;
    return html`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">${label}</div>
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
  const statusBadge = openclawwechat?.running
    ? html`<span class="channel-card__badge channel-card__badge--ok">
        <span class="status-dot status-dot--running"></span>
        ${t("common.running")}
      </span>`
    : openclawwechat?.configured
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

  // 卡片样式类
  const cardClasses = [
    "channel-card",
    openclawwechat?.running ? "channel-card--running" : "",
    openclawwechat?.configured && !openclawwechat?.running ? "channel-card--configured" : "",
    openclawwechat?.lastError
      ? isUnconfiguredError(openclawwechat.lastError)
        ? "channel-card--unconfigured"
        : "channel-card--error"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // 自动展开：运行中 或 有真实错误
  const shouldOpen =
    openclawwechat?.running ||
    (openclawwechat?.lastError != null && !isUnconfiguredError(openclawwechat.lastError));

  // 功能特性标签
  const features = html`
    <div class="channel-card__features">
      <span class="feature-tag">文本</span>
      <span class="feature-tag">图片</span>
      <span class="feature-tag">视频</span>
      <span class="feature-tag">文档</span>
      <span class="feature-tag feature-tag--highlight">无需翻墙</span>
    </div>
  `;

  return html`
    <details class="${cardClasses}" ?open=${shouldOpen}>
      <summary class="channel-card__header">
        <div class="channel-card__left">
          <span class="channel-card__icon">💬</span>
          <span class="channel-card__title">微信 (个人号)</span>
          <div class="channel-card__status">
            ${statusBadge}
          </div>
        </div>
        ${chevronIcon}
      </summary>
      <div class="channel-card__body">
        <div class="channel-card__desc">个人微信渠道 — 通过 ClawChat 桥接服务接入，无需企业认证，无需翻墙</div>
        ${features}

        ${
          hasMultipleAccounts
            ? html`
              <div class="account-card-list">
                ${openclawwechatAccounts.map((account) => renderAccountCard(account))}
              </div>
            `
            : openclawwechat?.configured || openclawwechat?.running
              ? html`
              <div class="status-list">
                <div>
                  <span class="label">${t("channels.configured")}</span>
                  <span class="status-value ${openclawwechat?.configured ? "status-value--yes" : "status-value--no"}">
                    ${openclawwechat?.configured ? t("common.yes") : t("common.no")}
                  </span>
                </div>
                <div>
                  <span class="label">${t("common.running")}</span>
                  <span class="status-value ${openclawwechat?.running ? "status-value--yes" : "status-value--no"}">
                    ${openclawwechat?.running ? t("common.yes") : t("common.no")}
                  </span>
                </div>
                <div>
                  <span class="label">${t("channels.lastStart")}</span>
                  <span>${openclawwechat?.lastStartAt ? formatAgo(openclawwechat.lastStartAt) : t("common.na")}</span>
                </div>
              </div>
            `
              : nothing
        }

        ${
          openclawwechat?.lastError
            ? html`<div class="${errorCalloutClass(openclawwechat.lastError)}" style="margin-top: 12px;">
              ${openclawwechat.lastError}
            </div>`
            : nothing
        }

        <!-- 配置帮助 - 详细指南 -->
        <details class="channel-card__help" style="margin-top: 16px;">
          <summary class="channel-card__help-title">
            📖 个人微信配置教程
            <span class="help-badge">详细教程</span>
          </summary>
          <div class="channel-card__help-content">
            <div class="callout success" style="margin-bottom: 16px;">
              <strong>💡 优势：</strong>无需公网 IP，无需企业认证，无需翻墙。用你的个人微信号就能接入 AI，5 分钟完成配置。
            </div>

            <div class="callout" style="margin-bottom: 16px;">
              <strong>工作原理：</strong>ClawChat 是一个桥接服务，它会把别人发给你微信的消息转发给 ${brand.productName}，AI 处理完后再通过微信回复对方。流程如下：
              <br><br>
              <code style="display: block; padding: 8px; background: var(--bg-elevated); border-radius: 4px; font-size: 12px; text-align: center;">
                对方发微信消息 → ClawChat 桥接 → ${brand.productName} AI 处理 → 微信自动回复
              </code>
            </div>

            <div style="margin-bottom: 12px; padding: 10px 12px; background: var(--bg-elevated); border-radius: 8px; border-left: 3px solid var(--accent);">
              <strong>第一步：在 ClawChat 上完成准备工作</strong>（约 3 分钟）
            </div>

            <div class="config-steps">
              <div class="config-step">
                <div class="step-number">1</div>
                <div class="step-content">
                  <strong>打开 ClawChat 小程序</strong>
                  <p>打开微信，在顶部搜索栏搜索「ClawChat」，点击进入小程序</p>
                  <p>如果是第一次使用，按提示完成注册（微信授权即可，无需手动填写信息）</p>
                </div>
              </div>

              <div class="config-step">
                <div class="step-number">2</div>
                <div class="step-content">
                  <strong>绑定你的个人微信号</strong>
                  <p>进入小程序后，按照页面引导扫码绑定你的微信号</p>
                  <p>绑定成功后，别人给你发微信消息时，ClawChat 就能收到并转发给 AI</p>
                  <div class="callout warning" style="margin-top: 8px;">
                    <strong>⚠️ 注意：</strong>绑定的是<strong>你自己的微信号</strong>，不是创建新号。绑定后你的微信正常使用，只是消息会额外被转发一份给 AI 处理。
                  </div>
                </div>
              </div>

              <div class="config-step">
                <div class="step-number">3</div>
                <div class="step-content">
                  <strong>生成 API Key（连接密钥）</strong>
                  <p>在 ClawChat 小程序中，依次点击：</p>
                  <ul style="margin: 4px 0 4px 16px; padding: 0; list-style: disc;">
                    <li>底部导航栏 →「我的」</li>
                    <li>「APIKey 管理」</li>
                    <li>点击「生成 APIKey」按钮</li>
                  </ul>
                  <p>生成后，<strong>长按复制</strong>整个 API Key</p>
                  <div class="callout danger" style="margin-top: 8px;">
                    <strong>🔐 重要：</strong>API Key 的格式是 <code>bot_id:secret</code>（中间有个冒号），例如 <code>12345:abcdef1234567890</code>。请<strong>完整复制</strong>，不要漏掉冒号和后面的部分！
                  </div>
                </div>
              </div>
            </div>

            <div style="margin: 16px 0 12px; padding: 10px 12px; background: var(--bg-elevated); border-radius: 8px; border-left: 3px solid var(--accent);">
              <strong>第二步：在 ${brand.productName} 中填入 API Key</strong>（约 1 分钟）
            </div>

            <div class="config-steps">
              <div class="config-step">
                <div class="step-number">4</div>
                <div class="step-content">
                  <strong>粘贴你的 API Key</strong>
                  <p>回到这个页面，<strong>向下滚动</strong>找到配置表单，把刚才复制的 API Key 粘贴进去，然后点击保存</p>
                </div>
              </div>

              <div class="config-step">
                <div class="step-number">5</div>
                <div class="step-content">
                  <strong>启动网关，发条消息试试！</strong>
                  <p>如果网关已经在运行（页面上方状态显示「运行中」），保存后直接跳到下面发消息测试。</p>
                  <p>如果还没启动网关，需要在电脑上打开<strong>终端</strong>（命令行窗口），输入启动命令：</p>
                  <div class="callout" style="margin: 8px 0; padding: 10px 12px; font-size: 12px;">
                    <strong>怎么打开终端？</strong>
                    <ul style="margin: 4px 0 0 16px; padding: 0; list-style: disc;">
                      <li><strong>Windows</strong>：按键盘 <code>Win + R</code>，输入 <code>cmd</code>，按回车</li>
                      <li><strong>Mac</strong>：按 <code>Command + 空格</code>，输入 <code>Terminal</code>，按回车</li>
                      <li><strong>Linux</strong>：按 <code>Ctrl + Alt + T</code></li>
                    </ul>
                  </div>
                  <p>在终端窗口里，输入下面这行命令，然后按<strong>回车键</strong>执行：</p>
                  <code style="display: block; margin: 6px 0; padding: 8px 12px; background: var(--bg-elevated); border-radius: 4px; font-size: 13px; user-select: all;">${brand.cliName} gateway run</code>
                  <p style="margin-top: 8px;">网关启动后，用<strong>另一个微信号</strong>（朋友的、家人的、或你的小号）给你绑定的微信号发一条消息，比如发「你好」</p>
                  <p>等待约 <strong>2 秒</strong>，如果收到 AI 的自动回复 — 恭喜，配置成功了！</p>
                </div>
              </div>
            </div>

            <div class="callout warning" style="margin-top: 12px;">
              <strong>⚠️ 没收到回复？按顺序排查：</strong>
              <ol style="margin: 8px 0 0 16px; padding: 0;">
                <li>回 ClawChat 小程序看看微信号绑定状态是否正常</li>
                <li>检查 API Key 是否粘贴完整（必须包含冒号 <code>:</code>）</li>
                <li>打开终端，输入 <code>${brand.cliName} gateway status</code> 按回车，看网关是否在运行</li>
                <li>在配置中把 <code>debug</code> 改为 <code>true</code>，保存后在终端输入 <code>${brand.cliName} logs --follow</code> 按回车，查看日志找原因</li>
              </ol>
            </div>
          </div>
        </details>

        ${renderChannelConfigSection({ channelId: "openclawwechat", props })}

        ${renderChannelRouteSection({ channelId: "openclawwechat", props, accounts: openclawwechatAccounts })}
      </div>
    </details>
  `;
}

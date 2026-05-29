/**
 * 免费模型管理页
 * 每日免费大模型平滑切换
 *
 * v2 重新设计：紧凑一屏布局 + 省钱统计常驻 + 切换模型 UX 优化
 */
import { html, nothing } from "lit";
import { brand } from "../brand";
import { t } from "../i18n/index.js";

/* ===========================================
   类型定义
   =========================================== */

export interface FreeModelProvider {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  freeQuota: {
    type: "daily" | "permanent";
    limit: number;
    unit: "tokens" | "requests";
    resetsAt?: string;
  };
  registerUrl: string;
  docsUrl: string;
  features: string[];
  recommended: boolean;
}

export interface FreeModelAccount {
  providerId: string;
  apiKey: string;
  enabled: boolean;
  priority: number;
  todayUsage: {
    tokens: number;
    requests: number;
    lastUpdated: string;
  };
  status: "active" | "exhausted" | "error" | "disabled";
  lastError?: string;
  rateLimitedUntil?: string;
}

export interface FreeModelsStats {
  todaySavings: number;
  totalSavings: number;
  todayFreeRequests: number;
  lastResetDate: string;
}

export interface FreeModelSwitchRecord {
  timestamp: string;
  fromProvider: string;
  toProvider: string;
  reason: "quota_exhausted" | "error" | "manual";
  savings: number;
}

export interface FreeModelsProps {
  connected: boolean;
  loading: boolean;
  enabled: boolean;
  providers: FreeModelProvider[];
  accounts: FreeModelAccount[];
  stats: FreeModelsStats;
  switchHistory: FreeModelSwitchRecord[];
  error: string | null;
  // 弹窗状态
  configModalOpen: boolean;
  configModalProvider: FreeModelProvider | null;
  configModalApiKey: string;
  configModalTesting: boolean;
  configModalTestResult: { success: boolean; message: string } | null;
  configModalSaving: boolean;
  // 删除确认
  deleteModalOpen: boolean;
  deleteModalProvider: FreeModelProvider | null;
  deleteModalDeleting: boolean;
  // 回调
  onToggleEnabled: (enabled: boolean) => void;
  onOpenConfigModal: (provider: FreeModelProvider) => void;
  onCloseConfigModal: () => void;
  onApiKeyChange: (apiKey: string) => void;
  onTestConnection: () => void;
  onSaveConfig: () => void;
  onOpenDeleteModal: (provider: FreeModelProvider) => void;
  onCloseDeleteModal: () => void;
  onConfirmDelete: () => void;
  onSetPreferred: (providerId: string) => void;
  onRefresh: () => void;
}

/* ===========================================
   主渲染函数
   =========================================== */

export function renderFreeModels(props: FreeModelsProps) {
  const renderContent = () => {
    if (props.loading && props.connected) {
      return renderLoading();
    }
    if (props.error) {
      return renderError(props.error, props.onRefresh);
    }
    if (!props.connected && props.accounts.length === 0 && props.providers.length === 0) {
      return renderConnectionRequired(props.onRefresh);
    }
    // 统一渲染：不再区分空状态和有数据态，一屏展示所有内容
    return renderMainContent(props);
  };

  return html`
    <section class="free-models">
      ${renderContent()}
      ${props.configModalOpen ? renderConfigModal(props) : nothing}
      ${props.deleteModalOpen ? renderDeleteModal(props) : nothing}
    </section>
  `;
}

/* ===========================================
   加载/错误/未连接 状态
   =========================================== */

function renderLoading() {
  return html`
    <div class="fm-status-card">
      <span class="fm-status-card__icon">⏳</span>
      <span>${t("common.loading")}</span>
    </div>
  `;
}

function renderConnectionRequired(onRefresh: () => void) {
  return html`
    <div class="fm-status-card">
      <span class="fm-status-card__icon">🔌</span>
      <div>
        <div class="fm-status-card__title">等待连接 Gateway</div>
        <div class="fm-status-card__desc">正在建立连接，请稍候...</div>
      </div>
      <button class="btn primary btn--sm" @click=${onRefresh}>${t("common.retry")}</button>
    </div>
  `;
}

function renderError(error: string, onRefresh: () => void) {
  return html`
    <div class="fm-status-card fm-status-card--error">
      <span class="fm-status-card__icon">😅</span>
      <div>
        <div class="fm-status-card__title">${t("freeModels.error.title")}</div>
        <div class="fm-status-card__desc">${error}</div>
      </div>
      <button class="btn primary btn--sm" @click=${onRefresh}>${t("common.retry")}</button>
    </div>
  `;
}

/* ===========================================
   主内容区 - 一屏展示
   =========================================== */

function renderMainContent(props: FreeModelsProps) {
  const hasAccounts = props.accounts.length > 0;
  const unconfiguredProviders = props.providers.filter(
    (p) => !props.accounts.some((a) => a.providerId === p.id),
  );

  return html`
    <!-- 省钱英雄区：永远展示 -->
    ${renderSavingsHero(props.stats, props.enabled, props.onToggleEnabled, hasAccounts)}

    <!-- 模型切换 UX 提示 -->
    ${hasAccounts && props.enabled ? renderSwitchNotice() : nothing}

    <!-- 已配置的模型 -->
    ${hasAccounts ? renderConfiguredAccounts(props) : nothing}

    <!-- 可配置的提供商 -->
    ${
      unconfiguredProviders.length > 0
        ? renderProviderSection(unconfiguredProviders, props.onOpenConfigModal, !hasAccounts)
        : nothing
    }

    <!-- 切换历史（折叠） -->
    ${
      props.switchHistory.length > 0 ? renderHistory(props.switchHistory, props.providers) : nothing
    }
  `;
}

/* ===========================================
   省钱英雄区 - 紧凑常驻
   =========================================== */

function renderSavingsHero(
  stats: FreeModelsStats,
  enabled: boolean,
  onToggle: (v: boolean) => void,
  hasAccounts: boolean,
) {
  return html`
    <div class="fm-hero">
      <div class="fm-hero__top">
        <div class="fm-hero__badge">
          <span>✨</span>
          <span>${brand.freeModelsEyebrow || t("freeModels.eyebrow")}</span>
        </div>
        <label class="fm-switch fm-switch--sm" title="${t("freeModels.toggle.title")}">
          <input
            type="checkbox"
            .checked=${enabled}
            @change=${(e: Event) => onToggle((e.target as HTMLInputElement).checked)}
          />
          <span class="fm-switch__track"></span>
          <span class="fm-switch__thumb"></span>
        </label>
      </div>

      <div class="fm-hero__savings">
        <div class="fm-hero__savings-main">
          <div class="fm-hero__savings-amount">¥${stats.totalSavings.toFixed(2)}</div>
          <div class="fm-hero__savings-label">${t("freeModels.stats.totalSavings")}</div>
        </div>
        <div class="fm-hero__savings-divider"></div>
        <div class="fm-hero__savings-today">
          <div class="fm-hero__savings-amount fm-hero__savings-amount--today">¥${stats.todaySavings.toFixed(2)}</div>
          <div class="fm-hero__savings-label">${t("freeModels.stats.todaySavings")}</div>
        </div>
        <div class="fm-hero__savings-divider"></div>
        <div class="fm-hero__savings-calls">
          <div class="fm-hero__savings-amount fm-hero__savings-amount--calls">${stats.todayFreeRequests}</div>
          <div class="fm-hero__savings-label">${t("freeModels.stats.freeRequests")}</div>
        </div>
      </div>

      ${
        !hasAccounts
          ? html`
            <div class="fm-hero__cta">
              <div class="fm-hero__cta-features">
                <span class="fm-hero__cta-chip">🎁 ${t("freeModels.feature.dailyTokens")}</span>
                <span class="fm-hero__cta-chip">🔄 ${t("freeModels.feature.autoSwitch")}</span>
                <span class="fm-hero__cta-chip">💵 ${t("freeModels.feature.saveMoney")}</span>
              </div>
            </div>
          `
          : nothing
      }
    </div>
  `;
}

/* ===========================================
   模型切换 UX 提示
   =========================================== */

function renderSwitchNotice() {
  return html`
    <div class="fm-notice">
      <span class="fm-notice__icon">💡</span>
      <div class="fm-notice__text">
        ${t("freeModels.switchNotice")}
      </div>
    </div>
  `;
}

/* ===========================================
   已配置账号区
   =========================================== */

function renderConfiguredAccounts(props: FreeModelsProps) {
  return html`
    <div class="fm-section">
      <div class="fm-section__header">
        <div class="fm-section__title">
          <span>⚡</span>
          <span>${t("freeModels.configuredAccounts")}</span>
        </div>
        <span class="fm-section__count">${props.accounts.length}</span>
      </div>
      <div class="fm-accounts">
        ${props.accounts.map((account) => {
          const provider = props.providers.find((p) => p.id === account.providerId);
          if (!provider) return nothing;
          const isPreferred = account.priority === 1;
          return renderAccountCard(
            account,
            provider,
            isPreferred,
            props.onSetPreferred,
            props.onOpenDeleteModal,
            props.onOpenConfigModal,
          );
        })}
      </div>
    </div>
  `;
}

/* ===========================================
   Provider 选择区
   =========================================== */

function renderProviderSection(
  providers: FreeModelProvider[],
  onSelect: (p: FreeModelProvider) => void,
  isFirstTime: boolean,
) {
  return html`
    <div class="fm-section">
      <div class="fm-section__header">
        <div class="fm-section__title">
          <span>${isFirstTime ? "🚀" : "➕"}</span>
          <span>${isFirstTime ? t("freeModels.selectProvider") : t("freeModels.addMore")}</span>
        </div>
      </div>
      <div class="fm-providers">
        ${providers.map((provider) => renderProviderCard(provider, onSelect))}
      </div>
    </div>
  `;
}

/* ===========================================
   Provider 卡片 - 紧凑横排
   =========================================== */

function renderProviderCard(provider: FreeModelProvider, onSelect: (p: FreeModelProvider) => void) {
  const quotaText = `${formatNumber(provider.freeQuota.limit)} ${provider.freeQuota.unit === "tokens" ? "tokens" : t("freeModels.requests")}`;

  return html`
    <div
      class="fm-provider ${provider.recommended ? "fm-provider--recommended" : ""}"
      @click=${() => onSelect(provider)}
    >
      <div class="fm-provider__left">
        <div class="fm-provider__name-row">
          <span class="fm-provider__name">${provider.name}</span>
          ${
            provider.recommended
              ? html`<span class="fm-provider__badge">${t("freeModels.recommended")}</span>`
              : nothing
          }
        </div>
        <div class="fm-provider__meta">
          <span class="fm-provider__quota">${t("freeModels.dailyQuota")}: <strong>${quotaText}</strong></span>
          <span class="fm-provider__features-inline">
            ${provider.features
              .slice(0, 3)
              .map((f) => html`<span class="fm-provider__tag">${f}</span>`)}
          </span>
        </div>
      </div>
      <button class="btn primary btn--sm fm-provider__action">
        ${t("freeModels.configureNow")}
      </button>
    </div>
  `;
}

/* ===========================================
   账号卡片 - 紧凑行
   =========================================== */

function resolveAccountStatus(account: FreeModelAccount): {
  icon: string;
  text: string;
  tooltip: string;
  dotClass: string;
  cardClass: string;
  needsReconfigure: boolean;
} {
  if (account.enabled === false) {
    return {
      icon: "🚫",
      text: t("freeModels.status.disabled"),
      tooltip: "该账号已被手动禁用，点击重新配置以启用",
      dotClass: "fm-account__state-dot--disabled",
      cardClass: "fm-account--disabled",
      needsReconfigure: true,
    };
  }

  switch (account.status) {
    case "active":
      return {
        icon: "✅",
        text: t("freeModels.status.active"),
        tooltip: "账号正常，可用于聊天",
        dotClass: "",
        cardClass: "",
        needsReconfigure: false,
      };
    case "exhausted":
      return {
        icon: "⏸️",
        text: t("freeModels.status.exhausted"),
        tooltip: "今日免费额度已用完，将在次日 00:00 重置",
        dotClass: "fm-account__state-dot--exhausted",
        cardClass: "fm-account--exhausted",
        needsReconfigure: false,
      };
    case "error":
      return {
        icon: "❌",
        text: t("freeModels.status.error"),
        tooltip: account.lastError ? `错误：${account.lastError}` : "连接错误，请检查 API Key",
        dotClass: "fm-account__state-dot--error",
        cardClass: "fm-account--error",
        needsReconfigure: true,
      };
    case "disabled":
      return {
        icon: "🚫",
        text: t("freeModels.status.disabled"),
        tooltip: "账号已禁用",
        dotClass: "fm-account__state-dot--disabled",
        cardClass: "fm-account--disabled",
        needsReconfigure: true,
      };
    default:
      return {
        icon: "⚠️",
        text: "状态异常",
        tooltip: `状态字段异常 (status=${account.status ?? "undefined"})，请重新配置`,
        dotClass: "fm-account__state-dot--warning",
        cardClass: "fm-account--warning",
        needsReconfigure: true,
      };
  }
}

function renderAccountCard(
  account: FreeModelAccount,
  provider: FreeModelProvider,
  isPreferred: boolean,
  onSetPreferred: (id: string) => void,
  onDelete: (p: FreeModelProvider) => void,
  onOpenConfig: (p: FreeModelProvider) => void,
) {
  const usagePercent = Math.min(
    ((account.todayUsage?.tokens ?? 0) / provider.freeQuota.limit) * 100,
    100,
  );
  const usageClass =
    usagePercent >= 90
      ? "fm-account__usage-fill--danger"
      : usagePercent >= 70
        ? "fm-account__usage-fill--warning"
        : "";

  const statusInfo = resolveAccountStatus(account);
  const cardClass = statusInfo.cardClass || (isPreferred ? "fm-account--preferred" : "");

  return html`
    <div class="fm-account ${cardClass}">
      <div class="fm-account__icon" title="${statusInfo.tooltip}">
        ${statusInfo.icon}
      </div>
      <div class="fm-account__info">
        <div class="fm-account__name">
          ${provider.name}
          ${
            isPreferred
              ? html`<span class="fm-account__preferred-badge">⭐ ${t("freeModels.preferred")}</span>`
              : nothing
          }
        </div>
        <div class="fm-account__status">
          <div class="fm-account__usage">
            <div class="fm-account__usage-bar">
              <div
                class="fm-account__usage-fill ${usageClass}"
                style="width: ${usagePercent}%"
              ></div>
            </div>
            <span>${formatNumber(account.todayUsage?.tokens ?? 0)} / ${formatNumber(provider.freeQuota.limit)}</span>
          </div>
          <div class="fm-account__state" title="${statusInfo.tooltip}">
            <span class="fm-account__state-dot ${statusInfo.dotClass}"></span>
            <span>${statusInfo.text}</span>
          </div>
        </div>
      </div>
      <div class="fm-account__actions">
        ${
          statusInfo.needsReconfigure
            ? html`
              <button
                class="btn btn--sm primary"
                @click=${() => onOpenConfig(provider)}
                title="${statusInfo.tooltip}"
              >
                重新配置
              </button>
            `
            : nothing
        }
        ${
          !isPreferred && !statusInfo.needsReconfigure
            ? html`
              <button
                class="btn btn--sm"
                @click=${() => onSetPreferred(account.providerId)}
              >
                ${t("freeModels.setPreferred")}
              </button>
            `
            : nothing
        }
        <button
          class="btn btn--sm danger"
          @click=${() => onDelete(provider)}
        >
          ${t("common.delete")}
        </button>
      </div>
    </div>
  `;
}

/* ===========================================
   切换历史 - 折叠
   =========================================== */

function renderHistory(history: FreeModelSwitchRecord[], providers: FreeModelProvider[]) {
  const getProviderName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  return html`
    <div class="fm-section fm-history">
      <details>
        <summary class="fm-history__toggle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <span>${t("freeModels.switchHistory")} (${history.length})</span>
        </summary>
        <ul class="fm-history__list">
          ${history.slice(0, 10).map(
            (record) => html`
              <li class="fm-history__item">
                <span class="fm-history__time">
                  ${new Date(record.timestamp).toLocaleString()}
                </span>
                <span class="fm-history__change">
                  ${getProviderName(record.fromProvider)} → ${getProviderName(record.toProvider)}
                </span>
                <span class="fm-history__savings">+¥${record.savings.toFixed(2)}</span>
              </li>
            `,
          )}
        </ul>
      </details>
    </div>
  `;
}

/* ===========================================
   配置弹窗
   =========================================== */

function renderConfigModal(props: FreeModelsProps) {
  const provider = props.configModalProvider;
  if (!provider) return nothing;

  const canSave = props.configModalApiKey.trim().length > 0 && !props.configModalSaving;

  return html`
    <div
      class="fm-modal-overlay"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) props.onCloseConfigModal();
      }}
    >
      <div class="fm-modal">
        <div class="fm-modal__header">
          <div class="fm-modal__title">
            <span>⚙️</span>
            <span>${t("freeModels.modal.configTitle", { name: provider.name })}</span>
          </div>
          <button class="fm-modal__close" @click=${props.onCloseConfigModal}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="fm-modal__body">
          <div class="fm-modal__info">
            <div class="fm-modal__info-item">
              <span class="fm-modal__info-label">${t("freeModels.dailyQuota")}</span>
              <span class="fm-modal__info-value">
                ${formatNumber(provider.freeQuota.limit)} tokens
              </span>
            </div>
            <div class="fm-modal__info-item">
              <span class="fm-modal__info-label">${t("freeModels.resetTime")}</span>
              <span class="fm-modal__info-value">
                ${provider.freeQuota.resetsAt ?? "00:00 CST"}
              </span>
            </div>
          </div>

          <div class="fm-steps">
            <div class="fm-step">
              <div class="fm-step__number">1</div>
              <div class="fm-step__content">
                <div class="fm-step__title">${t("freeModels.step1.title")}</div>
                <div class="fm-step__desc">${t("freeModels.step1.desc")}</div>
                <a
                  href="${provider.registerUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="fm-step__link btn primary btn--sm"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  ${t("freeModels.openRegisterPage", { name: provider.name })}
                </a>
              </div>
            </div>

            <div class="fm-step">
              <div class="fm-step__number">2</div>
              <div class="fm-step__content">
                <div class="fm-step__title">${t("freeModels.step2.title")}</div>
                <div class="fm-step__desc">${t("freeModels.step2.desc")}</div>
              </div>
            </div>

            <div class="fm-step">
              <div class="fm-step__number">3</div>
              <div class="fm-step__content">
                <div class="fm-step__title">${t("freeModels.step3.title")}</div>
                <div class="fm-form__field" style="margin-top: 8px;">
                  <input
                    type="password"
                    class="fm-form__input"
                    placeholder="${t("freeModels.modal.apiKeyPlaceholder")}"
                    .value=${props.configModalApiKey}
                    @input=${(e: Event) =>
                      props.onApiKeyChange((e.target as HTMLInputElement).value)}
                    ?disabled=${props.configModalTesting || props.configModalSaving}
                  />
                </div>

                ${
                  props.configModalTestResult
                    ? html`
                      <div
                        class="fm-test-result ${props.configModalTestResult.success ? "fm-test-result--success" : "fm-test-result--error"}"
                      >
                        <span>${props.configModalTestResult.success ? "✅" : "❌"}</span>
                        <span>${props.configModalTestResult.message}</span>
                      </div>
                    `
                    : props.configModalSaving
                      ? html`
                          <div class="fm-test-result fm-test-result--loading">
                            <span>⏳</span>
                            <span>正在验证 API 密钥...</span>
                          </div>
                        `
                      : nothing
                }
              </div>
            </div>
          </div>
        </div>

        <div class="fm-modal__footer">
          <button
            class="btn primary"
            @click=${props.onSaveConfig}
            ?disabled=${!canSave}
            style="min-width: 140px;"
          >
            ${props.configModalSaving ? "验证并保存中..." : t("freeModels.modal.save")}
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ===========================================
   删除确认弹窗
   =========================================== */

function renderDeleteModal(props: FreeModelsProps) {
  const provider = props.deleteModalProvider;
  if (!provider) return nothing;

  return html`
    <div
      class="fm-modal-overlay"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) props.onCloseDeleteModal();
      }}
    >
      <div class="fm-modal">
        <div class="fm-modal__header">
          <div class="fm-modal__title">
            <span>⚠️</span>
            <span>${t("freeModels.modal.deleteTitle")}</span>
          </div>
          <button class="fm-modal__close" @click=${props.onCloseDeleteModal}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="fm-modal__body">
          <div class="fm-confirm">
            <div class="fm-confirm__icon">🗑️</div>
            <div class="fm-confirm__title">
              ${t("freeModels.modal.deleteConfirm", { name: provider.name })}
            </div>
            <div class="fm-confirm__desc">
              ${t("freeModels.modal.deleteDesc")}
            </div>
          </div>
        </div>

        <div class="fm-modal__footer">
          <button class="btn" @click=${props.onCloseDeleteModal}>
            ${t("common.cancel")}
          </button>
          <button
            class="btn danger"
            @click=${props.onConfirmDelete}
            ?disabled=${props.deleteModalDeleting}
          >
            ${props.deleteModalDeleting ? "删除中..." : t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ===========================================
   工具函数
   =========================================== */

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + "K";
  }
  return num.toString();
}

/**
 * extensions-page.ts
 * "Extensions" page — dual-tab layout:
 *   Tab 1: "My Capabilities"  — installed capabilities + advanced settings
 *   Tab 2: "Capability Store"  — marketplace browse / search / install
 *
 * Design principles:
 *   - Never mention "MCP" — call it "扩展能力" or "AI capabilities"
 *   - Beginner-first: 99% users stay at Level 0-1, progressive disclosure
 *   - Reuses existing Skills marketplace patterns (search, chips, cards)
 */

import { html, nothing, type TemplateResult } from "lit";
import { ref, type RefOrCallback } from "lit/directives/ref.js";
import type {
  McpCapability,
  McpProcessInfo,
  McpMarketplaceItem,
  McpMarketplaceState,
  McpExtensionsTab,
  McpToast,
} from "../app-view-state.js";
import { t } from "../i18n/index.js";
import { icons } from "../icons.js";
import { renderExtensionsCard } from "./extensions-card.js";
import { renderMcpBatchConfig } from "./mcp-batch-config.js";
import { renderMcpConfigWizard } from "./mcp-config-wizard.js";
import { renderMcpDetailModal } from "./mcp-detail-modal.js";
import { renderMarketplaceCard } from "./mcp-marketplace-card.js";
import { MCP_CATEGORIES, MCP_MAX_RUNNING, filterMarketplaceItems } from "./mcp-shared.js";

// ---------------------------------------------------------------------------
// IntersectionObserver-based infinite scroll sentinel
// ---------------------------------------------------------------------------
const _sentinelObservers = new WeakMap<Element, IntersectionObserver>();

function scrollSentinelRef(onLoad?: () => void, loading?: boolean): RefOrCallback {
  return (el: Element | undefined) => {
    if (!el) {
      return;
    }
    const prev = _sentinelObservers.get(el);
    if (prev) {
      prev.disconnect();
      _sentinelObservers.delete(el);
    }
    if (!onLoad || loading) {
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoad();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    _sentinelObservers.set(el, obs);
  };
}

// ============================================================================
// Props
// ============================================================================

export type ExtensionsPageProps = {
  // — existing (Tab 1: My Capabilities) —
  capabilities: McpCapability[];
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  onConfigClick: (capabilityId: string) => void;
  onTrySay: (prompt: string) => void;
  onRestart: (serverId: string) => void;
  onDisable: (serverId: string) => void;
  onEnable: (serverId: string) => void;
  onTest: (serverId: string, env?: Record<string, string>) => void;
  onCheckUpdate: () => void;
  onViewUpdate?: () => void;
  processes: McpProcessInfo[];
  updateNotice: { count: number; names: string[] } | null;
  /** Server currently being tested (shows spinner) */
  testingServerId: string | null;
  /** Last test result per server id */
  testResults: Record<string, "success" | "failed">;
  /** Server currently being enabled (shows spinner on card button) */
  enablingServerId?: string | null;
  // — new (Tab switch + marketplace) —
  activeTab: McpExtensionsTab;
  onTabChange: (tab: McpExtensionsTab) => void;
  marketplace: McpMarketplaceState;
  onSearchChange: (search: string) => void;
  onCategoryChange: (category: string) => void;
  onSortChange: (sort: McpMarketplaceState["sort"]) => void;
  onOpenDetail: (item: McpMarketplaceItem) => void;
  onCloseDetail: () => void;
  onInstall: (item: McpMarketplaceItem) => void;
  onUninstall: (serverId: string) => void;
  onUpdate: (serverId: string) => void;
  onOpenConfigWizard: (item: McpMarketplaceItem) => void;
  onCloseConfigWizard: () => void;
  onDismissFirstVisit: () => void;
  onDismissRecommendation: () => void;
  /** Current running process count for limit guard */
  runningCount: number;
  /** Toast notification */
  toast: McpToast | null;
  /** Load next page of marketplace items */
  onLoadMore?: () => void;
  /** Retry marketplace data sync (shown when load fails or returns empty) */
  onRetrySync?: () => void;
  /** Manual add MCP server (advanced users). Returns true on success. */
  onManualAdd?: (config: {
    id: string;
    command: string;
    args: string[];
    transport: "stdio" | "sse";
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  }) => Promise<boolean>;
  // — Batch API Key configuration —
  onOpenBatchConfig?: () => void;
  onCloseBatchConfig?: () => void;
  onSaveBatchConfig?: (updates: Array<{ serverId: string; env: Record<string, string> }>) => void;
  batchConfigSaving?: boolean;
  batchConfigResult?: { success: number; failed: number } | null;
  serverEnvStatus?: Record<string, Record<string, boolean>>;
  /** Update env vars for an already-installed server and restart it */
  onUpdateServerEnv?: (serverId: string, env: Record<string, string>) => void;
};

// ============================================================================
// Search debounce (Fix #8: 300ms debounce on search input)
// ============================================================================

let _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let _searchDraft = "";

function debouncedSearch(value: string, onSearchChange: (s: string) => void): void {
  _searchDraft = value;
  if (_searchDebounceTimer) {
    clearTimeout(_searchDebounceTimer);
  }
  _searchDebounceTimer = setTimeout(() => {
    onSearchChange(_searchDraft);
    _searchDebounceTimer = null;
  }, 300);
}

// CATEGORIES, MCP_MAX_RUNNING, filterMarketplaceItems — imported from mcp-shared.ts

// ============================================================================
// Main render
// ============================================================================

export function renderExtensions(props: ExtensionsPageProps): TemplateResult {
  const { activeTab, onTabChange: _onTabChange, marketplace, toast } = props;

  return html`
    <div class="extensions-page">

      <!-- Decorative accent glow -->
      <div class="ext-accent-glow"></div>

      <!-- First visit guide overlay -->
      ${marketplace.showFirstVisit ? renderFirstVisitGuide(props) : nothing}

      <!-- ROW 1: Stats Dashboard (3 cards) -->
      ${renderStatsDashboard(props)}

      <!-- ROW 2: Toolbar — search + tabs + actions -->
      ${renderToolbar(props)}

      <!-- ROW 3: Tab content -->
      ${activeTab === "my" ? renderMyCapabilities(props) : renderCapabilityStore(props)}
    </div>

    <!-- Detail modal overlay -->
    ${
      marketplace.detailItem
        ? renderMcpDetailModal({
            item: marketplace.detailItem,
            onClose: props.onCloseDetail,
            onInstall: () => props.onInstall(marketplace.detailItem!),
            onConfigInstall: () => props.onOpenConfigWizard(marketplace.detailItem!),
            onUninstall: () => props.onUninstall(marketplace.detailItem!.serverId),
            onUpdate: () => props.onUpdate(marketplace.detailItem!.serverId),
            onTrySay: props.onTrySay,
          })
        : nothing
    }

    <!-- Config wizard overlay -->
    ${
      marketplace.configTarget
        ? renderMcpConfigWizard({
            item: marketplace.configTarget,
            onClose: props.onCloseConfigWizard,
            onSaveAndEnable: (env, overrides) => {
              const target = marketplace.configTarget!;
              if (target.installStatus === "installed" && props.onUpdateServerEnv) {
                // Already installed — update env vars and restart
                props.onUpdateServerEnv(target.serverId, env);
              } else {
                props.onInstall({
                  ...target,
                  _env: env,
                  _overrides: overrides,
                } as McpMarketplaceItem & {
                  _env: Record<string, string>;
                  _overrides?: typeof overrides;
                });
              }
              props.onCloseConfigWizard();
            },
            onTestConnection: (env) => {
              props.onTest(marketplace.configTarget!.serverId, env);
            },
            testState:
              props.testingServerId === marketplace.configTarget?.serverId
                ? "testing"
                : props.testResults[marketplace.configTarget?.serverId ?? ""] === "success"
                  ? "success"
                  : props.testResults[marketplace.configTarget?.serverId ?? ""] === "failed"
                    ? "error"
                    : "idle",
          })
        : nothing
    }

    <!-- Batch API Key config modal -->
    ${
      marketplace.showBatchConfig && props.onCloseBatchConfig && props.onSaveBatchConfig
        ? renderMcpBatchConfig({
            items: marketplace.items,
            serverEnvStatus: props.serverEnvStatus ?? {},
            onClose: props.onCloseBatchConfig,
            onSaveAll: props.onSaveBatchConfig,
            saving: props.batchConfigSaving ?? false,
            saveResult: props.batchConfigResult,
          })
        : nothing
    }

    <!-- Toast notification -->
    ${toast ? renderMcpToast(toast) : nothing}
  `;
}

// ============================================================================
// Tab button
// ============================================================================

function renderTab(
  id: McpExtensionsTab,
  active: McpExtensionsTab,
  label: string,
  onChange: (tab: McpExtensionsTab) => void,
  trialBadge = false,
): TemplateResult {
  const isActive = id === active;
  return html`
    <button
      @click=${() => onChange(id)}
      class="ext-glass-tab ${isActive ? "ext-glass-tab--active" : ""}"
    >${label}${
      trialBadge
        ? html`
            <span class="ext-glass-tab__badge">\u8BD5\u8FD0\u884C</span>
          `
        : nothing
    }</button>
  `;
}

// ============================================================================
// Stats Dashboard — 3 large stat cards (replaces inline stats ribbon)
// ============================================================================

function renderStatsDashboard(props: ExtensionsPageProps): TemplateResult {
  const { capabilities, processes } = props;
  const runningCount = capabilities.filter((c) => c.status === "ready").length;
  const stoppedCount = capabilities.filter(
    (c) => c.status === "paused" || c.status === "unavailable",
  ).length;
  const totalTools = processes.reduce((sum, p) => sum + p.toolCount, 0);

  return html`
    <div class="ext-stats-dashboard">
      <div class="ext-stat-card ext-stat-card--running">
        <div class="ext-stat-card__illust">${_renderRunningIllust()}</div>
        <div class="ext-stat-card__text">
          <div class="ext-stat-card__num" style="color:var(--ok, #34d399);">${runningCount}</div>
          <div class="ext-stat-card__label">${t("extensions.stats.running")}</div>
        </div>
      </div>
      <div class="ext-stat-card ext-stat-card--stopped">
        <div class="ext-stat-card__illust">${_renderStoppedIllust()}</div>
        <div class="ext-stat-card__text">
          <div class="ext-stat-card__num" style="color:var(--muted, #94a3b8);">${stoppedCount}</div>
          <div class="ext-stat-card__label">${t("extensions.stats.stopped")}</div>
        </div>
      </div>
      <div class="ext-stat-card ext-stat-card--tools">
        <div class="ext-stat-card__illust">${_renderToolsIllust()}</div>
        <div class="ext-stat-card__text">
          <div class="ext-stat-card__num" style="color:var(--accent, #6c8cff);">${totalTools}</div>
          <div class="ext-stat-card__label">${t("extensions.stats.tools")}${t("extensions.stats.toolsUnit")}</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Toolbar — unified search + tabs + actions bar
// ============================================================================

function renderToolbar(props: ExtensionsPageProps): TemplateResult {
  const { activeTab, onTabChange, marketplace, onSearchChange } = props;

  return html`
    <div class="ext-toolbar">
      <!-- Search box — always visible, shared state -->
      <div class="ext-glass-search">
        <span class="ext-glass-search__icon mcp-icon" aria-hidden="true">${icons.search}</span>
        <input
          type="text"
          .value=${marketplace.search}
          @input=${(e: Event) => debouncedSearch((e.target as HTMLInputElement).value, onSearchChange)}
          placeholder=${
            activeTab === "store"
              ? t("extensions.store.searchPlaceholder")
              : t("extensions.my.searchPlaceholder" as never)
          }
          class="ext-glass-search__input"
        />
        ${
          marketplace.search
            ? html`<button @click=${() => onSearchChange("")} class="ext-glass-search__clear">&times;</button>`
            : nothing
        }
      </div>

      <!-- Tab capsule -->
      <div class="ext-glass-tab-capsule">
        ${renderTab("my", activeTab, t("extensions.tab.my"), onTabChange)}
        ${renderTab("store", activeTab, t("extensions.tab.store"), onTabChange, true)}
      </div>

      <!-- Actions -->
      <div class="ext-toolbar__actions">
        <button class="ext-toolbar__sync-btn">
          <span class="mcp-icon" style="font-size:13px;">${icons.refreshCw}</span>
          ${t("extensions.stats.lastSync")}
        </button>
        <button
          @click=${() => _openImportMcpModal(props.onManualAdd)}
          class="ext-toolbar__import-btn"
        >+ ${t("extensions.stats.importMcp" as never)}</button>
      </div>
    </div>
  `;
}

// ============================================================================
// 3D SVG illustrations for stat cards
// ============================================================================

function _renderRunningIllust(): TemplateResult {
  return html`
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="82" rx="34" ry="8" fill="#34d399" opacity="0.25" />
      <path d="M20 70 L50 82 L80 70 L80 62 L50 74 L20 62 Z" fill="#2ab384" />
      <path d="M20 62 L50 74 L80 62 L50 50 Z" fill="#5eead4" />
      <path d="M20 62 L50 50 L50 74 Z" fill="#34d399" />
      <path d="M80 62 L50 50 L50 74 Z" fill="#86efac" />
      <circle cx="50" cy="34" r="18" fill="#34d399" />
      <circle cx="50" cy="34" r="12" fill="#5eead4" />
      <rect x="47" y="14" width="6" height="8" rx="2" fill="#2ab384" />
      <rect x="47" y="48" width="6" height="8" rx="2" fill="#2ab384" />
      <rect x="30" y="31" width="8" height="6" rx="2" fill="#2ab384" />
      <rect x="62" y="31" width="8" height="6" rx="2" fill="#2ab384" />
      <circle cx="50" cy="34" r="5" fill="#fff" opacity="0.9" />
      <rect x="28" y="55" width="44" height="10" rx="5" fill="#2ab384" opacity="0.7" />
      <text
        x="50"
        y="63"
        text-anchor="middle"
        font-size="7"
        fill="#fff"
        font-weight="600"
        opacity="0.9"
      >
        Running
      </text>
    </svg>
  `;
}

function _renderStoppedIllust(): TemplateResult {
  return html`
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="82" rx="34" ry="8" fill="#94a3b8" opacity="0.25" />
      <path d="M20 70 L50 82 L80 70 L80 62 L50 74 L20 62 Z" fill="#7a8a9e" />
      <path d="M20 62 L50 74 L80 62 L50 50 Z" fill="#b0bec5" />
      <path d="M20 62 L50 50 L50 74 Z" fill="#94a3b8" />
      <path d="M80 62 L50 50 L50 74 Z" fill="#cbd5e1" />
      <circle cx="50" cy="34" r="20" fill="#94a3b8" />
      <circle cx="50" cy="34" r="16" fill="#b0bec5" />
      <rect x="42" y="26" width="5" height="16" rx="1.5" fill="#fff" opacity="0.9" />
      <rect x="53" y="26" width="5" height="16" rx="1.5" fill="#fff" opacity="0.9" />
      <rect x="28" y="55" width="44" height="10" rx="5" fill="#7a8a9e" opacity="0.7" />
      <text
        x="50"
        y="63"
        text-anchor="middle"
        font-size="7"
        fill="#fff"
        font-weight="600"
        opacity="0.9"
      >
        Stopped
      </text>
    </svg>
  `;
}

function _renderToolsIllust(): TemplateResult {
  return html`
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="82" rx="34" ry="8" fill="#6c8cff" opacity="0.25" />
      <path d="M20 70 L50 82 L80 70 L80 62 L50 74 L20 62 Z" fill="#5a7ae6" />
      <path d="M20 62 L50 74 L80 62 L50 50 Z" fill="#93acff" />
      <path d="M20 62 L50 50 L50 74 Z" fill="#6c8cff" />
      <path d="M80 62 L50 50 L50 74 Z" fill="#b4c6ff" />
      <path d="M62 20 C58 16 52 16 48 20 L44 24 L56 36 L60 32 C64 28 64 22 62 20Z" fill="#6c8cff" />
      <path d="M56 36 L44 24 L32 36 L28 50 L42 50 Z" fill="#93acff" />
      <path d="M56 36 L44 24 L44 36 Z" fill="#5a7ae6" />
      <circle cx="55" cy="25" r="4" fill="#b4c6ff" />
      <rect x="30" y="42" width="16" height="8" rx="3" fill="#5a7ae6" />
      <rect x="28" y="55" width="44" height="10" rx="5" fill="#5a7ae6" opacity="0.7" />
      <text
        x="50"
        y="63"
        text-anchor="middle"
        font-size="7"
        fill="#fff"
        font-weight="600"
        opacity="0.9"
      >
        Tools
      </text>
    </svg>
  `;
}

// ============================================================================
// Tab 1: My Capabilities
// ============================================================================

function renderMyCapabilities(props: ExtensionsPageProps): TemplateResult {
  const {
    capabilities,
    advancedOpen,
    onToggleAdvanced,
    onConfigClick,
    onTrySay,
    onRestart,
    onDisable,
    onEnable,
    onTest,
    onCheckUpdate,
    onViewUpdate,
    processes,
    updateNotice,
    testingServerId,
    testResults,
  } = props;

  // Enrich user-installed capabilities with marketplace Chinese data
  const marketplaceMap = new Map(
    props.marketplace.items.map((m) => [m.serverId, m]),
  );
  const enrichedCaps = capabilities.map((cap) => {
    if (cap.isBuiltin) return cap;
    const marketItem = marketplaceMap.get(cap.id);
    if (!marketItem) return cap;
    return {
      ...cap,
      friendlyName: marketItem.friendlyName || cap.friendlyName,
      description:
        cap.description.length > 0
          ? cap.description
          : marketItem.capabilities?.length
            ? marketItem.capabilities
            : marketItem.description
              ? [marketItem.description]
              : cap.description,
      examplePrompt:
        cap.examplePrompt ||
        marketItem.examplePrompts?.[0] ||
        t("extensions.trySayFallback" as never).replace(
          "{{name}}",
          marketItem.friendlyName || cap.friendlyName,
        ),
    };
  });

  // Apply search filter from shared search state
  const search = props.marketplace.search.toLowerCase().trim();
  const filteredCaps = search
    ? enrichedCaps.filter(
        (cap) =>
          cap.friendlyName.toLowerCase().includes(search) ||
          cap.description.some((d) => d.toLowerCase().includes(search)) ||
          cap.id.toLowerCase().includes(search),
      )
    : enrichedCaps;

  return html`
    <!-- Update notice bar -->
    ${
      updateNotice
        ? html`
          <div class="ext-update-notice">
            <span>
              ${t("mcpUpdate.newAbilities").replace("{{count}}", String(updateNotice.count))}:
              ${updateNotice.names.join(", ")}
            </span>
            <button
              @click=${() => onViewUpdate?.()}
              style="all:unset; cursor:pointer; font-size:12px; font-weight:600; color:var(--ok); text-decoration:underline;"
            >${t("mcpUpdate.view")}</button>
          </div>
        `
        : nothing
    }

    <!-- Capability cards — Desktop: 3-column grid, fills full width -->
    ${
      filteredCaps.length === 0 && search
        ? html`
          <div style="text-align:center; padding:60px 20px;">
            <div class="mcp-icon" style="font-size:28px; color:var(--muted-strong);">${icons.search}</div>
            <div style="margin-top:8px; font-size:13px; color:var(--muted-strong);">
              ${t("extensions.noSearchResults" as never)}
            </div>
            <button @click=${() => props.onSearchChange("")}
              class="ext-pill-btn ext-pill-btn--accent" style="margin-top:12px;">
              ${t("extensions.clearSearch" as never)}
            </button>
          </div>
        `
        : filteredCaps.length === 0
          ? html`
            <div style="text-align:center; padding:80px 20px; color:var(--muted-strong, #6b7d91); font-size:14px;">
              ${t("extensions.noCapabilities")}
            </div>
          `
          : html`
            <div class="ext-cards-grid">
              ${filteredCaps.map((cap) =>
                renderExtensionsCard({
                  capability: cap,
                  onConfigClick,
                  onTrySay,
                  onUninstall: !cap.isBuiltin ? (id) => props.onUninstall(id) : undefined,
                  enablingId: props.enablingServerId,
                }),
              )}
            </div>
          `
    }

    <!-- Advanced Settings (collapsed) -->
    <div class="ext-advanced-toggle">
      <button
        @click=${onToggleAdvanced}
        style="
          all:unset; cursor:pointer;
          display:flex; align-items:center; gap:8px;
          font-size:13px; color:var(--muted-strong, #6b7d91);
          user-select:none;
          padding:4px 0;
        "
      >
        <span style="font-size:10px; transition:transform 150ms; transform:rotate(${advancedOpen ? "90deg" : "0deg"});">\u25B6</span>
        ${t("extensions.advanced")}
      </button>
      ${advancedOpen ? renderAdvancedSection(processes, onRestart, onDisable, onEnable, onTest, onCheckUpdate, testingServerId, testResults, marketplaceMap) : nothing}
    </div>

  `;
}

// ============================================================================
// Tab 2: Capability Store
// ============================================================================

function renderCapabilityStore(props: ExtensionsPageProps): TemplateResult {
  const {
    marketplace,
    onSearchChange,
    onCategoryChange,
    onSortChange,
    onOpenDetail,
    onInstall,
    onOpenConfigWizard,
    onDismissRecommendation,
    runningCount,
  } = props;

  // Filter items by search + category
  const filtered = filterMarketplaceItems(marketplace);

  return html`
    <!-- Recommendation banner -->
    ${
      marketplace.recommendations.length > 0
        ? renderRecommendationBanner(
            marketplace.recommendations,
            onInstall,
            onDismissRecommendation,
          )
        : nothing
    }

    <!-- Fix #9: Process limit warning -->
    ${
      runningCount >= MCP_MAX_RUNNING
        ? html`
          <div class="ext-limit-warning">
            <span class="mcp-icon" style="font-size:16px; color:var(--warn, #fbbf24);">${icons.alertCircle}</span>
            ${t("extensions.store.limitReached")
              .replace("{{count}}", String(runningCount))
              .replace("{{max}}", String(MCP_MAX_RUNNING))}
          </div>
        `
        : nothing
    }

    <!-- Desktop toolbar: search + categories + sort — all in one compact area -->
    <div class="ext-store-toolbar">
      <!-- Category chips -->
      <div class="ext-store-toolbar__categories">
        ${MCP_CATEGORIES.map((cat) => {
          const isActive = marketplace.activeCategory === cat.id;
          const count =
            cat.id === "all"
              ? marketplace.total
              : marketplace.items.filter((i) => i.category === cat.id).length;

          return html`
            <button
              @click=${() => onCategoryChange(isActive && cat.id !== "all" ? "all" : cat.id)}
              class="ext-category-chip ${isActive ? "ext-category-chip--active" : ""}"
              title="${t(`extensions.category.${cat.id}` as never)}${count > 0 ? ` (${count})` : ""}"
            ><span class="mcp-icon" style="font-size:12px;">${icons[cat.icon]}</span> ${t(`extensions.category.${cat.id}` as never)}</button>
          `;
        })}
      </div>

      <!-- Sort dropdown — right side -->
      <select
        @change=${(e: Event) => onSortChange((e.target as HTMLSelectElement).value as McpMarketplaceState["sort"])}
        .value=${marketplace.sort}
        class="ext-glass-select"
      >
        <option value="recommended">${t("extensions.store.sort.recommended")}</option>
        <option value="newest">${t("extensions.store.sort.newest")}</option>
        <option value="popular">${t("extensions.store.sort.popular")}</option>
        <option value="name">${t("extensions.store.sort.name")}</option>
      </select>

      <!-- Batch API Key config button (only when items with requiresApiKey exist) -->
      ${
        props.onOpenBatchConfig && marketplace.items.some((i) => i.requiresApiKey)
          ? html`<button
            @click=${props.onOpenBatchConfig}
            class="ext-batch-config-btn"
          ><span class="mcp-icon" style="font-size:13px;">${icons.key}</span> ${t("extensions.batchConfig.button" as never)}</button>`
          : nothing
      }
    </div>

    <!-- Content: loading / empty / no results / cards — Desktop: 3-4 column grid -->
    ${
      marketplace.loading
        ? renderStoreLoading()
        : marketplace.error
          ? renderStoreEmpty(marketplace.error, props.onRetrySync)
          : marketplace.items.length === 0
            ? renderStoreEmpty("", props.onRetrySync)
            : filtered.length === 0
              ? renderNoResults(marketplace.search, () => onSearchChange(""))
              : html`
                <div class="ext-store-grid">
                  ${filtered.map((item) =>
                    renderMarketplaceCard({
                      item,
                      onClick: () => onOpenDetail(item),
                      onInstall: () => onInstall(item),
                      onConfigInstall: () => onOpenConfigWizard(item),
                    }),
                  )}
                </div>
                ${
                  marketplace.page < marketplace.totalPages
                    ? html`
                    <div ${ref(scrollSentinelRef(props.onLoadMore, marketplace.loadingMore))}
                      style="display:flex; justify-content:center; align-items:center; padding:20px 0 28px; min-height:48px;">
                      ${
                        marketplace.loadingMore
                          ? html`<span style="font-size:13px; color:var(--muted-strong, #6b7d91);">${t("extensions.store.loadingMore" as never)}</span>`
                          : html`<span style="font-size:12px; color:var(--muted-strong, #6b7d91);">${marketplace.items.length} / ${marketplace.total}</span>`
                      }
                    </div>`
                    : marketplace.total > 0
                      ? html`<div style="text-align:center; margin-bottom:28px; font-size:12px; color:var(--muted-strong, #6b7d91);">
                        ${t("extensions.store.showingAll" as never).replace("{{count}}", String(marketplace.total))}
                      </div>`
                      : nothing
                }
              `
    }

  `;
}

// ============================================================================
// Store sub-components
// ============================================================================

// filterItems — now using filterMarketplaceItems from mcp-shared.ts

function renderStoreLoading(): TemplateResult {
  return html`
    <div class="ext-glass-status">
      <div class="ext-spinner ext-spinner--lg"></div>
      <div style="font-size:14px;">${t("extensions.store.loading")}</div>
      <div style="font-size:12px; margin-top:6px; opacity:0.7;">${t("extensions.store.loadingHint")}</div>
    </div>
  `;
}

function renderStoreEmpty(error: string, onRetry?: () => void): TemplateResult {
  return html`
    <div class="ext-glass-status">
      <div style="margin-bottom:12px;"><span class="mcp-icon" style="font-size:28px; color:var(--muted-strong, #6b7d91);">${error ? icons.alertCircle : icons.globe}</span></div>
      <div style="font-size:14px; font-weight:600;">${t("extensions.store.empty")}</div>
      <div style="font-size:12px; margin-top:8px; max-width:300px; margin-left:auto; margin-right:auto;">
        ${t("extensions.store.emptyHint")}
      </div>
      ${error ? html`<div style="font-size:11px; margin-top:6px; opacity:0.5;">${error}</div>` : nothing}
      ${
        onRetry
          ? html`
        <button
          @click=${onRetry}
          class="ext-pill-btn ext-pill-btn--accent"
          style="margin-top:16px;"
        >${t("extensions.store.reload" as never)}</button>
      `
          : nothing
      }
    </div>
  `;
}

function renderNoResults(query: string, onClear: () => void): TemplateResult {
  return html`
    <div class="ext-glass-status">
      <div style="margin-bottom:12px;"><span class="mcp-icon" style="font-size:28px; color:var(--muted-strong, #6b7d91);">${icons.search}</span></div>
      <div style="font-size:14px;">
        ${t("extensions.store.noResults").replace("{{query}}", query)}
      </div>
      <div style="font-size:12px; margin-top:8px;">
        ${t("extensions.store.noResultsHint")}
      </div>
      <button
        @click=${onClear}
        class="ext-pill-btn"
        style="margin-top:16px;"
      >${t("extensions.store.clearSearch")}</button>
    </div>
  `;
}

function renderRecommendationBanner(
  recommendations: McpMarketplaceItem[],
  onInstall: (item: McpMarketplaceItem) => void,
  onDismiss: () => void,
): TemplateResult {
  return html`
    <div class="ext-recommendation">
      <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
        <span style="font-size:15px; font-weight:600; color:var(--fg); white-space:nowrap;">
          \u2728 ${t("extensions.recommend.title")}
        </span>
        <span style="font-size:12px; color:var(--muted-strong, #6b7d91); white-space:nowrap;">
          ${t("extensions.recommend.subtitle")}
        </span>
        <div style="display:flex; gap:6px; flex-wrap:nowrap; overflow:hidden;">
          ${recommendations.slice(0, 3).map(
            (r) => html`
              <span style="
                font-size:11px; padding:3px 10px;
                border-radius:var(--radius-sm, 6px);
                background:var(--card);
                border:1px solid var(--border);
                color:var(--fg);
                white-space:nowrap;
                max-width:180px;
                overflow:hidden;
                text-overflow:ellipsis;
                display:inline-block;
              ">${r.friendlyName}</span>
            `,
          )}
        </div>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-shrink:0;">
        <button
          @click=${() => recommendations.filter((r) => r.installable !== false && r.installMethod !== "none").forEach((r) => onInstall(r))}
          class="ext-pill-btn ext-pill-btn--primary ext-pill-btn--sm"
        >${t("extensions.recommend.installAll")}</button>
        <button
          @click=${onDismiss}
          style="
            all:unset; cursor:pointer;
            font-size:12px;
            color:var(--muted-strong, #6b7d91);
            padding:6px 8px;
          "
        >${t("extensions.recommend.later")}</button>
      </div>
    </div>
  `;
}

// ============================================================================
// First visit guide
// ============================================================================

function renderFirstVisitGuide(props: ExtensionsPageProps): TemplateResult {
  return html`
    <div class="ext-first-visit">
      <!-- Left: text content -->
      <div style="flex:1; min-width:0;">
        <div style="font-size:20px; font-weight:700; color:#feb142; margin-bottom:8px;">
          <span class="mcp-icon" style="font-size:18px;">${icons.gift}</span> ${t("extensions.firstVisit.title")}
        </div>
        <div style="font-size:13px; color:var(--fg-secondary, #a0aec0); margin-bottom:14px; line-height:1.6;">
          ${t("extensions.firstVisit.desc")}
        </div>
        <div style="
          display:flex; gap:10px; flex-wrap:wrap;
          font-size:12px; margin-bottom:12px;
        ">
          <span class="ext-first-visit__pill">
            <span class="mcp-icon" style="font-size:14px;">${icons.folder}</span> \u64CD\u4F5C\u7535\u8111\u6587\u4EF6</span>
          <span class="ext-first-visit__pill">
            <span class="mcp-icon" style="font-size:14px;">${icons.search}</span> \u641C\u7D22\u7F51\u9875</span>
          <span class="ext-first-visit__pill">
            <span class="mcp-icon" style="font-size:14px;">${icons.hardDrive}</span> \u67E5\u8BE2\u6570\u636E\u5E93</span>
          <span class="ext-first-visit__pill">
            <span class="mcp-icon" style="font-size:14px;">${icons.clock}</span> \u4E86\u89E3\u65F6\u95F4\u65E5\u671F</span>
          <span class="ext-first-visit__pill">
            <span class="mcp-icon" style="font-size:14px;">${icons.brain}</span> \u6DF1\u5EA6\u601D\u8003</span>
        </div>
        <div style="font-size:12px; color:var(--muted-strong, #6b7d91); line-height:1.6;">
          ${t("extensions.firstVisit.preinstalled")}
          &nbsp;\u00B7&nbsp;
          ${t("extensions.firstVisit.storeHint")}
        </div>
      </div>
      <!-- Right: action -->
      <button
        @click=${props.onDismissFirstVisit}
        class="ext-pill-btn ext-pill-btn--primary"
      >${t("extensions.firstVisit.explore")}</button>
    </div>
  `;
}

// ============================================================================
// Advanced section (process table — preserved from original)
// ============================================================================

function renderAdvancedSection(
  processes: McpProcessInfo[],
  onRestart: (id: string) => void,
  onDisable: (id: string) => void,
  onEnable: (id: string) => void,
  onTest: (id: string) => void,
  onCheckUpdate: () => void,
  testingServerId: string | null,
  testResults: Record<string, "success" | "failed">,
  marketplaceMap?: Map<string, McpMarketplaceItem>,
): TemplateResult {
  const totalMemory = processes.reduce((sum, p) => sum + p.memoryMB, 0);

  return html`
    <div style="margin-top:20px; animation:extUpdateIn 200ms ease both;">
      <div class="ext-advanced-card">
        <div style="
          padding:14px 24px;
          font-size:13px; font-weight:600;
          color:var(--muted-strong, #6b7d91);
          border-bottom:1px solid var(--border);
          text-transform:uppercase;
          letter-spacing:0.03em;
        ">${t("extensions.advanced.status")}</div>

        ${
          processes.length === 0
            ? html`<div style="padding:32px; text-align:center; font-size:13px; color:var(--muted-strong);">
              ${t("extensions.noCapabilities")}
            </div>`
            : html`
            <div style="max-height:400px; overflow-y:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                  <tr style="color:var(--muted-strong, #6b7d91); text-align:left; background:var(--bg-elevated, #1c242e);">
                    <th style="padding:10px 24px; font-weight:500;">${t("extensions.advanced.name")}</th>
                    <th style="padding:10px 16px; font-weight:500;">${t("extensions.advanced.state")}</th>
                    <th style="padding:10px 16px; font-weight:500;">${t("extensions.advanced.memory")}</th>
                    <th style="padding:10px 16px; font-weight:500;">${t("extensions.advanced.tools")}</th>
                    <th style="padding:10px 16px; font-weight:500; text-align:right;">${t("extensions.advanced.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${processes.map((p) => {
                    const isTesting = testingServerId === p.id;
                    const testResult = testResults[p.id];
                    return html`
                      <tr style="border-top:1px solid var(--border); transition:background 150ms;" class="ext-process-row">
                        <td style="padding:12px 24px; color:var(--fg); font-weight:500;">${marketplaceMap?.get(p.id)?.friendlyName || p.friendlyName || p.id}</td>
                        <td style="padding:12px 16px;">
                          <span style="
                            display:inline-flex; align-items:center; gap:5px;
                            font-size:12px;
                            padding:3px 10px;
                            border-radius:var(--radius-full, 9999px);
                            background:${p.status === "running" ? "rgba(52,211,153,0.1)" : p.status === "error" ? "rgba(248,113,113,0.1)" : "rgba(148,163,184,0.1)"};
                            color:${p.status === "running" ? "var(--ok, #34d399)" : p.status === "error" ? "var(--danger, #f87171)" : "var(--muted, #94a3b8)"};
                          ">
                            <span style="width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block;"></span>
                            ${
                              p.status === "running"
                                ? t("common.running")
                                : p.status === "error"
                                  ? t("common.failed")
                                  : t("common.stopped")
                            }
                          </span>
                          ${
                            testResult
                              ? html`<span style="
                                margin-left:6px;
                                font-size:11px;
                                padding:2px 8px;
                                border-radius:var(--radius-full, 9999px);
                                background:${testResult === "success" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)"};
                                color:${testResult === "success" ? "var(--ok, #34d399)" : "var(--danger, #f87171)"};
                              ">${testResult === "success" ? t("extensions.advanced.testSuccess" as never) : t("extensions.advanced.testFailed" as never)}</span>`
                              : nothing
                          }
                          ${
                            p.status === "error" && p.error
                              ? html`<div style="
                                margin-top:4px;
                                font-size:11px;
                                color:var(--danger, #f87171);
                                max-width:320px;
                                word-break:break-word;
                                line-height:1.4;
                              ">${p.error}</div>`
                              : nothing
                          }
                        </td>
                        <td style="padding:12px 16px; color:var(--fg-secondary, #a0aec0); font-family:var(--mono);">${p.memoryMB}MB</td>
                        <td style="padding:12px 16px; color:var(--fg-secondary, #a0aec0);">${p.toolCount}</td>
                        <td style="padding:12px 16px; text-align:right; white-space:nowrap; display:flex; gap:8px; justify-content:flex-end; align-items:center;">
                          <!-- Test button -->
                          <button
                            @click=${() => onTest(p.id)}
                            ?disabled=${isTesting}
                            class="ext-process-action-btn ext-process-action-btn--test"
                            style="${isTesting ? "opacity:0.5; cursor:wait;" : ""}"
                          >${isTesting ? t("extensions.advanced.testing" as never) : t("extensions.advanced.test" as never)}</button>
                          <button
                            @click=${() => onRestart(p.id)}
                            class="ext-process-action-btn ext-process-action-btn--restart"
                          >${t("extensions.advanced.restart")}</button>
                          ${
                            p.status === "running"
                              ? html`<button
                                @click=${() => onDisable(p.id)}
                                class="ext-process-action-btn ext-process-action-btn--disable"
                              >${t("extensions.advanced.disable")}</button>`
                              : html`<button
                                @click=${() => onEnable(p.id)}
                                class="ext-process-action-btn ext-process-action-btn--enable"
                              >${t("extensions.advanced.enable" as never)}</button>`
                          }
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
            `
        }
      </div>

      <div style="display:flex; align-items:center; justify-content:space-between; font-size:13px; color:var(--muted-strong, #6b7d91); padding:0 4px;">
        <span>${t("extensions.advanced.totalMemory")}: <strong style="color:var(--fg);">${totalMemory}MB</strong></span>
        <button
          @click=${onCheckUpdate}
          style="all:unset; cursor:pointer; font-size:13px; font-weight:500; color:var(--accent-2, #20d5bc); transition:opacity 150ms;"
        >${t("extensions.advanced.checkUpdate")}</button>
      </div>

    </div>

  `;
}

// ============================================================================
// Toast notification
// ============================================================================

function renderMcpToast(toast: McpToast): TemplateResult {
  const toastIcon =
    toast.type === "success"
      ? icons.check
      : toast.type === "error"
        ? icons.xCircle
        : icons.alertCircle;

  return html`
    <div
      role="alert"
      aria-live="polite"
      class="ext-toast ext-toast--${toast.type}"
    >
      <span class="mcp-icon" style="font-size:14px; flex-shrink:0;" aria-hidden="true">${toastIcon}</span>
      ${toast.message}
    </div>
  `;
}

// ============================================================================
// Import MCP modal — JSON paste mode (imperative DOM, immune to Lit re-render)
// ============================================================================

type ManualAddConfig =
  NonNullable<ExtensionsPageProps["onManualAdd"]> extends (c: infer C) => void ? C : never;

/** Parse pasted JSON into server configs. Returns array on success, error string on failure. */
function _parseMcpJson(raw: string): ManualAddConfig[] | string {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return t("extensions.advanced.jsonPaste.parseError" as never);
  }

  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return t("extensions.advanced.jsonPaste.parseError" as never);
  }

  const rec = obj as Record<string, unknown>;

  // Unwrap "mcpServers" envelope if present
  const servers: Record<string, unknown> =
    rec.mcpServers && typeof rec.mcpServers === "object" && !Array.isArray(rec.mcpServers)
      ? (rec.mcpServers as Record<string, unknown>)
      : rec;

  // Format C: bare server config (has "command" or "url" at top level)
  if (typeof servers.command === "string" || typeof servers.url === "string") {
    const cfg = _extractServerConfig("mcp-server", servers);
    if (!cfg) {
      return t("extensions.advanced.jsonPaste.invalidConfig" as never);
    }
    return [cfg];
  }

  // Format A / B: iterate named server entries
  const results: ManualAddConfig[] = [];
  for (const [name, val] of Object.entries(servers)) {
    if (!val || typeof val !== "object" || Array.isArray(val)) {
      continue;
    }
    const cfg = _extractServerConfig(name, val as Record<string, unknown>);
    if (cfg) {
      results.push(cfg);
    }
  }

  if (results.length === 0) {
    return t("extensions.advanced.jsonPaste.noServers" as never);
  }
  return results;
}

function _extractServerConfig(id: string, obj: Record<string, unknown>): ManualAddConfig | null {
  const command = typeof obj.command === "string" ? obj.command : "";
  const url = typeof obj.url === "string" ? obj.url : undefined;
  if (!command && !url) {
    return null;
  }

  const transport: "stdio" | "sse" = url && !command ? "sse" : "stdio";
  const args = Array.isArray(obj.args)
    ? obj.args.filter((a): a is string => typeof a === "string")
    : [];
  const env =
    obj.env && typeof obj.env === "object" && !Array.isArray(obj.env)
      ? (obj.env as Record<string, string>)
      : undefined;
  const headers =
    obj.headers && typeof obj.headers === "object" && !Array.isArray(obj.headers)
      ? (obj.headers as Record<string, string>)
      : undefined;

  return { id, command, args, transport, env, url, headers };
}

/**
 * Open import-MCP modal: creates a centered overlay with a JSON textarea.
 * Pure DOM — not a Lit template — so it's immune to re-render race conditions.
 */
function _openImportMcpModal(onManualAdd: ExtensionsPageProps["onManualAdd"]): void {
  if (!onManualAdd) {
    return;
  }
  // Prevent duplicate
  if (document.getElementById("mcp-import-modal-backdrop")) {
    return;
  }

  const placeholder = `{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@org/mcp-server"]
    }
  }
}`;

  // --- Backdrop ---
  const backdrop = document.createElement("div");
  backdrop.id = "mcp-import-modal-backdrop";
  Object.assign(backdrop.style, {
    position: "fixed",
    inset: "0",
    zIndex: "9999",
    background: "rgba(0,0,0,0.3)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "extUpdateIn 150ms ease both",
  });

  const close = () => {
    backdrop.remove();
  };
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) {
      close();
    }
  });

  // --- Dialog card ---
  const card = document.createElement("div");
  Object.assign(card.style, {
    background: "var(--glass-bg, var(--card, #1e293b))",
    border: "1px solid var(--glass-border, var(--border, #334155))",
    borderRadius: "20px",
    padding: "24px",
    width: "520px",
    maxWidth: "90vw",
    maxHeight: "80vh",
    overflowY: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    animation: "extUpdateIn 200ms ease both",
  });

  // Title row
  const titleRow = document.createElement("div");
  Object.assign(titleRow.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  });
  const title = document.createElement("div");
  title.textContent = t("extensions.stats.importMcp" as never);
  Object.assign(title.style, { fontSize: "15px", fontWeight: "700", color: "var(--fg, #e2e8f0)" });
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "\u2715";
  Object.assign(closeBtn.style, {
    all: "unset",
    cursor: "pointer",
    fontSize: "16px",
    color: "var(--muted, #8b9caf)",
    padding: "4px 8px",
    borderRadius: "4px",
    lineHeight: "1",
  });
  closeBtn.addEventListener("click", close);
  titleRow.append(title, closeBtn);

  // Hint text
  const hint = document.createElement("div");
  hint.textContent = t("extensions.advanced.jsonPaste.hint" as never);
  Object.assign(hint.style, {
    fontSize: "12px",
    color: "var(--muted-strong, #6b7d91)",
    lineHeight: "1.5",
  });

  // Textarea
  const textarea = document.createElement("textarea");
  textarea.placeholder = placeholder;
  textarea.rows = 10;
  Object.assign(textarea.style, {
    padding: "10px 12px",
    border: "1px solid var(--border, #334155)",
    borderRadius: "8px",
    background: "var(--bg, #0f172a)",
    color: "var(--fg, #e2e8f0)",
    fontSize: "13px",
    fontFamily: "monospace",
    resize: "vertical",
    outline: "none",
    tabSize: "2",
    whiteSpace: "pre",
    lineHeight: "1.5",
  });
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const s = textarea.selectionStart,
        end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, s) + "  " + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = s + 2;
    }
    if (e.key === "Escape") {
      close();
    }
  });

  // Status line
  const status = document.createElement("div");
  Object.assign(status.style, {
    display: "none",
    fontSize: "12px",
    padding: "0 2px",
    lineHeight: "1.4",
  });

  // Button row
  const btnRow = document.createElement("div");
  Object.assign(btnRow.style, {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end",
    alignItems: "center",
  });

  const spinner = document.createElement("span");
  spinner.textContent = t("extensions.advanced.jsonPaste.adding" as never);
  Object.assign(spinner.style, {
    display: "none",
    fontSize: "12px",
    color: "var(--muted-strong, #6b7d91)",
  });

  const submitBtn = document.createElement("button");
  submitBtn.textContent = t("extensions.advanced.manualAdd.submit" as never);
  Object.assign(submitBtn.style, {
    all: "unset",
    cursor: "pointer",
    padding: "8px 24px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "600",
    background: "var(--accent, #6c8cff)",
    color: "#fff",
    transition: "opacity 150ms",
  });

  submitBtn.addEventListener("click", () => {
    const raw = textarea.value.trim();
    if (!raw) {
      return;
    }

    const result = _parseMcpJson(raw);
    if (typeof result === "string") {
      status.textContent = result;
      status.style.display = "block";
      status.style.color = "var(--danger, #f87171)";
      return;
    }

    status.style.display = "none";
    spinner.style.display = "inline";
    submitBtn.style.opacity = "0.5";
    submitBtn.style.pointerEvents = "none";

    void (async () => {
      const ok: string[] = [],
        fail: string[] = [];
      for (const cfg of result) {
        if (await onManualAdd(cfg)) {
          ok.push(cfg.id);
        } else {
          fail.push(cfg.id);
        }
      }

      submitBtn.style.opacity = "1";
      submitBtn.style.pointerEvents = "";
      spinner.style.display = "none";

      if (fail.length > 0 && ok.length === 0) {
        status.textContent = t("extensions.advanced.jsonPaste.addFailed" as never).replace(
          "{{names}}",
          fail.join(", "),
        );
        status.style.color = "var(--danger, #f87171)";
        status.style.display = "block";
      } else if (fail.length > 0) {
        status.textContent = t("extensions.advanced.jsonPaste.addPartial" as never)
          .replace("{{ok}}", ok.join(", "))
          .replace("{{fail}}", fail.join(", "));
        status.style.color = "#fb923c";
        status.style.display = "block";
      } else {
        status.textContent = t("extensions.advanced.jsonPaste.addSuccess" as never).replace(
          "{{names}}",
          ok.join(", "),
        );
        status.style.color = "var(--ok, #34d399)";
        status.style.display = "block";
        setTimeout(close, 1200);
      }
    })();
  });

  btnRow.append(spinner, submitBtn);
  card.append(titleRow, hint, textarea, status, btnRow);
  backdrop.append(card);
  document.body.append(backdrop);

  // Auto-focus textarea
  requestAnimationFrame(() => textarea.focus());
}

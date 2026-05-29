/**
 * mcp-store-section.ts
 * Shared MCP marketplace rendering module.
 *
 * Used by both:
 *   - Skills page (as "MCP 市场" tab)
 *   - Extensions page (as "Capability Store" tab)
 *
 * Provides search, category chips, sort, card grid, detail modal, and config wizard.
 */

import { html, nothing, type TemplateResult } from "lit";
import { ref, type RefOrCallback } from "lit/directives/ref.js";
import type { McpMarketplaceItem, McpMarketplaceState } from "../app-view-state.js";
import { t } from "../i18n/index.js";

// ---------------------------------------------------------------------------
// IntersectionObserver-based infinite scroll sentinel
// ---------------------------------------------------------------------------
const _sentinelObservers = new WeakMap<Element, IntersectionObserver>();

function scrollSentinelRef(onLoad?: () => void, loading?: boolean): RefOrCallback {
  return (el: Element | undefined) => {
    if (!el) return;
    // Clean up previous observer on this element
    const prev = _sentinelObservers.get(el);
    if (prev) {
      prev.disconnect();
      _sentinelObservers.delete(el);
    }
    if (!onLoad || loading) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoad();
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    _sentinelObservers.set(el, obs);
  };
}
import { icons } from "../icons.js";
import { renderMcpBatchConfig } from "./mcp-batch-config.js";
import { renderMcpConfigWizard, type McpInstallOverrides } from "./mcp-config-wizard.js";
import { renderMcpDetailModal } from "./mcp-detail-modal.js";
import { renderMarketplaceCard } from "./mcp-marketplace-card.js";
import { MCP_CATEGORIES, MCP_MAX_RUNNING, filterMarketplaceItems } from "./mcp-shared.js";

// ============================================================================
// Props
// ============================================================================

export type McpStoreSectionProps = {
  marketplace: McpMarketplaceState;
  onSearchChange: (search: string) => void;
  onCategoryChange: (category: string) => void;
  onSortChange: (sort: McpMarketplaceState["sort"]) => void;
  onOpenDetail: (item: McpMarketplaceItem) => void;
  onCloseDetail: () => void;
  onInstall: (item: McpMarketplaceItem) => void;
  onUninstall: (serverId: string) => void;
  onOpenConfigWizard: (item: McpMarketplaceItem) => void;
  onCloseConfigWizard: () => void;
  /** Update an installed marketplace item */
  onUpdate?: (serverId: string) => void;
  /** Send a prompt to chat (from detail modal "try saying") */
  onTrySay?: (prompt: string) => void;
  /** Test connection for config wizard */
  onTestConnection?: (serverId: string, env: Record<string, string>) => void;
  /** Test connection state (managed by parent) */
  testConnectionState?: "idle" | "testing" | "success" | "error";
  /** Test connection result message */
  testConnectionMessage?: string;
  /** Load next page of marketplace items */
  onLoadMore?: () => void;
  /** Current running process count for limit guard */
  runningCount: number;
  // — Batch API Key configuration —
  onOpenBatchConfig?: () => void;
  onCloseBatchConfig?: () => void;
  onSaveBatchConfig?: (updates: Array<{ serverId: string; env: Record<string, string> }>) => void;
  batchConfigSaving?: boolean;
  batchConfigResult?: { success: number; failed: number } | null;
  serverEnvStatus?: Record<string, Record<string, boolean>>;
};

// CATEGORIES, MCP_MAX_RUNNING, filterMarketplaceItems — imported from mcp-shared.ts

// ============================================================================
// Search debounce
// ============================================================================

let _searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSearch(value: string, cb: (s: string) => void): void {
  if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(() => cb(value), 300);
}

// ============================================================================
// Main render
// ============================================================================

/**
 * Render the MCP marketplace section with search, categories, cards, and modals.
 */
export function renderMcpStoreSection(props: McpStoreSectionProps): TemplateResult {
  const {
    marketplace,
    onSearchChange,
    onCategoryChange,
    onSortChange,
    onOpenDetail,
    onInstall,
    onOpenConfigWizard,
    runningCount,
  } = props;

  const filtered = filterMarketplaceItems(marketplace);

  const atLimit = runningCount >= MCP_MAX_RUNNING;
  const nearLimit = runningCount >= MCP_MAX_RUNNING - 2; // 5+

  return html`
    <!-- Token consumption info bar — always visible -->
    <div style="
      padding:10px 20px;
      margin-bottom:16px;
      border-radius:var(--radius-lg, 12px);
      background:${atLimit ? "rgba(248,113,113,0.08)" : nearLimit ? "rgba(251,191,36,0.06)" : "rgba(var(--accent-rgb, 108,140,255),0.05)"};
      border:1px solid ${atLimit ? "rgba(248,113,113,0.2)" : nearLimit ? "rgba(251,191,36,0.15)" : "rgba(var(--accent-rgb, 108,140,255),0.1)"};
      font-size:12px;
      color:${atLimit ? "var(--danger, #f87171)" : "var(--fg-secondary, #a0aec0)"};
      display:flex;
      align-items:center;
      gap:10px;
    ">
      <!-- Counter badge -->
      <span style="
        display:inline-flex;
        align-items:center;
        gap:4px;
        padding:3px 10px;
        border-radius:var(--radius-full, 9999px);
        background:${atLimit ? "rgba(248,113,113,0.15)" : "rgba(var(--accent-rgb, 108,140,255),0.1)"};
        color:${atLimit ? "var(--danger, #f87171)" : "var(--accent, #6c8cff)"};
        font-weight:600;
        font-size:12px;
        white-space:nowrap;
        flex-shrink:0;
      ">${runningCount} / ${MCP_MAX_RUNNING}</span>
      <span>
        ${
          atLimit
            ? t("extensions.store.limitReached")
                .replace("{{count}}", String(runningCount))
                .replace("{{max}}", String(MCP_MAX_RUNNING))
            : t("extensions.store.tokenTip" as never)
        }
      </span>
    </div>

    <!-- Toolbar: search + categories + sort -->
    <div style="
      display:flex;
      gap:12px;
      margin-bottom:16px;
      align-items:center;
      flex-wrap:wrap;
    ">
      <!-- Search box -->
      <div style="
        width:280px; flex-shrink:0;
        display:flex; align-items:center;
        padding:0 14px;
        border:1px solid var(--border);
        border-radius:var(--radius-md, 8px);
        background:var(--card);
        transition:border-color 150ms, box-shadow 150ms;
        height:36px;
      " class="mcp-store-search-box">
        <span class="mcp-icon" style="font-size:14px; color:var(--muted-strong, #6b7d91); margin-right:8px;">${icons.search}</span>
        <input
          type="text"
          .value=${marketplace.search}
          @input=${(e: Event) => debouncedSearch((e.target as HTMLInputElement).value, onSearchChange)}
          placeholder=${t("extensions.store.searchPlaceholder")}
          style="
            all:unset;
            flex:1;
            padding:8px 0;
            font-size:13px;
            color:var(--fg);
          "
        />
        ${
          marketplace.search
            ? html`<button
              @click=${() => onSearchChange("")}
              style="all:unset; cursor:pointer; font-size:16px; color:var(--muted-strong, #6b7d91); padding:0 4px; line-height:1;"
            >&times;</button>`
            : nothing
        }
      </div>

      <!-- Category chips -->
      <div style="
        display:flex;
        gap:6px;
        flex-wrap:wrap;
        flex:1;
        align-items:center;
      ">
        ${MCP_CATEGORIES.map((cat) => {
          const isActive = marketplace.activeCategory === cat.id;
          const count =
            cat.id === "all"
              ? marketplace.total
              : marketplace.items.filter((i) => i.category === cat.id).length;

          return html`
            <button
              @click=${() => onCategoryChange(isActive && cat.id !== "all" ? "all" : cat.id)}
              style="
                all:unset; cursor:pointer;
                padding:4px 12px;
                border-radius:var(--radius-full, 9999px);
                font-size:11px;
                white-space:nowrap;
                border:1px solid ${isActive ? "var(--accent, #6c8cff)" : "var(--border)"};
                background:${isActive ? "rgba(108,140,255,0.1)" : "transparent"};
                color:${isActive ? "var(--accent, #6c8cff)" : "var(--muted-strong, #6b7d91)"};
                transition:all 150ms;
                user-select:none;
              "
            ><span class="mcp-icon" style="font-size:12px;">${icons[cat.icon]}</span> ${t(`extensions.category.${cat.id}` as never)}${count > 0 ? ` (${count})` : ""}</button>
          `;
        })}
      </div>

      <!-- Sort dropdown -->
      <select
        @change=${(e: Event) => onSortChange((e.target as HTMLSelectElement).value as McpMarketplaceState["sort"])}
        .value=${marketplace.sort}
        style="
          padding:0 12px;
          height:36px;
          border:1px solid var(--border);
          border-radius:var(--radius-md, 8px);
          background:var(--card);
          color:var(--fg);
          font-size:12px;
          outline:none;
          cursor:pointer;
          flex-shrink:0;
        "
      >
        <option value="recommended">${t("extensions.store.sort.recommended")}</option>
        <option value="newest">${t("extensions.store.sort.newest")}</option>
        <option value="popular">${t("extensions.store.sort.popular")}</option>
        <option value="name">${t("extensions.store.sort.name")}</option>
      </select>

      <!-- Batch API Key config button -->
      ${
        props.onOpenBatchConfig && marketplace.items.some((i) => i.requiresApiKey)
          ? html`<button
            @click=${props.onOpenBatchConfig}
            style="
              all:unset; cursor:pointer;
              padding:0 14px;
              height:36px;
              border:1px solid var(--accent-2, #20d5bc);
              border-radius:var(--radius-md, 8px);
              background:rgba(32,213,188,0.08);
              color:var(--accent-2, #20d5bc);
              font-size:12px;
              font-weight:600;
              white-space:nowrap;
              flex-shrink:0;
              display:flex;
              align-items:center;
              gap:6px;
              transition:background 150ms, border-color 150ms;
            "
            class="mcp-store-batch-btn"
          ><span class="mcp-icon" style="font-size:13px;">${icons.key}</span> ${t("extensions.batchConfig.button" as never)}</button>`
          : nothing
      }
    </div>

    <!-- Content: loading / empty / no results / cards grid -->
    ${
      marketplace.loading
        ? renderStoreLoading()
        : marketplace.error
          ? renderStoreEmpty(marketplace.error)
          : marketplace.items.length === 0
            ? renderStoreEmpty("")
            : filtered.length === 0
              ? renderNoResults(marketplace.search, () => onSearchChange(""))
              : html`
                <div class="mcp-store-grid" style="
                  display:grid;
                  gap:16px;
                  margin-bottom:16px;
                ">
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

    <!-- Detail modal overlay -->
    ${
      marketplace.detailItem
        ? renderMcpDetailModal({
            item: marketplace.detailItem,
            onClose: props.onCloseDetail,
            onInstall: () => onInstall(marketplace.detailItem!),
            onUninstall: () => props.onUninstall(marketplace.detailItem!.serverId),
            onConfigInstall: () => onOpenConfigWizard(marketplace.detailItem!),
            onUpdate: () => {
              props.onUpdate?.(marketplace.detailItem!.serverId);
              props.onCloseDetail();
            },
            onTrySay: (prompt: string) => {
              props.onTrySay?.(prompt);
            },
          })
        : nothing
    }

    <!-- Config wizard modal overlay -->
    ${
      marketplace.configTarget
        ? renderMcpConfigWizard({
            item: marketplace.configTarget,
            onClose: props.onCloseConfigWizard,
            onSaveAndEnable: (env: Record<string, string>, overrides?: McpInstallOverrides) => {
              const target = marketplace.configTarget!;
              onInstall({ ...target, _env: env, _overrides: overrides } as McpMarketplaceItem & {
                _env: Record<string, string>;
                _overrides?: McpInstallOverrides;
              });
              props.onCloseConfigWizard();
            },
            onTestConnection: (env: Record<string, string>) => {
              props.onTestConnection?.(marketplace.configTarget!.serverId, env);
            },
            testState: props.testConnectionState ?? "idle",
            testMessage: props.testConnectionMessage,
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

    <style>
      .mcp-store-search-box:focus-within {
        border-color:var(--accent, #6c8cff) !important;
        box-shadow:0 0 0 3px rgba(108,140,255,0.1);
      }
      .mcp-store-batch-btn:hover {
        background:rgba(32,213,188,0.15) !important;
      }
      .mcp-store-grid {
        grid-template-columns: repeat(4, 1fr);
      }
      @media (max-width: 1400px) {
        .mcp-store-grid { grid-template-columns: repeat(3, 1fr); }
      }
      @media (max-width: 1000px) {
        .mcp-store-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (max-width: 600px) {
        .mcp-store-grid { grid-template-columns: 1fr; }
      }
      .mcp-icon { display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
      .mcp-icon svg { width:1em; height:1em; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    </style>
  `;
}

// filterItems — now using filterMarketplaceItems from mcp-shared.ts

function renderStoreLoading(): TemplateResult {
  return html`
    <div style="text-align:center; padding:60px 20px; color:var(--muted-strong, #6b7d91);">
      <div style="width:24px; height:24px; border:3px solid var(--accent-2, #20d5bc); border-top-color:transparent; border-radius:50%; animation:mcpStoreSpinShared 0.8s linear infinite; margin:0 auto 16px;"></div>
      <div style="font-size:14px;">${t("extensions.store.loading")}</div>
      <div style="font-size:12px; margin-top:6px; opacity:0.7;">${t("extensions.store.loadingHint")}</div>
    </div>
    <style>
      @keyframes mcpStoreSpinShared { to { transform:rotate(360deg); } }
    </style>
  `;
}

function renderStoreEmpty(error: string): TemplateResult {
  return html`
    <div style="text-align:center; padding:60px 20px; color:var(--muted-strong, #6b7d91);">
      <div style="margin-bottom:12px;"><span class="mcp-icon" style="font-size:28px; color:var(--muted-strong, #6b7d91);">${icons.globe}</span></div>
      <div style="font-size:14px; font-weight:600;">${t("extensions.store.empty")}</div>
      <div style="font-size:12px; margin-top:8px; max-width:300px; margin-left:auto; margin-right:auto;">${t("extensions.store.emptyHint")}</div>
      <div style="font-size:11px; margin-top:6px; opacity:0.5;">${error}</div>
    </div>
  `;
}

function renderNoResults(query: string, onClear: () => void): TemplateResult {
  return html`
    <div style="text-align:center; padding:60px 20px; color:var(--muted-strong, #6b7d91);">
      <div style="margin-bottom:12px;"><span class="mcp-icon" style="font-size:28px; color:var(--muted-strong, #6b7d91);">${icons.search}</span></div>
      <div style="font-size:14px;">${(t("extensions.store.noResults") as string).replace("{{query}}", query)}</div>
      <div style="font-size:12px; margin-top:8px;">${t("extensions.store.noResultsHint")}</div>
      <button
        @click=${onClear}
        style="all:unset; cursor:pointer; margin-top:16px; font-size:12px; font-weight:600; padding:6px 20px; border-radius:6px; border:1px solid var(--border); color:var(--fg-secondary, #a0aec0);"
      >${t("extensions.store.clearSearch")}</button>
    </div>
  `;
}

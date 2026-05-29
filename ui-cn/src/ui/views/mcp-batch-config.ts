/**
 * mcp-batch-config.ts
 * Batch API Key configuration modal for MCP servers.
 *
 * Shows a table of all MCP servers requiring API keys, allowing users
 * to configure multiple keys at once. Unconfigured items are highlighted.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { McpMarketplaceItem } from "../app-view-state.js";
import { t } from "../i18n/index.js";
import { icons } from "../icons.js";

// ============================================================================
// Types
// ============================================================================

export type McpBatchConfigProps = {
  /** All marketplace items that require API keys */
  items: McpMarketplaceItem[];
  /** Server env configuration status: { serverId: { envKey: boolean } } */
  serverEnvStatus: Record<string, Record<string, boolean>>;
  onClose: () => void;
  onSaveAll: (updates: Array<{ serverId: string; env: Record<string, string> }>) => void;
  saving: boolean;
  saveResult?: { success: number; failed: number } | null;
};

// ============================================================================
// Helpers
// ============================================================================

function isConfigured(
  item: McpMarketplaceItem,
  serverEnvStatus: Record<string, Record<string, boolean>>,
): boolean {
  const status = serverEnvStatus[item.serverId];
  if (!status) return false;
  // Check all required env keys, not just one
  const requiredKeys: string[] =
    item.envRequired && item.envRequired.length > 0
      ? item.envRequired
      : item.envSchema && Object.keys(item.envSchema).length > 0
        ? Object.keys(item.envSchema)
        : [item.apiKeyName ?? "API_KEY"];
  return requiredKeys.every((key) => !!status[key]);
}

function collectUpdates(): Array<{ serverId: string; env: Record<string, string> }> {
  const updates: Array<{ serverId: string; env: Record<string, string> }> = [];
  const rows = document.querySelectorAll("[data-batch-server-id]");
  rows.forEach((row) => {
    const serverId = row.getAttribute("data-batch-server-id") ?? "";
    const keyName = row.getAttribute("data-batch-key-name") ?? "";
    const input = row.querySelector(".batch-key-input") as HTMLInputElement | null;
    const val = input?.value?.trim();
    if (serverId && keyName && val) {
      updates.push({ serverId, env: { [keyName]: val } });
    }
  });
  return updates;
}

// ============================================================================
// Render
// ============================================================================

export function renderMcpBatchConfig(props: McpBatchConfigProps): TemplateResult {
  const { items, serverEnvStatus, onClose, onSaveAll, saving, saveResult } = props;

  const needsKey = items.filter((i) => i.requiresApiKey);
  // Sort: unconfigured first, then configured
  const sorted = [...needsKey].sort((a, b) => {
    const aConf = isConfigured(a, serverEnvStatus) ? 1 : 0;
    const bConf = isConfigured(b, serverEnvStatus) ? 1 : 0;
    return aConf - bConf;
  });

  return html`
    <!-- Backdrop -->
    <div
      @click=${onClose}
      class="ext-glass-overlay"
      style="z-index:9200"
    ></div>

    <!-- Panel -->
    <div
      role="dialog"
      aria-modal="true"
      aria-label="${t("extensions.batchConfig.title" as never)}"
      class="ext-glass-modal ext-glass-modal--batch"
      @click=${(e: Event) => e.stopPropagation()}
    >
      <!-- Close -->
      <button
        @click=${onClose}
        class="ext-modal-close batch-cfg-close"
      >&times;</button>

      <!-- Title -->
      <div class="ext-modal-title">
        ${t("extensions.batchConfig.title" as never)}
      </div>
      <div class="ext-modal-subtitle">
        ${t("extensions.batchConfig.subtitle" as never)}
      </div>

      <!-- Empty state -->
      ${
        sorted.length === 0
          ? html`
            <div style="
              padding:40px 20px;
              text-align:center;
              color:var(--muted-strong, #6b7d91);
              font-size:13px;
            ">
              ${t("extensions.batchConfig.empty" as never)}
            </div>
          `
          : html`
            <!-- Table header -->
            <div class="ext-batch-table-header">
              <span>${t("extensions.batchConfig.serverName" as never)}</span>
              <span>${t("extensions.batchConfig.apiKeyVar" as never)}</span>
              <span>${t("extensions.batchConfig.value" as never)}</span>
              <span>${t("extensions.batchConfig.guide" as never)}</span>
              <span style="text-align:center;">${t("extensions.batchConfig.status" as never)}</span>
            </div>

            <!-- Rows -->
            ${sorted.map((item) => {
              const keyName = item.apiKeyName ?? "API_KEY";
              const configured = isConfigured(item, serverEnvStatus);
              const isInstalled = item.installStatus === "installed";
              return html`
                <div
                  data-batch-server-id="${item.serverId}"
                  data-batch-key-name="${keyName}"
                  class="ext-batch-row"
                  style="opacity:${isInstalled ? "1" : "0.6"};"
                >
                  <!-- Name -->
                  <div style="font-size:13px; color:var(--fg); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${item.friendlyName}
                    ${
                      !isInstalled
                        ? html`<span style="font-size:10px; color:var(--muted-strong, #6b7d91); margin-left:4px;">(${t("extensions.store.install" as never)})</span>`
                        : nothing
                    }
                  </div>

                  <!-- Key variable name -->
                  <div style="font-size:11px; color:var(--accent-2, #20d5bc); font-family:monospace;">
                    ${keyName}
                  </div>

                  <!-- Key input -->
                  <div style="position:relative;">
                    <input
                      type="password"
                      class="batch-key-input ext-glass-input ext-glass-input--password"
                      placeholder="${configured ? "••••••••" : keyName}"
                      autocomplete="off"
                      ?disabled=${!isInstalled}
                    />
                    <button
                      type="button"
                      @click=${(e: Event) => {
                        const btn = e.currentTarget as HTMLElement;
                        const container = btn.closest("div");
                        const input = container?.querySelector(
                          ".batch-key-input",
                        ) as HTMLInputElement | null;
                        if (!input) return;
                        const isPassword = input.type === "password";
                        input.type = isPassword ? "text" : "password";
                        const eyeSvg =
                          '<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
                        const eyeOffSvg =
                          '<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';
                        btn.innerHTML = isPassword ? eyeSvg : eyeOffSvg;
                      }}
                      style="
                        all:unset; cursor:pointer;
                        position:absolute;
                        right:8px;
                        top:50%;
                        transform:translateY(-50%);
                        font-size:12px;
                        color:var(--muted-strong, #6b7d91);
                        line-height:1;
                        display:inline-flex; align-items:center; justify-content:center;
                      "
                    >${icons.eyeOff}</button>
                  </div>

                  <!-- Guide link -->
                  <div style="text-align:center;">
                    ${
                      item.apiKeyGuideUrl
                        ? html`<a
                          href=${item.apiKeyGuideUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style="font-size:12px; color:var(--accent-2, #20d5bc); text-decoration:none;"
                          title="${t("extensions.batchConfig.guide" as never)}"
                        ><span class="mcp-icon" style="font-size:11px;">${icons.link}</span></a>`
                        : html`
                            <span style="color: var(--muted-strong, #6b7d91)">—</span>
                          `
                    }
                  </div>

                  <!-- Status dot -->
                  <div style="text-align:center;">
                    <span
                      style="
                        display:inline-block;
                        width:8px; height:8px;
                        border-radius:50%;
                        background:${configured ? "var(--ok, #34d399)" : "var(--warn, #fbbf24)"};
                      "
                      title="${
                        configured
                          ? t("extensions.batchConfig.configured" as never)
                          : t("extensions.batchConfig.unconfigured" as never)
                      }"
                    ></span>
                  </div>
                </div>
              `;
            })}
          `
      }

      <!-- Save result -->
      ${
        saveResult
          ? html`
            <div class="ext-alert-box" style="
              margin-top:16px;
              background:${saveResult.failed === 0 ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)"};
              border:1px solid ${saveResult.failed === 0 ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)"};
              color:${saveResult.failed === 0 ? "var(--ok, #34d399)" : "var(--danger, #f87171)"};
            ">
              ${
                saveResult.success > 0
                  ? html`<span><span class="mcp-icon" style="font-size:12px;">${icons.check}</span> ${saveResult.success} ${t("extensions.batchConfig.saved" as never)}</span>`
                  : nothing
              }
              ${
                saveResult.failed > 0
                  ? html`<span><span class="mcp-icon" style="font-size:12px;">${icons.xCircle}</span> ${saveResult.failed} ${t("extensions.batchConfig.failed" as never)}</span>`
                  : nothing
              }
            </div>
          `
          : nothing
      }

      <!-- Actions -->
      <div class="ext-modal-actions" style="margin-top:20px;">
        <button
          @click=${onClose}
          class="ext-pill-btn"
        >${t("common.cancel" as never)}</button>

        <button
          @click=${() => {
            const updates = collectUpdates();
            if (updates.length > 0) onSaveAll(updates);
          }}
          ?disabled=${saving || sorted.length === 0}
          class="ext-pill-btn ext-pill-btn--primary"
          style="opacity:${saving ? "0.6" : "1"};"
        >
          ${
            saving
              ? html`
                  <span
                    class="ext-spinner ext-spinner--md"
                    style="
                      vertical-align: middle;
                      margin-right: 6px;
                      border-color: #fff;
                      border-top-color: transparent;
                    "
                  ></span>
                `
              : nothing
          }
          ${t("extensions.batchConfig.saveAll" as never)}
        </button>
      </div>
    </div>

  `;
}

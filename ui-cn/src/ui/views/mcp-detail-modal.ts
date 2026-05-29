/**
 * mcp-detail-modal.ts
 * Capability detail modal — shows full info + "try saying" + install.
 *
 * Opened when user clicks a store card. Follows fm-modal pattern (centered
 * overlay, 540px max width, click-outside-to-close).
 */

import { html, nothing, type TemplateResult } from "lit";
import type { McpMarketplaceItem } from "../app-view-state.js";
import { t } from "../i18n/index.js";
import { icons } from "../icons.js";
import { CATEGORY_ICON } from "./mcp-shared.js";
import { showConfirmModal } from "./confirm-modal.js";

export type McpDetailModalProps = {
  item: McpMarketplaceItem;
  onClose: () => void;
  onInstall: () => void;
  onConfigInstall: () => void;
  onUninstall: () => void;
  onUpdate: () => void;
  onTrySay: (prompt: string) => void;
};

/* ── helpers ────────────────────────────────────────────── */

function badgePill(bg: string, fg: string, label: string | TemplateResult): TemplateResult {
  return html`<span class="ext-badge" style="background:${bg}; color:${fg};">${label}</span>`;
}

/* ── main render ───────────────────────────────────────── */

export function renderMcpDetailModal(props: McpDetailModalProps): TemplateResult {
  const { item, onClose, onInstall, onConfigInstall, onUninstall, onUpdate, onTrySay } = props;
  const iconName = CATEGORY_ICON[item.category] ?? "puzzle";
  const scoreColor =
    item.securityScore >= 80
      ? "var(--ok, #34d399)"
      : item.securityScore >= 60
        ? "var(--warn, #fbbf24)"
        : "#94a3b8";

  return html`
    <!-- Backdrop -->
    <div
      @click=${onClose}
      class="ext-glass-overlay"
      style="z-index:9000"
    ></div>

    <!-- Modal -->
    <div
      role="dialog"
      aria-modal="true"
      aria-label="${item.friendlyName}"
      class="ext-glass-modal ext-glass-modal--detail"
      @click=${(e: Event) => e.stopPropagation()}
    >
      <!-- Close button -->
      <button
        @click=${onClose}
        aria-label="Close"
        class="ext-modal-close"
      >&times;</button>

      <!-- Header: icon + name + version + badges -->
      <div style="display:flex; align-items:flex-start; gap:14px; margin-bottom:20px;">
        <div style="
          width:52px; height:52px; border-radius:12px;
          background:rgba(var(--accent-rgb, 108,140,255),0.08);
          display:flex; align-items:center; justify-content:center;
          flex-shrink:0;
        "><span class="mcp-icon" style="font-size:24px;">${icons[iconName]}</span></div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="font-size:17px; font-weight:700; color:var(--fg);">${item.friendlyName}</span>
            <span style="
              font-size:10px; padding:2px 8px; border-radius:4px;
              background:rgba(148,163,184,0.1); color:var(--muted-strong, #6b7d91);
            ">v${item.version}</span>
          </div>
          <div style="font-size:12px; color:var(--muted-strong, #6b7d91); margin-top:3px;">
            ${item.npmPackage}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
            ${
              item.isOfficial
                ? badgePill(
                    "rgba(var(--accent-rgb, 108,140,255),0.12)",
                    "#818cf8",
                    html`<span class="mcp-icon" style="font-size:11px;">${icons.package}</span> ${t("extensions.store.official")}`,
                  )
                : nothing
            }
            ${(() => {
              const needsKey =
                item.requiresApiKey ||
                (item.envRequired && item.envRequired.length > 0) ||
                (item.envSchema && Object.keys(item.envSchema).length > 0);
              return !needsKey && item.installable !== false && item.installMethod !== "none"
                ? badgePill(
                    "rgba(52,211,153,0.12)",
                    "var(--ok, #34d399)",
                    html`<span class="mcp-icon" style="font-size:11px;">${icons.zap}</span> ${t("extensions.store.zeroConfig")}`,
                  )
                : needsKey
                  ? badgePill(
                      "rgba(251,191,36,0.12)",
                      "var(--warn, #fbbf24)",
                      html`<span class="mcp-icon" style="font-size:11px;">${icons.key}</span> ${t("extensions.store.needsKey")}`,
                    )
                  : nothing;
            })()}
            ${
              item.securityScore >= 60
                ? badgePill(
                    "rgba(52,211,153,0.08)",
                    scoreColor,
                    html`<span class="mcp-icon" style="font-size:11px;">${icons.shieldCheck}</span> ${item.securityScore}`,
                  )
                : nothing
            }
          </div>
        </div>
      </div>

      <div class="ext-modal-divider"></div>

      <!-- Capabilities list -->
      ${
        item.capabilities && item.capabilities.length > 0
          ? html`
            <div style="margin-top:20px;">
              <div style="font-size:13px; font-weight:600; color:var(--fg); margin-bottom:10px;">
                ${t("extensions.detail.canHelp")}
              </div>
              <ul style="margin:0; padding-left:20px; font-size:13px; color:var(--fg-secondary, #a0aec0); line-height:1.8;">
                ${item.capabilities.map((c) => html`<li>${c}</li>`)}
              </ul>
            </div>
          `
          : html`
            <div style="margin-top:20px;">
              <div style="font-size:13px; font-weight:600; color:var(--fg); margin-bottom:10px;">
                ${t("extensions.detail.canHelp")}
              </div>
              <p style="font-size:13px; color:var(--fg-secondary, #a0aec0); line-height:1.6; margin:0;">
                ${item.description}
              </p>
            </div>
          `
      }

      <!-- SSE Remote Service risk warning -->
      ${
        item.installMethod === "sse"
          ? (() => {
              const sseUrl = (item as McpMarketplaceItem & { sseUrl?: string }).sseUrl || "";
              let domain = "";
              try {
                domain = new URL(sseUrl).hostname;
              } catch {
                domain = sseUrl;
              }
              const isVerified = (item as McpMarketplaceItem & { isVerified?: boolean }).isVerified;
              return html`
              <div class="ext-alert-box ext-alert-box--danger" style="margin-top:16px">
                <div style="font-weight:600; color:var(--danger, #f87171); margin-bottom:6px;">
                  ${t("extensions.detail.sseRiskTitle" as never)}
                </div>
                <div style="font-size:11px; line-height:1.6; color:var(--muted-strong, #6b7d91); margin-bottom:4px;">
                  ${(t("extensions.detail.sseRiskBody" as never) as string).replace("{{domain}}", domain || "unknown")}
                </div>
                ${
                  !isVerified
                    ? html`<div style="font-size:11px; font-weight:600; color:var(--danger, #f87171); margin-top:4px;">
                      ${t("extensions.detail.sseRiskUnverified" as never)}
                    </div>`
                    : nothing
                }
              </div>
            `;
            })()
          : nothing
      }

      <!-- API Key warning -->
      ${
        item.requiresApiKey ||
        (item.envRequired && item.envRequired.length > 0) ||
        (item.envSchema && Object.keys(item.envSchema).length > 0)
          ? html`
            <div class="ext-alert-box ext-alert-box--warning" style="margin-top:16px">
              <div style="font-weight:600; color:var(--warn, #fbbf24); margin-bottom:6px;">
                <span class="mcp-icon" style="font-size:14px;">${icons.alertCircle}</span> ${t("extensions.detail.needsKeyWarning")}
              </div>
              ${
                item.configHint
                  ? html`<div style="font-size:11px; line-height:1.5; color:var(--muted-strong, #6b7d91); margin-bottom:6px;">
                    ${item.configHint}
                  </div>`
                  : nothing
              }
              ${(() => {
                const envVarNames =
                  item.envRequired && item.envRequired.length > 0
                    ? item.envRequired
                    : item.envSchema && Object.keys(item.envSchema).length > 0
                      ? Object.keys(item.envSchema)
                      : [];
                return envVarNames.length > 0
                  ? html`<div style="font-size:11px; color:var(--muted-strong, #6b7d91); margin-bottom:6px;">
                      ${t("extensions.detail.requiredEnvVars" as never)}:
                      <code style="font-size:10px; background:rgba(148,163,184,0.1); padding:1px 4px; border-radius:3px;">
                        ${envVarNames.join(", ")}
                      </code>
                    </div>`
                  : nothing;
              })()}
              <details style="cursor:pointer;">
                <summary class="ext-details-summary" style="font-size:11px; color:var(--accent-2, #20d5bc); margin-bottom:6px;">
                  ${t("extensions.detail.whatIsApiKey")}
                </summary>
                <p style="margin:6px 0 0; font-size:11px; line-height:1.6; color:var(--muted-strong, #6b7d91);">
                  ${t("extensions.detail.apiKeyExplain")}
                </p>
              </details>
            </div>
          `
          : nothing
      }

      <div class="ext-modal-divider" style="margin-top:20px"></div>

      <!-- Try saying prompts -->
      ${
        item.examplePrompts && item.examplePrompts.length > 0
          ? html`
            <div style="margin-top:20px;">
              <div style="font-size:13px; font-weight:600; color:var(--fg); margin-bottom:10px;">
                ${t("extensions.detail.trySay")}
              </div>
              ${item.examplePrompts.map(
                (prompt) => html`
                  <button
                    @click=${() => {
                      onTrySay(prompt);
                      onClose();
                    }}
                    class="ext-modal-prompt-btn"
                  >
                    <span>"${prompt}"</span>
                    <span style="
                      font-size:11px; font-weight:600;
                      color:var(--accent-2, #20d5bc);
                      flex-shrink:0; margin-left:12px;
                    ">${t("extensions.detail.sendToChat")} <span class="mcp-icon" style="font-size:12px;">${icons.arrowDown}</span></span>
                  </button>
                `,
              )}
            </div>
          `
          : nothing
      }

      <div class="ext-modal-divider" style="margin-top:16px"></div>

      <!-- Collapsible detail info -->
      <details style="margin-top:16px;">
        <summary class="ext-details-summary">${t("extensions.detail.info")}</summary>
        <div style="margin-top:10px; font-size:12px; color:var(--fg-secondary, #a0aec0); line-height:2;">
          <div>${t("extensions.detail.source")}: <span style="color:var(--fg);">${item.installMethod ?? (item.npmPackage ? "npm" : item.sourceUrl ? "source" : "—")} &middot; ${item.npmPackage || item.sourceUrl || item.serverId}</span></div>
          <div>${t("extensions.detail.category")}: <span style="color:var(--fg);">${t(`extensions.category.${item.category}` as never)}</span></div>
          <div>${t("extensions.detail.platform")}: <span style="color:var(--fg);">${item.platforms.join(" / ")}</span></div>
          <div>${t("extensions.detail.transport")}: <span style="color:var(--fg);">${item.installMethod === "sse" ? "SSE / StreamableHTTP" : "stdio"}</span></div>
          <div>${t("extensions.detail.toolCount")}: <span style="color:var(--fg);">${item.toolCount}</span></div>
          ${
            item.securityScore >= 60
              ? html`<div>${t("extensions.detail.securityAudit")}: <span style="color:${scoreColor};">${t("extensions.detail.auditPassed")} (${item.securityScore})</span></div>`
              : nothing
          }
        </div>
      </details>

      <!-- Collapsible tool list -->
      ${
        item.toolNames && item.toolNames.length > 0
          ? html`
            <details style="margin-top:12px;">
              <summary class="ext-details-summary">${t("extensions.detail.toolsList")} (${item.toolNames.length})</summary>
              <div style="
                margin-top:8px;
                font-size:11px;
                color:var(--fg-secondary, #a0aec0);
                line-height:1.8;
                word-break:break-all;
              ">
                ${item.toolNames.join(" \u00B7 ")}
              </div>
            </details>
          `
          : nothing
      }

      <div class="ext-modal-divider" style="margin-top:20px"></div>

      <!-- Footer install/uninstall/update buttons -->
      <div style="margin-top:20px; text-align:center; display:flex; justify-content:center; gap:12px;">
        ${
          item.installStatus === "installed"
            ? html`
              ${
                item.hasUpdate
                  ? html`
                    <button
                      @click=${() => {
                        onUpdate();
                        onClose();
                      }}
                      class="ext-pill-btn ext-pill-btn--primary"
                    ><span class="mcp-icon" style="font-size:12px;">${icons.arrowUp}</span> ${t("extensions.detail.updateNow" as never)}</button>
                  `
                  : html`
                    <button
                      @click=${onClose}
                      class="ext-pill-btn ext-pill-btn--accent"
                    ><span class="mcp-icon" style="font-size:12px;">${icons.check}</span> ${t("extensions.detail.installedManage")}</button>
                  `
              }
              <button
                @click=${() => {
                  void showConfirmModal({
                    title: t("extensions.detail.uninstall" as never),
                    message: t("extensions.detail.uninstallConfirm" as never).replace(
                      "{{name}}",
                      item.friendlyName,
                    ),
                    confirmText: t("extensions.detail.uninstall" as never),
                    danger: true,
                    icon: "⚠️",
                  }).then((ok) => {
                    if (ok) {
                      onUninstall();
                      onClose();
                    }
                  });
                }}
                class="ext-pill-btn ext-pill-btn--danger"
              >${t("extensions.detail.uninstall" as never)}</button>
            `
            : item.installStatus === "installing"
              ? html`
                <span class="ext-pill-btn ext-pill-btn--accent" style="pointer-events:none;">
                  <span class="ext-spinner ext-spinner--md"></span>
                  ${t("extensions.store.installing")}
                </span>
              `
              : item.installable === false
                ? html`
                  <div style="display:flex; gap:10px; align-items:center;">
                    <button
                      @click=${() => {
                        onConfigInstall();
                      }}
                      class="ext-pill-btn ext-pill-btn--warning"
                    >${t("extensions.store.manualConfig" as never)}</button>
                    ${
                      item.sourceUrl
                        ? html`
                      <a
                        href=${item.sourceUrl}
                        target="_blank"
                        rel="noopener"
                        style="
                          font-size:12px;
                          color:var(--muted-strong, #6b7d91);
                          text-decoration:underline;
                        "
                      >${t("extensions.store.viewSource" as never)} <span class="mcp-icon" style="font-size:12px;">${icons.link}</span></a>
                    `
                        : nothing
                    }
                  </div>
                `
                : item.requiresApiKey ||
                    (item.envRequired && item.envRequired.length > 0) ||
                    (item.envSchema && Object.keys(item.envSchema).length > 0)
                  ? html`
                    <button
                      @click=${() => {
                        onConfigInstall();
                      }}
                      class="ext-pill-btn ext-pill-btn--warning"
                    >${t("extensions.store.configAndInstall")}</button>
                  `
                  : html`
                    <button
                      @click=${onInstall}
                      class="ext-pill-btn ext-pill-btn--primary"
                    >${t("extensions.detail.installThis")}</button>
                  `
        }
      </div>
    </div>

  `;
}

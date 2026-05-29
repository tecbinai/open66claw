/**
 * extensions-card.ts
 * Single MCP capability card for the Extensions page.
 *
 * Design goal (from mcp-ux-design-beginner.md):
 *   - User-facing, not developer-facing
 *   - Show "what it can do" + "try saying" example
 *   - Status: ready (green), needs_config (yellow), paused/fixing (muted)
 *   - "needs_config" cards show a [Configure & Enable] button
 *   - "ready" cards show no action — capability just works
 *   - Whole card is clickable for better UX
 */

import { html, nothing, type TemplateResult } from "lit";
import type { McpCapability, McpCapabilityStatus } from "../app-view-state.js";
import { showConfirmModal } from "./confirm-modal.js";
import { t } from "../i18n/index.js";
import { icons } from "../icons.js";

export type ExtensionsCardProps = {
  capability: McpCapability;
  onConfigClick: (id: string) => void;
  onTrySay: (prompt: string) => void;
  onUninstall?: (id: string) => void;
  /** When set to this capability's id, button shows a loading spinner */
  enablingId?: string | null;
};

/* ── status visual helpers ───────────────────────────────────── */

const STATUS_DOT_COLORS: Record<McpCapabilityStatus, string> = {
  ready: "var(--ok, #34d399)",
  needs_config: "var(--warn, #fbbf24)",
  paused: "var(--muted, #94a3b8)",
  fixing: "var(--info, #60a5fa)",
  unavailable: "var(--danger, #f87171)",
};

const STATUS_BG: Record<McpCapabilityStatus, string> = {
  ready: "var(--ok-subtle, rgba(52,211,153,0.08))",
  needs_config: "var(--warn-subtle, rgba(251,191,36,0.08))",
  paused: "var(--muted-subtle, rgba(148,163,184,0.08))",
  fixing: "var(--info-subtle, rgba(96,165,250,0.08))",
  unavailable: "var(--danger-subtle, rgba(248,113,113,0.08))",
};

function statusLabel(status: McpCapabilityStatus): string {
  switch (status) {
    case "ready":
      return t("extensions.status.ready");
    case "needs_config":
      return t("extensions.status.needsConfig");
    case "paused":
      return t("extensions.status.paused");
    case "fixing":
      return t("extensions.status.fixing");
    case "unavailable":
      return t("extensions.status.unavailable");
  }
}

/* ── main render ─────────────────────────────────────────────── */

export function renderExtensionsCard(props: ExtensionsCardProps): TemplateResult {
  const { capability: cap, onConfigClick, onTrySay, onUninstall, enablingId } = props;
  const isEnabling = enablingId === cap.id;
  const dotColor = STATUS_DOT_COLORS[cap.status];
  const bgColor = STATUS_BG[cap.status];

  // Whole-card click: needs_config → config wizard, otherwise → try saying
  const handleCardClick = (e: Event) => {
    // Don't trigger if user clicked an actual button inside the card
    if ((e.target as HTMLElement).closest("button")) return;
    if (cap.status === "needs_config") {
      onConfigClick(cap.id);
    } else if (cap.examplePrompt) {
      onTrySay(cap.examplePrompt);
    }
  };

  return html`
    <div
      class="ext-glass-card"
      @click=${handleCardClick}
    >
      ${cap.isNew ? html`<span class="ext-new-badge">${t("extensions.newBadge")}</span>` : nothing}

      <!-- Header: name + status — compact -->
      <div class="ext-glass-card__header">
        <span class="ext-glass-card__name">${cap.friendlyName}</span>
        <span
          class="ext-status-pill"
          style="background:${bgColor}; color:${dotColor};"
        >
          <span class="ext-status-dot" style="background:${dotColor};${cap.status === "ready" ? "box-shadow:0 0 5px " + dotColor + ";" : ""}"></span>
          ${statusLabel(cap.status)}
        </span>
      </div>

      <!-- Description list — compact -->
      <div style="margin-bottom:10px; flex:1;">
        <div class="ext-glass-card__desc-label">
          ${t("extensions.canHelp")}
        </div>
        <ul class="ext-glass-card__desc-list">
          ${cap.description.map((d) => html`<li>${d}</li>`)}
        </ul>
      </div>

      <!-- Config needed hint — compact -->
      ${
        (cap.status === "needs_config" || cap.status === "unavailable") && cap.configNeeded
          ? html`
            <div class="ext-config-hint">
              ${t("mcpConfig.needKey")}:
              <strong style="color:var(--warn, #fbbf24);">${cap.configNeeded}</strong>
            </div>
          `
          : nothing
      }

      <!-- Footer: action buttons + "try saying" — stacked layout -->
      <div class="ext-glass-card__footer">
        <!-- Action buttons row -->
        <div class="ext-glass-card__actions">
          ${
            cap.status === "needs_config" || isEnabling
              ? html`
                <button
                  class="ext-pill-btn ext-pill-btn--warning"
                  @click=${() => {
                    if (!isEnabling) onConfigClick(cap.id);
                  }}
                  ?disabled=${isEnabling}
                >
                  ${
                    isEnabling
                      ? html`
                          <span
                            class="ext-spinner ext-spinner--md"
                            style="border-color: rgba(0, 0, 0, 0.3); border-top-color: #000"
                          ></span>
                        `
                      : nothing
                  }
                  ${isEnabling ? t("extensions.status.enabling" as never) : t("extensions.configAndEnable")}
                </button>
              `
              : nothing
          }
          ${
            !cap.isBuiltin && onUninstall
              ? html`
                <button
                  class="ext-pill-btn ext-pill-btn--danger ext-pill-btn--sm"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    void showConfirmModal({
                      title: t("extensions.uninstall" as never),
                      message: t("extensions.detail.uninstallConfirm" as never).replace(
                        "{{name}}",
                        cap.friendlyName,
                      ),
                      confirmText: t("extensions.uninstall" as never),
                      danger: true,
                      icon: "⚠️",
                    }).then((ok) => {
                      if (ok) onUninstall(cap.id);
                    });
                  }}
                >${t("extensions.uninstall" as never)}</button>
              `
              : nothing
          }
        </div>

        <!-- Try-say suggestion — always below buttons, full width, left aligned -->
        ${(() => {
          const prompt =
            cap.examplePrompt ||
            t("extensions.trySayFallback" as never).replace("{{name}}", cap.friendlyName);
          return html`
            <button
              class="ext-pill-btn ext-pill-btn--try-say"
              @click=${() => onTrySay(prompt)}
              title="${prompt}"
            >
              <span class="mcp-icon" style="font-size:13px;">${icons.messageSquare}</span>
              <span style="font-size:11px; color:var(--muted-strong, #6b7d91); flex-shrink:0;">${t("extensions.trySayBtn" as never)}</span>
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">"${prompt}"</span>
            </button>
          `;
        })()}
      </div>
    </div>
  `;
}

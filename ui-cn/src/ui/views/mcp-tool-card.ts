/**
 * mcp-tool-card.ts
 * Simplified tool-call card for MCP invocations in the Chat view.
 *
 * Design goal (mcp-ux-design-beginner.md §5 / §10):
 *   - Show ONE human-readable sentence: "Queried Beijing weather"
 *   - Show duration on the right: "0.8s"
 *   - No tool ID, no JSON params, no raw return value
 *   - Optional expand (Level 2) for curious users
 *   - Loading state with spinner + text ("Querying weather...")
 */

import { html, nothing, type TemplateResult } from "lit";
import { t } from "../i18n/index.js";

export type McpToolCardProps = {
  /** Human-readable description, e.g. "查询了北京的天气" */
  description: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Current state */
  status: "loading" | "done" | "error";
  /** Whether the detail panel is expanded */
  expanded: boolean;
  /** Toggle expand */
  onToggle: () => void;
  /** Optional detail for Level-2 expansion */
  detail?: {
    capabilityName: string;
    action: string;
  };
};

export function renderMcpToolCard(props: McpToolCardProps): TemplateResult {
  const { description, durationMs, status, expanded, onToggle, detail } = props;

  if (status === "loading") {
    return html`
      <div
        style="
          display:flex;
          align-items:center;
          gap:8px;
          padding:8px 14px;
          border-radius:8px;
          background:var(--card);
          border:1px solid var(--border);
          font-size:12px;
          color:var(--muted-strong, #6b7d91);
          animation: mcpCardPulse 1.5s ease-in-out infinite;
        "
      >
        <span class="mcp-spinner" style="
          width:12px; height:12px;
          border:2px solid var(--accent-2, #20d5bc);
          border-top-color:transparent;
          border-radius:50%;
          animation: mcpSpin 0.8s linear infinite;
          flex-shrink:0;
        "></span>
        <span>${description}</span>
      </div>
      <style>
        @keyframes mcpSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes mcpCardPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      </style>
    `;
  }

  const durationLabel =
    durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`;

  // done / error
  const borderColor = status === "error" ? "rgba(248,113,113,0.2)" : "var(--border)";

  return html`
    <div
      style="
        border-radius:8px;
        background:var(--card);
        border:1px solid ${borderColor};
        overflow:hidden;
        font-size:12px;
      "
    >
      <!-- Compact row -->
      <button
        @click=${onToggle}
        style="
          all:unset;
          cursor:pointer;
          display:flex;
          align-items:center;
          justify-content:space-between;
          width:100%;
          box-sizing:border-box;
          padding:8px 14px;
          color:var(--muted-strong, #6b7d91);
          user-select:none;
        "
      >
        <span style="display:flex; align-items:center; gap:6px;">
          ${
            status === "error"
              ? html`
                  <span style="color: #f87171">!</span>
                `
              : html`
                  <span style="color: #34d399">&#10003;</span>
                `
          }
          <span>${description}</span>
        </span>
        <span style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
          <span style="font-size:11px; opacity:0.7;">${durationLabel}</span>
          ${
            detail
              ? html`<span style="font-size:9px; opacity:0.5;">${expanded ? "▾" : "▸"}</span>`
              : nothing
          }
        </span>
      </button>

      <!-- Expanded detail (Level 2) -->
      ${
        expanded && detail
          ? html`
            <div
              style="
                padding:8px 14px 10px;
                border-top:1px solid var(--border);
                font-size:11px;
                color:var(--muted-strong, #6b7d91);
                line-height:1.6;
                animation: mcpDetailIn 150ms ease both;
              "
            >
              <div>${t("mcpChat.used")} <strong style="color:var(--fg);">${detail.capabilityName}</strong></div>
              <div>${detail.action}</div>
            </div>
          `
          : nothing
      }
    </div>
    <style>
      @keyframes mcpDetailIn {
        from { opacity:0; max-height:0; }
        to   { opacity:1; max-height:80px; }
      }
    </style>
  `;
}

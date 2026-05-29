import { html, nothing } from "lit";
import { icons } from "../icons";
import { formatToolDetail, resolveToolDisplay } from "../tool-display";
import type { ToolCard } from "../types/chat-types";
import { TOOL_INLINE_THRESHOLD } from "./constants";
import { renderFileWritePending, renderFileWriteInterrupted } from "./file-write-card";
import { renderImageGenPending, renderImageGenInterrupted } from "./image-gen-result";
import { extractTextCached } from "./message-extract";
import { isToolResultMessage } from "./message-normalizer";
import { formatToolOutputForSidebar, getTruncatedPreview, isErrorOutput } from "./tool-helpers";
import { renderVideoGenPending, renderVideoGenInterrupted } from "./video-gen-result";

export function extractToolCards(message: unknown): ToolCard[] {
  const m = message as Record<string, unknown>;
  const content = normalizeContent(m.content);
  const cards: ToolCard[] = [];

  for (const item of content) {
    const kind = String(item.type ?? "").toLowerCase();
    const isToolCall =
      ["toolcall", "tool_call", "tooluse", "tool_use"].includes(kind) ||
      (typeof item.name === "string" && item.arguments != null);
    if (isToolCall) {
      cards.push({
        kind: "call",
        name: (item.name as string) ?? "tool",
        args: coerceArgs(item.arguments ?? item.args),
      });
    }
  }

  for (const item of content) {
    const kind = String(item.type ?? "").toLowerCase();
    if (kind !== "toolresult" && kind !== "tool_result") continue;
    const text = extractToolText(item);
    const name = typeof item.name === "string" ? item.name : "tool";
    cards.push({ kind: "result", name, text });
  }

  if (isToolResultMessage(message) && !cards.some((card) => card.kind === "result")) {
    const name =
      (typeof m.toolName === "string" && m.toolName) ||
      (typeof m.tool_name === "string" && m.tool_name) ||
      "tool";
    const text = extractTextCached(message) ?? undefined;
    cards.push({ kind: "result", name, text });
  }

  // Mark call cards as pending when no matching result exists yet (tool still executing).
  // Skip if the message is tagged as resolved (tool result exists in a separate history message).
  const hasResult = cards.some((card) => card.kind === "result");
  const isResolved = Boolean((m as Record<string, unknown>).__toolsResolved);
  const isStaleMedia = Boolean((m as Record<string, unknown>).__staleMediaTools);
  if (!hasResult && !isResolved) {
    for (const card of cards) {
      if (card.kind !== "call") continue;
      // Stale image_gen/video_gen calls (page closed mid-generation, no active run):
      // mark as interrupted instead of pending so the renderer shows a recovery UI.
      if (
        isStaleMedia &&
        (card.name === "image_gen" || card.name === "image_edit" || card.name === "video_gen")
      ) {
        card.interrupted = true;
      } else {
        card.pending = true;
      }
    }
  }

  return cards;
}

/**
 * Render a single tool card with collapse/expand behavior.
 * Default state: compact (icon + friendly label + summary + status badge).
 * Expanded: shows raw command detail and full output.
 */
export function renderToolCardSidebar(card: ToolCard, onOpenSidebar?: (content: string) => void) {
  const display = resolveToolDisplay({ name: card.name, args: card.args });
  const detail = formatToolDetail(display);
  const hasText = Boolean(card.text?.trim());
  const hasError = hasText && isErrorOutput(card.text!);
  const hasRawDetail = Boolean(display.rawDetail);

  // Determine if there is expandable content worth showing
  const hasExpandableContent = hasRawDetail || hasText;

  const handleToggle = hasExpandableContent
    ? (e: Event) => {
        const container = (e.currentTarget as HTMLElement).closest(".chat-tool-card");
        container?.classList.toggle("chat-tool-card--expanded");
      }
    : undefined;

  // Open sidebar for full output view
  const handleViewFull =
    onOpenSidebar && hasText
      ? (e: Event) => {
          e.stopPropagation();
          onOpenSidebar(formatToolOutputForSidebar(card.text!));
        }
      : undefined;

  const isPending = Boolean(card.pending);
  const isInterrupted = Boolean(card.interrupted);

  // OpenClawCN: Hide all resolved tool cards — users don't need to see
  // technical tool call details. Only keep pending (shimmer) and interrupted states.
  if (!isPending && !isInterrupted) {
    return nothing as unknown as ReturnType<typeof html>;
  }

  // OpenClawCN: Interrupted generation (page was closed mid-generation, loaded from history)
  if (isInterrupted && (card.name === "image_gen" || card.name === "image_edit")) {
    return renderImageGenInterrupted(card.args as Record<string, unknown> | undefined);
  }
  if (isInterrupted && card.name === "video_gen") {
    return renderVideoGenInterrupted(card.args as Record<string, unknown> | undefined);
  }
  // [CN-FEAT:file-card] Interrupted file write
  if (isInterrupted && (card.name === "write" || card.name === "edit")) {
    return renderFileWriteInterrupted(card.args as Record<string, unknown> | undefined);
  }

  // OpenClawCN: Specialized shimmer placeholder for image_gen/image_edit tool calls in progress
  if (isPending && (card.name === "image_gen" || card.name === "image_edit")) {
    return renderImageGenPending(card.args as Record<string, unknown> | undefined);
  }
  // OpenClawCN: Specialized shimmer placeholder for video_gen tool calls in progress
  if (isPending && card.name === "video_gen") {
    return renderVideoGenPending(card.args as Record<string, unknown> | undefined);
  }
  // [CN-FEAT:file-card] Specialized shimmer placeholder for write/edit tool calls in progress
  if (isPending && (card.name === "write" || card.name === "edit")) {
    return renderFileWritePending(card.args as Record<string, unknown> | undefined);
  }

  return html`
    <div
      class="chat-tool-card ${hasError ? "chat-tool-card--warning" : ""} ${isPending ? "chat-tool-card--pending" : ""} ${hasExpandableContent ? "chat-tool-card--has-expandable" : ""}"
    >
      <div
        class="chat-tool-card__header ${hasExpandableContent ? "chat-tool-card__header--clickable" : ""}"
        @click=${handleToggle ?? nothing}
        role=${hasExpandableContent ? "button" : nothing}
        tabindex=${hasExpandableContent ? "0" : nothing}
        @keydown=${
          hasExpandableContent
            ? (e: KeyboardEvent) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                handleToggle?.(e);
              }
            : nothing
        }
      >
        <div class="chat-tool-card__title">
          <span class="chat-tool-card__icon">${icons[display.icon]}</span>
          <span>${display.label}</span>
          ${
            isPending
              ? html`
                  <span class="chat-tool-card__badge chat-tool-card__badge--pending"
                    ><span class="chat-tool-card__spinner"></span
                  ></span>
                `
              : hasError
                ? html`<span class="chat-tool-card__badge chat-tool-card__badge--warning">${icons.alertCircle}</span>`
                : html`<span class="chat-tool-card__badge chat-tool-card__badge--ok">${icons.check}</span>`
          }
        </div>
        ${
          hasExpandableContent
            ? html`
                <span class="chat-tool-card__chevron">
                  <svg
                    class="chat-tool-card__chevron-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </span>
              `
            : nothing
        }
      </div>
      ${
        isPending
          ? html`<div class="chat-tool-card__summary chat-tool-card__summary--pending">${detail ? `${detail} · ` : ""}正在执行...</div>`
          : detail
            ? html`<div class="chat-tool-card__summary">${detail}</div>`
            : nothing
      }
      ${
        hasExpandableContent
          ? html`
            <div class="chat-tool-card__expandable">
              ${
                hasRawDetail
                  ? html`<div class="chat-tool-card__raw-detail mono">
                    ${display.rawDetail}
                  </div>`
                  : nothing
              }
              ${
                hasText
                  ? html`<div class="chat-tool-card__output mono">
                    ${getTruncatedPreview(card.text!)}
                    ${
                      handleViewFull
                        ? html`<button
                          class="chat-tool-card__view-btn"
                          @click=${handleViewFull}
                          type="button"
                        >
                          查看完整输出
                        </button>`
                        : nothing
                    }
                  </div>`
                  : nothing
              }
            </div>
          `
          : nothing
      }
    </div>
  `;
}

/**
 * Render a group of tool cards.
 * - 1-2 cards: render individually (each collapsible)
 * - 3+ cards: group with a summary header, only last card visible by default
 */
export function renderToolCardGroup(cards: ToolCard[], onOpenSidebar?: (content: string) => void) {
  // Only keep cards that have visible state (pending/interrupted).
  // Resolved cards are hidden by renderToolCardSidebar, so filter them
  // out here to avoid rendering empty group wrappers.
  const visibleCards = cards.filter((c) => Boolean(c.pending) || Boolean(c.interrupted));
  if (visibleCards.length === 0) return nothing;

  if (visibleCards.length <= 2) {
    return html`${visibleCards.map((card) => renderToolCardSidebar(card, onOpenSidebar))}`;
  }

  // 3+ cards: group them
  const lastCard = visibleCards[visibleCards.length - 1];
  const previousCards = visibleCards.slice(0, -1);

  const handleGroupToggle = (e: Event) => {
    const container = (e.currentTarget as HTMLElement).closest(".chat-tool-group");
    container?.classList.toggle("chat-tool-group--expanded");
  };

  return html`
    <div class="chat-tool-group">
      <div
        class="chat-tool-group__header"
        @click=${handleGroupToggle}
        role="button"
        tabindex="0"
        @keydown=${(e: KeyboardEvent) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          handleGroupToggle(e);
        }}
      >
        <span class="chat-tool-group__icon">${icons.wrench}</span>
        <span class="chat-tool-group__count">
          ${visibleCards.length} 步操作进行中
        </span>
        <span class="chat-tool-group__chevron">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </div>
      <div class="chat-tool-group__collapsed-cards">
        ${previousCards.map((card) => renderToolCardSidebar(card, onOpenSidebar))}
      </div>
      <div class="chat-tool-group__last-card">
        ${renderToolCardSidebar(lastCard, onOpenSidebar)}
      </div>
    </div>
  `;
}

function normalizeContent(content: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) return [];
  return content.filter(Boolean) as Array<Record<string, unknown>>;
}

function coerceArgs(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function extractToolText(item: Record<string, unknown>): string | undefined {
  if (typeof item.text === "string") return item.text;
  if (typeof item.content === "string") return item.content;
  return undefined;
}

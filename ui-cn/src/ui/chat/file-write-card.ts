/**
 * File Write Card Renderer — renders inline file cards in chat when agents write files.
 *
 * Handles:
 *   - Compact card with filename, path, size, code preview
 *   - Shimmer placeholder during write
 *   - Interrupted placeholder
 *   - Copy content to clipboard
 *
 * Follows the same injection pattern as image-gen-result.ts:
 *   toolResult hidden → data extracted → injected into assistant message → rendered outside bubble
 */

import { html, nothing, type TemplateResult } from "lit";
import { tMaybe } from "../i18n/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileWriteDetails {
  /** Full file path from tool args */
  path: string;
  /** Basename extracted from path */
  filename: string;
  /** File content (from tool args) */
  content?: string;
  /** Byte size estimate */
  size?: number;
  /** Detected language from file extension */
  language?: string;
  /** Write status */
  status?: "created" | "updated" | "error";
  /** Error message if failed */
  error?: string;
}

// Marker for embedded file write details in persisted messages
const FILE_WRITE_MARKER = "<!-- FILE_WRITE:";

// ---------------------------------------------------------------------------
// Extraction (from tool result messages)
// ---------------------------------------------------------------------------

/**
 * Extract file write details from a tool result message.
 * Returns null if the message is not a file write result.
 */
export function extractFileWriteDetails(message: unknown): FileWriteDetails | null {
  const m = message as Record<string, unknown>;

  // Check top-level details (live tool stream format)
  const details = m.details as Record<string, unknown> | undefined;
  if (
    details?.path &&
    (details.status === "success" || details.status === "created" || details.status === "updated")
  ) {
    return buildFileDetails(details);
  }

  // Check the tool name (from top-level toolName / tool_name)
  const toolName = String(m.toolName ?? m.tool_name ?? "").toLowerCase();
  const isFileWrite = toolName === "write" || toolName === "edit";

  // Check content blocks
  const content = m.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as Record<string, unknown>;
      const kind = String(b.type ?? "").toLowerCase();

      // Format 1: tool_result block with file details
      if (kind === "toolresult" || kind === "tool_result") {
        const blockName = String(b.name ?? "").toLowerCase();
        if (blockName === "write" || blockName === "edit" || isFileWrite) {
          const td = b.details as Record<string, unknown> | undefined;
          if (td?.path) {
            return buildFileDetails(td);
          }
          // If no details but we know it's a write tool, try to extract path from args
          const args = (b.args ?? b.arguments) as Record<string, unknown> | undefined;
          if (args?.path || args?.file_path) {
            return buildFileDetailsFromArgs(args);
          }
        }
      }

      // Format 2: embedded HTML comment in text block (persisted by PI SDK)
      if (kind === "text" && typeof b.text === "string") {
        const text = b.text as string;
        const idx = text.indexOf(FILE_WRITE_MARKER);
        if (idx >= 0) {
          const start = idx + FILE_WRITE_MARKER.length;
          const end = text.indexOf("-->", start);
          if (end > start) {
            try {
              const parsed = JSON.parse(text.slice(start, end));
              if (parsed?.path) {
                return buildFileDetails(parsed);
              }
            } catch {
              /* ignore parse error */
            }
          }
        }
      }
    }

    // Format 3: if we know this is a write tool from name, extract from args
    if (isFileWrite) {
      // Try to find the tool call args from the preceding assistant message
      // (This path is mainly for fallback when details are not available)
      const textBlock = content.find(
        (b: Record<string, unknown>) =>
          String(b.type ?? "").toLowerCase() === "text" && typeof b.text === "string",
      ) as Record<string, unknown> | undefined;
      if (textBlock?.text) {
        const text = String(textBlock.text);
        // Common write tool result text patterns
        if (
          text.includes("successfully") ||
          text.includes("written") ||
          text.includes("saved") ||
          text.includes("created")
        ) {
          // Try to extract path from the text
          const pathMatch = text.match(/(?:path|file)[:\s]+["']?([^\s"']+)/i);
          if (pathMatch?.[1]) {
            return {
              path: pathMatch[1],
              filename: extractFilename(pathMatch[1]),
              language: detectLanguage(pathMatch[1]),
              status: "created",
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extract file write details from an assistant message's tool_use/tool_call blocks.
 * This extracts from the CALL side (args contain path + content).
 */
export function extractFileWriteFromToolCall(message: unknown): FileWriteDetails[] {
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (!Array.isArray(content)) return [];

  const results: FileWriteDetails[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as Record<string, unknown>;
    const kind = String(b.type ?? "").toLowerCase();
    if (!["toolcall", "tool_call", "tooluse", "tool_use"].includes(kind)) continue;
    const name = String(b.name ?? "").toLowerCase();
    if (name !== "write" && name !== "edit") continue;
    const args = coerceArgs(b.arguments ?? b.args);
    if (!args) continue;
    const filePath = String(args.path ?? args.file_path ?? "");
    if (!filePath) continue;
    results.push({
      path: filePath,
      filename: extractFilename(filePath),
      content: typeof args.content === "string" ? args.content : undefined,
      size: typeof args.content === "string" ? new Blob([args.content]).size : undefined,
      language: detectLanguage(filePath),
      status: name === "edit" ? "updated" : "created",
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Rendering — Result Card
// ---------------------------------------------------------------------------

export function renderFileWriteResult(details: FileWriteDetails): TemplateResult {
  if (details.error && !details.path) {
    return renderFileWriteError(details.error);
  }

  const preview = details.content ? truncatePreview(details.content, 5) : undefined;

  const sizeStr = details.size ? formatBytes(details.size) : "";
  const statusLabel =
    details.status === "updated"
      ? tMaybe("chat.fileCard.updated")
      : tMaybe("chat.fileCard.created");

  const handleCopy = (e: Event) => {
    e.stopPropagation();
    if (details.content) {
      navigator.clipboard?.writeText(details.content)?.catch(() => {});
    }
  };

  return html`
    <div class="file-write-card">
      <div class="file-write-card__header">
        <div class="file-write-card__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </div>
        <div class="file-write-card__info">
          <div class="file-write-card__filename">${details.filename}</div>
          <div class="file-write-card__path">${shortenPath(details.path)}</div>
          <div class="file-write-card__meta">
            ${statusLabel}${sizeStr ? ` · ${sizeStr}` : ""}
          </div>
        </div>
        <div class="file-write-card__actions">
          ${
            details.content
              ? html`<button
                class="file-write-card__action-btn"
                @click=${handleCopy}
                title="${tMaybe("chat.fileCard.copy")}"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="14" height="14" x="8" y="8" rx="2"/>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                </svg>
                ${tMaybe("chat.fileCard.copy")}
              </button>`
              : nothing
          }
        </div>
      </div>
      ${
        preview
          ? html`<div class="file-write-card__preview"><code>${preview}</code></div>`
          : nothing
      }
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Rendering — Pending Shimmer
// ---------------------------------------------------------------------------

export function renderFileWritePending(args?: Record<string, unknown>): TemplateResult {
  const filePath =
    typeof args?.path === "string"
      ? args.path
      : typeof args?.file_path === "string"
        ? args.file_path
        : "";
  const filename = filePath ? extractFilename(String(filePath)) : "";

  return html`
    <div class="media-gen-progress">
      <div class="media-gen-progress__icon media-gen-progress__icon--file">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div class="media-gen-progress__body">
        <div class="media-gen-progress__title">${tMaybe("chat.fileCard.writing")}</div>
        <div class="media-gen-progress__hint">${tMaybe("chat.fileCard.writingHint")}</div>
        ${filename ? html`<div class="media-gen-progress__prompt">${filename}</div>` : nothing}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Rendering — Interrupted
// ---------------------------------------------------------------------------

export function renderFileWriteInterrupted(args?: Record<string, unknown>): TemplateResult {
  const filePath =
    typeof args?.path === "string"
      ? args.path
      : typeof args?.file_path === "string"
        ? args.file_path
        : "";
  const filename = filePath ? extractFilename(String(filePath)) : "";

  return html`
    <div class="media-gen-progress media-gen-progress--interrupted">
      <div class="media-gen-progress__icon media-gen-progress__icon--interrupted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div class="media-gen-progress__body">
        <div class="media-gen-progress__title">${tMaybe("chat.fileCard.interrupted")}</div>
        ${filename ? html`<div class="media-gen-progress__prompt">${filename}</div>` : nothing}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Rendering — Error
// ---------------------------------------------------------------------------

function renderFileWriteError(error: string): TemplateResult {
  return html`
    <div class="media-gen-progress media-gen-progress--error">
      <div class="media-gen-progress__icon media-gen-progress__icon--interrupted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div class="media-gen-progress__body">
        <div class="media-gen-progress__title">${tMaybe("chat.fileCard.failed")}</div>
        <div class="media-gen-progress__prompt">${truncate(error, 100)}</div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFileDetails(data: Record<string, unknown>): FileWriteDetails {
  const filePath = String(data.path ?? data.file_path ?? "");
  return {
    path: filePath,
    filename: extractFilename(filePath),
    content: typeof data.content === "string" ? data.content : undefined,
    size:
      typeof data.size === "number"
        ? data.size
        : typeof data.content === "string"
          ? new Blob([data.content]).size
          : undefined,
    language: detectLanguage(filePath),
    status: data.status === "updated" ? "updated" : data.status === "error" ? "error" : "created",
    error: typeof data.error === "string" ? data.error : undefined,
  };
}

function buildFileDetailsFromArgs(args: Record<string, unknown>): FileWriteDetails {
  const filePath = String(args.path ?? args.file_path ?? "");
  return {
    path: filePath,
    filename: extractFilename(filePath),
    content: typeof args.content === "string" ? args.content : undefined,
    size: typeof args.content === "string" ? new Blob([args.content]).size : undefined,
    language: detectLanguage(filePath),
    status: "created",
  };
}

function coerceArgs(raw: unknown): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return undefined;
}

function extractFilename(filePath: string): string {
  // Handle both forward and backslash paths
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || filePath;
}

function shortenPath(filePath: string): string {
  // Normalize and shorten workspace paths
  const normalized = filePath.replace(/\\/g, "/");
  const wsIdx = normalized.indexOf("/workspace/");
  if (wsIdx >= 0) return normalized.slice(wsIdx + 1); // "workspace/..."
  // Show last 3 segments
  const parts = normalized.split("/");
  if (parts.length > 3) return ".../" + parts.slice(-3).join("/");
  return normalized;
}

const LANG_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  md: "markdown",
  json: "json",
  csv: "csv",
  html: "html",
  css: "css",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  sql: "sql",
  rs: "rust",
  go: "go",
  java: "java",
};

function detectLanguage(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return ext ? LANG_MAP[ext] : undefined;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function truncatePreview(content: string, maxLines: number): string {
  const MAX_CHARS = 2000;
  let result = content;
  // Truncate by lines first
  const lines = result.split("\n");
  if (lines.length > maxLines) {
    result = lines.slice(0, maxLines).join("\n") + "\n...";
  }
  // Then truncate by character count to prevent huge single-line files
  if (result.length > MAX_CHARS) {
    result = result.slice(0, MAX_CHARS) + "...";
  }
  return result;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

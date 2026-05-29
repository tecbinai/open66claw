/**
 * Video Generation Result Renderer — renders AI-generated videos inline in chat.
 *
 * Handles:
 *   - Video player with native controls
 *   - Shimmer placeholder during generation
 *   - Expired video placeholder with regenerate
 *   - Error state
 *   - Download + regenerate actions
 *
 * CN-only module.
 */

import { html, nothing, type TemplateResult } from "lit";
import { tMaybe } from "../i18n/index.js";
import { icons } from "../icons";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoGenDetails {
  videoUrl?: string;
  coverImageUrl?: string;
  prompt?: string;
  model?: string;
  provider?: string;
  size?: string;
  durationSeconds?: number;
  error?: string;
  videoAvailable?: boolean;
  mediaType?: string;
  /** [CN-FEAT:media-sqlite] SQLite media asset ID for querying via media.details API. */
  mediaId?: string | null;
}

// ---------------------------------------------------------------------------
// Shimmer Placeholder (tool call pending)
// ---------------------------------------------------------------------------

export function renderVideoGenPending(args?: Record<string, unknown>): TemplateResult {
  const prompt = typeof args?.prompt === "string" ? (args.prompt as string) : "";

  return html`
    <div class="media-gen-progress">
      <div class="media-gen-progress__icon media-gen-progress__icon--video">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect width="18" height="18" x="3" y="3" rx="2"/>
          <path d="m10 8 6 4-6 4Z"/>
        </svg>
      </div>
      <div class="media-gen-progress__body">
        <div class="media-gen-progress__title">${tMaybe("chat.videoGen.generating")}</div>
        <div class="media-gen-progress__hint">这一过程可能需要 1-2 分钟</div>
        ${
          prompt
            ? html`<div class="media-gen-progress__prompt">${truncate(prompt, 80)}</div>`
            : nothing
        }
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Generated Video Result
// ---------------------------------------------------------------------------

export function renderVideoGenResult(details: VideoGenDetails): TemplateResult {
  if (details.error && !details.videoUrl) {
    return renderVideoGenError(details.error, details.prompt);
  }

  const videoUrl = details.videoUrl;
  if (!videoUrl || !isSafeVideoUrl(videoUrl)) return nothing as unknown as TemplateResult;

  // Check if video is available (for history rehydration)
  if (details.videoAvailable === false) {
    return renderExpiredVideo(details);
  }

  const modelDisplay = details.model?.split("/").pop() ?? details.provider ?? "";
  const sizeDisplay = details.size ?? "";
  const durationDisplay = details.durationSeconds ? `${details.durationSeconds}s` : "";

  return html`
    <div class="video-gen-result">
      <div class="video-gen-player">
        <video
          controls
          preload="metadata"
          ${details.coverImageUrl ? html`poster=${details.coverImageUrl}` : nothing}
        >
          <source src=${videoUrl} type="video/mp4" />
        </video>
        <div class="video-gen-overlay">
          <div class="video-gen-overlay-actions">
            <button
              class="image-gen-overlay-btn"
              title="${tMaybe("chat.videoGen.regenerate")}"
              @click=${(e: Event) => {
                e.stopPropagation();
                regenerateVideo(details.prompt ?? "");
              }}
            >
              ${icons.refreshCw}
            </button>
            <button
              class="image-gen-overlay-btn"
              title="${tMaybe("chat.videoGen.download")}"
              @click=${(e: Event) => {
                e.stopPropagation();
                downloadVideo(details.videoUrl!, details.prompt);
              }}
            >
              ${icons.download}
            </button>
          </div>
        </div>
      </div>
      ${renderMeta({ modelDisplay, sizeDisplay, durationDisplay })}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Meta Info Line
// ---------------------------------------------------------------------------

function renderMeta(meta: {
  modelDisplay: string;
  sizeDisplay: string;
  durationDisplay: string;
}): TemplateResult {
  const parts = [meta.modelDisplay, meta.sizeDisplay, meta.durationDisplay].filter(Boolean);
  if (parts.length === 0) return nothing as unknown as TemplateResult;

  return html`
    <div class="image-gen-result-meta">
      ${parts.map((part) => html`<span class="image-gen-meta-item">${part}</span>`)}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Action Buttons
// ---------------------------------------------------------------------------

function renderActions(details: VideoGenDetails): TemplateResult {
  if (!details.videoUrl) return nothing as unknown as TemplateResult;

  return html`
    <div class="image-gen-result-actions">
      <button
        class="image-gen-action image-gen-action--primary"
        title="${tMaybe("chat.videoGen.download")}"
        @click=${() => downloadVideo(details.videoUrl!, details.prompt)}
      >
        ${icons.download}
        <span>${tMaybe("chat.videoGen.download")}</span>
      </button>
      <button
        class="image-gen-action"
        title="${tMaybe("chat.videoGen.regenerate")}"
        @click=${() => regenerateVideo(details.prompt ?? "")}
      >
        ${icons.refreshCw}
        <span>${tMaybe("chat.videoGen.regenerate")}</span>
      </button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Error State
// ---------------------------------------------------------------------------

function renderVideoGenError(error: string, prompt?: string): TemplateResult {
  return html`
    <div class="image-gen-error">
      <div class="image-gen-error-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
        </svg>
      </div>
      <div class="image-gen-error-text">
        <span class="image-gen-error-title">${tMaybe("chat.videoGen.failed")}</span>
        <span class="image-gen-error-detail">${error}</span>
      </div>
      ${
        prompt
          ? html`<button
            class="image-gen-action"
            @click=${() => regenerateVideo(prompt)}
          >
            ${icons.refreshCw}
            <span>${tMaybe("chat.videoGen.retry")}</span>
          </button>`
          : nothing
      }
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Expired Video Placeholder (history)
// ---------------------------------------------------------------------------

function renderExpiredVideo(details: VideoGenDetails): TemplateResult {
  return html`
    <div class="media-gen-progress media-gen-progress--interrupted">
      <div class="media-gen-progress__icon media-gen-progress__icon--interrupted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect width="18" height="18" x="3" y="3" rx="2"/>
          <path d="m10 8 6 4-6 4Z"/>
        </svg>
      </div>
      <div class="media-gen-progress__body">
        <div class="media-gen-progress__title">${tMaybe("chat.videoGen.expired")}</div>
        ${
          details.prompt
            ? html`<div class="media-gen-progress__prompt">"${truncate(details.prompt, 60)}"</div>`
            : nothing
        }
        ${
          details.prompt
            ? html`<button class="media-gen-progress__action" @click=${() => regenerateVideo(details.prompt!)}>
              ${icons.refreshCw}
              <span>${tMaybe("chat.videoGen.regenerate")}</span>
            </button>`
            : nothing
        }
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Interrupted Video Placeholder (page closed mid-generation)
// ---------------------------------------------------------------------------

export function renderVideoGenInterrupted(args?: Record<string, unknown>): TemplateResult {
  const prompt = typeof args?.prompt === "string" ? (args.prompt as string) : undefined;
  return html`
    <div class="media-gen-progress media-gen-progress--interrupted">
      <div class="media-gen-progress__icon media-gen-progress__icon--interrupted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect width="18" height="18" x="3" y="3" rx="2"/>
          <path d="m10 8 6 4-6 4Z"/>
        </svg>
      </div>
      <div class="media-gen-progress__body">
        <div class="media-gen-progress__title">${tMaybe("chat.videoGen.interrupted")}</div>
        ${
          prompt
            ? html`<div class="media-gen-progress__prompt">"${truncate(prompt, 60)}"</div>`
            : nothing
        }
        ${
          prompt
            ? html`<button class="media-gen-progress__action" @click=${() => regenerateVideo(prompt)}>
              ${icons.refreshCw}
              <span>${tMaybe("chat.videoGen.regenerate")}</span>
            </button>`
            : nothing
        }
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

/** Only allow safe URL schemes for video rendering. */
function isSafeVideoUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://") || url.startsWith("/api/media/");
}

async function downloadVideo(url: string, prompt?: string): Promise<void> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    const safeName = (prompt ?? "video").slice(0, 40).replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, "_");
    a.download = `${safeName}_${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error("Failed to download video:", err);
  }
}

function regenerateVideo(prompt: string): void {
  const event = new CustomEvent("video-gen-regenerate", {
    bubbles: true,
    detail: { prompt },
  });
  document.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Integration: extract video_gen details from tool result
// ---------------------------------------------------------------------------

/**
 * Check if a tool card represents a video_gen result and extract its details.
 * Used by grouped-render.ts to decide whether to use specialized rendering.
 */
/** Marker prefix for embedded video gen metadata in tool result text blocks. */
const VIDEO_GEN_MARKER = "<!--OPENCLAWCN_VIDEO_GEN:";

export function extractVideoGenDetails(message: unknown): VideoGenDetails | null {
  const m = message as Record<string, unknown>;

  // Check top-level details
  const details = m.details as Record<string, unknown> | undefined;
  if (details?.videoUrl && details?.mediaType === "video") {
    return details as unknown as VideoGenDetails;
  }

  // Check content blocks for tool_result with video_gen details,
  // OR embedded HTML comment markers (persisted in session JSONL)
  const content = m.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as Record<string, unknown>;
      const kind = String(b.type ?? "").toLowerCase();

      // Format 2: tool_result block with details
      if (kind === "toolresult" || kind === "tool_result") {
        const td = b.details as Record<string, unknown> | undefined;
        if (td?.videoUrl && td?.mediaType === "video") {
          return td as unknown as VideoGenDetails;
        }
      }

      // Format 3: embedded HTML comment in text block (persisted by PI SDK)
      if (kind === "text" && typeof b.text === "string") {
        const text = b.text as string;
        const idx = text.indexOf(VIDEO_GEN_MARKER);
        if (idx >= 0) {
          const start = idx + VIDEO_GEN_MARKER.length;
          const end = text.indexOf("-->", start);
          if (end > start) {
            try {
              const parsed = JSON.parse(text.slice(start, end));
              if (parsed && parsed.videoUrl) {
                return parsed as VideoGenDetails;
              }
            } catch {
              /* ignore parse error */
            }
          }
        }
      }
    }
  }

  return null;
}

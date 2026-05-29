/**
 * Image Generation Result Renderer — renders AI-generated images inline in chat.
 *
 * Handles:
 *   - Single image with metadata + action buttons
 *   - Multi-image 2x2 grid layout
 *   - Shimmer placeholder during generation
 *   - Expired image placeholder with regenerate
 *   - Error state
 *
 * CN-only module.
 */

import { html, nothing, type TemplateResult } from "lit";
import { tMaybe } from "../i18n/index.js";
import { icons } from "../icons";
import { openImageLightbox } from "./image-lightbox";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageGenDetails {
  imageUrl?: string;
  imageUrls?: string[];
  imageCount?: number;
  prompt?: string;
  model?: string;
  provider?: string;
  size?: string;
  style?: string;
  durationMs?: number;
  revisedPrompt?: string;
  error?: string;
  imageAvailable?: boolean;
  /** [CN-FEAT:media-sqlite] SQLite media asset IDs for querying via media.details API. */
  mediaIds?: string[];
}

// ---------------------------------------------------------------------------
// Shimmer Placeholder (tool call pending)
// ---------------------------------------------------------------------------

export function renderImageGenPending(args?: Record<string, unknown>): TemplateResult {
  const prompt = typeof args?.prompt === "string" ? (args.prompt as string) : "";

  return html`
    <div class="media-gen-progress">
      <div class="media-gen-progress__icon media-gen-progress__icon--image">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
        </svg>
      </div>
      <div class="media-gen-progress__body">
        <div class="media-gen-progress__title">${tMaybe("chat.imageGen.generating")}</div>
        <div class="media-gen-progress__hint">通常需要 5-15 秒</div>
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
// Generated Image Result
// ---------------------------------------------------------------------------

export function renderImageGenResult(details: ImageGenDetails): TemplateResult {
  if (details.error && !details.imageUrl) {
    return renderImageGenError(details.error, details.prompt);
  }

  const rawUrls = details.imageUrls ?? (details.imageUrl ? [details.imageUrl] : []);
  const urls = rawUrls.filter(isSafeImageUrl);
  if (urls.length === 0) return nothing as unknown as TemplateResult;

  // Check if images are available (for history rehydration)
  if (details.imageAvailable === false) {
    return renderExpiredImage(details);
  }

  const modelDisplay = details.model?.split("/").pop() ?? details.provider ?? "";
  const sizeDisplay = details.size ?? "";
  const durationDisplay = details.durationMs ? `${(details.durationMs / 1000).toFixed(1)}s` : "";

  if (urls.length === 1) {
    return renderSingleImage(urls[0]!, { modelDisplay, sizeDisplay, durationDisplay, details });
  }

  return renderMultiImage(urls, { modelDisplay, sizeDisplay, durationDisplay, details });
}

// ---------------------------------------------------------------------------
// Single Image
// ---------------------------------------------------------------------------

function renderSingleImage(
  url: string,
  meta: {
    modelDisplay: string;
    sizeDisplay: string;
    durationDisplay: string;
    details: ImageGenDetails;
  },
): TemplateResult {
  return html`
    <div class="image-gen-result">
      <div class="image-gen-result-image">
        <img
          src=${url}
          alt="AI generated image"
          class="chat-message-image chat-message-image--clickable"
          loading="eager"
          decoding="async"
          @click=${() => openImageLightbox(url)}
          @error=${handleImageLoadError}
        />
        <div class="image-gen-result-overlay">
          <div class="image-gen-overlay-actions">
            <button
              class="image-gen-overlay-btn"
              title="${tMaybe("chat.imageGen.download")}"
              @click=${(e: Event) => {
                e.stopPropagation();
                downloadImage(url, meta.details.prompt);
              }}
            >
              ${icons.download}
            </button>
            <button
              class="image-gen-overlay-btn"
              title="${tMaybe("chat.imageGen.regenerate")}"
              @click=${(e: Event) => {
                e.stopPropagation();
                regenerateImage(meta.details.prompt ?? "");
              }}
            >
              ${icons.refreshCw}
            </button>
          </div>
        </div>
      </div>
      ${renderMeta(meta)}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Multi-Image Grid
// ---------------------------------------------------------------------------

function renderMultiImage(
  urls: string[],
  meta: {
    modelDisplay: string;
    sizeDisplay: string;
    durationDisplay: string;
    details: ImageGenDetails;
  },
): TemplateResult {
  return html`
    <div class="image-gen-result">
      <div class="image-gen-grid image-gen-grid--${urls.length <= 2 ? "2" : "4"}">
        ${urls.map(
          (url, i) => html`
            <div class="image-gen-grid-item">
              <img
                src=${url}
                alt="AI generated image ${i + 1} of ${urls.length}"
                class="chat-message-image chat-message-image--clickable"
                loading="eager"
                decoding="async"
                @click=${() => openImageLightbox(url, urls)}
                @error=${handleImageLoadError}
              />
              <div class="image-gen-result-overlay">
                <div class="image-gen-overlay-actions">
                  <button
                    class="image-gen-overlay-btn"
                    title="${tMaybe("chat.imageGen.download")}"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      downloadImage(url, meta.details.prompt);
                    }}
                  >
                    ${icons.download}
                  </button>
                </div>
              </div>
            </div>
          `,
        )}
      </div>
      ${renderMeta(meta)}
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

function renderActions(details: ImageGenDetails): TemplateResult {
  const urls = details.imageUrls ?? (details.imageUrl ? [details.imageUrl] : []);
  const firstUrl = urls[0];
  if (!firstUrl) return nothing as unknown as TemplateResult;

  return html`
    <div class="image-gen-result-actions">
      <button
        class="image-gen-action image-gen-action--primary"
        title="${tMaybe("chat.imageGen.download")}"
        @click=${() => downloadImage(firstUrl, details.prompt)}
      >
        ${icons.download}
        <span>${tMaybe("chat.imageGen.download")}</span>
      </button>
      <button
        class="image-gen-action"
        title="${tMaybe("chat.imageGen.copy")}"
        @click=${(e: Event) => copyImageToClipboard(firstUrl, e.currentTarget as HTMLElement)}
      >
        ${icons.copy}
        <span>${tMaybe("chat.imageGen.copy")}</span>
      </button>
      <button
        class="image-gen-action"
        title="${tMaybe("chat.imageGen.regenerate")}"
        @click=${() => regenerateImage(details.prompt ?? "")}
      >
        ${icons.refreshCw}
        <span>${tMaybe("chat.imageGen.regenerate")}</span>
      </button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Error State
// ---------------------------------------------------------------------------

function renderImageGenError(error: string, prompt?: string): TemplateResult {
  return html`
    <div class="image-gen-error">
      <div class="image-gen-error-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>
        </svg>
      </div>
      <div class="image-gen-error-text">
        <span class="image-gen-error-title">${tMaybe("chat.imageGen.failed")}</span>
        <span class="image-gen-error-detail">${error}</span>
      </div>
      ${
        prompt
          ? html`<button
            class="image-gen-action"
            @click=${() => regenerateImage(prompt)}
          >
            ${icons.refreshCw}
            <span>${tMaybe("chat.imageGen.retry")}</span>
          </button>`
          : nothing
      }
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Expired Image Placeholder (history)
// ---------------------------------------------------------------------------

function renderExpiredImage(details: ImageGenDetails): TemplateResult {
  return html`
    <div class="media-gen-progress media-gen-progress--interrupted">
      <div class="media-gen-progress__icon media-gen-progress__icon--interrupted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
        </svg>
      </div>
      <div class="media-gen-progress__body">
        <div class="media-gen-progress__title">${tMaybe("chat.imageGen.expired")}</div>
        ${
          details.prompt
            ? html`<div class="media-gen-progress__prompt">"${truncate(details.prompt, 60)}"</div>`
            : nothing
        }
        ${
          details.prompt
            ? html`<button class="media-gen-progress__action" @click=${() => regenerateImage(details.prompt!)}>
              ${icons.refreshCw}
              <span>${tMaybe("chat.imageGen.regenerate")}</span>
            </button>`
            : nothing
        }
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Interrupted Image Placeholder (page closed mid-generation)
// ---------------------------------------------------------------------------

export function renderImageGenInterrupted(args?: Record<string, unknown>): TemplateResult {
  const prompt = typeof args?.prompt === "string" ? (args.prompt as string) : undefined;
  return html`
    <div class="media-gen-progress media-gen-progress--interrupted">
      <div class="media-gen-progress__icon media-gen-progress__icon--interrupted">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
        </svg>
      </div>
      <div class="media-gen-progress__body">
        <div class="media-gen-progress__title">${tMaybe("chat.imageGen.interrupted")}</div>
        ${
          prompt
            ? html`<div class="media-gen-progress__prompt">"${truncate(prompt, 60)}"</div>`
            : nothing
        }
        ${
          prompt
            ? html`<button class="media-gen-progress__action" @click=${() => regenerateImage(prompt)}>
              ${icons.refreshCw}
              <span>${tMaybe("chat.imageGen.regenerate")}</span>
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

function parseSizeToAspect(size: string): [number, number] {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (match) return [parseInt(match[1]!, 10), parseInt(match[2]!, 10)];
  return [1, 1];
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

/** Only allow safe URL schemes for image rendering. */
function isSafeImageUrl(url: string): boolean {
  return (
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("data:image/") ||
    url.startsWith("/api/media/")
  );
}

function handleImageLoadError(event: Event): void {
  const img = event.target as HTMLImageElement;
  if (img) {
    img.style.display = "none";
    const container = img.closest(".image-gen-result-image, .image-gen-grid-item");
    if (container) {
      (container as HTMLElement).classList.add("image-gen--load-failed");
    }
  }
}

async function downloadImage(url: string, prompt?: string): Promise<void> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    // Generate filename from prompt
    const safeName = (prompt ?? "image").slice(0, 40).replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, "_");
    a.download = `${safeName}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error("Failed to download image:", err);
  }
}

async function copyImageToClipboard(url: string, btn: HTMLElement): Promise<void> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    const textSpan = btn.querySelector("span");
    if (textSpan) {
      const orig = textSpan.textContent;
      textSpan.textContent = tMaybe("chat.imageGen.copied");
      btn.classList.add("image-gen-action--success");
      setTimeout(() => {
        textSpan.textContent = orig;
        btn.classList.remove("image-gen-action--success");
      }, 2000);
    }
  } catch (err) {
    console.error("Failed to copy image:", err);
  }
}

function regenerateImage(prompt: string): void {
  // Dispatch a custom event that the chat controller can listen to
  const event = new CustomEvent("image-gen-regenerate", {
    bubbles: true,
    detail: { prompt },
  });
  document.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Integration: extract image_gen details from tool result
// ---------------------------------------------------------------------------

/** Marker prefix for embedded image gen metadata in tool result text blocks. */
const IMAGE_GEN_MARKER = "<!--OPENCLAWCN_IMAGE_GEN:";

/**
 * Check if a tool card represents an image_gen result and extract its details.
 * Used by grouped-render.ts to decide whether to use specialized rendering.
 *
 * Supports three formats:
 *   1. Top-level `details` object (live tool stream)
 *   2. Content block with `type: tool_result` + `details` (older format)
 *   3. Embedded HTML comment in text block (persisted in session JSONL)
 */
export function extractImageGenDetails(message: unknown): ImageGenDetails | null {
  const m = message as Record<string, unknown>;

  // Check top-level details
  const details = m.details as Record<string, unknown> | undefined;
  if (details?.imageUrl || details?.imageUrls) {
    return details as unknown as ImageGenDetails;
  }

  // Check content blocks
  const content = m.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as Record<string, unknown>;
      const kind = String(b.type ?? "").toLowerCase();

      // Format 2: tool_result block with details
      if (kind === "toolresult" || kind === "tool_result") {
        const td = b.details as Record<string, unknown> | undefined;
        if (td?.imageUrl || td?.imageUrls) {
          return td as unknown as ImageGenDetails;
        }
      }

      // Format 3: embedded HTML comment in text block (persisted by PI SDK)
      if (kind === "text" && typeof b.text === "string") {
        const text = b.text as string;
        const idx = text.indexOf(IMAGE_GEN_MARKER);
        if (idx >= 0) {
          const start = idx + IMAGE_GEN_MARKER.length;
          const end = text.indexOf("-->", start);
          if (end > start) {
            try {
              const parsed = JSON.parse(text.slice(start, end));
              if (parsed && (parsed.imageUrl || parsed.imageUrls)) {
                return parsed as ImageGenDetails;
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

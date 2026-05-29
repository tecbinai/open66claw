/**
 * OpenClawCN: Compose Card Module
 *
 * 豆包/Gemini 风格的卡片式输入框组件。
 * 独立模块，方便将来与上游 OpenClaw 合并。
 *
 * 布局：
 * ┌──────────────────────────────────────────┐
 * │  [附件预览]                               │
 * │  textarea（全宽）                          │
 * │  ＋  ⊗深度思考           🎙️ / ⬆️ 发送    │  ← 内嵌工具栏
 * └──────────────────────────────────────────┘
 */
import { html, nothing, type TemplateResult } from "lit";
import { live } from "lit/directives/live.js";
import { t } from "../i18n/index.js";
import { icons } from "../icons";
import { detectTextDirection } from "../text-direction";
import type { ChatAttachment } from "../ui-types";
import { renderVolumeWaveform } from "./voice-waveform.js";

// ── Types ──────────────────────────────────────────────

export type ComposeCardProps = {
  draft: string;
  connected: boolean;
  sending: boolean;
  canAbort: boolean;
  hasStream: boolean;
  placeholder: string;
  /** Image attachments to preview inside the card */
  attachments: ChatAttachment[];

  // Callbacks
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAbort?: () => void;
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void;
  onPaste?: (e: ClipboardEvent) => void;

  // Voice
  voiceAvailable: boolean;
  /** True when actively recording (or requesting mic). */
  voiceRecording: boolean;
  /** True when transcribing (post-recording). */
  voiceProcessing: boolean;
  /** Click-toggle: click once to start, click again to stop.
   *  Pass `{ autoSend: true }` when stopping via mic button (should send immediately).
   */
  onVoiceToggle?: (opts?: { autoSend?: boolean }) => void;
  /** Fired when mic is tapped but ASR is not installed — navigates to setup. */
  onVoiceUnavailable?: () => void;

  /** Real-time volume level (0..1) from AnalyserNode, drives waveform bars. */
  volumeLevel?: number;

  // Voice mode (interactive voice loop)
  /** True when voice loop mode is active. */
  voiceMode?: boolean;
  /** Toggle voice loop mode (enter/exit interactive voice conversation). */
  onVoiceModeToggle?: () => void;

  // Tools dropdown
  /** Callback when a tool shortcut is selected from the dropdown. */
  onToolSelect?: (toolId: string) => void;

  // Image generation mode
  /** True when the compose card is in image generation mode. */
  imageGenMode?: boolean;

  // Screen share
  /** True when screen sharing is active (AI can see the screen). */
  screenShareActive?: boolean;
  /** Number of frames analyzed so far. */
  screenShareFrameCount?: number;
  /** Name of the vision model being used. */
  screenShareModelName?: string;
  /** Toggle screen sharing on/off. */
  onScreenShareToggle?: () => void;

  // Deep thinking
  /** True when deep thinking mode is active. */
  deepThinking?: boolean;
  /** Toggle deep thinking mode. */
  onDeepThinkToggle?: () => void;
};

// ── Tool shortcuts ────────────────────────────────────

const TOOL_SHORTCUTS = [
  { id: "copywriting", label: "写文案", icon: "penLine" },
  { id: "spreadsheet", label: "做表格", icon: "grid" },
  { id: "presentation", label: "做PPT", icon: "layers" },
  { id: "imagegen", label: "图片制作", icon: "image" },
  { id: "videogen", label: "视频制作", icon: "video" },
] as const;

// ── Constants ─────────────────────────────────────────

const MAX_ATTACHMENT_BYTES = 5_000_000; // 5 MB, matches server-side limit

// ── Helpers ────────────────────────────────────────────

/** Derive rendering category from MIME type. */
function categorizeFile(mime: string): "image" | "video" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

/** Check if a file is acceptable for attachment (blocks SVG for XSS defense). */
function isAcceptedFile(file: File): boolean {
  if (file.type === "image/svg+xml") return false;
  if (file.size > MAX_ATTACHMENT_BYTES) return false;
  return true;
}

/** Format byte count for display. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Check if text looks like an image reference (data URL or HTTP image URL). */
function isImageReference(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  const trimmed = text.trim();
  if (trimmed.startsWith("data:image/")) return isSafeImageDataUrl(trimmed);
  if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|bmp|avif)(\?.*)?$/i.test(trimmed)) return true;
  return false;
}

export function secureAttachmentId(): string {
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  return `att-${Date.now()}-${hex}`;
}

/**
 * Validate that a data URL is a safe raster image source (防 XSS).
 * SVG is intentionally excluded: SVG can contain embedded <script> tags,
 * onload handlers, and other active content. While <img> sandboxes SVG,
 * we use an explicit allowlist for defense-in-depth.
 */
function isSafeImageDataUrl(url: string): boolean {
  return (
    url.startsWith("data:image/png") ||
    url.startsWith("data:image/jpeg") ||
    url.startsWith("data:image/gif") ||
    url.startsWith("data:image/webp") ||
    url.startsWith("data:image/bmp")
  );
}

/** Check if an attachment is a video by mimeType. */
function isVideoAttachment(att: ChatAttachment): boolean {
  return att.mimeType.startsWith("video/");
}

// ── Attachment preview ────────────────────────────────

function renderAttachmentTile(att: ChatAttachment): TemplateResult {
  const cat = att.category ?? categorizeFile(att.mimeType);

  if (cat === "video") {
    return html`
      <div class="cc-attachment__img cc-attachment__video-thumb" title=${att.fileName ?? "video"}>
        <span style="font-size:20px">🎬</span>
        <span class="cc-attachment__label">${att.fileName ?? "video"}</span>
      </div>
    `;
  }

  if (cat === "image" && isSafeImageDataUrl(att.dataUrl)) {
    return html`
      <img
        src=${att.dataUrl}
        alt=${att.fileName ?? "attachment"}
        class="cc-attachment__img"
        loading="lazy"
        decoding="async"
      />
    `;
  }

  // Generic file thumbnail
  const ext = att.fileName?.split(".").pop()?.toUpperCase() ?? "";
  const icon = ext === "PDF" ? "📄" : ext === "ZIP" || ext === "RAR" || ext === "7Z" ? "📦" : "📎";
  return html`
    <div class="cc-attachment__img cc-attachment__file-thumb" title=${att.fileName ?? "file"}>
      <span style="font-size:18px">${icon}</span>
      <span class="cc-attachment__label">${att.fileName ?? (ext || "file")}</span>
      ${att.fileSize ? html`<span class="cc-attachment__size">${formatFileSize(att.fileSize)}</span>` : nothing}
    </div>
  `;
}

function renderAttachments(
  attachments: ChatAttachment[],
  onChange?: (next: ChatAttachment[]) => void,
): TemplateResult | typeof nothing {
  if (attachments.length === 0) return nothing;

  return html`
    <div class="cc-attachments">
      ${attachments.map(
        (att) => html`
          <div class="cc-attachment">
            ${renderAttachmentTile(att)}
            ${
              onChange
                ? html`
                  <button
                    class="cc-attachment__remove"
                    type="button"
                    aria-label="Remove"
                    @click=${() => {
                      onChange(attachments.filter((a) => a.id !== att.id));
                    }}
                  >
                    ${icons.x}
                  </button>
                `
                : nothing
            }
          </div>
        `,
      )}
    </div>
  `;
}

// ── File input handler ─────────────────────────────────

function handleFileSelect(
  e: Event,
  currentAttachments: ChatAttachment[],
  onChange?: (next: ChatAttachment[]) => void,
): void {
  if (!onChange) return;
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const acceptedFiles = Array.from(input.files).filter((f) => isAcceptedFile(f));
  if (acceptedFiles.length === 0) {
    input.value = "";
    return;
  }

  // Read all files, then batch-update once to avoid stale closure
  const readPromises = acceptedFiles.map(
    (file) =>
      new Promise<ChatAttachment | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            id: secureAttachmentId(),
            dataUrl: reader.result as string,
            mimeType: file.type || "application/octet-stream",
            fileName: file.name,
            fileSize: file.size,
            category: categorizeFile(file.type),
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      }),
  );
  Promise.all(readPromises).then((results) => {
    const newAtts = results.filter((a): a is ChatAttachment => a !== null);
    if (newAtts.length > 0) {
      onChange([...currentAttachments, ...newAtts]);
    }
  });
  input.value = "";
}

// ── Paste handler ─────────────────────────────────────

/** Read files from clipboard/drop into ChatAttachment array. */
function readFilesToAttachments(files: File[]): Promise<ChatAttachment[]> {
  const readPromises = files
    .filter((f) => isAcceptedFile(f))
    .map(
      (file) =>
        new Promise<ChatAttachment | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              id: secureAttachmentId(),
              dataUrl: reader.result as string,
              mimeType: file.type || "application/octet-stream",
              fileName: file.name,
              fileSize: file.size,
              category: categorizeFile(file.type),
            });
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        }),
    );
  return Promise.all(readPromises).then((r) => r.filter((a): a is ChatAttachment => a !== null));
}

/**
 * Paste handler for the compose card.
 * Supports: clipboard images, clipboard files, base64 data URLs, HTTP image URLs.
 * Exported so app-render.ts can wire it.
 */
export async function handleComposePaste(
  e: ClipboardEvent,
  currentAttachments: ChatAttachment[],
  onChange?: (next: ChatAttachment[]) => void,
): Promise<void> {
  if (!onChange) return;
  const items = e.clipboardData?.items;
  if (!items) return;

  // Collect file items and text
  const fileItems: DataTransferItem[] = [];
  let textContent = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "file") {
      fileItems.push(item);
    } else if (item.type === "text/plain" && !textContent) {
      textContent = await new Promise<string>((resolve) => item.getAsString(resolve));
    }
  }

  // If clipboard has files, handle them
  if (fileItems.length > 0) {
    e.preventDefault();
    const files = fileItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null);
    const newAtts = await readFilesToAttachments(files);
    if (newAtts.length > 0) {
      onChange([...currentAttachments, ...newAtts]);
    }
    return;
  }

  // No files — check if text is an image reference
  if (textContent && isImageReference(textContent)) {
    e.preventDefault();
    const trimmed = textContent.trim();

    // Base64 data URL
    if (trimmed.startsWith("data:image/") && isSafeImageDataUrl(trimmed)) {
      const mimeMatch = trimmed.match(/^data:(image\/[^;]+);base64,/);
      if (mimeMatch) {
        onChange([
          ...currentAttachments,
          {
            id: secureAttachmentId(),
            dataUrl: trimmed,
            mimeType: mimeMatch[1],
            category: "image",
          },
        ]);
      }
      return;
    }

    // HTTP(S) image URL — fetch and convert
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const response = await fetch(trimmed, { mode: "cors" });
        if (!response.ok) return;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = () => {
          onChange([
            ...currentAttachments,
            {
              id: secureAttachmentId(),
              dataUrl: reader.result as string,
              mimeType: blob.type,
              category: "image",
            },
          ]);
        };
        reader.readAsDataURL(blob);
      } catch {
        // Silently fail — user can try again
      }
      return;
    }
  }

  // Otherwise let default text paste behavior proceed
}

// ── Drop handler ──────────────────────────────────────

function handleComposeDrop(
  e: DragEvent,
  currentAttachments: ChatAttachment[],
  onChange?: (next: ChatAttachment[]) => void,
): void {
  if (!onChange) return;
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  void readFilesToAttachments(Array.from(files)).then((newAtts) => {
    if (newAtts.length > 0) {
      onChange([...currentAttachments, ...newAtts]);
    }
  });
}

// ── Tools dropdown ────────────────────────────────────

function renderToolsDropdown(onSelect?: (toolId: string) => void): TemplateResult | typeof nothing {
  if (!onSelect) return nothing;

  const openMenu = (triggerBtn: HTMLElement) => {
    // Remove any existing menu
    const existing = document.querySelector(".cc-tools-menu");
    if (existing) {
      existing.remove();
      return;
    }

    const rect = triggerBtn.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "cc-tools-menu cc-tools-menu--open";
    // Estimate menu height (5 items * ~36px + 12px padding)
    const estimatedHeight = TOOL_SHORTCUTS.length * 36 + 12;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openDown = spaceBelow >= estimatedHeight;

    Object.assign(menu.style, {
      position: "fixed",
      left: `${rect.left}px`,
      ...(openDown
        ? { top: `${rect.bottom + 8}px` }
        : { bottom: `${window.innerHeight - rect.top + 8}px` }),
    });

    let menuClosed = false;

    const closeMenu = () => {
      if (menuClosed) return;
      menuClosed = true;
      menu.remove();
      document.removeEventListener("click", closeOnClick);
    };

    const closeOnClick = (ev: Event) => {
      if (!menu.contains(ev.target as Node) && ev.target !== triggerBtn) {
        closeMenu();
      }
    };

    for (const tool of TOOL_SHORTCUTS) {
      const item = document.createElement("button");
      item.className = "cc-tools-menu__item";
      item.type = "button";
      item.innerHTML = `<span class="cc-tools-menu__icon">${
        tool.icon === "penLine"
          ? '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'
          : tool.icon === "grid"
            ? '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>'
            : tool.icon === "layers"
              ? '<svg viewBox="0 0 24 24"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.5-8.58 3.9a2 2 0 0 1-1.66 0L2.6 12.5"/><path d="m22 17-8.58 3.91a2 2 0 0 1-1.66 0L2.6 17"/></svg>'
              : tool.icon === "image"
                ? '<svg viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'
                : '<svg viewBox="0 0 24 24"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>'
      }</span><span>${tool.label}</span>`;
      item.addEventListener("click", (ev) => {
        ev.stopPropagation();
        closeMenu();
        onSelect(tool.id);
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);

    menu.addEventListener("mouseleave", () => closeMenu());

    requestAnimationFrame(() => {
      if (menuClosed) return;
      document.addEventListener("click", closeOnClick);
    });
  };

  return html`
    <button
      class="cc-tb-btn cc-tb-btn--tools"
      type="button"
      title="功能"
      aria-label="功能"
      @click=${(e: Event) => {
        e.stopPropagation();
        openMenu(e.currentTarget as HTMLElement);
      }}
    >
      ${icons.sparkles}
    </button>
  `;
}

// ── Main Render ────────────────────────────────────────

export function renderComposeCard(props: ComposeCardProps): TemplateResult {
  const isBusy = props.sending || props.hasStream;
  const hasContent = props.draft.trim().length > 0 || props.attachments.length > 0;
  // During screen share, allow sending even without text (screen frame is auto-injected)
  // Block sending while already busy (streaming/sending) to prevent double-send
  const canSend = props.connected && !isBusy && (hasContent || Boolean(props.screenShareActive));
  // During voice recording/processing, keep showing the mic button (with waveform)
  // instead of switching to the send arrow — even if partial ASR text is in the draft.
  const isVoiceActive = props.voiceRecording || props.voiceProcessing;
  const showSend = !isVoiceActive && (hasContent || isBusy || Boolean(props.screenShareActive));

  return html`
    <div
      class="cc-card ${props.imageGenMode ? "cc-card--imagegen" : ""}"
      @dragover=${(e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        (e.currentTarget as HTMLElement).classList.add("cc-card--drag-over");
      }}
      @dragleave=${(e: DragEvent) => {
        const ct = e.currentTarget as HTMLElement;
        const rt = e.relatedTarget as Node | null;
        if (!rt || !ct.contains(rt)) ct.classList.remove("cc-card--drag-over");
      }}
      @drop=${(e: DragEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.remove("cc-card--drag-over");
        handleComposeDrop(e, props.attachments, props.onAttachmentsChange);
      }}
    >
      <!-- Hidden file input (inside card so querySelector can find it) -->
      ${
        props.onAttachmentsChange
          ? html`
            <input
              type="file"
              class="cc-file-input"
              multiple
              style="display: none;"
              @change=${(e: Event) =>
                handleFileSelect(e, props.attachments, props.onAttachmentsChange)}
            />
          `
          : nothing
      }

      <!-- Attachment preview (inside card, above textarea) -->
      ${renderAttachments(props.attachments, props.onAttachmentsChange)}

      <!-- Screen share status bar -->
      ${
        props.screenShareActive
          ? html`
            <div class="cc-screen-share-bar">
              <span class="cc-screen-share-bar__dot"></span>
              <span class="cc-screen-share-bar__label">${t("screenShare.active")}</span>
              ${
                (props.screenShareFrameCount ?? 0) > 0
                  ? html`<span class="cc-screen-share-bar__stat">${t("screenShare.analyzed")} ${props.screenShareFrameCount}</span>`
                  : nothing
              }
              ${
                props.screenShareModelName
                  ? html`<span class="cc-screen-share-bar__stat">${props.screenShareModelName}</span>`
                  : nothing
              }
              <button
                class="cc-screen-share-bar__stop"
                type="button"
                @click=${() => props.onScreenShareToggle?.()}
              >
                ${t("screenShare.end")}
              </button>
            </div>
          `
          : nothing
      }

      <!-- Textarea -->
      <textarea
        class="cc-textarea"
        .value=${live(props.draft)}
        dir=${detectTextDirection(props.draft)}
        ?disabled=${!props.connected}
        placeholder=${props.placeholder}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key !== "Enter") return;
          if (e.isComposing || e.keyCode === 229) return;
          if (e.shiftKey) return;
          if (!props.connected) return;
          e.preventDefault();
          if (canSend) props.onSend();
        }}
        @input=${(e: Event) => {
          // If the user types while recording, stop recording so they can edit freely
          if (isVoiceActive && props.onVoiceToggle) {
            props.onVoiceToggle();
          }
          props.onDraftChange((e.target as HTMLTextAreaElement).value);
        }}
        @paste=${props.onPaste}
      ></textarea>

      <!-- Toolbar -->
      <div class="cc-toolbar">
        <div class="cc-toolbar__left">
          <!-- + Attach button -->
          ${
            props.onAttachmentsChange
              ? html`
                <button
                  class="cc-tb-btn"
                  type="button"
                  ?disabled=${!props.connected}
                  title=${t("chat.addAttachment")}
                  aria-label=${t("chat.addAttachment")}
                  @click=${(e: Event) => {
                    const card = (e.currentTarget as HTMLElement).closest(".cc-card");
                    const input = card?.querySelector<HTMLInputElement>(".cc-file-input");
                    input?.click();
                  }}
                >
                  ${icons.plus}
                </button>
              `
              : nothing
          }

          <!-- Deep thinking toggle -->
          <button
            class="cc-deep-think ${props.deepThinking ? "cc-deep-think--active" : ""}"
            type="button"
            title="深度思考"
            aria-label="深度思考"
            @click=${() => props.onDeepThinkToggle?.()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            <span>深度思考</span>
          </button>

          <!-- Tools dropdown (hidden, keep for future use) -->
          ${renderToolsDropdown(props.onToolSelect)}

          <!-- Screen share toggle (hidden, keep for future use) -->
          ${
            props.onScreenShareToggle
              ? html`
                <button
                  class="cc-tb-btn cc-tb-btn--screen-share ${props.screenShareActive ? "cc-tb-btn--screen-active" : ""}"
                  type="button"
                  ?disabled=${!props.connected}
                  title=${props.screenShareActive ? t("screenShare.stop") : t("screenShare.start")}
                  aria-label=${props.screenShareActive ? t("screenShare.stop") : t("screenShare.start")}
                  @click=${() => props.onScreenShareToggle?.()}
                >
                  ${icons.monitor}
                </button>
              `
              : nothing
          }


        </div>

        <div class="cc-toolbar__right">
          <!-- Stop button (only visible when streaming) -->
          ${
            isBusy && props.canAbort
              ? html`
                <button
                  class="cc-pill"
                  type="button"
                  @click=${props.onAbort}
                  title=${t("chat.stop")}
                  aria-label=${t("chat.stop")}
                >
                  ${icons.x}
                  <span>${t("chat.stop")}</span>
                </button>
              `
              : nothing
          }

          <!-- Voice mode (phone) button — interactive voice conversation loop (ASR→AI→TTS) -->
          ${
            props.onVoiceModeToggle
              ? html`
                <button
                  class="cc-voice-btn ${props.voiceMode ? "cc-voice-btn--recording" : ""}"
                  type="button"
                  @click=${() => props.onVoiceModeToggle?.()}
                  title=${props.voiceMode ? t("voice.voiceMode.stop") : t("voice.voiceMode.start")}
                  aria-label=${props.voiceMode ? t("voice.voiceMode.stop") : t("voice.voiceMode.start")}
                >
                  ${props.voiceMode ? icons.phoneOff : icons.phone}
                </button>
              `
              : nothing
          }

          <!-- Gemini-style: mic when empty, send when has content (hidden in voice mode) -->
          ${
            props.voiceMode
              ? nothing
              : showSend
                ? html`
                <button
                  class="cc-send ${canSend ? "" : "cc-send--disabled"}"
                  type="button"
                  ?disabled=${!canSend}
                  @click=${props.onSend}
                  title=${t("chat.send")}
                  aria-label=${t("chat.send")}
                >
                  ${icons.arrowUp}
                </button>
              `
                : props.voiceRecording || props.voiceProcessing
                  ? html`
                  <button
                    class="cc-voice-btn ${props.voiceRecording ? "cc-voice-btn--recording" : "cc-voice-btn--processing"}"
                    type="button"
                    ?disabled=${!props.connected || props.voiceProcessing}
                    @click=${() => props.onVoiceToggle?.()}
                    title=${props.voiceProcessing ? t("voice.processing") : t("voice.clickToStop")}
                    aria-label="Voice input"
                  >
                    ${props.voiceRecording ? renderVolumeWaveform(props.volumeLevel ?? 0) : icons.mic}
                  </button>
                `
                  : props.voiceAvailable && props.onVoiceToggle
                    ? html`
                    <button
                      class="cc-voice-btn"
                      type="button"
                      ?disabled=${!props.connected}
                      @click=${() => props.onVoiceToggle?.()}
                      title=${t("voice.clickToStart")}
                      aria-label="Voice input"
                    >
                      ${icons.mic}
                    </button>
                  `
                    : props.onVoiceUnavailable
                      ? html`
                      <button
                        class="cc-voice-btn"
                        type="button"
                        @click=${props.onVoiceUnavailable}
                        title=${t("voice.setupRequired")}
                        aria-label="Voice input setup"
                      >
                        ${icons.mic}
                      </button>
                    `
                      : html`
                      <button
                        class="cc-send cc-send--disabled"
                        type="button"
                        disabled
                        aria-label=${t("chat.send")}
                      >
                        ${icons.arrowUp}
                      </button>
                    `
          }
        </div>
      </div>
    </div>
  `;
}

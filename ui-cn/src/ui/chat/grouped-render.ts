import { html, nothing } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { AssistantIdentity } from "../assistant-identity";
import { brand } from "../brand";
import { t } from "../i18n/index.js";
import { toSanitizedMarkdownHtml } from "../markdown";
import type { MessageGroup } from "../types/chat-types";
import type { ChatQueueItem } from "../ui-types";
import { renderCopyAsMarkdownButton } from "./copy-as-markdown";
import { formatErrorHintFull, type FormattedError } from "./error-hints";
import { renderFileWriteResult, type FileWriteDetails } from "./file-write-card";
import {
  extractImageGenDetails,
  renderImageGenResult,
  renderImageGenPending,
} from "./image-gen-result";
import { openImageLightbox } from "./image-lightbox";
import {
  extractTextCached,
  extractThinkingCached,
  extractFreeModelNotification,
  formatReasoningMarkdown,
  type FreeModelNotification,
} from "./message-extract";
import { isToolResultMessage, normalizeRoleForGrouping } from "./message-normalizer";
import { extractToolCards, renderToolCardGroup } from "./tool-cards";
import { typewriterIndicator } from "./typewriter-indicator";
import { typewriterStream } from "./typewriter-stream";
import { extractVideoGenDetails, renderVideoGenResult } from "./video-gen-result";

// 思考过程折叠阈值（字符数）
const THINKING_COLLAPSE_THRESHOLD = 200;

// ============ 静默回复过滤 ============
// NO_REPLY 是系统内部标记，不应该显示给用户
const SILENT_REPLY_TOKEN = "NO_REPLY";

/**
 * 检查文本是否为静默回复（NO_REPLY）
 * 这些是系统内部操作的响应，不应该显示给用户
 */
function isSilentReplyText(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  // 完全匹配 NO_REPLY
  if (trimmed === SILENT_REPLY_TOKEN) return true;
  // 以 NO_REPLY 开头（可能后面跟着空格或标点）
  if (
    trimmed.startsWith(SILENT_REPLY_TOKEN) &&
    (trimmed.length === SILENT_REPLY_TOKEN.length ||
      /^\s|[.,!?;:]/.test(trimmed.charAt(SILENT_REPLY_TOKEN.length)))
  ) {
    return true;
  }
  // 以 NO_REPLY 结尾
  if (trimmed.endsWith(SILENT_REPLY_TOKEN)) return true;
  return false;
}

// ============ OpenClawCN 免费模型通知渲染 ============

/**
 * 渲染免费模型通知卡片
 * OpenClawCN 专属权益展示
 */
function renderFreeModelNotificationCard(notification: FreeModelNotification) {
  const iconMap = {
    started: "🎉",
    switched: "🔄",
    exhausted: "⚠️",
    fallback: "💳",
  };
  const icon = iconMap[notification.type] || "ℹ️";
  const colorClass = notification.type === "exhausted" ? "warning" : "success";

  return html`
    <div class="free-model-notification free-model-notification--${colorClass}">
      <div class="free-model-notification__icon">${icon}</div>
      <div class="free-model-notification__content">
        <div class="free-model-notification__badge">OpenClawCN 专属权益</div>
        <div class="free-model-notification__message">${notification.message}</div>
      </div>
    </div>
  `;
}

// ============ 性能优化：Markdown 渲染缓存 ============
// 使用 WeakMap 缓存已渲染的 Markdown HTML，避免重复转换
const markdownHtmlCache = new WeakMap<object, string>();
// 字符串内容到 HTML 的缓存（用于非对象消息）
const markdownStringCache = new Map<string, string>();
// 字符串缓存大小限制，防止内存泄漏
const MAX_STRING_CACHE_SIZE = 200;

/**
 * 获取缓存的 Markdown HTML，避免重复渲染
 * @param message 原始消息对象
 * @param markdown 提取的 markdown 文本
 */
function getCachedMarkdownHtml(message: unknown, markdown: string): string {
  // 尝试从对象缓存获取
  if (message && typeof message === "object") {
    const cached = markdownHtmlCache.get(message as object);
    if (cached !== undefined) {
      return cached;
    }
  }

  // 尝试从字符串缓存获取
  const stringCached = markdownStringCache.get(markdown);
  if (stringCached !== undefined) {
    return stringCached;
  }

  // 渲染并缓存
  const html = toSanitizedMarkdownHtml(markdown);

  // 存入对象缓存
  if (message && typeof message === "object") {
    markdownHtmlCache.set(message as object, html);
  }

  // 存入字符串缓存（控制大小）
  if (markdownStringCache.size >= MAX_STRING_CACHE_SIZE) {
    // 删除最早的条目
    const firstKey = markdownStringCache.keys().next().value;
    if (firstKey) markdownStringCache.delete(firstKey);
  }
  markdownStringCache.set(markdown, html);

  return html;
}

type ImageBlock = {
  url: string;
  alt?: string;
};

/**
 * Validate that a string looks like valid base64 image data.
 * Returns false for empty strings or obviously invalid data.
 */
function isValidBase64ImageData(data: string): boolean {
  // Must have some content (at least a few characters for a minimal image)
  if (!data || data.length < 20) return false;
  // If it's already a data URL, check if it has actual content after the header
  if (data.startsWith("data:")) {
    const commaIndex = data.indexOf(",");
    if (commaIndex === -1 || data.length - commaIndex < 20) return false;
    return true;
  }
  // For raw base64, check it contains valid base64 characters
  // and has reasonable length
  return /^[A-Za-z0-9+/]+=*$/.test(data.slice(0, 100));
}

/**
 * Validate that a URL is likely to be a valid image URL.
 */
function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  // Accept http(s) URLs, data URLs with content, and relative paths
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true;
  if (trimmed.startsWith("data:image/")) return trimmed.length > 30;
  if (trimmed.startsWith("/")) return true;
  return false;
}

function extractImages(message: unknown): ImageBlock[] {
  const m = message as Record<string, unknown>;
  const content = m.content;
  const images: ImageBlock[] = [];

  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as Record<string, unknown>;

      if (b.type === "image") {
        // Handle source object format (from sendChatMessage optimistic message)
        const source = b.source as Record<string, unknown> | undefined;
        if (source?.type === "base64" && typeof source.data === "string") {
          const data = source.data as string;
          // Validate base64 data before creating URL
          if (!isValidBase64ImageData(data)) continue;
          const mediaType = (source.media_type as string) || "image/png";
          // If data is already a data URL, use it directly
          const url = data.startsWith("data:") ? data : `data:${mediaType};base64,${data}`;
          images.push({ url });
        } else if (typeof b.data === "string" && typeof b.mimeType === "string") {
          // Handle pi-agent-core ImageContent format from backend history:
          // { type: "image", data: "raw-base64...", mimeType: "image/jpeg" }
          const data = b.data as string;
          if (!isValidBase64ImageData(data)) continue;
          const url = data.startsWith("data:") ? data : `data:${b.mimeType};base64,${data}`;
          images.push({ url });
        } else if (typeof b.url === "string" && isValidImageUrl(b.url)) {
          images.push({ url: b.url });
        }
      } else if (b.type === "image_url") {
        // OpenAI format
        const imageUrl = b.image_url as Record<string, unknown> | undefined;
        if (typeof imageUrl?.url === "string" && isValidImageUrl(imageUrl.url)) {
          images.push({ url: imageUrl.url });
        }
      } else if (b.type === "tool_result" || b.type === "toolresult") {
        // OpenClawCN: Extract images from tool results (e.g. image_gen tool)
        const details = b.details as Record<string, unknown> | undefined;
        if (typeof details?.imageUrl === "string" && isValidImageUrl(details.imageUrl)) {
          images.push({ url: details.imageUrl });
        }
      }
    }
  }

  // OpenClawCN: Also check top-level details for tool result messages
  const topDetails = (m as Record<string, unknown>).details as Record<string, unknown> | undefined;
  if (typeof topDetails?.imageUrl === "string" && isValidImageUrl(topDetails.imageUrl)) {
    images.push({ url: topDetails.imageUrl });
  }

  return images;
}

// ============ 等待指示器：分阶段渐进展示 + 打字机效果 ============

// 超时阈值（毫秒）- 超过此时间显示错误排查卡片
// OpenClawCN: 设为 90s，部分模型（如 doubao）首次响应可达 60-70s
const TIMEOUT_WARNING_MS = 90000;

/**
 * 等待阶段配置
 * 每个阶段在对应时间点开始，文案通过打字机效果逐字显示
 * style 控制文字颜色：normal=灰色, info=主题色, warning=橙色
 */
const WAITING_PHASES: ReadonlyArray<{
  startMs: number;
  text: string;
  style: "normal" | "info" | "warning";
}> = [
  { startMs: 0, text: "", style: "normal" },
  { startMs: 3000, text: "思考中", style: "normal" },
  { startMs: 8000, text: "正在组织回复...", style: "normal" },
  { startMs: 15000, text: "仍在等待 AI 响应...", style: "info" },
  { startMs: 30000, text: "部分模型首次响应较慢，请耐心等待", style: "warning" },
  { startMs: 45000, text: "还在处理中，请继续等待...", style: "warning" },
  { startMs: 60000, text: "模型响应时间过长，仍在等待中...", style: "warning" },
  { startMs: 75000, text: "如长时间无响应，建议检查模型配置", style: "warning" },
];

/** 根据已等待时间找到当前阶段 */
function getCurrentPhase(elapsedMs: number) {
  let phase = WAITING_PHASES[0];
  for (const p of WAITING_PHASES) {
    if (elapsedMs >= p.startMs) phase = p;
  }
  return phase;
}

/**
 * 渲染超时/错误提示卡片
 * 简洁提示：模型响应异常，请检查模型接口
 * 如果有 provider/model 信息，会显示错误来源
 */
function renderTimeoutHintCard(errorInfo: FormattedError | null) {
  const friendlyMessage = errorInfo?.friendlyMessage ?? "模型响应异常，请检查模型接口配置";
  const rawError = errorInfo?.rawError;
  const provider = errorInfo?.provider;
  const model = errorInfo?.model;
  const hasSource = provider || model;
  const sourceLabel = provider && model ? `${provider} / ${model}` : provider || model || "";

  return html`
    <div class="chat-error-hint-card hint-card-enter">
      <div class="chat-error-hint-card__header">
        <span class="chat-error-hint-card__icon">⚠️</span>
        <span class="chat-error-hint-card__title">
          ${typewriterIndicator(friendlyMessage, `err-${friendlyMessage.length}`, "tw--warning")}
        </span>
      </div>
      ${
        hasSource
          ? html`
            <div class="chat-error-hint-card__raw hint-raw-enter">
              <span class="chat-error-hint-card__raw-label">来源：</span>
              <span class="chat-error-hint-card__raw-text">${sourceLabel}</span>
            </div>
          `
          : nothing
      }
      ${
        rawError
          ? html`
            <div class="chat-error-hint-card__raw hint-raw-enter">
              <span class="chat-error-hint-card__raw-label">原始错误：</span>
              <span class="chat-error-hint-card__raw-text">${rawError}</span>
            </div>
          `
          : nothing
      }
    </div>
  `;
}

export function renderReadingIndicatorGroup(
  assistant?: AssistantIdentity,
  startedAt?: number | null,
  errorMessage?: string | null,
) {
  const elapsed = startedAt ? Date.now() - startedAt : 0;
  const elapsedSeconds = Math.floor(elapsed / 1000);
  const isTimeout = elapsed >= TIMEOUT_WARNING_MS;
  const errorInfo = errorMessage ? formatErrorHintFull(errorMessage) : null;

  // 当前等待阶段
  const phase = getCurrentPhase(elapsed);
  const twStyleCls =
    phase.style === "warning" ? "tw--warning" : phase.style === "info" ? "tw--info" : "tw--normal";

  // 圆点动画修饰
  const dotsModifier =
    elapsed >= 30000
      ? "chat-reading-indicator__dots--pulse"
      : elapsed >= 15000
        ? "chat-reading-indicator__dots--accent"
        : "";

  const renderWaitingContent = () => {
    // 超时或有具体错误 → 展示排查卡片
    if (isTimeout || errorMessage) {
      return html`
        <div class="chat-reading-indicator__content">
          <span class="chat-reading-indicator__dots chat-reading-indicator__dots--warning">
            <span></span><span></span><span></span>
          </span>
          <span class="chat-reading-indicator__timer">${elapsedSeconds}s</span>
        </div>
        ${renderTimeoutHintCard(errorInfo)}
      `;
    }

    // 正常等待：打字机逐字显示当前阶段文案
    return html`
      <div class="chat-reading-indicator__content">
        <span class="chat-reading-indicator__dots ${dotsModifier}">
          <span></span><span></span><span></span>
        </span>
        <span class="chat-reading-indicator__text">
          ${
            phase.text
              ? typewriterIndicator(phase.text, String(phase.startMs), twStyleCls)
              : nothing
          }
          <span class="chat-reading-indicator__timer">${elapsedSeconds}s</span>
        </span>
      </div>
    `;
  };

  // 汇总 CSS 类
  const isProcessing = elapsed >= 30000 && !isTimeout && !errorMessage;
  const cls = [
    "chat-bubble",
    "chat-reading-indicator",
    isTimeout ? "chat-reading-indicator--timeout" : "",
    errorMessage ? "chat-reading-indicator--has-error" : "",
    isProcessing ? "chat-reading-indicator--processing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        <div class="${cls}" aria-hidden="true">
          ${renderWaitingContent()}
        </div>
      </div>
    </div>
  `;
}

export function renderStreamingGroup(
  text: string,
  startedAt: number,
  onOpenSidebar?: (content: string) => void,
  assistant?: AssistantIdentity,
  streamKey?: string,
) {
  // 如果流式文本是静默回复（NO_REPLY），显示等待指示器而不是文本
  // 这是系统内部操作的响应，不应该显示给用户
  if (isSilentReplyText(text)) {
    return renderReadingIndicatorGroup(assistant, startedAt);
  }

  const timestamp = new Date(startedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const name = assistant?.name ?? "Assistant";
  const key = streamKey ?? `stream:${startedAt}`;

  return html`
    <div class="chat-group assistant">
      ${renderAvatar("assistant", assistant)}
      <div class="chat-group-messages">
        <div class="chat-bubble streaming fade-in">
          <div class="chat-text chat-text--streaming">
            ${typewriterStream(text, key)}
          </div>
        </div>
        <div class="chat-group-footer">
          <span class="chat-sender-name">${name}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * 检查消息是否有可渲染的内容
 * 用于在渲染消息组之前判断是否应该渲染
 * 注意：NO_REPLY 等静默回复不算有效内容
 */
function hasRenderableContent(message: unknown): boolean {
  const text = extractTextCached(message);
  // 静默回复（NO_REPLY）不算有效内容
  if (text?.trim() && !isSilentReplyText(text)) return true;

  const toolCards = extractToolCards(message);
  // Only count visible tool cards (pending/interrupted); resolved cards are hidden.
  const visibleCards = toolCards.filter((c) => Boolean(c.pending) || Boolean(c.interrupted));
  if (visibleCards.length > 0) return true;

  // 使用已有的 extractImages 函数检查图片
  const images = extractImages(message);
  if (images.length > 0) return true;

  // Injected image/video/file gen data counts as renderable content
  const m = message as Record<string, unknown>;
  if (m.__imageGenDetails || m.__videoGenDetails || m.__fileCardDetails) return true;

  return false;
}

export function renderMessageGroup(
  group: MessageGroup,
  opts: {
    onOpenSidebar?: (content: string) => void;
    showReasoning: boolean;
    assistantName?: string;
    assistantAvatar?: string | null;
    justCompleted?: boolean;
  },
) {
  const normalizedRole = normalizeRoleForGrouping(group.role);
  const assistantName = opts.assistantName ?? "66CLAW";
  const who =
    normalizedRole === "user"
      ? "我"
      : normalizedRole === "assistant"
        ? assistantName
        : normalizedRole;
  const roleClass =
    normalizedRole === "user" ? "user" : normalizedRole === "assistant" ? "assistant" : "other";
  const timestamp = new Date(group.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  // 检查是否有任何可渲染的消息内容
  // 如果组内所有消息都没有有效内容，则不渲染整个组
  const hasAnyContent = group.messages.some((item) => hasRenderableContent(item.message));
  if (!hasAnyContent) {
    return nothing;
  }

  return html`
    <div class="chat-group ${roleClass}">
      ${renderAvatar(group.role, {
        name: assistantName,
        avatar: opts.assistantAvatar ?? null,
      })}
      <div class="chat-group-messages">
        ${group.messages.map((item, index) =>
          renderGroupedMessage(
            item.message,
            {
              isStreaming: group.isStreaming && index === group.messages.length - 1,
              showReasoning: opts.showReasoning,
              justCompleted: opts.justCompleted && index === group.messages.length - 1,
            },
            opts.onOpenSidebar,
          ),
        )}
        ${
          opts.justCompleted
            ? html`
                <div class="chat-reply-complete">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span>回复完成</span>
                </div>
              `
            : nothing
        }
        <div class="chat-group-footer">
          <span class="chat-sender-name">${who}</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

function renderAvatar(role: string, assistant?: Pick<AssistantIdentity, "name" | "avatar">) {
  const normalized = normalizeRoleForGrouping(role);
  const assistantName = assistant?.name?.trim() || "Assistant";
  const assistantAvatar = assistant?.avatar?.trim() || "";
  const initial =
    normalized === "user"
      ? "U"
      : normalized === "assistant"
        ? assistantName.charAt(0).toUpperCase() || "A"
        : normalized === "tool"
          ? "⚙"
          : "?";
  const className =
    normalized === "user"
      ? "user"
      : normalized === "assistant"
        ? "assistant"
        : normalized === "tool"
          ? "tool"
          : "other";

  // 66CLAW: 用户使用 user_avatar.png
  if (normalized === "user") {
    return html`<img
      class="chat-avatar ${className}"
      src="/user_avatar.png"
      alt="User"
      @error=${(e: Event) => {
        const img = e.target as HTMLImageElement;
        if (img?.parentElement) {
          const fallback = document.createElement("div");
          fallback.className = `chat-avatar ${className}`;
          fallback.textContent = initial;
          img.parentElement.replaceChild(fallback, img);
        }
      }}
    />`;
  }

  // 66CLAW: AI 使用 logo_66_main.png
  if (normalized === "assistant") {
    // 优先使用自定义头像
    if (assistantAvatar && isAvatarUrl(assistantAvatar)) {
      const handleAvatarError = (event: Event) => {
        const img = event.target as HTMLImageElement;
        if (img && img.parentElement) {
          const fallback = document.createElement("div");
          fallback.className = `chat-avatar ${className}`;
          fallback.textContent = initial;
          img.parentElement.replaceChild(fallback, img);
        }
      };
      return html`<img
        class="chat-avatar ${className}"
        src="${assistantAvatar}"
        alt="${assistantName}"
        @error=${handleAvatarError}
      />`;
    }
    // 默认使用品牌 logo
    return html`<img
      class="chat-avatar ${className}"
      src="${brand.logoPath}"
      alt="${brand.logoAlt}"
      @error=${(e: Event) => {
        const img = e.target as HTMLImageElement;
        if (img?.parentElement) {
          const fallback = document.createElement("div");
          fallback.className = `chat-avatar ${className}`;
          fallback.textContent = initial;
          img.parentElement.replaceChild(fallback, img);
        }
      }}
    />`;
  }

  return html`<div class="chat-avatar ${className}">${initial}</div>`;
}

function isAvatarUrl(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) || /^data:image\//i.test(value) || /^\//.test(value) // Relative paths from avatar endpoint
  );
}

/**
 * Handle image load error by hiding the broken image.
 * This prevents the browser's default "broken image" icon from showing.
 */
function handleImageError(event: Event) {
  const img = event.target as HTMLImageElement;
  if (img) {
    // Hide the broken image completely
    img.style.display = "none";
    // Also try to remove empty container if all images failed
    const container = img.parentElement;
    if (container?.classList.contains("chat-message-images")) {
      const visibleImages = container.querySelectorAll("img:not([style*='display: none'])");
      if (visibleImages.length === 0) {
        container.style.display = "none";
      }
    }
  }
}

function renderMessageImages(images: ImageBlock[]) {
  if (images.length === 0) return nothing;

  return html`
    <div class="chat-message-images">
      ${images.map(
        (img) => html`
          <img
            src=${img.url}
            alt=${img.alt ?? "Attached image"}
            class="chat-message-image chat-message-image--clickable"
            loading="eager"
            decoding="async"
            @click=${() => openImageLightbox(img.url)}
            @error=${handleImageError}
          />
        `,
      )}
    </div>
  `;
}

/**
 * 渲染可折叠的思考过程区域
 */
function renderThinkingSection(reasoningMarkdown: string) {
  const shouldCollapse = reasoningMarkdown.length > THINKING_COLLAPSE_THRESHOLD;
  const previewText = shouldCollapse
    ? reasoningMarkdown.slice(0, THINKING_COLLAPSE_THRESHOLD) + "..."
    : reasoningMarkdown;

  // 切换折叠状态
  const handleToggle = (e: Event) => {
    const container = (e.currentTarget as HTMLElement).closest(".chat-thinking-collapsible");
    if (container) {
      container.classList.toggle("chat-thinking-collapsible--expanded");
    }
  };

  if (!shouldCollapse) {
    return html`<div class="chat-thinking">${unsafeHTML(
      toSanitizedMarkdownHtml(reasoningMarkdown),
    )}</div>`;
  }

  return html`
    <div class="chat-thinking-collapsible">
      <div class="chat-thinking-header" @click=${handleToggle}>
        <span class="chat-thinking-header__icon">🤔</span>
        <span class="chat-thinking-header__title">思考过程</span>
        <span class="chat-thinking-header__toggle">
          <svg class="chat-thinking-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </div>
      <div class="chat-thinking-content">
        <div class="chat-thinking-preview">${unsafeHTML(toSanitizedMarkdownHtml(previewText))}</div>
        <div class="chat-thinking-full">${unsafeHTML(
          toSanitizedMarkdownHtml(reasoningMarkdown),
        )}</div>
      </div>
    </div>
  `;
}

/**
 * 复制消息文本到剪贴板
 */
async function handleCopyMessage(text: string, btn: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add("chat-action--copied");
    const textSpan = btn.querySelector(".chat-action__text");
    if (textSpan) textSpan.textContent = "已复制";

    setTimeout(() => {
      btn.classList.remove("chat-action--copied");
      if (textSpan) textSpan.textContent = "复制";
    }, 2000);
  } catch (err) {
    console.error("Failed to copy message:", err);
  }
}

/**
 * 渲染消息底部操作栏（仅 AI 消息）
 */
function renderMessageActions(
  markdown: string | null,
  isStreaming: boolean,
  justCompleted?: boolean,
) {
  // 流式输出时不显示操作栏
  if (isStreaming || !markdown) return nothing;

  return html`
    <div class="chat-bubble__actions ${justCompleted ? "actions-enter" : ""}">
      <button
        type="button" 
        class="chat-action"
        title="复制消息"
        @click=${(e: Event) => {
          const btn = e.currentTarget as HTMLElement;
          void handleCopyMessage(markdown, btn);
        }}
      >
        <svg class="chat-action__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span class="chat-action__text">复制</span>
      </button>
    </div>
  `;
}

function renderGroupedMessage(
  message: unknown,
  opts: { isStreaming: boolean; showReasoning: boolean; justCompleted?: boolean },
  onOpenSidebar?: (content: string) => void,
) {
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "unknown";
  const isAssistant = role === "assistant";
  const isToolResult =
    isToolResultMessage(message) ||
    role.toLowerCase() === "toolresult" ||
    role.toLowerCase() === "tool_result" ||
    typeof m.toolCallId === "string" ||
    typeof m.tool_call_id === "string";

  const toolCards = extractToolCards(message);
  // Only count tool cards that will actually render (pending or interrupted).
  // Resolved cards are hidden, so they shouldn't affect layout decisions.
  const visibleToolCards = toolCards.filter((c) => Boolean(c.pending) || Boolean(c.interrupted));
  const hasToolCards = visibleToolCards.length > 0;
  const images = extractImages(message);
  const hasImages = images.length > 0;

  // OpenClawCN 专属功能：提取免费模型通知
  const freeModelNotification = isAssistant ? extractFreeModelNotification(message) : null;

  const extractedText = extractTextCached(message);
  const extractedThinking =
    opts.showReasoning && role === "assistant" ? extractThinkingCached(message) : null;
  // 过滤静默回复（NO_REPLY）- 这是系统内部标记，不应显示给用户
  const markdownBase =
    extractedText?.trim() && !isSilentReplyText(extractedText) ? extractedText : null;
  const reasoningMarkdown = extractedThinking ? formatReasoningMarkdown(extractedThinking) : null;
  const markdown = markdownBase;
  const canCopyMarkdown = role === "assistant" && Boolean(markdown?.trim());
  // 是否显示消息操作栏（仅 AI 消息且有内容）
  const showActions = isAssistant && markdown && !opts.isStreaming;

  const bubbleClasses = [
    "chat-bubble",
    canCopyMarkdown ? "has-copy" : "",
    opts.isStreaming ? "streaming" : "",
    isAssistant && !opts.isStreaming && opts.justCompleted ? "just-completed" : "",
    showActions ? "has-actions" : "",
    "fade-in",
  ]
    .filter(Boolean)
    .join(" ");

  // [CN-FIX:image-display] Check for image/video gen results BEFORE the
  // markdown guard. Tool results from JSONL have text content ("Image generated
  // successfully.") which makes `markdown` truthy, but we still want specialized
  // rendering with the actual image inline.
  if (isToolResult) {
    const imageGenDetails = extractImageGenDetails(message);
    if (imageGenDetails) {
      return renderImageGenResult(imageGenDetails);
    }
    const videoGenDetails = extractVideoGenDetails(message);
    if (videoGenDetails) {
      return renderVideoGenResult(videoGenDetails);
    }
  }
  if (!markdown && hasToolCards && isToolResult) {
    return renderToolCardGroup(toolCards, onOpenSidebar);
  }

  // [CN-FIX:image-display] Render image/video gen results injected from preceding
  // toolResult messages (attached by buildChatItems as __imageGenDetails/__videoGenDetails).
  // [CN-FEAT:file-card] Also render file write cards injected as __fileCardDetails.
  const injectedImageGen = isAssistant
    ? (m.__imageGenDetails as import("./image-gen-result").ImageGenDetails | undefined)
    : undefined;
  const injectedVideoGen = isAssistant
    ? (m.__videoGenDetails as Record<string, unknown> | undefined)
    : undefined;
  const injectedFileCards = isAssistant
    ? (m.__fileCardDetails as FileWriteDetails[] | undefined)
    : undefined;

  if (
    !markdown &&
    !hasToolCards &&
    !hasImages &&
    !freeModelNotification &&
    !injectedImageGen &&
    !injectedVideoGen &&
    !injectedFileCards?.length
  )
    return nothing;

  // Determine if the bubble has any visible inner content (text, images, visible tool cards).
  // If the only content is injected image/video/file gen (rendered OUTSIDE the bubble), skip the empty bubble div.
  const hasBubbleContent =
    Boolean(markdown) || hasImages || hasToolCards || Boolean(reasoningMarkdown);

  return html`
    ${freeModelNotification ? renderFreeModelNotificationCard(freeModelNotification) : nothing}
    ${injectedImageGen ? renderImageGenResult(injectedImageGen) : nothing}
    ${injectedVideoGen ? renderVideoGenResult(injectedVideoGen as any) : nothing}
    ${injectedFileCards?.length ? injectedFileCards.map((fc) => renderFileWriteResult(fc)) : nothing}
    ${
      hasBubbleContent
        ? html`
    <div class="${bubbleClasses}">
      ${canCopyMarkdown ? renderCopyAsMarkdownButton(markdown!) : nothing}
      ${renderMessageImages(images)}
      ${reasoningMarkdown ? renderThinkingSection(reasoningMarkdown) : nothing}
      ${
        markdown
          ? html`<div class="chat-text">${unsafeHTML(getCachedMarkdownHtml(message, markdown))}</div>`
          : nothing
      }
      ${renderToolCardGroup(toolCards, onOpenSidebar)}
      ${showActions ? renderMessageActions(markdown, opts.isStreaming, opts.justCompleted) : nothing}
    </div>`
        : nothing
    }
  `;
}

// ============ 排队消息气泡 ============

export function renderQueuedMessage(queueItem: ChatQueueItem, onRemove: (id: string) => void) {
  const timestamp = new Date(queueItem.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const displayText =
    queueItem.text ||
    (queueItem.attachments?.length
      ? t("chat.queuedAttachments" as Parameters<typeof t>[0], {
          count: String(queueItem.attachments.length),
        })
      : "");

  return html`
    <div class="chat-group user">
      ${renderAvatar("user")}
      <div class="chat-group-messages">
        <div class="chat-bubble chat-bubble--queued fade-in">
          <div class="chat-bubble--queued__header">
            <span class="chat-bubble--queued__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </span>
            <span class="chat-bubble--queued__label">${t("chat.queuedPending" as Parameters<typeof t>[0])}</span>
            <button
              class="chat-bubble--queued__cancel"
              type="button"
              aria-label="${t("chat.queuedCancel" as Parameters<typeof t>[0])}"
              @click=${() => onRemove(queueItem.id)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </div>
          ${displayText ? html`<div class="chat-text">${displayText}</div>` : nothing}
          ${
            queueItem.attachments?.length
              ? html`
                <div class="chat-message-images chat-message-images--queued">
                  ${queueItem.attachments.map((att) =>
                    att.category === "image" || att.mimeType?.startsWith("image/")
                      ? html`<img
                          src="${att.dataUrl}"
                          alt="${att.fileName ?? "image"}"
                          class="chat-message-image chat-message-image--queued"
                        />`
                      : html`<span class="chat-bubble--queued__file"
                          >\u{1F4CE} ${att.fileName ?? "file"}</span
                        >`,
                  )}
                </div>
              `
              : nothing
          }
        </div>
        <div class="chat-group-footer">
          <span class="chat-sender-name">You</span>
          <span class="chat-group-timestamp">${timestamp}</span>
        </div>
      </div>
    </div>
  `;
}

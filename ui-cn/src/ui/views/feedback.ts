/**
 * 意见反馈视图 - 底部浮动面板设计
 * 底部上滑、单栏布局、现代简洁
 */

import { html, nothing } from "lit";
import { t } from "../i18n/index.js";
import { icons } from "../icons.js";

export type FeedbackType = "suggestion" | "bug";

export type FeedbackAttachment = {
  id: string;
  dataUrl: string;
  mimeType: string;
};

export type FeedbackViewState = {
  showModal: boolean;
  type: FeedbackType;
  content: string;
  contact: string;
  attachments: FeedbackAttachment[];
  submitting: boolean;
  submitted: boolean;
  error: string | null;
};

export type FeedbackViewProps = {
  state: FeedbackViewState;
  onOpenModal: () => void;
  onCloseModal: () => void;
  onTypeChange: (type: FeedbackType) => void;
  onContentChange: (content: string) => void;
  onContactChange: (contact: string) => void;
  onAddAttachment: (attachment: FeedbackAttachment) => void;
  onRemoveAttachment: (id: string) => void;
  onSubmit: () => void;
  onReset: () => void;
};

// SVG Icons for feedback (Lucide-style, consistent with existing UI)
const feedbackIcons = {
  lightbulb: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"
      />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  `,
  bug: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="m8 2 1.88 1.88" />
      <path d="M14.12 3.88 16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  `,
  image: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  `,
  sparkles: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"
      />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  `,
  check: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  `,
  arrowRight: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  `,
  plus: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  `,
  trash: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  `,
};

function generateAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function handleFeedbackPaste(
  e: ClipboardEvent,
  onAddAttachment: (attachment: FeedbackAttachment) => void,
  maxAttachments = 3,
  currentCount = 0,
) {
  const items = e.clipboardData?.items;
  if (!items) {return;}

  const imageItems = Array.from(items).filter((item) => item.type.startsWith("image/"));

  if (imageItems.length === 0) {return;}
  e.preventDefault();

  const remaining = maxAttachments - currentCount;
  const toProcess = imageItems.slice(0, remaining);

  for (const item of toProcess) {
    const file = item.getAsFile();
    if (!file) {continue;}

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      onAddAttachment({
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
      });
    });
    reader.readAsDataURL(file);
  }
}

export function handleFeedbackFileSelect(
  e: Event,
  onAddAttachment: (attachment: FeedbackAttachment) => void,
  maxAttachments = 3,
  currentCount = 0,
) {
  const input = e.target as HTMLInputElement;
  const files = input.files;
  if (!files) {return;}

  const remaining = maxAttachments - currentCount;
  const toProcess = Array.from(files).slice(0, remaining);

  for (const file of toProcess) {
    if (!file.type.startsWith("image/")) {continue;}

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = reader.result as string;
      onAddAttachment({
        id: generateAttachmentId(),
        dataUrl,
        mimeType: file.type,
      });
    });
    reader.readAsDataURL(file);
  }

  input.value = "";
}

/**
 * 侧边栏触发按钮
 */
export function renderFeedbackTrigger(onOpen: () => void) {
  return html`
    <button class="feedback-trigger" @click=${onOpen} title="${t("feedback.trigger")}">
      <span class="feedback-trigger__icon">${icons.messageCircle}</span>
      <span class="feedback-trigger__text">${t("feedback.trigger")}</span>
    </button>
  `;
}

/**
 * 渲染类型选择卡片
 */
function renderTypeCard(type: FeedbackType, isActive: boolean, onClick: () => void) {
  const isSuggestion = type === "suggestion";
  const icon = isSuggestion ? feedbackIcons.lightbulb : feedbackIcons.bug;
  const title = isSuggestion ? t("feedback.type.suggestion") : t("feedback.type.bug");
  const desc = isSuggestion ? t("feedback.type.suggestion.desc") : t("feedback.type.bug.desc");

  return html`
    <button
      class="fb-type-card ${isActive ? "fb-type-card--active" : ""} ${isSuggestion ? "fb-type-card--suggestion" : "fb-type-card--bug"}"
      @click=${onClick}
    >
      <div class="fb-type-card__icon">${icon}</div>
      <div class="fb-type-card__content">
        <div class="fb-type-card__title">${title}</div>
        <div class="fb-type-card__desc">${desc}</div>
      </div>
      ${isActive ? html`<div class="fb-type-card__check">${feedbackIcons.check}</div>` : nothing}
    </button>
  `;
}

/** 字段限制常量 */
const LIMITS = {
  maxAttachments: 5,
  maxContentLength: 5000,
  maxContactLength: 200,
} as const;

/**
 * 渲染图片上传区域
 */
function renderImageUpload(props: FeedbackViewProps) {
  const { state, onAddAttachment, onRemoveAttachment } = props;
  const canAdd = state.attachments.length < LIMITS.maxAttachments;

  return html`
    <div class="fb-images">
      <div class="fb-images__grid">
        ${state.attachments.map(
          (att) => html`
            <div class="fb-image-item">
              <img src="${att.dataUrl}" alt="" />
              <button
                class="fb-image-item__remove"
                @click=${() => onRemoveAttachment(att.id)}
                title="Remove"
              >
                ${feedbackIcons.trash}
              </button>
            </div>
          `,
        )}
        ${
          canAdd
            ? html`
              <label class="fb-image-add">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  @change=${(e: Event) =>
                    handleFeedbackFileSelect(
                      e,
                      onAddAttachment,
                      LIMITS.maxAttachments,
                      state.attachments.length,
                    )}
                />
                <span class="fb-image-add__icon">${feedbackIcons.plus}</span>
              </label>
            `
            : nothing
        }
      </div>
      <div class="fb-images__hint">
        ${feedbackIcons.image}
        <span>${t("feedback.images.hint")}</span>
      </div>
    </div>
  `;
}

/**
 * 渲染成功状态
 */
function renderSuccessState(props: FeedbackViewProps) {
  return html`
    <div class="fb-success">
      <div class="fb-success__icon">${feedbackIcons.sparkles}</div>
      <div class="fb-success__title">${t("feedback.success.title")}</div>
      <div class="fb-success__message">${t("feedback.success.message")}</div>
      <div class="fb-success__actions">
        <button class="fb-btn fb-btn--primary" @click=${props.onCloseModal}>
          ${t("feedback.success.ok")}
        </button>
      </div>
    </div>
  `;
}

/**
 * 渲染反馈表单主体 - 单栏布局适合浮动面板
 */
function renderFeedbackForm(props: FeedbackViewProps) {
  const { state, onTypeChange, onContentChange, onContactChange, onAddAttachment, onSubmit } =
    props;
  const charCount = state.content.length;
  const isOverLimit = charCount > LIMITS.maxContentLength;
  const isValid = state.content.trim().length >= 5 && !isOverLimit;

  return html`
    <div class="fb-sheet-form">
      <!-- 类型选择 - 横向排列 -->
      <div class="fb-sheet-section">
        <div class="fb-sheet-section__title">${t("feedback.type.label")}</div>
        <div class="fb-type-row">
          ${renderTypeCard("suggestion", state.type === "suggestion", () => onTypeChange("suggestion"))}
          ${renderTypeCard("bug", state.type === "bug", () => onTypeChange("bug"))}
        </div>
      </div>

      <!-- 内容输入 -->
      <div class="fb-sheet-section">
        <div class="fb-sheet-section__title">${t("feedback.content.label")}</div>
        <div class="fb-textarea-wrap">
          <textarea
            class="fb-textarea fb-textarea--sheet"
            placeholder="${t("feedback.content.placeholder")}"
            .value=${state.content}
            maxlength="${LIMITS.maxContentLength}"
            @input=${(e: InputEvent) => onContentChange((e.target as HTMLTextAreaElement).value)}
            @paste=${(e: ClipboardEvent) =>
              handleFeedbackPaste(
                e,
                onAddAttachment,
                LIMITS.maxAttachments,
                state.attachments.length,
              )}
          ></textarea>
          <div class="fb-textarea-footer">
            <span class="fb-char-count ${charCount < 5 || isOverLimit ? "fb-char-count--warn" : ""}">${charCount}/${LIMITS.maxContentLength}</span>
          </div>
        </div>
      </div>

      <!-- 图片上传 -->
      <div class="fb-sheet-section">
        <div class="fb-sheet-section__title">
          ${t("feedback.images.label")}
          <span class="fb-sheet-section__optional">${t("feedback.optional")}</span>
        </div>
        ${renderImageUpload(props)}
      </div>

      <!-- 联系方式 -->
      <div class="fb-sheet-section">
        <div class="fb-sheet-section__title">
          ${t("feedback.contact.label")}
          <span class="fb-sheet-section__optional">${t("feedback.optional")}</span>
        </div>
        <input
          type="text"
          class="fb-input fb-input--sheet"
          placeholder="${t("feedback.contact.placeholder")}"
          maxlength="${LIMITS.maxContactLength}"
          .value=${state.contact}
          @input=${(e: InputEvent) => onContactChange((e.target as HTMLInputElement).value)}
        />
        <div class="fb-sheet-hint">${t("feedback.contact.hint")}</div>
      </div>

      ${state.error ? html`<div class="fb-error">${state.error}</div>` : nothing}

      <!-- 奖励提示 + 提交按钮 -->
      <div class="fb-sheet-footer">
        <div class="fb-reward-hint fb-reward-hint--compact">
          <div class="fb-reward-hint__icon">${feedbackIcons.sparkles}</div>
          <div class="fb-reward-hint__text">${t("feedback.reward.hint")}</div>
        </div>
        <button
          class="fb-btn fb-btn--primary fb-btn--sheet ${state.submitting ? "fb-btn--loading" : ""}"
          ?disabled=${!isValid || state.submitting}
          @click=${onSubmit}
        >
          <span>${state.submitting ? t("feedback.submitting") : t("feedback.submit")}</span>
          ${!state.submitting ? html`<span class="fb-btn__icon">${feedbackIcons.arrowRight}</span>` : nothing}
        </button>
      </div>
    </div>
  `;
}

/**
 * 渲染反馈页面 — 内嵌页面布局（类似调试页）
 */
export function renderFeedbackPage(props: FeedbackViewProps) {
  if (props.state.submitted) {
    return html`
      <section class="card" style="width: 80%; margin: 0 auto; text-align: center; padding: 48px 24px;">
        <div style="font-size: 40px; margin-bottom: 16px;">${feedbackIcons.sparkles}</div>
        <div class="card-title" style="font-size: 18px; margin-bottom: 8px;">${t("feedback.success.title")}</div>
        <div class="card-sub" style="margin-bottom: 24px;">${t("feedback.success.message")}</div>
        <button class="btn primary" @click=${props.onReset}>${t("feedback.success.ok")}</button>
      </section>
    `;
  }

  const { state, onTypeChange, onContentChange, onAddAttachment, onSubmit } = props;
  const charCount = state.content.length;
  const isOverLimit = charCount > LIMITS.maxContentLength;
  const isValid = state.content.trim().length >= 5 && !isOverLimit;

  return html`
    <div style="width: 80%; margin: 0 auto;">
      <!-- 类型选择 -->
      <section class="card">
        <div class="card-title">${t("feedback.type.label")}</div>
        <div class="fb-type-row" style="margin-top: 12px;">
          ${renderTypeCard("suggestion", state.type === "suggestion", () => onTypeChange("suggestion"))}
          ${renderTypeCard("bug", state.type === "bug", () => onTypeChange("bug"))}
        </div>
      </section>

      <!-- 内容输入 -->
      <section class="card" style="margin-top: 16px;">
        <div class="card-title" style="margin-bottom: 8px;">${t("feedback.content.label")}</div>
        <div class="fb-textarea-wrap">
          <textarea
            class="fb-textarea fb-textarea--sheet"
            placeholder="${t("feedback.content.placeholder")}"
            .value=${state.content}
            maxlength="${LIMITS.maxContentLength}"
            rows="6"
            @input=${(e: InputEvent) => onContentChange((e.target as HTMLTextAreaElement).value)}
            @paste=${(e: ClipboardEvent) =>
              handleFeedbackPaste(e, onAddAttachment, LIMITS.maxAttachments, state.attachments.length)}
          ></textarea>
          <div class="fb-textarea-footer">
            <span class="fb-char-count ${charCount < 5 || isOverLimit ? "fb-char-count--warn" : ""}">${charCount}/${LIMITS.maxContentLength}</span>
          </div>
        </div>
      </section>

      <!-- 截图 -->
      <section class="card" style="margin-top: 16px;">
        <div class="card-title">${t("feedback.images.label")}
          <span style="font-size: 12px; font-weight: 400; color: var(--muted); margin-left: 6px;">${t("feedback.optional")}</span>
        </div>
        <div class="card-sub" style="margin-bottom: 12px;">${t("feedback.images.hint")}</div>
        ${renderImageUpload(props)}
      </section>

      <!-- 提交 -->
      ${state.error
        ? html`<div class="callout danger" style="margin-top: 16px;">${state.error}</div>`
        : nothing}

      <div style="margin-top: 16px; text-align: right;">
        <button
          class="btn primary ${state.submitting ? "fb-btn--loading" : ""}"
          style="padding: 10px 48px;"
          ?disabled=${!isValid || state.submitting}
          @click=${onSubmit}
        >
          ${state.submitting ? t("feedback.submitting") : t("feedback.submit")}
        </button>
      </div>
    </div>
  `;
}

/**
 * 渲染底部浮动反馈面板
 */
export function renderFeedbackModal(props: FeedbackViewProps) {
  if (!props.state.showModal) {return nothing;}

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onCloseModal();
    }
  };

  return html`
    <div
      class="fb-sheet-overlay"
      @keydown=${handleKeyDown}
      @click=${props.onCloseModal}
      tabindex="-1"
    >
      <div class="fb-sheet" @click=${(e: Event) => e.stopPropagation()}>
        <!-- 顶部拖拽指示条 -->
        <div class="fb-sheet__handle">
          <div class="fb-sheet__handle-bar"></div>
        </div>
        
        <!-- 头部 -->
        <div class="fb-sheet__header">
          <div class="fb-sheet__title">${t("feedback.title")}</div>
          <button class="fb-sheet__close" @click=${props.onCloseModal} title="Close">
            ${icons.x}
          </button>
        </div>
        
        <!-- 内容区域 -->
        <div class="fb-sheet__body">
          ${props.state.submitted ? renderSuccessState(props) : renderFeedbackForm(props)}
        </div>
      </div>
    </div>
  `;
}

export function createFeedbackViewState(): FeedbackViewState {
  return {
    showModal: false,
    type: "suggestion",
    content: "",
    contact: "",
    attachments: [],
    submitting: false,
    submitted: false,
    error: null,
  };
}

export function resetFeedbackState(state: FeedbackViewState): FeedbackViewState {
  return {
    ...state,
    type: "suggestion",
    content: "",
    contact: "",
    attachments: [],
    submitting: false,
    submitted: false,
    error: null,
  };
}

export type FeedbackPayload = {
  type: FeedbackType;
  content: string;
  contact?: string;
  attachments?: string[];
  context?: {
    version?: string;
    platform?: string;
    page?: string;
    userAgent?: string;
    timestamp?: string;
  };
};

export function buildFeedbackPayload(
  state: FeedbackViewState,
  context?: FeedbackPayload["context"],
): FeedbackPayload {
  return {
    type: state.type,
    content: state.content.trim(),
    contact: state.contact.trim() || undefined,
    attachments: state.attachments.length > 0 ? state.attachments.map((a) => a.dataUrl) : undefined,
    context: {
      ...context,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    },
  };
}

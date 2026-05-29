/**
 * 日志上报运维中心 - 对话框视图
 * 从日志页面触发，用户填写问题描述、上传截图，
 * 自动携带最近日志一起提交。
 */

import { html, nothing } from "lit";
import { t } from "../i18n/index.js";
import { icons } from "../icons.js";

// ── 类型 ──────────────────────────────────────────────────

export type LogReportViewState = {
  showModal: boolean;
  description: string;
  attachments: LogReportAttachment[];
  submitting: boolean;
  submitted: boolean;
  error: string | null;
  ticketCode: string | null;
  remaining: number | null;
  // 工单查询
  queryMode: boolean;
  queryCode: string;
  querying: boolean;
  queryResult: LogReportQueryResult | null;
  queryError: string | null;
};

export type LogReportAttachment = {
  id: string;
  dataUrl: string;
  mimeType: string;
};

export type LogReportQueryResult = {
  found: boolean;
  message?: string;
  report?: {
    ticketCode: string;
    status: "pending" | "analyzing" | "replied" | "closed";
    description: string;
    createdAt: string;
    reply?: {
      content: string;
      repliedAt: string;
    } | null;
  };
};

export type LogReportViewProps = {
  state: LogReportViewState;
  onOpen: () => void;
  onClose: () => void;
  onDescriptionChange: (value: string) => void;
  onAddAttachment: (attachment: LogReportAttachment) => void;
  onRemoveAttachment: (id: string) => void;
  onImageError: (message: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  onToggleQueryMode: () => void;
  onQueryCodeChange: (value: string) => void;
  onQuerySubmit: () => void;
};

// ── 常量 ──────────────────────────────────────────────────

const MAX_ATTACHMENTS = 3;
const MAX_DESCRIPTION = 2000;
const MAX_IMAGE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB (base64后~1.33MB, 3张≈4MB，加日志总量可控)

// ── SVG icons ────────────────────────────────────────────

const reportIcons = {
  send: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  `,
  search: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
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
  clock: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  `,
  reply: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  `,
  clipboard: html`
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  `,
};

// ── 文件选择 & 粘贴处理 ─────────────────────────────────

function generateAttachmentId(): string {
  return `rpt-att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function handleReportFileSelect(
  e: Event,
  onAdd: (att: LogReportAttachment) => void,
  currentCount: number,
  onError?: (message: string) => void,
) {
  const input = e.target as HTMLInputElement;
  const files = input.files;
  if (!files) return;

  const remaining = MAX_ATTACHMENTS - currentCount;
  const toProcess = Array.from(files).slice(0, remaining);
  const skippedNames: string[] = [];

  for (const file of toProcess) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      skippedNames.push(file.name);
      continue;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onAdd({
        id: generateAttachmentId(),
        dataUrl: reader.result as string,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  }

  if (skippedNames.length > 0 && onError) {
    const sizeMB = MAX_IMAGE_SIZE_BYTES / (1024 * 1024);
    onError(`${skippedNames.join(", ")} 超过 ${sizeMB}MB 限制，已跳过`);
  }

  input.value = "";
}

export function handleReportPaste(
  e: ClipboardEvent,
  onAdd: (att: LogReportAttachment) => void,
  currentCount: number,
  onError?: (message: string) => void,
) {
  const items = e.clipboardData?.items;
  if (!items) return;

  const imageItems = Array.from(items).filter((item) => item.type.startsWith("image/"));
  if (imageItems.length === 0) return;

  e.preventDefault();
  const remaining = MAX_ATTACHMENTS - currentCount;
  const toProcess = imageItems.slice(0, remaining);
  let skippedCount = 0;

  for (const item of toProcess) {
    const file = item.getAsFile();
    if (!file) continue;
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      skippedCount++;
      continue;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onAdd({
        id: generateAttachmentId(),
        dataUrl: reader.result as string,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  }

  if (skippedCount > 0 && onError) {
    const sizeMB = MAX_IMAGE_SIZE_BYTES / (1024 * 1024);
    onError(`${skippedCount} 张图片超过 ${sizeMB}MB 限制，已跳过`);
  }
}

// ── 状态管理辅助 ─────────────────────────────────────────

export function createLogReportViewState(): LogReportViewState {
  return {
    showModal: false,
    description: "",
    attachments: [],
    submitting: false,
    submitted: false,
    error: null,
    ticketCode: null,
    remaining: null,
    queryMode: false,
    queryCode: "",
    querying: false,
    queryResult: null,
    queryError: null,
  };
}

export function resetLogReportState(state: LogReportViewState): LogReportViewState {
  return {
    ...state,
    description: "",
    attachments: [],
    submitting: false,
    submitted: false,
    error: null,
    ticketCode: null,
    remaining: null,
    queryMode: false,
    queryCode: "",
    querying: false,
    queryResult: null,
    queryError: null,
  };
}

// ── 渲染：状态标签 ───────────────────────────────────────

function renderStatusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: t("logReport.status.pending"), cls: "lr-badge--pending" },
    analyzing: { label: t("logReport.status.analyzing"), cls: "lr-badge--analyzing" },
    replied: { label: t("logReport.status.replied"), cls: "lr-badge--replied" },
    closed: { label: t("logReport.status.closed"), cls: "lr-badge--closed" },
  };
  const info = map[status] ?? { label: status, cls: "" };
  return html`<span class="lr-badge ${info.cls}">${info.label}</span>`;
}

// ── 渲染：图片上传区 ────────────────────────────────────

function renderImageUpload(props: LogReportViewProps) {
  const { state, onAddAttachment, onRemoveAttachment, onImageError } = props;
  const canAdd = state.attachments.length < MAX_ATTACHMENTS;

  return html`
    <div class="lr-images">
      <div class="lr-images__grid">
        ${state.attachments.map(
          (att) => html`
            <div class="lr-image-item">
              <img src="${att.dataUrl}" alt="" />
              <button class="lr-image-item__remove" @click=${() => onRemoveAttachment(att.id)}>
                ${reportIcons.trash}
              </button>
            </div>
          `,
        )}
        ${
          canAdd
            ? html`
            <label class="lr-image-add">
              <input
                type="file"
                accept="image/*"
                multiple
                @change=${(e: Event) =>
                  handleReportFileSelect(
                    e,
                    onAddAttachment,
                    state.attachments.length,
                    onImageError,
                  )}
              />
              <span class="lr-image-add__icon">${reportIcons.plus}</span>
            </label>
          `
            : nothing
        }
      </div>
      <div class="lr-images__hint">
        ${reportIcons.image}
        <span>${t("logReport.images.hint")}</span>
      </div>
    </div>
  `;
}

// ── 渲染：提交成功 ──────────────────────────────────────

function renderSuccessState(props: LogReportViewProps) {
  const { state } = props;
  const ticketCode = state.ticketCode;

  return html`
    <div class="lr-success">
      <div class="lr-success__icon">${reportIcons.check}</div>
      <div class="lr-success__title">${t("logReport.success.title")}</div>
      <div class="lr-success__message">${t("logReport.success.message")}</div>
      ${
        ticketCode
          ? html`
          <div class="lr-ticket">
            <div class="lr-ticket__label">${t("logReport.success.ticketLabel")}</div>
            <div class="lr-ticket__code">${ticketCode}</div>
            <button class="lr-ticket__copy" @click=${() => {
              void navigator.clipboard.writeText(ticketCode);
            }} title="${t("common.copy")}">
              ${reportIcons.clipboard}
            </button>
          </div>
          <div class="lr-ticket__hint">${t("logReport.success.ticketHint")}</div>
        `
          : nothing
      }
      ${
        state.remaining != null
          ? html`<div class="lr-remaining">${t("logReport.remaining", { count: String(state.remaining) })}</div>`
          : nothing
      }
      <div class="lr-success__actions">
        <button class="lr-btn lr-btn--secondary" @click=${props.onToggleQueryMode}>
          ${reportIcons.search}
          <span>${t("logReport.queryTicket")}</span>
        </button>
        <button class="lr-btn lr-btn--primary" @click=${props.onClose}>
          ${t("common.close")}
        </button>
      </div>
    </div>
  `;
}

// ── 渲染：工单查询 ──────────────────────────────────────

function renderQueryMode(props: LogReportViewProps) {
  const { state } = props;
  const result = state.queryResult;

  return html`
    <div class="lr-query">
      <div class="lr-query__form">
        <div class="lr-section__title">${t("logReport.query.title")}</div>
        <div class="lr-query__row">
          <input
            type="text"
            class="lr-input"
            maxlength="6"
            placeholder="${t("logReport.query.placeholder")}"
            .value=${state.queryCode}
            @input=${(e: InputEvent) =>
              props.onQueryCodeChange((e.target as HTMLInputElement).value.toUpperCase())}
          />
          <button
            class="lr-btn lr-btn--primary"
            ?disabled=${state.queryCode.length !== 6 || state.querying}
            @click=${props.onQuerySubmit}
          >
            ${state.querying ? t("common.loading") : t("logReport.query.search")}
          </button>
        </div>
      </div>

      ${state.queryError ? html`<div class="lr-error">${state.queryError}</div>` : nothing}

      ${
        result && result.found && result.report
          ? html`
          <div class="lr-query__result">
            <div class="lr-query__header">
              <span class="lr-query__ticket">#${result.report.ticketCode}</span>
              ${renderStatusBadge(result.report.status)}
              <span class="lr-query__date">${new Date(result.report.createdAt).toLocaleString()}</span>
            </div>
            <div class="lr-query__desc">${result.report.description}</div>
            ${
              result.report.reply
                ? html`
                <div class="lr-query__reply">
                  <div class="lr-query__reply-header">
                    ${reportIcons.reply}
                    <span>${t("logReport.query.replyTitle")}</span>
                    <span class="lr-query__reply-date">
                      ${new Date(result.report.reply.repliedAt).toLocaleString()}
                    </span>
                  </div>
                  <div class="lr-query__reply-content">${result.report.reply.content}</div>
                </div>
              `
                : html`
                <div class="lr-query__no-reply">
                  ${reportIcons.clock}
                  <span>${t("logReport.query.noReply")}</span>
                </div>
              `
            }
          </div>
        `
          : nothing
      }

      ${
        result && !result.found
          ? html`<div class="lr-query__not-found">${result.message ?? t("logReport.query.notFound")}</div>`
          : nothing
      }

      <div class="lr-query__actions">
        <button class="lr-btn lr-btn--secondary" @click=${props.onToggleQueryMode}>
          ${t("logReport.backToReport")}
        </button>
      </div>
    </div>
  `;
}

// ── 渲染：报告表单 ──────────────────────────────────────

function renderReportForm(props: LogReportViewProps) {
  const { state, onDescriptionChange, onAddAttachment, onImageError, onSubmit } = props;
  const charCount = state.description.length;
  const isOverLimit = charCount > MAX_DESCRIPTION;
  const isValid = state.description.trim().length >= 5 && !isOverLimit;

  return html`
    <div class="lr-form">
      <!-- 问题描述 -->
      <div class="lr-section">
        <div class="lr-section__title">${t("logReport.description.label")}</div>
        <div class="lr-textarea-wrap">
          <textarea
            class="lr-textarea"
            placeholder="${t("logReport.description.placeholder")}"
            .value=${state.description}
            maxlength="${MAX_DESCRIPTION}"
            rows="4"
            @input=${(e: InputEvent) => onDescriptionChange((e.target as HTMLTextAreaElement).value)}
            @paste=${(e: ClipboardEvent) =>
              handleReportPaste(e, onAddAttachment, state.attachments.length, onImageError)}
          ></textarea>
          <div class="lr-textarea-footer">
            <span class="lr-char-count ${charCount < 5 || isOverLimit ? "lr-char-count--warn" : ""}">
              ${charCount}/${MAX_DESCRIPTION}
            </span>
          </div>
        </div>
      </div>

      <!-- 问题截图 -->
      <div class="lr-section">
        <div class="lr-section__title">
          ${t("logReport.images.label")}
          <span class="lr-section__optional">${t("logReport.optional")}</span>
        </div>
        ${renderImageUpload(props)}
      </div>

      <!-- 自动附带日志提示 -->
      <div class="lr-auto-logs-hint">
        ${reportIcons.clipboard}
        <span>${t("logReport.autoLogsHint")}</span>
      </div>

      ${state.error ? html`<div class="lr-error">${state.error}</div>` : nothing}

      <!-- 底部操作栏 -->
      <div class="lr-footer">
        <button class="lr-btn lr-btn--link" @click=${props.onToggleQueryMode}>
          ${reportIcons.search}
          <span>${t("logReport.queryTicket")}</span>
        </button>
        <button
          class="lr-btn lr-btn--primary ${state.submitting ? "lr-btn--loading" : ""}"
          ?disabled=${!isValid || state.submitting}
          @click=${onSubmit}
        >
          <span>${state.submitting ? t("logReport.submitting") : t("logReport.submit")}</span>
          ${!state.submitting ? html`<span class="lr-btn__icon">${reportIcons.send}</span>` : nothing}
        </button>
      </div>
    </div>
  `;
}

// ── 渲染：主弹框 ────────────────────────────────────────

export function renderLogReportModal(props: LogReportViewProps) {
  if (!props.state.showModal) return nothing;

  const handleOverlayClick = (e: Event) => {
    if ((e.target as HTMLElement).classList.contains("lr-overlay")) {
      props.onClose();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    }
  };

  return html`
    <div
      class="lr-overlay"
      @click=${handleOverlayClick}
      @keydown=${handleKeyDown}
      tabindex="-1"
    >
      <div class="lr-dialog" @click=${(e: Event) => e.stopPropagation()}>
        <!-- 头部 -->
        <div class="lr-dialog__header">
          <div class="lr-dialog__title">${t("logReport.title")}</div>
          <button class="lr-dialog__close" @click=${props.onClose}>
            ${icons.x}
          </button>
        </div>

        <!-- 内容 -->
        <div class="lr-dialog__body">
          ${
            props.state.submitted
              ? renderSuccessState(props)
              : props.state.queryMode
                ? renderQueryMode(props)
                : renderReportForm(props)
          }
        </div>
      </div>
    </div>
  `;
}

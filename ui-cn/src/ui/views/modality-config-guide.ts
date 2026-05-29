/**
 * Modality Configuration Guide — JIT configuration dialog.
 *
 * 当用户尝试使用多模态功能（图片分析、图片生成、视频分析）时，
 * 如果未配置相应能力的模型，弹出友好的引导对话框。
 */

import type { GatewayBrowserClient } from "../gateway";

/** 与后端 src/agents/modality-capability-checker.ts 中的类型保持同步 */
export type ModalityCapability =
  | "image-analysis"
  | "image-generation"
  | "image-editing"
  | "video-analysis";

export type ConfigGuideOptions = {
  client: GatewayBrowserClient;
  missingCapabilities: ModalityCapability[];
  suggestions: string[];
  onConfigured?: () => void;
  onCancelled?: () => void;
};

const CAPABILITY_LABELS: Record<ModalityCapability, string> = {
  "image-analysis": "图片分析",
  "image-generation": "图片生成",
  "image-editing": "图像编辑",
  "video-analysis": "视频分析",
};

const CAPABILITY_ICONS: Record<ModalityCapability, string> = {
  "image-analysis": "🖼️",
  "image-generation": "🎨",
  "image-editing": "✏️",
  "video-analysis": "🎬",
};

/**
 * 显示多模态配置引导对话框
 */
export function showModalityConfigGuide(options: ConfigGuideOptions): void {
  const { missingCapabilities, suggestions, onConfigured, onCancelled } = options;

  if (missingCapabilities.length === 0) {
    return;
  }

  const modal = document.createElement("div");
  modal.className = "modal-overlay modality-config-guide-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "modality-guide-title");

  const capabilityList = missingCapabilities
    .map(
      (cap) =>
        `<li class="capability-item">
          <span class="capability-icon">${CAPABILITY_ICONS[cap]}</span>
          <span class="capability-label">${CAPABILITY_LABELS[cap]}</span>
        </li>`,
    )
    .join("");

  const suggestionsList = suggestions
    .map((s) => `<div class="suggestion-block"><pre>${escapeHtml(s)}</pre></div>`)
    .join("");

  modal.innerHTML = `
    <div class="modal-backdrop" aria-hidden="true"></div>
    <div class="modal-content modality-guide-content">
      <div class="modal-header">
        <h2 id="modality-guide-title" class="modal-title">
          <span class="title-icon">⚠️</span>
          需要配置多模态能力
        </h2>
        <button
          class="close-button"
          aria-label="关闭对话框"
          data-action="cancel"
        >
          ✕
        </button>
      </div>

      <div class="modal-body">
        <p class="guide-intro">
          您尝试使用以下功能，但尚未配置相应的模型：
        </p>

        <ul class="capability-list">
          ${capabilityList}
        </ul>

        <div class="suggestions-section">
          <h3 class="suggestions-title">推荐配置</h3>
          ${suggestionsList}
        </div>

        <div class="action-hint">
          <p>
            💡 点击下方"前往配置"按钮，在设置页面添加支持相应能力的 API Key 和模型。
          </p>
        </div>
      </div>

      <div class="modal-footer">
        <button
          class="button button-secondary"
          data-action="cancel"
        >
          稍后配置
        </button>
        <button
          class="button button-primary"
          data-action="configure"
        >
          前往配置
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  // Focus trap
  const focusableElements = modal.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];
  firstFocusable?.focus();

  // Event handlers
  let closed = false;
  function closeModal() {
    if (closed) return;
    closed = true;
    modal.remove();
    document.body.classList.remove("modal-open");
  }

  function handleCancel() {
    closeModal();
    onCancelled?.();
  }

  function handleConfigure() {
    closeModal();
    // 跳转到配置页面
    window.location.hash = "#/config";
    onConfigured?.();
  }

  // Click handlers
  modal.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const action = target.getAttribute("data-action");

    if (action === "cancel" || target.classList.contains("modal-backdrop")) {
      handleCancel();
    } else if (action === "configure") {
      handleConfigure();
    }
  });

  // Keyboard handlers
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      handleCancel();
    } else if (e.key === "Tab") {
      // Focus trap
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    }
  });
}

/**
 * 检测用户意图并在需要时显示配置引导
 */
export async function checkAndGuideModalityConfig(options: {
  client: GatewayBrowserClient;
  prompt: string;
  attachments?: Array<{ mimeType: string }>;
  onConfigured?: () => void;
  onCancelled?: () => void;
}): Promise<{ needsConfiguration: boolean; canProceed: boolean }> {
  const { client, prompt, attachments = [], onConfigured, onCancelled } = options;

  try {
    const attachmentTypes = attachments.map((att) => att.mimeType);
    const hasAttachments = attachmentTypes.length > 0;

    const result = (await client.request("modality.detectIntent", {
      prompt,
      hasAttachments,
      attachmentTypes,
    })) as {
      needsConfiguration: boolean;
      missingCapabilities: ModalityCapability[];
      suggestions: string[];
    };

    if (result.needsConfiguration && result.missingCapabilities.length > 0) {
      // 显示配置引导
      showModalityConfigGuide({
        client,
        missingCapabilities: result.missingCapabilities,
        suggestions: result.suggestions,
        onConfigured,
        onCancelled,
      });

      return { needsConfiguration: true, canProceed: false };
    }

    return { needsConfiguration: false, canProceed: true };
  } catch (err) {
    console.error("[modality-config-guide] Failed to check capability:", err);
    // 发生错误时，允许继续执行（降级策略）
    return { needsConfiguration: false, canProceed: true };
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

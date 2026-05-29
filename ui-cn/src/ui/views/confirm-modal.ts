/**
 * Confirm Modal — 风格化确认弹窗（替代浏览器原生 confirm()）
 * CN-ONLY FILE — 不影响上游 OpenClaw
 */

export interface ConfirmModalOptions {
  /** 弹窗标题 */
  title: string;
  /** 描述文字 */
  message: string;
  /** 确认按钮文字 */
  confirmText?: string;
  /** 取消按钮文字 */
  cancelText?: string;
  /** 确认按钮是否为危险样式 */
  danger?: boolean;
  /** 图标（emoji 或文字） */
  icon?: string;
}

/**
 * 显示一个风格化的确认弹窗，返回 Promise<boolean>。
 * 用法：const ok = await showConfirmModal({ title, message });
 */
export function showConfirmModal(options: ConfirmModalOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const {
      title,
      message,
      confirmText = "确认",
      cancelText = "取消",
      danger = false,
      icon,
    } = options;

    // Create overlay
    const overlay = document.createElement("div");
    overlay.className = "confirm-modal-overlay";

    const dangerBtnClass = danger ? " confirm-modal-btn--danger" : "";

    overlay.innerHTML = `
      <div class="confirm-modal-backdrop"></div>
      <div class="confirm-modal-card">
        <div class="confirm-modal-body">
          ${icon ? `<div class="confirm-modal-icon">${icon}</div>` : ""}
          <h3 class="confirm-modal-title">${title}</h3>
          <p class="confirm-modal-message">${message}</p>
        </div>
        <div class="confirm-modal-footer">
          <button class="confirm-modal-btn confirm-modal-btn--cancel" data-action="cancel">${cancelText}</button>
          <button class="confirm-modal-btn confirm-modal-btn--confirm${dangerBtnClass}" data-action="confirm">${confirmText}</button>
        </div>
      </div>
    `;

    let settled = false;
    const close = (result: boolean) => {
      if (settled) return;
      settled = true;
      overlay.classList.add("confirm-modal-closing");
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 150);
    };

    // Event delegation
    overlay.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action ?? target.closest<HTMLElement>("[data-action]")?.dataset.action;
      if (action === "confirm") {
        close(true);
      } else if (action === "cancel") {
        close(false);
      }
      // Click on backdrop
      if (target.classList.contains("confirm-modal-backdrop")) {
        close(false);
      }
    });

    // ESC key
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);

    document.body.appendChild(overlay);

    // Auto-focus cancel button (safer default)
    const cancelBtn = overlay.querySelector<HTMLButtonElement>("[data-action=cancel]");
    cancelBtn?.focus();
  });
}

/**
 * QR Code Screenshot Protection
 *
 * 多层防截屏保护，当检测到截屏/录屏行为时自动隐藏 QR 码。
 * Multi-layer screenshot protection that hides QR codes when capture is detected.
 *
 * 保护层:
 *  1. CSS @media print - 打印/PDF 导出时隐藏
 *  2. Page Visibility API - 页面不可见时隐藏 (Alt+Tab 等)
 *  3. Window blur - 窗口失焦时隐藏 (截图工具弹出)
 *  4. Keyboard - PrintScreen / Win+Shift+S / Cmd+Shift+3,4,5
 *  5. Mouse leave - 鼠标离开页面区域时隐藏
 */

/** CSS class toggled on <html> to activate QR blur */
const GUARD_CLASS = "qr-guard-active";

/** How long (ms) to keep QR hidden after trigger */
const GUARD_DURATION_MS = 3000;

let guardTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

// ── helpers ──────────────────────────────────────────────────────────────

function activateGuard(): void {
  document.documentElement.classList.add(GUARD_CLASS);
  // Reset timer on repeated triggers
  if (guardTimer) clearTimeout(guardTimer);
  guardTimer = setTimeout(deactivateGuard, GUARD_DURATION_MS);
}

function deactivateGuard(): void {
  document.documentElement.classList.remove(GUARD_CLASS);
  guardTimer = null;
}

// ── Layer 2: Visibility change ───────────────────────────────────────────

function onVisibilityChange(): void {
  if (document.hidden) {
    activateGuard();
  }
}

// ── Layer 3: Window blur / focus ─────────────────────────────────────────

function onWindowBlur(): void {
  activateGuard();
}

// ── Layer 4: Keyboard shortcuts ──────────────────────────────────────────

function onKeyDown(e: KeyboardEvent): void {
  // PrintScreen
  if (e.key === "PrintScreen") {
    activateGuard();
    return;
  }

  // Windows: Win + Shift + S (Snipping Tool)
  if (e.key === "s" && e.shiftKey && e.metaKey) {
    activateGuard();
    return;
  }

  // macOS: Cmd + Shift + 3 / 4 / 5
  if (e.metaKey && e.shiftKey && (e.key === "3" || e.key === "4" || e.key === "5")) {
    activateGuard();
    return;
  }
}

// ── Layer 5: Mouse leave ─────────────────────────────────────────────────

function onMouseLeave(): void {
  activateGuard();
}

function onMouseEnter(): void {
  // Cancel pending guard when mouse returns
  if (guardTimer) {
    clearTimeout(guardTimer);
    guardTimer = null;
  }
  deactivateGuard();
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * 初始化 QR 码截屏保护。
 * 只需调用一次；重复调用无副作用。
 */
export function initQrGuard(): void {
  if (initialized) return;
  initialized = true;

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("keydown", onKeyDown, true); // capture phase
  document.documentElement.addEventListener("mouseleave", onMouseLeave);
  document.documentElement.addEventListener("mouseenter", onMouseEnter);
}

/**
 * 销毁 QR 码截屏保护（清理事件监听）。
 */
export function destroyQrGuard(): void {
  if (!initialized) return;
  initialized = false;

  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("blur", onWindowBlur);
  document.removeEventListener("keydown", onKeyDown, true);
  document.documentElement.removeEventListener("mouseleave", onMouseLeave);
  document.documentElement.removeEventListener("mouseenter", onMouseEnter);

  deactivateGuard();
}

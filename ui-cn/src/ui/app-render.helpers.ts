import { html } from "lit";
import type { AppViewState } from "./app-view-state";
import { applyPerformanceProfile } from "./controllers/perf-profile";
import { toggleSmartDispatch } from "./controllers/smart-dispatch";
import { t, type TranslationKey } from "./i18n/index.js";
import { icons } from "./icons";
import { iconForTab, pathForTab, titleForTab, type Tab } from "./navigation";
import type { ThemeMode } from "./theme";
import type { ThemeTransitionContext } from "./theme-transition";
import { generateUUID } from "./uuid";

export function renderTab(state: AppViewState, tab: Tab) {
  const href = pathForTab(tab, state.basePath);
  return html`
    <a
      href=${href}
      class="nav-item ${state.tab === tab ? "active" : ""}"
      @click=${(event: MouseEvent) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        // 点击任意 tab 时，如果"更多"菜单已展开则收起
        if (!state.settings.navGroupsCollapsed["More"]) {
          state.applySettings({
            ...state.settings,
            navGroupsCollapsed: { ...state.settings.navGroupsCollapsed, More: true },
          });
        }
        // CN: 点击"对话"且已在 chat 页面时，新建会话回到大卡空状态
        if (tab === "chat" && state.tab === "chat") {
          state.sessionKey = generateUUID();
          state.chatMessages = [];
          state.chatToolMessages = [];
          state.chatStream = null;
          state.chatMessage = "";
          state.chatAttachments = [];
          state.chatQueue = [];
        } else {
          state.setTab(tab);
        }
      }}
      title=${titleForTab(tab)}
    >
      <span class="nav-item__icon" aria-hidden="true">${icons[iconForTab(tab)]}</span>
      <span class="nav-item__text">${titleForTab(tab)}</span>
    </a>
  `;
}

export function renderChatControls(state: AppViewState) {
  return html`
    <div class="chat-controls">
      ${renderCliButton(state)}
      ${renderSmartDispatchToggle(state)}
      ${renderPerfToggle(state)}
    </div>
  `;
}

function renderCliButton(state: AppViewState) {
  const disabled = !state.connected;
  const handleClick = () => {
    console.log("[CLI] button clicked, disabled=", disabled, "client=", !!state.client);
    if (disabled) {
      return;
    }
    state.client
      ?.request("terminal.open", {})
      .then((res: unknown) => {
        console.log("[CLI] terminal.open success:", res);
      })
      .catch((err: unknown) => {
        console.warn("[CLI] terminal.open failed:", err);
      });
  };
  return html`
    <button
      class="cli-toggle ${disabled ? "cli-toggle--disabled" : ""}"
      ?disabled=${disabled}
      @click=${handleClick}
      title=${t("chat.openTerminal")}
    >
      <span class="cli-toggle__label">CLI</span>
    </button>
  `;
}

// ── Performance Profile Toggle (3-segment) ──────────────────────────

type PerfProfile = "economy" | "balanced" | "power";
const PERF_ORDER: PerfProfile[] = ["economy", "balanced", "power"];

/** Force a LitElement re-render via requestUpdate (not in AppViewState type) */
function forceUpdate(state: AppViewState) {
  (state as unknown as { requestUpdate(): void }).requestUpdate();
}

/** 显示性能模式切换确认弹窗（居中 modal，三模式对比） */
function showPerfConfirmModal(targetProfile: PerfProfile, state: AppViewState) {
  // 如果点击的是当前模式，不弹窗
  if (state.performanceProfile === targetProfile) {
    return;
  }

  // Remove existing modal if any
  const existing = document.querySelector(".perf-modal-overlay");
  if (existing) {
    existing.remove();
  }

  const currentProfile = state.performanceProfile;
  const profiles: PerfProfile[] = ["economy", "balanced", "power"];
  const nameMap: Record<PerfProfile, string> = {
    economy: t("chat.perfProfile.economy"),
    balanced: t("chat.perfProfile.balanced"),
    power: t("chat.perfProfile.power"),
  };
  const titleMap: Record<PerfProfile, string> = {
    economy: t("chat.perfProfile.economy.title" as TranslationKey),
    balanced: t("chat.perfProfile.balanced.title" as TranslationKey),
    power: t("chat.perfProfile.power.title" as TranslationKey),
  };
  const iconMap: Record<PerfProfile, string> = {
    economy: "🌿",
    balanced: "⚖️",
    power: "⚡",
  };
  const paramKeys = ["thinking.val", "concurrent.val", "context.val", "token"] as const;
  const paramLabels = [
    t("chat.perfProfile.thinking"),
    t("chat.perfProfile.concurrent"),
    t("chat.perfProfile.context"),
    t("chat.perfProfile.tokenUsage"),
  ];

  // Build the 3-mode comparison table
  let tableRows = "";
  for (let i = 0; i < paramKeys.length; i++) {
    const label = paramLabels[i];
    let cells = "";
    for (const p of profiles) {
      const val = t(`chat.perfProfile.${p}.${paramKeys[i]}` as TranslationKey);
      const isTarget = p === targetProfile;
      const isCurrent = p === currentProfile;
      cells += `<td class="perf-modal__cell ${isTarget ? "perf-modal__cell--target" : ""} ${isCurrent ? "perf-modal__cell--current" : ""}">${val}</td>`;
    }
    const isHighlight = paramKeys[i] === "token" ? ' class="perf-modal__row--highlight"' : "";
    tableRows += `<tr${isHighlight}><td class="perf-modal__label">${label}</td>${cells}</tr>`;
  }

  // Column headers
  let headerCells = "";
  for (const p of profiles) {
    const isTarget = p === targetProfile;
    const isCurrent = p === currentProfile;
    headerCells += `<th class="perf-modal__th ${isTarget ? "perf-modal__th--target" : ""} ${isCurrent ? "perf-modal__th--current" : ""}">
      <span class="perf-modal__th-icon">${iconMap[p]}</span>
      <span>${nameMap[p]}</span>
      ${isCurrent ? `<span class="perf-modal__current-badge">${t("chat.perfProfile.current")}</span>` : ""}
    </th>`;
  }

  const overlay = document.createElement("div");
  overlay.className = "perf-modal-overlay";
  overlay.innerHTML = `
    <div class="perf-modal">
      <div class="perf-modal__header">
        <span class="perf-modal__title">${t("chat.perfProfile.confirmSwitch" as TranslationKey)} ${iconMap[targetProfile]} ${nameMap[targetProfile]}</span>
        <button class="perf-modal__close" type="button">&times;</button>
      </div>
      <p class="perf-modal__desc">${titleMap[targetProfile]}</p>
      <div class="perf-modal__table-wrap">
        <table class="perf-modal__table">
          <thead><tr><th class="perf-modal__label-th"></th>${headerCells}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div class="perf-modal__actions">
        <button class="perf-modal__cancel" type="button">${t("chat.perfProfile.cancel" as TranslationKey)}</button>
        <button class="perf-modal__confirm" type="button">${t("chat.perfProfile.confirmSwitch" as TranslationKey)} ${nameMap[targetProfile]}</button>
      </div>
    </div>
  `;

  // Event handlers
  const close = () => overlay.remove();
  overlay.querySelector(".perf-modal__close")!.addEventListener("click", close);
  overlay.querySelector(".perf-modal__cancel")!.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
    }
  });
  overlay.querySelector(".perf-modal__confirm")!.addEventListener("click", () => {
    close();
    void applyPerformanceProfile(state, targetProfile);
    forceUpdate(state);
  });

  document.body.appendChild(overlay);
}

export function renderSmartDispatchToggle(state: AppViewState) {
  const disabled = state.onboarding || state.smartDispatchSaving || !state.connected;
  const active = state.smartDispatchEnabled;

  const handleClick = () => {
    if (disabled) {
      return;
    }
    void toggleSmartDispatch(state, !active);
    forceUpdate(state);
  };

  return html`
    <button
      class="smart-dispatch-toggle ${active ? "smart-dispatch-toggle--active" : ""} ${disabled ? "smart-dispatch-toggle--disabled" : ""}"
      ?disabled=${disabled}
      @click=${handleClick}
      aria-pressed=${active}
      title=${t("chat.smartDispatch.desc")}
    >
      <svg class="smart-dispatch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
      <span class="smart-dispatch-label">${t("chat.smartDispatch")}</span>
    </button>
  `;
}

export function renderPerfToggle(state: AppViewState) {
  const disabled = state.onboarding || state.performanceProfileSaving || !state.connected;
  const current = state.performanceProfile;
  const index = Math.max(0, PERF_ORDER.indexOf(current));

  const handleClick = (profile: PerfProfile) => (e: MouseEvent) => {
    e.stopPropagation();
    if (disabled) {
      return;
    }
    showPerfConfirmModal(profile, state);
  };

  return html`
    <div class="perf-toggle ${disabled ? "perf-toggle--disabled" : ""}" style="--perf-index: ${index};">
      <div class="perf-toggle__track" role="group" aria-label=${t("chat.perfProfile")}>
        <span class="perf-toggle__indicator"></span>
        <button
          class="perf-toggle__button ${current === "economy" ? "active" : ""}"
          ?disabled=${disabled}
          @click=${handleClick("economy")}
          aria-pressed=${current === "economy"}
          title=${disabled ? t("chat.perfProfile.disabled") : t("chat.perfProfile.economy.title")}
        >
          ${renderLeafIcon()}
          <span class="perf-toggle__label">${t("chat.perfProfile.economy")}</span>
        </button>
        <button
          class="perf-toggle__button ${current === "balanced" ? "active" : ""}"
          ?disabled=${disabled}
          @click=${handleClick("balanced")}
          aria-pressed=${current === "balanced"}
          title=${disabled ? t("chat.perfProfile.disabled") : t("chat.perfProfile.balanced.title")}
        >
          ${renderScaleIcon()}
          <span class="perf-toggle__label">${t("chat.perfProfile.balanced")}</span>
        </button>
        <button
          class="perf-toggle__button ${current === "power" ? "active" : ""}"
          ?disabled=${disabled}
          @click=${handleClick("power")}
          aria-pressed=${current === "power"}
          title=${disabled ? t("chat.perfProfile.disabled") : t("chat.perfProfile.power.title")}
        >
          ${renderBoltIcon()}
          <span class="perf-toggle__label">${t("chat.perfProfile.power")}</span>
        </button>
      </div>
    </div>
  `;
}

function renderLeafIcon() {
  return html`
    <svg class="perf-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8c0 5.5-4.5 10-10 10Z"></path>
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path>
    </svg>
  `;
}

function renderScaleIcon() {
  return html`
    <svg class="perf-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path>
      <path d="M7 21h10"></path>
      <path d="M12 3v18"></path>
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path>
    </svg>
  `;
}

function renderBoltIcon() {
  return html`
    <svg class="perf-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"></path>
    </svg>
  `;
}

// ── Theme Toggle ─────────────────────────────────────────────────────

const THEME_ORDER: ThemeMode[] = ["system", "light", "dark"];

export function renderThemeToggle(state: AppViewState) {
  const index = Math.max(0, THEME_ORDER.indexOf(state.theme));
  const applyTheme = (next: ThemeMode) => (event: MouseEvent) => {
    const element = event.currentTarget as HTMLElement;
    const context: ThemeTransitionContext = { element };
    if (event.clientX || event.clientY) {
      context.pointerClientX = event.clientX;
      context.pointerClientY = event.clientY;
    }
    state.setTheme(next, context);
  };

  return html`
    <div class="theme-toggle" style="--theme-index: ${index};">
      <div class="theme-toggle__track" role="group" aria-label="Theme">
        <span class="theme-toggle__indicator"></span>
        <button
          class="theme-toggle__button ${state.theme === "system" ? "active" : ""}"
          @click=${applyTheme("system")}
          aria-pressed=${state.theme === "system"}
          aria-label="System theme"
          title="System"
        >
          ${renderMonitorIcon()}
        </button>
        <button
          class="theme-toggle__button ${state.theme === "light" ? "active" : ""}"
          @click=${applyTheme("light")}
          aria-pressed=${state.theme === "light"}
          aria-label="Light theme"
          title="Light"
        >
          ${renderSunIcon()}
        </button>
        <button
          class="theme-toggle__button ${state.theme === "dark" ? "active" : ""}"
          @click=${applyTheme("dark")}
          aria-pressed=${state.theme === "dark"}
          aria-label="Dark theme"
          title="Dark"
        >
          ${renderMoonIcon()}
        </button>
      </div>
    </div>
  `;
}

function renderSunIcon() {
  return html`
    <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4"></circle>
      <path d="M12 2v2"></path>
      <path d="M12 20v2"></path>
      <path d="m4.93 4.93 1.41 1.41"></path>
      <path d="m17.66 17.66 1.41 1.41"></path>
      <path d="M2 12h2"></path>
      <path d="M20 12h2"></path>
      <path d="m6.34 17.66-1.41 1.41"></path>
      <path d="m19.07 4.93-1.41 1.41"></path>
    </svg>
  `;
}

function renderMoonIcon() {
  return html`
    <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
      ></path>
    </svg>
  `;
}

function renderMonitorIcon() {
  return html`
    <svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="20" height="14" x="2" y="3" rx="2"></rect>
      <line x1="8" x2="16" y1="21" y2="21"></line>
      <line x1="12" x2="12" y1="17" y2="21"></line>
    </svg>
  `;
}

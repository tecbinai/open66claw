/**
 * OpenClawCN: Conversation Sidebar
 *
 * ChatGPT-style left-hand conversation history panel.
 * Replaces the native <select> dropdown with a proper session list.
 */
import { html, nothing, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { t } from "../i18n/index.js";
import { icons } from "../icons.js";
import type { GatewaySessionRow, SessionsListResult } from "../types.js";

// ── Custom confirm dialog ────────────────────────────

function showConfirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Remove any existing dialog
    document.querySelector(".cn-confirm-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.className = "cn-confirm-overlay";

    const dialog = document.createElement("div");
    dialog.className = "cn-confirm-dialog";
    dialog.innerHTML = `
      <div class="cn-confirm-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f5a623" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <div class="cn-confirm-message">${message}</div>
      <div class="cn-confirm-actions">
        <button class="cn-confirm-btn cn-confirm-btn--cancel">取消</button>
        <button class="cn-confirm-btn cn-confirm-btn--ok">确定</button>
      </div>
    `;

    overlay.appendChild(dialog);

    const cleanup = (result: boolean) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener("pointerdown", (ev) => {
      if (ev.target === overlay) cleanup(false);
    });
    dialog
      .querySelector(".cn-confirm-btn--cancel")!
      .addEventListener("click", () => cleanup(false));
    dialog.querySelector(".cn-confirm-btn--ok")!.addEventListener("click", () => cleanup(true));

    document.body.appendChild(overlay);
    // Auto-focus OK button
    (dialog.querySelector(".cn-confirm-btn--ok") as HTMLElement)?.focus();
  });
}

// ── Types ──────────────────────────────────────────────

export type DigitalAsset = {
  id: string;
  type: "image" | "video";
  url: string;
  thumbnailUrl?: string;
  name: string;
  size?: number;
  createdAt: number;
  sessionKey?: string;
};

export type ConversationSidebarProps = {
  open: boolean;
  sessionKey: string;
  sessionsResult: SessionsListResult | null;
  sessionsLoading: boolean;
  connected: boolean;
  /** The canonical key of the main session (cannot be deleted). */
  mainKey?: string;
  onToggle: () => void;
  onSelectSession: (key: string) => void;
  onNewChat: () => void;
  onPinSession: (key: string, pinned: boolean) => void;
  onArchiveSession: (key: string) => void;
  onDeleteSession: (key: string) => void;
  onRenameSession: (key: string, name: string) => void;
  onViewDetails: (key: string) => void;
  onManageAll: () => void;
  /** Digital assets (images/videos) for the asset gallery tab */
  assets?: DigitalAsset[];
  assetsLoading?: boolean;
  onDeleteAsset?: (id: string) => void;
  onViewAsset?: (asset: DigitalAsset) => void;
  /** Called when the user switches to the assets tab (to trigger lazy loading). */
  onAssetsTabActivated?: () => void;
  /** Error pill in sidebar header */
  lastError?: string | null;
};

// ── State ──────────────────────────────────────────────

type SidebarTab = "conversations" | "assets";
let _activeTab: SidebarTab = "conversations";
let _assetFilter: "all" | "image" | "video" = "all";
let _searchQuery = "";
let _contextMenuKey: string | null = null;
let _contextMenuX = 0;
let _contextMenuY = 0;
let _contextMenuShowMore = false;
let _renamingKey: string | null = null;
let _renameValue = "";

// ── Helpers ────────────────────────────────────────────

function formatTimeShort(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

type TimeGroup = {
  label: string;
  sessions: GatewaySessionRow[];
};

function groupByTime(sessions: GatewaySessionRow[]): TimeGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const past7Start = todayStart - 7 * 86_400_000;
  const past30Start = todayStart - 30 * 86_400_000;

  const pinned: GatewaySessionRow[] = [];
  const today: GatewaySessionRow[] = [];
  const yesterday: GatewaySessionRow[] = [];
  const past7: GatewaySessionRow[] = [];
  const past30: GatewaySessionRow[] = [];
  const older: GatewaySessionRow[] = [];

  for (const s of sessions) {
    if (s.pinned) {
      pinned.push(s);
      continue;
    }
    const t = s.updatedAt ?? 0;
    if (t >= todayStart) today.push(s);
    else if (t >= yesterdayStart) yesterday.push(s);
    else if (t >= past7Start) past7.push(s);
    else if (t >= past30Start) past30.push(s);
    else older.push(s);
  }

  const groups: TimeGroup[] = [];
  if (pinned.length) groups.push({ label: t("sidebar.pinned"), sessions: pinned });
  if (today.length) groups.push({ label: t("sidebar.today"), sessions: today });
  if (yesterday.length) groups.push({ label: t("sidebar.yesterday"), sessions: yesterday });
  if (past7.length) groups.push({ label: t("sidebar.past7days"), sessions: past7 });
  if (past30.length) groups.push({ label: t("sidebar.past30days"), sessions: past30 });
  if (older.length) groups.push({ label: t("sidebar.older"), sessions: older });
  return groups;
}

/** Detect hash/UUID-like strings that aren't meaningful titles */
const HASH_LIKE_RE = /^[0-9a-f]{6,}(?:\s|$)/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
/** Channel-prefixed keys like "slack:#general", "telegram:group-123" */
const CHANNEL_KEY_RE = /^(?:slack|telegram|discord|signal|wecom|wechat|qq|feishu|dingtalk|nostr):/i;

function isHashLike(text: string): boolean {
  return HASH_LIKE_RE.test(text) || UUID_RE.test(text) || CHANNEL_KEY_RE.test(text);
}

/**
 * [CN-FIX:session-title] Strip gateway-injected inbound metadata that leaks
 * into derived titles. After deriveSessionTitle() collapses whitespace and
 * truncates, the text looks like:
 *   "Sender (untrusted metadata): ```json { "label": "webchat" } ``` 你好"
 * Strategy: strip ``` fenced blocks first, then strip metadata sentinels.
 */

/**
 * Clean raw text for display as a session title (client-side).
 * Strips timestamps, markdown, emoji noise, URLs, etc.
 */
function cleanForTitle(raw: string): string | null {
  let t = raw;
  // Strip ``` fenced code blocks (collapsed to single line by deriveSessionTitle)
  t = t.replace(/```[\w]*\s*[^`]*```/g, "");
  // Strip remaining unclosed ``` fence (truncated titles)
  t = t.replace(/```[\w]*\s*.*/g, "");
  // Strip metadata sentinels: "Sender (untrusted metadata):" etc.
  t = t.replace(
    /(?:Sender|Conversation info|Message info|Thread starter)\s*\(untrusted[^)]*\)\s*:\s*/gi,
    "",
  );
  // Strip leading timestamp envelopes: [Tue 2026-02-24 21:23 GMT+0800]
  t = t.replace(/^\[?(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\]]*\]?\s*/i, "");
  // Strip ISO-like timestamps: 2026-02-24 21:23:00 or 2026/02/24T21:23
  t = t.replace(
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}[\sT]\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:GMT|UTC)?[+-]?\d{0,4})?\s*/i,
    "",
  );
  // Strip markdown formatting
  t = t.replace(/[*_~`#]+/g, "");
  // Strip URLs
  t = t.replace(/https?:\/\/\S+/gi, "");
  // Strip "视频已生成！" prefixes (assistant forwarded text)
  t = t.replace(/^(?:视频已生成[！!]?\s*)/i, "");
  // Collapse leading emoji
  t = t.replace(/^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+/gu, "");
  // Normalize whitespace
  t = t.replace(/\s+/g, " ").trim();
  if (t.length < 2) return null;
  return t.length > 40 ? t.slice(0, 40) + "..." : t;
}

function getSessionTitle(s: GatewaySessionRow): string {
  // Priority 1: user-set display name (always meaningful)
  if (s.displayName?.trim()) return s.displayName.trim();

  // Priority 2: server-derived title (cleaned first user message)
  if (s.derivedTitle?.trim()) {
    const cleaned = cleanForTitle(s.derivedTitle.trim());
    if (cleaned && !isHashLike(cleaned)) return cleaned;
  }

  // Priority 3: last message preview (clean it for display)
  if (s.lastMessagePreview?.trim()) {
    const cleaned = cleanForTitle(s.lastMessagePreview.trim());
    if (cleaned && !isHashLike(cleaned)) return cleaned;
  }

  // Priority 4: label, but only if not hash/channel-key
  if (s.label?.trim()) {
    const cleaned = cleanForTitle(s.label.trim());
    if (cleaned && !isHashLike(cleaned)) return cleaned;
  }

  return "新对话";
}

function filterSessions(sessions: GatewaySessionRow[], query: string): GatewaySessionRow[] {
  if (!query.trim()) return sessions;
  const lower = query.toLowerCase();
  return sessions.filter((s) => {
    const title = getSessionTitle(s).toLowerCase();
    const preview = (s.lastMessagePreview ?? "").toLowerCase();
    return title.includes(lower) || preview.includes(lower) || s.key.toLowerCase().includes(lower);
  });
}

// ── Context Menu ───────────────────────────────────────

function showContextMenu(key: string, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  _contextMenuKey = key;
  _contextMenuX = event.clientX;
  _contextMenuY = event.clientY;
}

function hideContextMenu() {
  _contextMenuKey = null;
  _contextMenuShowMore = false;
}

function startRename(key: string, currentName: string) {
  _renamingKey = key;
  _renameValue = currentName;
  hideContextMenu();
}

// ── Render ─────────────────────────────────────────────

function renderSessionItem(
  s: GatewaySessionRow,
  props: ConversationSidebarProps,
  requestUpdate: () => void,
): TemplateResult {
  const isActive = s.key === props.sessionKey;
  const title = getSessionTitle(s);
  const isRenaming = _renamingKey === s.key;
  const isMain = !!(props.mainKey && s.key === props.mainKey);

  return html`
    <div
      class="conv-sidebar__item ${isActive ? "conv-sidebar__item--active" : ""}"
      @click=${() => {
        if (!isRenaming) {
          props.onSelectSession(s.key);
          // Close sidebar on mobile
          if (window.innerWidth <= 768) props.onToggle();
        }
      }}
      @contextmenu=${(e: MouseEvent) => {
        showContextMenu(s.key, e);
        requestUpdate();
      }}
    >
      <div class="conv-sidebar__title-row">
        ${s.pinned ? html`<span class="conv-sidebar__pin-icon">${icons.pin}</span>` : nothing}
        ${
          isRenaming
            ? html`<input
              class="conv-sidebar__rename-input"
              .value=${_renameValue}
              @input=${(e: Event) => {
                _renameValue = (e.target as HTMLInputElement).value;
              }}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter") {
                  props.onRenameSession(s.key, _renameValue);
                  _renamingKey = null;
                  requestUpdate();
                } else if (e.key === "Escape") {
                  _renamingKey = null;
                  requestUpdate();
                }
              }}
              @blur=${() => {
                if (_renamingKey === s.key && _renameValue.trim()) {
                  props.onRenameSession(s.key, _renameValue);
                }
                _renamingKey = null;
                requestUpdate();
              }}
              @click=${(e: Event) => e.stopPropagation()}
            />`
            : html`<span class="conv-sidebar__title">${title}</span>`
        }
        ${isMain ? html`<span class="conv-sidebar__main-badge" title=${t("sidebar.mainSessionCannotDelete")}>${t("sidebar.mainSession")}</span>` : nothing}
        <span class="conv-sidebar__time">${formatTimeShort(s.updatedAt)}</span>
      </div>
      ${nothing /* preview line removed — title already shows the summary */}
      <div class="conv-sidebar__actions">
        <button
          class="conv-sidebar__actions-btn"
          @click=${(e: MouseEvent) => {
            showContextMenu(s.key, e);
            requestUpdate();
          }}
          title="More"
        >
          ${icons.moreHorizontal}
        </button>
      </div>
    </div>
  `;
}

function renderContextMenu(
  props: ConversationSidebarProps,
  sessions: GatewaySessionRow[],
  requestUpdate: () => void,
): TemplateResult | typeof nothing {
  if (!_contextMenuKey) return nothing;

  const session = sessions.find((s) => s.key === _contextMenuKey);
  if (!session) return nothing;

  const isPinned = session.pinned ?? false;
  const isMain = !!(props.mainKey && session.key === props.mainKey);
  const title = getSessionTitle(session);

  return html`
    <div
      class="conv-sidebar__context-menu"
      style="left: ${_contextMenuX}px; top: ${_contextMenuY}px"
      @click=${(e: Event) => e.stopPropagation()}
    >
      <button
        class="conv-sidebar__context-menu-item"
        @click=${() => {
          props.onViewDetails(_contextMenuKey!);
          hideContextMenu();
          requestUpdate();
        }}
      >
        ${icons.settings} ${t("sidebar.viewDetails")}
      </button>
      ${
        isMain
          ? nothing
          : html`
        <div class="conv-sidebar__context-menu-sep"></div>
        <button
          class="conv-sidebar__context-menu-item conv-sidebar__context-menu-item--danger"
          @click=${async () => {
            const key = _contextMenuKey!;
            hideContextMenu();
            requestUpdate();
            const ok = await showConfirmDialog(t("sidebar.deleteConfirm"));
            if (ok) props.onDeleteSession(key);
          }}
        >
          ${icons.trash} ${t("sidebar.delete")}
        </button>
      `
      }
      <div class="conv-sidebar__context-menu-sep"></div>
      <button
        class="conv-sidebar__context-menu-item"
        @click=${() => {
          navigator.clipboard?.writeText(_contextMenuKey!);
          hideContextMenu();
          requestUpdate();
        }}
      >
        ${icons.copy} ${t("sidebar.copyKey")}
      </button>
    </div>
  `;
}

// ── Digital Assets ─────────────────────────────────────

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderAssetItem(asset: DigitalAsset, props: ConversationSidebarProps): TemplateResult {
  const isImage = asset.type === "image";
  const thumb = asset.thumbnailUrl ?? asset.url;
  return html`
    <div
      class="conv-sidebar__asset-item"
      @click=${() => props.onViewAsset?.(asset)}
      title=${asset.name}
    >
      <div class="conv-sidebar__asset-thumb">
        ${
          isImage
            ? html`<img src=${thumb} alt=${asset.name} loading="lazy" />`
            : html`<div class="conv-sidebar__asset-video-thumb">
              <span class="conv-sidebar__asset-play">${icons.play}</span>
            </div>`
        }
      </div>
      <div class="conv-sidebar__asset-info">
        <span class="conv-sidebar__asset-name">${asset.name}</span>
        <span class="conv-sidebar__asset-meta">
          ${formatFileSize(asset.size)}
          ${asset.createdAt ? ` · ${formatTimeShort(asset.createdAt)}` : ""}
        </span>
      </div>
      ${
        props.onDeleteAsset
          ? html`<button
            class="conv-sidebar__asset-delete"
            @click=${(e: Event) => {
              e.stopPropagation();
              props.onDeleteAsset!(asset.id);
            }}
            title="删除"
          >${icons.trash}</button>`
          : nothing
      }
    </div>
  `;
}

function renderAssetsTab(
  props: ConversationSidebarProps,
  requestUpdate: () => void,
): TemplateResult {
  const assets = props.assets ?? [];
  const filtered = _assetFilter === "all" ? assets : assets.filter((a) => a.type === _assetFilter);

  const imageCount = assets.filter((a) => a.type === "image").length;
  const videoCount = assets.filter((a) => a.type === "video").length;

  return html`
    <!-- Asset filter tabs -->
    <div class="conv-sidebar__asset-filters">
      <button
        class="conv-sidebar__asset-filter ${_assetFilter === "all" ? "conv-sidebar__asset-filter--active" : ""}"
        @click=${() => {
          _assetFilter = "all";
          requestUpdate();
        }}
      >
        全部 (${assets.length})
      </button>
      <button
        class="conv-sidebar__asset-filter ${_assetFilter === "image" ? "conv-sidebar__asset-filter--active" : ""}"
        @click=${() => {
          _assetFilter = "image";
          requestUpdate();
        }}
      >
        ${icons.image} 图片 (${imageCount})
      </button>
      <button
        class="conv-sidebar__asset-filter ${_assetFilter === "video" ? "conv-sidebar__asset-filter--active" : ""}"
        @click=${() => {
          _assetFilter = "video";
          requestUpdate();
        }}
      >
        ${icons.play} 视频 (${videoCount})
      </button>
    </div>

    <!-- Asset grid -->
    <div class="conv-sidebar__asset-list">
      ${
        props.assetsLoading
          ? html`<div class="conv-sidebar__empty">${t("common.loading")}</div>`
          : filtered.length === 0
            ? html`<div class="conv-sidebar__empty">
              <span class="conv-sidebar__empty-icon">${icons.image}</span>
              暂无媒体资源
            </div>`
            : filtered.map((a) => renderAssetItem(a, props))
      }
    </div>
  `;
}

// ── Main Render ───────────────────────────────────────

export function renderConversationSidebar(
  props: ConversationSidebarProps,
  requestUpdate: () => void,
): TemplateResult {
  const sessions = (props.sessionsResult?.sessions ?? [])
    // Hide team-agent sessions from the chat sidebar — they belong in the Agents panel.
    // Team-agent session keys contain "orch-" (e.g. "webchat:g-agent-orch-20260307-…").
    .filter((s) => !s.key.includes("orch-"));
  const filtered = filterSessions(sessions, _searchQuery);
  const groups = groupByTime(filtered);
  const hasContent = filtered.length > 0;

  return html`
    <!-- Mobile backdrop -->
    <div
      class="conv-sidebar-backdrop ${!props.open ? "conv-sidebar-backdrop--hidden" : ""}"
      @click=${props.onToggle}
    ></div>

    <!-- Sidebar panel -->
    <div class="conv-sidebar ${!props.open ? "conv-sidebar--collapsed" : ""}">
      <!-- Top toolbar: toggle + title + new chat -->
      <div class="conv-sidebar__toolbar">
        <button
          class="conv-sidebar__toolbar-toggle"
          @click=${props.onToggle}
          title=${t("sidebar.toggleSidebar")}
        >
          ${icons.panelLeft}
          ${props.open ? html`<span class="conv-sidebar__title-text">${t("sidebar.history")}</span>` : nothing}
        </button>
        ${
          props.open
            ? html`
        <div class="conv-sidebar__toolbar-spacer"></div>
        <button
          class="conv-sidebar__toolbar-btn conv-sidebar__toolbar-btn--new-chat"
          ?disabled=${!props.connected}
          @click=${props.onNewChat}
          title=${t("sidebar.newChat")}
        >
          ${icons.edit}
          <span>新建对话</span>
        </button>
        `
            : nothing
        }
      </div>

      <!-- Tab switcher -->
      <div class="conv-sidebar__tabs">
        <button
          class="conv-sidebar__tab ${_activeTab === "conversations" ? "conv-sidebar__tab--active" : ""}"
          @click=${() => {
            _activeTab = "conversations";
            requestUpdate();
          }}
        >
          ${icons.messageSquare}
          <span>对话</span>
        </button>
        <button
          class="conv-sidebar__tab ${_activeTab === "assets" ? "conv-sidebar__tab--active" : ""}"
          @click=${() => {
            _activeTab = "assets";
            props.onAssetsTabActivated?.();
            requestUpdate();
          }}
        >
          ${icons.image}
          <span>资源</span>
        </button>
      </div>

      ${
        _activeTab === "conversations"
          ? html`
        <!-- Search -->
        <div class="conv-sidebar__header">
          <div class="conv-sidebar__search">
            <span class="conv-sidebar__search-icon">${icons.search}</span>
            <input
              class="conv-sidebar__search-input"
              type="text"
              placeholder=${t("sidebar.searchPlaceholder")}
              .value=${_searchQuery}
              @input=${(e: Event) => {
                _searchQuery = (e.target as HTMLInputElement).value;
                requestUpdate();
              }}
            />
          </div>
        </div>

        <!-- Session list -->
        <div class="conv-sidebar__list" @click=${hideContextMenu}>
          ${
            props.sessionsLoading && !hasContent
              ? html`<div class="conv-sidebar__empty">${t("common.loading")}</div>`
              : !hasContent
                ? html`<div class="conv-sidebar__empty">
                  <span class="conv-sidebar__empty-icon">${icons.messageSquare}</span>
                  ${_searchQuery ? t("sidebar.noSearchResults") : t("sidebar.noConversations")}
                </div>`
                : groups.map(
                    (group) => html`
                    <div class="conv-sidebar__group-label">${group.label}</div>
                    ${repeat(
                      group.sessions,
                      (s) => s.key,
                      (s) => renderSessionItem(s, props, requestUpdate),
                    )}
                  `,
                  )
          }
        </div>

        <!-- Footer -->
        <div class="conv-sidebar__footer">
          <button class="conv-sidebar__footer-btn" @click=${props.onManageAll}>
            ${icons.settings}
            <span>${t("sidebar.manageAll")}</span>
          </button>
        </div>
      `
          : renderAssetsTab(props, requestUpdate)
      }
    </div>

    <!-- Context menu overlay -->
    ${renderContextMenu(props, sessions, requestUpdate)}
  `;
}

/** Toggle button for the chat header — shows "历史对话" label when sidebar is closed */
export function renderSidebarToggle(open: boolean, onToggle: () => void): TemplateResult {
  return html`
    <button
      class="conv-sidebar-toggle ${open ? "conv-sidebar-toggle--open" : ""}"
      @click=${onToggle}
      title=${t("sidebar.toggleSidebar")}
      aria-label=${t("sidebar.toggleSidebar")}
    >
      ${icons.panelLeft}
      ${!open ? html`<span class="conv-sidebar-toggle__label">${t("sidebar.history")}</span>` : nothing}
    </button>
  `;
}

// ── Lifecycle ──────────────────────────────────────────

/** Call this once to set up global click-to-close for context menu.
 *  Returns a cleanup function to remove the listener. */
export function setupContextMenuDismiss(requestUpdate: () => void): () => void {
  const handler = () => {
    if (_contextMenuKey) {
      hideContextMenu();
      requestUpdate();
    }
  };
  document.addEventListener("click", handler);
  return () => document.removeEventListener("click", handler);
}

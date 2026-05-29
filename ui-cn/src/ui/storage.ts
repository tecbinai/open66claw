const KEY = "openclawcn.control.settings.v1";
const DOCS_KEY = "openclawcn.docs.v1";

import type { ThemeMode } from "./theme";

declare global {
  interface Window {
    /** Gateway token injected by server for automatic authentication */
    __CLAWDBOT_GATEWAY_TOKEN__?: string;
  }
}

/**
 * Detect token authentication errors (token_missing, token_mismatch).
 * Also checks the raw close reason to handle cases where the error message
 * comes from the preserved connect RPC error (see gateway.ts lastConnectError).
 */
export function isTokenAuthError(error: string | null): boolean {
  if (!error) {return false;}
  const lower = error.toLowerCase();
  return (
    lower.includes("token mismatch") ||
    lower.includes("token_mismatch") ||
    lower.includes("token missing") ||
    lower.includes("token_missing") ||
    (lower.includes("unauthorized") && (lower.includes("1008") || lower.includes("4008")))
  );
}

/** @deprecated Use isTokenAuthError instead */
export const isTokenMismatchError = isTokenAuthError;

/**
 * Fetch the current gateway token from the server via HTTP.
 * Uses the /api/auth/discover endpoint which is localhost-only and returns
 * the current token without requiring a full page reload.
 * Returns null if the server is unreachable or returns an error.
 */
export async function refreshGatewayTokenFromServer(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000); // 5s timeout
    const res = await fetch("/api/auth/discover", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {return null;}
    const data = (await res.json()) as { ok?: boolean; token?: string | null };
    if (!data.ok || !data.token) {return null;}
    return data.token;
  } catch {
    return null;
  }
}

/**
 * Try to recover a valid gateway token by checking:
 * 1. Server-injected window variable (current page load)
 * 2. URL query parameter
 *
 * Returns true if a NEW token was found and saved (caller should reconnect).
 * Returns false if no better token is available (caller should try HTTP refresh).
 */
export function tryFixTokenFromInjection(): boolean {
  const injectedToken = getInjectedGatewayToken();
  if (!injectedToken) {return false;}

  const currentSettings = loadSettings();
  if (currentSettings.token === injectedToken) {
    // Already using the injected token — it's stale too (page not reloaded).
    return false;
  }

  console.log("[openclawcn] Auto-fixing token auth: using server-injected token");
  saveSettings({ ...currentSettings, token: injectedToken });
  return true;
}

/** @deprecated Use tryFixTokenFromInjection instead */
export const tryFixTokenMismatch = tryFixTokenFromInjection;

/**
 * Check if token auth error is completely unrecoverable
 * (no injected token AND no stored token available).
 */
export function isUnrecoverableAuthError(error: string | null): boolean {
  if (!error) {return false;}
  if (!isTokenAuthError(error)) {return false;}
  const injectedToken = getInjectedGatewayToken();
  const currentSettings = loadSettings();
  return !injectedToken && !currentSettings.token;
}

export type UiSettings = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
  lastActiveSessionKey: string;
  theme: ThemeMode;
  chatFocusMode: boolean;
  chatShowThinking: boolean;
  splitRatio: number; // Sidebar split ratio (0.4 to 0.7, default 0.6)
  navCollapsed: boolean; // Collapsible sidebar state
  navGroupsCollapsed: Record<string, boolean>; // Which nav groups are collapsed
};

/**
 * 文档中心存储
 */
export type DocsStorage = {
  favorites: string[]; // 收藏的文档 ID
  history: { id: string; timestamp: number }[]; // 浏览历史
  lastSearchQuery: string; // 上次搜索词
};

/**
 * Get the gateway token from server injection (window.__CLAWDBOT_GATEWAY_TOKEN__),
 * falling back to URL query parameter (?token=xxx) if injection is not available.
 * This allows users to access the UI without having to manually configure the token.
 */
function getInjectedGatewayToken(): string {
  // Primary: server-injected window variable
  if (typeof window !== "undefined" && window.__CLAWDBOT_GATEWAY_TOKEN__) {
    return window.__CLAWDBOT_GATEWAY_TOKEN__.trim();
  }
  // Fallback: check URL query parameter (e.g. from setup wizard redirect)
  try {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken && urlToken.trim()) {
      // FIX BUG#6: 读取后从 URL 中清除 token，防止泄露到浏览器历史/Referer 头
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("token");
        history.replaceState(null, "", cleanUrl.toString());
      } catch {
        // replaceState 失败不阻止正常流程
      }
      return urlToken.trim();
    }
  } catch {
    // ignore
  }
  return "";
}

/** Check if a WebSocket URL points at the same host:port as the current page. */
function isSameOrigin(wsUrl: string): boolean {
  try {
    // Convert ws(s):// to http(s):// so URL parsing works consistently
    const normalized = wsUrl.replace(/^ws(s?):\/\//, "http$1://");
    const url = new URL(normalized);
    // FIX BUG#5: 根据协议返回正确的默认端口（HTTPS=443, HTTP=80）
    const defaultPort = (protocol: string) => (protocol === "https:" ? "443" : "80");
    return (
      url.hostname === location.hostname &&
      (url.port || defaultPort(url.protocol)) === (location.port || defaultPort(location.protocol))
    );
  } catch {
    // FIX BUG#7: 解析失败应返回 false（拒绝注入 token），而非 true
    return false;
  }
}

export function loadSettings(): UiSettings {
  const defaultUrl = (() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    // dev 模式：WS 走 vite 代理（/gw-ws → gateway 根路径），避免系统代理拦截
    if (import.meta.env?.DEV) {
      // 优先从 URL query 参数读取
      try {
        const qGw = new URLSearchParams(location.search).get("gatewayUrl");
        if (qGw?.trim()) return qGw.trim();
      } catch { /* ignore */ }
      // 走同源 vite 代理：ws://localhost:5173/gw-ws → gateway:19001/
      return `${proto}://${location.host}/gw-ws`;
    }
    return `${proto}://${location.host}`;
  })();

  // Get server-injected token for automatic authentication
  const injectedToken = getInjectedGatewayToken();

  const defaults: UiSettings = {
    gatewayUrl: defaultUrl,
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "light",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
  };

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // No saved settings - use injected token if available
      if (injectedToken) {
        const settings = { ...defaults, token: injectedToken };
        // Auto-save to localStorage so subsequent visits work
        saveSettings(settings);
        return settings;
      }
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<UiSettings>;

    // Determine the token to use:
    // Server-injected token takes priority when the user is connecting to the same
    // gateway that served this page (same host + port). This ensures a fresh token
    // after a gateway restart without requiring a manual page reload.
    // When the user has changed gatewayUrl to point at a *different* server (remote
    // gateway), the stored token is used — the injected token is for the local
    // gateway and would be wrong for the remote one.
    const storedToken = typeof parsed.token === "string" ? parsed.token : "";
    const storedGatewayUrl = typeof parsed.gatewayUrl === "string" ? parsed.gatewayUrl.trim() : "";
    const isSameOriginGateway =
      !storedGatewayUrl ||
      storedGatewayUrl === defaults.gatewayUrl ||
      isSameOrigin(storedGatewayUrl);
    const resolvedToken =
      injectedToken && isSameOriginGateway
        ? injectedToken
        : storedToken || injectedToken || defaults.token;

    const storedGwUrl =
      typeof parsed.gatewayUrl === "string" && parsed.gatewayUrl.trim()
        ? parsed.gatewayUrl.trim()
        : "";

    const settings: UiSettings = {
      // dev 模式下强制使用 gateway 端口，忽略 localStorage 缓存的旧值
      gatewayUrl: import.meta.env?.DEV ? defaults.gatewayUrl : (storedGwUrl || defaults.gatewayUrl),
      token: resolvedToken,
      sessionKey:
        typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()
          ? parsed.sessionKey.trim()
          : defaults.sessionKey,
      lastActiveSessionKey:
        typeof parsed.lastActiveSessionKey === "string" && parsed.lastActiveSessionKey.trim()
          ? parsed.lastActiveSessionKey.trim()
          : (typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()) ||
            defaults.lastActiveSessionKey,
      theme:
        parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system"
          ? parsed.theme
          : defaults.theme,
      chatFocusMode:
        typeof parsed.chatFocusMode === "boolean" ? parsed.chatFocusMode : defaults.chatFocusMode,
      chatShowThinking:
        typeof parsed.chatShowThinking === "boolean"
          ? parsed.chatShowThinking
          : defaults.chatShowThinking,
      splitRatio:
        typeof parsed.splitRatio === "number" &&
        parsed.splitRatio >= 0.4 &&
        parsed.splitRatio <= 0.7
          ? parsed.splitRatio
          : defaults.splitRatio,
      navCollapsed:
        typeof parsed.navCollapsed === "boolean" ? parsed.navCollapsed : defaults.navCollapsed,
      navGroupsCollapsed:
        typeof parsed.navGroupsCollapsed === "object" && parsed.navGroupsCollapsed !== null
          ? parsed.navGroupsCollapsed
          : defaults.navGroupsCollapsed,
    };

    // Persist the resolved token to localStorage so subsequent visits and reconnects
    // use the correct value. This also handles the case where a gateway restart changed
    // the token: the fresh page load injects the new token, and we save it here.
    // Only overwrite when we're connecting to the same gateway (don't clobber remote tokens).
    if (injectedToken && isSameOriginGateway && storedToken !== injectedToken) {
      saveSettings(settings);
    }

    return settings;
  } catch {
    // Parse error - use defaults with injected token if available
    if (injectedToken) {
      const settings = { ...defaults, token: injectedToken };
      saveSettings(settings);
      return settings;
    }
    return defaults;
  }
}

export function saveSettings(next: UiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("[storage] localStorage.setItem failed:", e);
  }
}

// ============================================================================
// 文档中心存储
// ============================================================================

const MAX_HISTORY_LENGTH = 20;

function getDefaultDocsStorage(): DocsStorage {
  return {
    favorites: [],
    history: [],
    lastSearchQuery: "",
  };
}

export function loadDocsStorage(): DocsStorage {
  try {
    const raw = localStorage.getItem(DOCS_KEY);
    if (!raw) {return getDefaultDocsStorage();}
    const parsed = JSON.parse(raw) as Partial<DocsStorage>;
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      lastSearchQuery: typeof parsed.lastSearchQuery === "string" ? parsed.lastSearchQuery : "",
    };
  } catch {
    return getDefaultDocsStorage();
  }
}

export function saveDocsStorage(next: DocsStorage) {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("[storage] localStorage.setItem failed:", e);
  }
}

/**
 * 添加到收藏
 */
export function addDocFavorite(docId: string) {
  const storage = loadDocsStorage();
  if (!storage.favorites.includes(docId)) {
    storage.favorites.unshift(docId);
    saveDocsStorage(storage);
  }
}

/**
 * 从收藏移除
 */
export function removeDocFavorite(docId: string) {
  const storage = loadDocsStorage();
  storage.favorites = storage.favorites.filter((id) => id !== docId);
  saveDocsStorage(storage);
}

/**
 * 检查是否已收藏
 */
export function isDocFavorite(docId: string): boolean {
  const storage = loadDocsStorage();
  return storage.favorites.includes(docId);
}

/**
 * 添加到浏览历史
 */
export function addDocHistory(docId: string) {
  const storage = loadDocsStorage();
  // 移除已存在的相同记录
  storage.history = storage.history.filter((item) => item.id !== docId);
  // 添加到最前面
  storage.history.unshift({ id: docId, timestamp: Date.now() });
  // 限制历史记录数量
  if (storage.history.length > MAX_HISTORY_LENGTH) {
    storage.history = storage.history.slice(0, MAX_HISTORY_LENGTH);
  }
  saveDocsStorage(storage);
}

/**
 * 获取浏览历史
 */
export function getDocHistory(): { id: string; timestamp: number }[] {
  const storage = loadDocsStorage();
  return storage.history;
}

/**
 * 保存搜索词
 */
export function saveLastSearchQuery(query: string) {
  const storage = loadDocsStorage();
  storage.lastSearchQuery = query;
  saveDocsStorage(storage);
}

/**
 * 获取上次搜索词
 */
export function getLastSearchQuery(): string {
  const storage = loadDocsStorage();
  return storage.lastSearchQuery;
}

// ============================================================================
// License 续费提醒存储
// ============================================================================


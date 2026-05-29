import { parseAgentSessionKey } from "../shared/session-key-utils.js";
import type { ClawdbotApp } from "./app";
import { scheduleChatScroll } from "./app-scroll";
import { setLastActiveSessionKey } from "./app-settings";
import { resetToolStream } from "./app-tool-stream";
import type { AppViewState } from "./app-view-state";
import {
  abortChatRun,
  loadChatHistory,
  sendChatMessage,
  type ChatSendResult,
} from "./controllers/chat";
import { loadConfig } from "./controllers/config";
import { syncPerformanceProfile } from "./controllers/perf-profile";
import { loadSessions } from "./controllers/sessions";
import { syncSmartDispatch } from "./controllers/smart-dispatch";
import type { GatewayHelloOk } from "./gateway";
import { t } from "./i18n/index.js";
import { normalizeBasePath } from "./navigation";
import type { ChatAttachment, ChatQueueItem } from "./ui-types";
import { generateUUID } from "./uuid";

type ChatHost = {
  connected: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatQueue: ChatQueueItem[];
  chatRunId: string | null;
  chatSending: boolean;
  sessionKey: string;
  basePath: string;
  hello: GatewayHelloOk | null;
  chatAvatarUrl: string | null;
  // OpenClawCN: 聊天模型是否已配置
  chatModelConfigured: boolean | null;
  // OpenClawCN: 必要 provider（硅基流动）是否已配置
  essentialProviderConfigured: boolean | null;
  // OpenClawCN: Screen share state
  screenShareActive?: boolean;
  screenShareLatestFrame?: string | null;
};

export const CHAT_SESSIONS_ACTIVE_MINUTES = 10;

export function isChatBusy(host: ChatHost) {
  return host.chatSending || Boolean(host.chatRunId);
}

export function isChatStopCommand(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const normalized = trimmed.toLowerCase();
  if (normalized === "/stop") return true;
  return (
    normalized === "stop" ||
    normalized === "esc" ||
    normalized === "abort" ||
    normalized === "wait" ||
    normalized === "exit"
  );
}

export async function handleAbortChat(host: ChatHost) {
  if (!host.connected) return;
  host.chatMessage = "";
  await abortChatRun(host as unknown as ClawdbotApp);
}

function enqueueChatMessage(host: ChatHost, text: string, attachments?: ChatAttachment[]) {
  const trimmed = text.trim();
  const hasAttachments = Boolean(attachments && attachments.length > 0);
  if (!trimmed && !hasAttachments) return;
  host.chatQueue = [
    ...host.chatQueue,
    {
      id: generateUUID(),
      text: trimmed,
      createdAt: Date.now(),
      attachments: hasAttachments ? attachments?.map((att) => ({ ...att })) : undefined,
    },
  ];
}

async function sendChatMessageNow(
  host: ChatHost,
  message: string,
  opts?: {
    previousDraft?: string;
    restoreDraft?: boolean;
    attachments?: ChatAttachment[];
    previousAttachments?: ChatAttachment[];
    restoreAttachments?: boolean;
    voiceInput?: boolean;
    voiceMode?: boolean;
  },
) {
  resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
  // Clear completion indicator from previous response
  const app = host as unknown as ClawdbotApp;
  clearTimeout(app._justCompletedTimer);
  app.chatStreamJustCompleted = false;
  // Reset API monitor state for new request
  app.apiMonitorDismissed = false;
  app.apiMonitorElapsedMs = 0;
  // 深度思考模式：开启时传递 thinking level 到 gateway
  const thinking = app.chatDeepThinking ? "high" : undefined;
  const result: ChatSendResult = await sendChatMessage(app, message, opts?.attachments, {
    voiceInput: opts?.voiceInput,
    voiceMode: opts?.voiceMode,
    thinking,
  });

  // [CN-PATCH:voice] Track voice-input runs for frontend-side TTS triggering.
  // When AI response finishes, app-gateway will check this set and synthesize TTS.
  if (opts?.voiceInput && app.chatRunId && "_voiceInputRunIds" in app) {
    (app as any)._voiceInputRunIds.add(app.chatRunId);
  }

  const ok = result === true;
  if (!ok && opts?.previousDraft != null) {
    host.chatMessage = opts.previousDraft;
  }
  if (!ok && opts?.previousAttachments) {
    host.chatAttachments = opts.previousAttachments;
  }
  if (ok) {
    setLastActiveSessionKey(
      host as unknown as Parameters<typeof setLastActiveSessionKey>[0],
      host.sessionKey,
    );
    // 发送成功后立即清空附件，避免卡顿
    // 只有在不需要恢复附件时才清空
    if (!opts?.restoreAttachments) {
      host.chatAttachments = [];
    }
  }
  if (ok && opts?.restoreDraft && opts.previousDraft?.trim()) {
    host.chatMessage = opts.previousDraft;
  }
  if (ok && opts?.restoreAttachments && opts.previousAttachments?.length) {
    host.chatAttachments = opts.previousAttachments;
  }
  scheduleChatScroll(host as unknown as Parameters<typeof scheduleChatScroll>[0]);
  if (ok && !host.chatRunId) {
    void flushChatQueue(host);
  }
  return ok;
}

async function flushChatQueue(host: ChatHost) {
  if (!host.connected || isChatBusy(host)) return;
  const [next, ...rest] = host.chatQueue;
  if (!next) return;
  host.chatQueue = rest;
  const ok = await sendChatMessageNow(host, next.text, { attachments: next.attachments });
  if (!ok) {
    host.chatQueue = [next, ...host.chatQueue];
  }
}

export function removeQueuedMessage(host: ChatHost, id: string) {
  host.chatQueue = host.chatQueue.filter((item) => item.id !== id);
}

export async function handleSendChat(
  host: ChatHost,
  messageOverride?: string,
  opts?: { restoreDraft?: boolean; voiceInput?: boolean; voiceMode?: boolean },
) {
  if (!host.connected) return;
  const previousDraft = host.chatMessage;
  let message = (messageOverride ?? host.chatMessage).trim();
  const attachments = host.chatAttachments ?? [];
  let attachmentsToSend = messageOverride == null ? [...attachments] : [];

  // OpenClawCN: Auto-inject latest screen frame when screen sharing is active
  const hasScreenFrame = Boolean(host.screenShareActive && host.screenShareLatestFrame);
  if (hasScreenFrame) {
    attachmentsToSend.push({
      id: `screen-${Date.now()}`,
      dataUrl: host.screenShareLatestFrame!,
      mimeType: "image/jpeg",
      fileName: "screen-capture.jpg",
    });
    // If user sent without text during screen share, add a default prompt
    if (!message) {
      message = t("screenShare.defaultPrompt" as Parameters<typeof t>[0]);
    }
  }

  const hasAttachments = attachmentsToSend.length > 0;

  // Allow sending with just attachments (no message text required)
  if (!message && !hasAttachments) return;

  if (isChatStopCommand(message)) {
    await handleAbortChat(host);
    return;
  }

  // 清空消息文本 — 仅当用户主动发送时清空输入框，
  // messageOverride（如语音自动发送）不应清空用户正在编辑的草稿
  if (messageOverride == null) {
    host.chatMessage = "";
  }

  if (isChatBusy(host)) {
    enqueueChatMessage(host, message, attachmentsToSend);
    // 如果消息已入队，立即清空输入框和附件
    if (messageOverride == null) {
      host.chatAttachments = [];
    }
    // 入队后滚动到底部，让用户看到排队消息
    scheduleChatScroll(host as unknown as Parameters<typeof scheduleChatScroll>[0]);
    return;
  }

  await sendChatMessageNow(host, message, {
    // 始终传递 previousDraft，以便 restoreDraft 时可以恢复用户输入
    previousDraft: previousDraft,
    restoreDraft: Boolean(messageOverride && opts?.restoreDraft),
    attachments: hasAttachments ? attachmentsToSend : undefined,
    previousAttachments: attachments,
    restoreAttachments: Boolean(messageOverride && opts?.restoreDraft),
    voiceInput: opts?.voiceInput,
  });
}

export async function refreshChat(host: ChatHost) {
  // [CN-PERF] Pre-load config once so syncPerformanceProfile / syncSmartDispatch
  // skip their internal loadConfig() calls (each was a redundant config.get RPC).
  const app = host as unknown as ClawdbotApp;
  if (app.client && app.connected && !(host as unknown as AppViewState).configSnapshot?.hash) {
    await loadConfig(app);
  }
  await Promise.all([
    loadChatHistory(app),
    loadSessions(app),
    refreshChatAvatar(host),
    syncPerformanceProfile(host as unknown as AppViewState),
    syncSmartDispatch(host as unknown as AppViewState),
    checkChatModelConfigured(host),
  ]);
  scheduleChatScroll(host as unknown as Parameters<typeof scheduleChatScroll>[0], true);
}

/**
 * OpenClawCN: 检查聊天(text)能力是否已配置
 * 用于在聊天页面显示配置提示
 */
async function checkChatModelConfigured(host: ChatHost): Promise<void> {
  const app = host as unknown as ClawdbotApp;
  if (!app.client || !app.connected) return;
  try {
    // [CN-PERF] Fire both RPCs in parallel instead of sequentially.
    const [result, provResult] = await Promise.all([
      app.client.request("capability_matrix.summary") as Promise<{
        capabilities?: Array<{ key: string; status: string }>;
      }>,
      app.client.request("capability_matrix.providers.list").catch(() => null) as Promise<{
        providers?: Array<{ providerId: string; configured?: boolean }>;
      } | null>,
    ]);

    const caps = (result.capabilities ?? []).map((c) => ({
      capability: c.key,
      status: c.status === "active" ? "active" : "inactive",
    }));
    const textCap = caps.find((c) => c.capability === "text");
    host.chatModelConfigured = textCap?.status === "active";
    // 同步提取所有已激活的能力，供 intent-hint 判断缺失能力
    const activeCaps = caps.filter((c) => c.status === "active").map((c) => c.capability);
    (app as unknown as { activeCapabilities: string[] }).activeCapabilities = activeCaps;

    // 检查必要 provider（硅基流动）是否已配置
    if (provResult) {
      const sf = (provResult.providers ?? []).find((p) => p.providerId === "siliconflow");
      host.essentialProviderConfigured = sf?.configured ?? false;
    } else {
      host.essentialProviderConfigured = null;
    }
  } catch {
    // 降级：查询失败时不显示提示
    host.chatModelConfigured = null;
    host.essentialProviderConfigured = null;
  }
}

export const flushChatQueueForEvent = flushChatQueue;

type SessionDefaultsSnapshot = {
  defaultAgentId?: string;
};

function resolveAgentIdForSession(host: ChatHost): string | null {
  const parsed = parseAgentSessionKey(host.sessionKey);
  if (parsed?.agentId) return parsed.agentId;
  const snapshot = host.hello?.snapshot as
    | { sessionDefaults?: SessionDefaultsSnapshot }
    | undefined;
  const fallback = snapshot?.sessionDefaults?.defaultAgentId?.trim();
  return fallback || "main";
}

function buildAvatarMetaUrl(basePath: string, agentId: string): string {
  const base = normalizeBasePath(basePath);
  const encoded = encodeURIComponent(agentId);
  return base ? `${base}/avatar/${encoded}?meta=1` : `/avatar/${encoded}?meta=1`;
}

export async function refreshChatAvatar(host: ChatHost) {
  if (!host.connected) {
    host.chatAvatarUrl = null;
    return;
  }
  const agentId = resolveAgentIdForSession(host);
  if (!agentId) {
    host.chatAvatarUrl = null;
    return;
  }
  host.chatAvatarUrl = null;
  const url = buildAvatarMetaUrl(host.basePath, agentId);
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      host.chatAvatarUrl = null;
      return;
    }
    const data = (await res.json()) as { avatarUrl?: unknown };
    const avatarUrl = typeof data.avatarUrl === "string" ? data.avatarUrl.trim() : "";
    host.chatAvatarUrl = avatarUrl || null;
  } catch {
    host.chatAvatarUrl = null;
  }
}

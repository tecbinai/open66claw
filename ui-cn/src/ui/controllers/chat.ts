import { formatErrorHintFull } from "../chat/error-hints";
import {
  extractText,
  extractRawText,
  type FailoverNotificationPayload,
} from "../chat/message-extract";
import type { GatewayBrowserClient } from "../gateway";
import type { ChatAttachment } from "../ui-types";
import { generateUUID } from "../uuid";
import { checkModalityBeforeSend } from "./modality-guard";

// Track runs that detected a free model switch notification.
// Used to trigger auto new-session when the run completes.
const freeModelSwitchRuns = new Set<string>();

// OpenClawCN: Track runs that detected a failover notification.
const failoverNotificationRuns = new Map<string, FailoverNotificationPayload>();

/** Failover reason → Chinese display text */
const FAILOVER_REASON_MAP: Record<string, string> = {
  billing: "余额不足",
  auth: "密钥无效",
  rate_limit: "频率限制",
  timeout: "请求超时",
  format: "格式错误",
  unknown: "请求失败",
};

export type ChatState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey: string;
  chatLoading: boolean;
  chatMessages: unknown[];
  chatThinkingLevel: string | null;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatRunId: string | null;
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  chatStreamJustCompleted?: boolean;
  /** Active media generation tool (video_gen / image_gen / image_edit) detected in stream */
  chatMediaToolActive: { tool: string; args?: Record<string, unknown> } | null;
  lastError: string | null;
  /** OpenClawCN: auto-failover notification banner */
  failoverBanner: {
    fromProvider: string;
    toProvider: string;
    toModel: string;
    reason: string;
    reasonText: string;
  } | null;
};

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
  /** TTS audio attached by server on "final" when auto-TTS is active. */
  ttsAudio?: { base64: string; format: string };
};

export async function loadChatHistory(state: ChatState) {
  if (!state.client || !state.connected) return;
  state.chatLoading = true;
  state.lastError = null;
  try {
    const res = (await state.client.request("chat.history", {
      sessionKey: state.sessionKey,
      limit: 200,
    })) as { messages?: unknown[]; thinkingLevel?: string | null };
    state.chatMessages = Array.isArray(res.messages) ? res.messages : [];
    state.chatThinkingLevel = res.thinkingLevel ?? null;
    // [CN-PATCH:dedup] Safety-net: clear chatStream if no active run.
    // Primary dedup happens in handleChatEvent("final") which clears chatStream
    // synchronously. This catch-all handles edge cases (e.g. reconnect mid-stream).
    if (state.chatStream && !state.chatRunId) {
      state.chatStream = null;
    }
    // [CN] Restore omitted images from persisted media (fire-and-forget)
    restoreOmittedImages(state).catch(() => {});
  } catch (err) {
    state.lastError = String(err);
  } finally {
    state.chatLoading = false;
  }
}

function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1], content: match[2] };
}

// [CN-MERGE:8264d4521b+f2e9986813] Validate final assistant message before appending
function normalizeFinalAssistantMessage(message: unknown): Record<string, unknown> | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  const candidate = message as Record<string, unknown>;
  const role = typeof candidate.role === "string" ? candidate.role.toLowerCase() : "";
  if (role && role !== "assistant") {
    return null;
  }
  if (!("content" in candidate) && !("text" in candidate)) {
    return null;
  }
  return candidate;
}

export type ChatSendResult = boolean | { ok: false; isLicenseError: true; error: string };

export async function sendChatMessage(
  state: ChatState,
  message: string,
  attachments?: ChatAttachment[],
  opts?: { voiceInput?: boolean; voiceMode?: boolean; thinking?: string },
): Promise<ChatSendResult> {
  if (!state.client || !state.connected) return false;
  const msg = message.trim();
  const hasAttachments = attachments && attachments.length > 0;
  if (!msg && !hasAttachments) return false;

  // OpenClawCN: 多模态能力检测 — 发送前检查是否配置了所需的模型
  const guardResult = await checkModalityBeforeSend({
    client: state.client,
    message: msg,
    attachments,
  });
  if (!guardResult.canProceed) {
    return false;
  }

  const now = Date.now();

  // Build user message content blocks
  const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
  if (msg) {
    contentBlocks.push({ type: "text", text: msg });
  }
  // Add attachment previews to the message for display
  if (hasAttachments) {
    for (const att of attachments) {
      const cat =
        att.category ??
        (att.mimeType.startsWith("image/")
          ? "image"
          : att.mimeType.startsWith("video/")
            ? "video"
            : "file");
      if (cat === "image") {
        contentBlocks.push({
          type: "image",
          source: { type: "base64", media_type: att.mimeType, data: att.dataUrl },
        });
      } else {
        // Non-image: show as text in the message bubble
        contentBlocks.push({
          type: "text",
          text: `📎 ${att.fileName ?? "file"} (${att.mimeType})`,
        });
      }
    }
  }

  state.chatMessages = [
    ...state.chatMessages,
    {
      role: "user",
      content: contentBlocks,
      timestamp: now,
    },
  ];

  state.chatSending = true;
  state.lastError = null;
  state.chatMediaToolActive = null;
  const runId = generateUUID();
  state.chatRunId = runId;
  state.chatStream = "";
  state.chatStreamStartedAt = now;

  // Convert attachments to API format
  const apiAttachments = hasAttachments
    ? attachments
        .map((att) => {
          const parsed = dataUrlToBase64(att.dataUrl);
          if (!parsed) return null;
          const isImage = att.mimeType.startsWith("image/");
          return {
            type: isImage ? "image" : "file",
            mimeType: parsed.mimeType,
            content: parsed.content,
            fileName: att.fileName,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null)
    : undefined;

  try {
    await state.client.request("chat.send", {
      sessionKey: state.sessionKey,
      message: msg,
      deliver: false,
      idempotencyKey: runId,
      attachments: apiAttachments,
      ...(opts?.thinking ? { thinking: opts.thinking } : {}),
    });

    // [CN] 持久化用户上传的图片到磁盘，成功后将乐观消息中的 base64 替换为 URL
    if (apiAttachments && apiAttachments.length > 0) {
      const imageAtts = apiAttachments.filter((a) => a.type === "image" && a.content);
      if (imageAtts.length > 0) {
        state.client
          .request("cn.chat.saveImages", {
            sessionKey: state.sessionKey,
            images: imageAtts.map((a) => ({ base64: a.content, mimeType: a.mimeType })),
            messageText: msg.slice(0, 100),
          })
          .then((result: any) => {
            // 用服务端返回的 URL 替换乐观消息中的 base64 data，释放内存
            const urls = result?.urls as string[] | undefined;
            if (urls && urls.length > 0) {
              replaceOptimisticImageData(state, now, urls);
            }
          })
          .catch(() => {
            /* 保存失败不影响聊天 */
          });
      }
    }

    return true;
  } catch (err) {
    const error = String(err);

    state.chatRunId = null;
    state.chatStream = null;
    state.chatStreamStartedAt = null;
    state.chatMediaToolActive = null;

    state.lastError = error;

    // 添加格式化的错误消息（使用完整版 — 含友好提示 + 解决建议）
    const errorHint = formatErrorHintFull(error);
    const errorText = errorHint.rawError
      ? `${errorHint.friendlyMessage}\n\n> ${errorHint.rawError}`
      : errorHint.friendlyMessage;
    state.chatMessages = [
      ...state.chatMessages,
      {
        role: "assistant",
        content: [{ type: "text", text: errorText }],
        timestamp: Date.now(),
        isError: true,
      },
    ];
    return false;
  } finally {
    state.chatSending = false;
  }
}

export async function abortChatRun(state: ChatState): Promise<boolean> {
  if (!state.client || !state.connected) return false;
  const runId = state.chatRunId;
  try {
    await state.client.request(
      "chat.abort",
      runId ? { sessionKey: state.sessionKey, runId } : { sessionKey: state.sessionKey },
    );
    return true;
  } catch (err) {
    state.lastError = String(err);
    return false;
  }
}

export function handleChatEvent(state: ChatState, payload?: ChatEventPayload) {
  if (!payload) return null;
  // [CN-FIX:session-key-mismatch] The gateway may broadcast sessionKey with an
  // "agent:<agentId>:" prefix (e.g. "agent:main:UUID") while the client stores
  // just the bare UUID. Match if either key ends with / contains the other.
  const payloadKey = payload.sessionKey ?? "";
  const stateKey = state.sessionKey ?? "";
  const sessionMatch =
    payloadKey === stateKey ||
    payloadKey.endsWith(`:${stateKey}`) ||
    stateKey.endsWith(`:${payloadKey}`);
  if (!sessionMatch) return null;

  // Final from another run (e.g. sub-agent announce): refresh history to show new message.
  // See https://github.com/clawdbot/clawdbot/issues/1909
  if (payload.runId && state.chatRunId && payload.runId !== state.chatRunId) {
    // [CN-MERGE:f2e9986813] Append out-of-band final payloads inline
    if (payload.state === "final") {
      const finalMessage = normalizeFinalAssistantMessage(payload.message);
      if (finalMessage) {
        state.chatMessages = [...state.chatMessages, finalMessage];
        return null;
      }
      return "final";
    }
    return null;
  }

  if (payload.state === "delta") {
    const next = extractText(payload.message);
    if (typeof next === "string") {
      const current = state.chatStream ?? "";
      if (!current || next.length >= current.length) {
        state.chatStream = next;
      }
    }
    // Detect free model switch notification in raw stream text
    const rawText = extractRawText(payload.message);
    if (rawText && /<!--CLAWDBOT_FREE_MODEL_NOTIFICATION:/.test(rawText)) {
      freeModelSwitchRuns.add(payload.runId);
    }
    // [CN-PATCH:media-tool-heartbeat] Detect media generation tool marker
    if (rawText && /<!--MEDIA_TOOL_ACTIVE:/.test(rawText)) {
      const mtMatch = rawText.match(/<!--MEDIA_TOOL_ACTIVE:(.+?)-->/);
      if (mtMatch) {
        try {
          state.chatMediaToolActive = JSON.parse(mtMatch[1]) as {
            tool: string;
            args?: Record<string, unknown>;
          };
        } catch {
          /* ignore */
        }
      }
    }
    // OpenClawCN: detect failover notification in raw stream text
    if (rawText && /<!--CLAWDBOT_FAILOVER_NOTIFICATION:/.test(rawText)) {
      const match = rawText.match(/<!--CLAWDBOT_FAILOVER_NOTIFICATION:(.+?)-->/);
      if (match) {
        try {
          const notification = JSON.parse(match[1]) as FailoverNotificationPayload;
          failoverNotificationRuns.set(payload.runId, notification);
        } catch {
          /* ignore parse error */
        }
      }
    }
  } else if (payload.state === "final") {
    const hadModelSwitch = freeModelSwitchRuns.delete(payload.runId);
    // OpenClawCN: consume failover notification and set banner
    const failoverInfo = failoverNotificationRuns.get(payload.runId);
    failoverNotificationRuns.delete(payload.runId);
    if (failoverInfo) {
      state.failoverBanner = {
        fromProvider: failoverInfo.fromProvider,
        toProvider: failoverInfo.toProvider,
        toModel: failoverInfo.toModel,
        reason: failoverInfo.reason,
        reasonText: FAILOVER_REASON_MAP[failoverInfo.reason] ?? failoverInfo.reason,
      };
      // Auto-dismiss after 15 seconds
      setTimeout(() => {
        state.failoverBanner = null;
      }, 15_000);
    }
    // [CN-PATCH:dedup] Optimistically add the final message to chatMessages BEFORE
    // clearing chatStream. This prevents the "reply disappears" gap between clearing
    // the stream and the async loadChatHistory RPC completing.
    // [CN-MERGE:8264d4521b] Validate message has assistant role and content before appending.
    let finalMessage = normalizeFinalAssistantMessage(payload.message);
    // [CN-FIX:swallowed-reply] When the server sends chat.final with no message
    // (e.g. tool-only responses where the buffer was empty), preserve whatever
    // was streamed so the user doesn't see their content vanish.
    if (!finalMessage && state.chatStream) {
      finalMessage = {
        role: "assistant",
        content: [{ type: "text", text: state.chatStream }],
        timestamp: Date.now(),
        _streamFallback: true,
      };
    }
    if (finalMessage) {
      state.chatMessages = [...state.chatMessages, finalMessage];
    }
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
    state.chatMediaToolActive = null;
    // Return special indicator so gateway can auto-create new session
    if (hadModelSwitch) return "final_model_switch";
    if (failoverInfo) return "final_failover";
  } else if (payload.state === "aborted") {
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
    state.chatMediaToolActive = null;
  } else if (payload.state === "error") {
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
    state.chatMediaToolActive = null;
    const errorMsg = payload.errorMessage ?? "聊天请求失败";
    state.lastError = errorMsg;

    // 添加格式化的错误消息到聊天历史（使用完整版 — 含友好提示 + 解决建议）
    const errorHint = formatErrorHintFull(errorMsg);
    const errorText = errorHint.rawError
      ? `${errorHint.friendlyMessage}\n\n> ${errorHint.rawError}`
      : errorHint.friendlyMessage;
    state.chatMessages = [
      ...state.chatMessages,
      {
        role: "assistant",
        content: [{ type: "text", text: errorText }],
        timestamp: Date.now(),
        isError: true,
      },
    ];
  }
  return payload.state;
}

// ---------------------------------------------------------------------------
// [CN] Image persistence helpers
// ---------------------------------------------------------------------------

/**
 * After cn.chat.saveImages returns URLs, replace base64 data in the optimistic
 * user message (identified by timestamp) with URL references.
 * This releases memory and ensures history reload shows images via HTTP.
 */
function replaceOptimisticImageData(state: ChatState, timestamp: number, urls: string[]): void {
  const idx = state.chatMessages.findIndex(
    (m: any) => m.role === "user" && m.timestamp === timestamp,
  );
  if (idx === -1) return;

  const msg = state.chatMessages[idx] as any;
  const content = msg.content;
  if (!Array.isArray(content)) return;

  let urlIdx = 0;
  const newContent = content.map((block: any) => {
    if (block.type === "image" && urlIdx < urls.length) {
      const url = urls[urlIdx++];
      // Replace base64 source with URL reference
      return { type: "image", url };
    }
    return block;
  });

  // Immutable update to trigger reactivity
  const updated = [...state.chatMessages];
  updated[idx] = { ...msg, content: newContent };
  state.chatMessages = updated;
}

/**
 * Restore omitted images in chat history messages using persisted media URLs.
 * Called after loadChatHistory to patch `{ type: "image", omitted: true }` blocks.
 */
export async function restoreOmittedImages(state: ChatState): Promise<void> {
  if (!state.client || state.chatMessages.length === 0) return;

  try {
    const res = (await state.client.request("media.list", {
      sessionKey: state.sessionKey,
    })) as { assets?: Array<{ id: string; type: string; url: string; createdAt: number }> };

    const imageAssets = (res.assets ?? []).filter((a) => a.type === "image");
    if (imageAssets.length === 0) return;

    // Sort by creation time for sequential matching
    imageAssets.sort((a, b) => a.createdAt - b.createdAt);

    let assetIdx = 0;
    let changed = false;
    const updated = state.chatMessages.map((msg: any) => {
      if (msg.role !== "user" || !Array.isArray(msg.content)) return msg;

      let msgChanged = false;
      const newContent = msg.content.map((block: any) => {
        if (block.type === "image" && block.omitted && assetIdx < imageAssets.length) {
          const asset = imageAssets[assetIdx++];
          msgChanged = true;
          return { type: "image", url: asset.url };
        }
        return block;
      });

      if (msgChanged) {
        changed = true;
        return { ...msg, content: newContent };
      }
      return msg;
    });

    if (changed) {
      state.chatMessages = updated;
    }
  } catch {
    // Non-critical — images just won't be restored
  }
}

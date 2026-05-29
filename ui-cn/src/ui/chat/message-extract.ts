import { stripEnvelope } from "../../shared/chat-envelope.js";
import { stripThinkingTags } from "../format.ts";

const textCache = new WeakMap<object, string | null>();
const thinkingCache = new WeakMap<object, string | null>();
const freeModelNotificationCache = new WeakMap<object, FreeModelNotification | null>();
const failoverNotificationCache = new WeakMap<object, FailoverNotificationPayload | null>();

/** OpenClawCN 免费模型通知类型 */
export type FreeModelNotification = {
  type: "started" | "switched" | "exhausted" | "fallback";
  providerName: string;
  message: string;
  showInChat: boolean;
};

/** OpenClawCN Provider 自动切换通知类型 */
export type FailoverNotificationPayload = {
  type: "auto_failover";
  fromProvider: string;
  fromModel: string;
  toProvider: string;
  toModel: string;
  reason: string;
  attemptCount: number;
};

/** Strip internal notification markers from text before display */
function stripNotificationMarkers(text: string): string {
  return text
    .replace(/<!--CLAWDBOT_FAILOVER_NOTIFICATION:.+?-->/g, "")
    .replace(/<!--(?:CLAWDBOT|OPENCLAWCN)_FREE_MODEL_NOTIFICATION:.+?-->/g, "")
    .replace(/<!--MEDIA_TOOL_ACTIVE:.+?-->/g, "")
    .trim();
}

function stripInlineDirectiveTags(text: string): string {
  return text
    .replace(/\[\[\s*reply_to_current\s*\]\]/gi, " ")
    .replace(/\[\[\s*reply_to\s*:[^\]]*?\]\]/gi, " ")
    .replace(/\[\[\s*audio_as_voice\s*\]\]/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

export function extractText(message: unknown): string | null {
  const m = message as Record<string, unknown>;
  const role = typeof m.role === "string" ? m.role : "";
  const content = m.content;
  if (typeof content === "string") {
    const processed = role === "assistant" ? stripThinkingTags(content) : stripEnvelope(content);
    return stripInlineDirectiveTags(stripNotificationMarkers(processed));
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        const item = p as Record<string, unknown>;
        if (item.type === "text" && typeof item.text === "string") {
          return item.text;
        }
        return null;
      })
      .filter((v): v is string => typeof v === "string");
    if (parts.length > 0) {
      const joined = parts.join("\n");
      const processed = role === "assistant" ? stripThinkingTags(joined) : stripEnvelope(joined);
      return stripInlineDirectiveTags(stripNotificationMarkers(processed));
    }
  }
  if (typeof m.text === "string") {
    const processed = role === "assistant" ? stripThinkingTags(m.text) : stripEnvelope(m.text);
    return stripInlineDirectiveTags(stripNotificationMarkers(processed));
  }
  return null;
}

export function extractTextCached(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return extractText(message);
  }
  const obj = message;
  if (textCache.has(obj)) {
    return textCache.get(obj) ?? null;
  }
  const value = extractText(message);
  textCache.set(obj, value);
  return value;
}

export function extractThinking(message: unknown): string | null {
  const m = message as Record<string, unknown>;
  const content = m.content;
  const parts: string[] = [];
  if (Array.isArray(content)) {
    for (const p of content) {
      const item = p as Record<string, unknown>;
      if (item.type === "thinking" && typeof item.thinking === "string") {
        const cleaned = item.thinking.trim();
        if (cleaned) {
          parts.push(cleaned);
        }
      }
    }
  }
  if (parts.length > 0) {
    return parts.join("\n");
  }

  // Back-compat: older logs may still have <think> tags inside text blocks.
  const rawText = extractRawText(message);
  if (!rawText) {
    return null;
  }
  const matches = [
    ...rawText.matchAll(/<\s*think(?:ing)?\s*>([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/gi),
  ];
  const extracted = matches.map((m) => (m[1] ?? "").trim()).filter(Boolean);
  return extracted.length > 0 ? extracted.join("\n") : null;
}

export function extractThinkingCached(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return extractThinking(message);
  }
  const obj = message;
  if (thinkingCache.has(obj)) {
    return thinkingCache.get(obj) ?? null;
  }
  const value = extractThinking(message);
  thinkingCache.set(obj, value);
  return value;
}

export function extractRawText(message: unknown): string | null {
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        const item = p as Record<string, unknown>;
        if (item.type === "text" && typeof item.text === "string") {
          return item.text;
        }
        return null;
      })
      .filter((v): v is string => typeof v === "string");
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  if (typeof m.text === "string") {
    return m.text;
  }
  return null;
}

export function formatReasoningMarkdown(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `_${line}_`);
  return lines.length ? ["_Reasoning:_", ...lines].join("\n") : "";
}

/**
 * Extract OpenClawCN free model notification from message text
 */
export function extractFreeModelNotification(message: unknown): FreeModelNotification | null {
  if (!message || typeof message !== "object") return null;

  const obj = message as object;
  if (freeModelNotificationCache.has(obj)) {
    return freeModelNotificationCache.get(obj) ?? null;
  }

  const rawText = extractRawText(message);
  if (!rawText) {
    freeModelNotificationCache.set(obj, null);
    return null;
  }

  const match = rawText.match(/<!--OPENCLAWCN_FREE_MODEL_NOTIFICATION:(.+?)-->/);
  if (!match) {
    freeModelNotificationCache.set(obj, null);
    return null;
  }

  try {
    const notification = JSON.parse(match[1]) as FreeModelNotification;
    freeModelNotificationCache.set(obj, notification);
    return notification;
  } catch {
    freeModelNotificationCache.set(obj, null);
    return null;
  }
}

/**
 * Extract OpenClawCN failover notification from message text
 */
export function extractFailoverNotification(message: unknown): FailoverNotificationPayload | null {
  if (!message || typeof message !== "object") return null;

  const obj = message as object;
  if (failoverNotificationCache.has(obj)) {
    return failoverNotificationCache.get(obj) ?? null;
  }

  const rawText = extractRawText(message);
  if (!rawText) {
    failoverNotificationCache.set(obj, null);
    return null;
  }

  const match = rawText.match(/<!--CLAWDBOT_FAILOVER_NOTIFICATION:(.+?)-->/);
  if (!match) {
    failoverNotificationCache.set(obj, null);
    return null;
  }

  try {
    const notification = JSON.parse(match[1]) as FailoverNotificationPayload;
    failoverNotificationCache.set(obj, notification);
    return notification;
  } catch {
    failoverNotificationCache.set(obj, null);
    return null;
  }
}

/**
 * Strip failover notification markers from displayed text
 */
export function stripFailoverNotification(text: string): string {
  return text.replace(/<!--CLAWDBOT_FAILOVER_NOTIFICATION:.+?-->/g, "").trim();
}

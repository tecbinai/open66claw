import type { GatewayBrowserClient } from "../gateway";
import type { ChatAttachment } from "../ui-types";
/**
 * OpenClawCN: Embedded Agent Chat Controller
 *
 * Provides chat send/receive/abort for the embedded chat panel
 * inside the agents page. Reuses the existing ChatState functions
 * from controllers/chat.ts via an adapter that maps agentChat*
 * state properties to the ChatState interface.
 */
import {
  loadChatHistory as _loadChatHistory,
  sendChatMessage as _sendChatMessage,
  abortChatRun as _abortChatRun,
  handleChatEvent as _handleChatEvent,
  type ChatState,
  type ChatEventPayload,
} from "./chat.js";

/** Minimal host interface — only the agentChat* properties we need. */
export type AgentChatHost = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  agentChatSessionKey: string;
  agentChatMessages: unknown[];
  agentChatStream: string | null;
  agentChatStreamStartedAt: number | null;
  agentChatRunId: string | null;
  agentChatSending: boolean;
  agentChatLoading: boolean;
  agentChatMessage: string;
  agentChatAttachments: ChatAttachment[];
  agentChatError: string | null;
};

/**
 * Build a ChatState-compatible proxy that reads/writes the host's
 * agentChat* properties. This lets us reuse loadChatHistory,
 * sendChatMessage, handleChatEvent, etc. unchanged.
 */
function buildAdapter(host: AgentChatHost): ChatState {
  return {
    get client() {
      return host.client;
    },
    get connected() {
      return host.connected;
    },
    get sessionKey() {
      return host.agentChatSessionKey;
    },
    set sessionKey(v) {
      host.agentChatSessionKey = v;
    },
    get chatLoading() {
      return host.agentChatLoading;
    },
    set chatLoading(v) {
      host.agentChatLoading = v;
    },
    get chatMessages() {
      return host.agentChatMessages;
    },
    set chatMessages(v) {
      host.agentChatMessages = v;
    },
    get chatThinkingLevel() {
      return null;
    },
    set chatThinkingLevel(_v) {
      /* ignore */
    },
    get chatSending() {
      return host.agentChatSending;
    },
    set chatSending(v) {
      host.agentChatSending = v;
    },
    get chatMessage() {
      return host.agentChatMessage;
    },
    set chatMessage(v) {
      host.agentChatMessage = v;
    },
    get chatAttachments() {
      return host.agentChatAttachments;
    },
    set chatAttachments(v) {
      host.agentChatAttachments = v;
    },
    get chatRunId() {
      return host.agentChatRunId;
    },
    set chatRunId(v) {
      host.agentChatRunId = v;
    },
    get chatStream() {
      return host.agentChatStream;
    },
    set chatStream(v) {
      host.agentChatStream = v;
    },
    get chatStreamStartedAt() {
      return host.agentChatStreamStartedAt;
    },
    set chatStreamStartedAt(v) {
      host.agentChatStreamStartedAt = v;
    },
    get chatStreamJustCompleted() {
      return false;
    },
    set chatStreamJustCompleted(_v) {
      /* ignore */
    },
    get chatMediaToolActive() {
      return null;
    },
    set chatMediaToolActive(_v) {
      /* ignore for agent chat */
    },
    get lastError() {
      return host.agentChatError;
    },
    set lastError(v) {
      host.agentChatError = v;
    },
    get failoverBanner() {
      return null;
    },
    set failoverBanner(_v) {
      /* ignore */
    },
  };
}

/**
 * Reset embedded chat state and switch to a new agent session.
 * Aborts any active run before resetting.
 */
export function resetAgentChatState(host: AgentChatHost, sessionKey: string) {
  // Abort active run if any (fire-and-forget)
  if (host.agentChatRunId) {
    void _abortChatRun(buildAdapter(host));
  }
  host.agentChatSessionKey = sessionKey;
  host.agentChatMessages = [];
  host.agentChatStream = null;
  host.agentChatStreamStartedAt = null;
  host.agentChatRunId = null;
  host.agentChatError = null;
  host.agentChatSending = false;
}

export async function loadAgentChatHistory(host: AgentChatHost) {
  await _loadChatHistory(buildAdapter(host));
}

export async function sendAgentChatMessage(
  host: AgentChatHost,
  message: string,
  attachments?: ChatAttachment[],
) {
  return _sendChatMessage(buildAdapter(host), message, attachments);
}

export async function abortAgentChatRun(host: AgentChatHost) {
  return _abortChatRun(buildAdapter(host));
}

/**
 * Handle a chat event for the embedded agent chat.
 * Returns the event state string if consumed, or null if not matched.
 */
export function handleAgentChatEvent(
  host: AgentChatHost,
  payload?: ChatEventPayload,
): string | null {
  if (!payload) return null;
  if (payload.sessionKey !== host.agentChatSessionKey) return null;
  return _handleChatEvent(buildAdapter(host), payload);
}

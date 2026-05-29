import { describe, expect, it } from "vitest";
import { handleChatEvent, type ChatEventPayload, type ChatState } from "./chat";

function createState(overrides: Partial<ChatState> = {}): ChatState {
  return {
    client: null,
    connected: true,
    sessionKey: "main",
    chatLoading: false,
    chatMessages: [],
    chatThinkingLevel: null,
    chatSending: false,
    chatMessage: "",
    chatAttachments: [],
    chatRunId: null,
    chatStream: null,
    chatStreamStartedAt: null,
    chatStreamJustCompleted: false,
    chatMediaToolActive: null,
    lastError: null,
    failoverBanner: null,
    ...overrides,
  };
}

describe("handleChatEvent", () => {
  it("returns null when payload is missing", () => {
    const state = createState();
    expect(handleChatEvent(state, undefined)).toBe(null);
  });

  it("returns null when sessionKey does not match", () => {
    const state = createState({ sessionKey: "main" });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "other",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe(null);
  });

  it("returns null for delta from another run", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-user",
      chatStream: "Hello",
    });
    const payload: ChatEventPayload = {
      runId: "run-announce",
      sessionKey: "main",
      state: "delta",
      message: { role: "assistant", content: [{ type: "text", text: "Done" }] },
    };
    expect(handleChatEvent(state, payload)).toBe(null);
    expect(state.chatRunId).toBe("run-user");
    expect(state.chatStream).toBe("Hello");
  });

  // [CN-MERGE:f2e9986813] Out-of-band finals with valid assistant messages
  // are now appended inline (returns null) instead of triggering full reload ("final").
  it("appends out-of-band final assistant message inline without clearing own run state", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-user",
      chatStream: "Working...",
      chatStreamStartedAt: 123,
    });
    const payload: ChatEventPayload = {
      runId: "run-announce",
      sessionKey: "main",
      state: "final",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Sub-agent findings" }],
      },
    };
    expect(handleChatEvent(state, payload)).toBe(null);
    expect(state.chatRunId).toBe("run-user");
    expect(state.chatStream).toBe("Working...");
    expect(state.chatStreamStartedAt).toBe(123);
    // Message should have been appended to chatMessages
    expect(state.chatMessages).toHaveLength(1);
  });

  // [CN-MERGE:8264d4521b] Own-run final now clears chatStream synchronously
  // because the final message is appended inline via normalizeFinalAssistantMessage.
  it("processes final from own run — clears runId, chatStream, and startedAt", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-1",
      chatStream: "Reply",
      chatStreamStartedAt: 100,
    });
    const payload: ChatEventPayload = {
      runId: "run-1",
      sessionKey: "main",
      state: "final",
    };
    expect(handleChatEvent(state, payload)).toBe("final");
    expect(state.chatRunId).toBe(null);
    expect(state.chatStream).toBe(null);
    expect(state.chatStreamStartedAt).toBe(null);
  });

  // ============================================================
  // Free model switch auto-new-session detection
  // ============================================================

  it("returns 'final_model_switch' when stream contains free model notification", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-fm",
      chatStream: "",
      chatStreamStartedAt: 100,
    });

    // Step 1: simulate delta with notification marker in raw text
    const notificationJson = JSON.stringify({
      type: "switched",
      providerName: "SiliconFlow",
      message: "已切换至 SiliconFlow",
      showInChat: true,
    });
    const deltaPayload: ChatEventPayload = {
      runId: "run-fm",
      sessionKey: "main",
      state: "delta",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: `<!--CLAWDBOT_FREE_MODEL_NOTIFICATION:${notificationJson}-->\n你好！`,
          },
        ],
      },
    };
    expect(handleChatEvent(state, deltaPayload)).toBe("delta");

    // Step 2: simulate final — should detect the tracked notification
    const finalPayload: ChatEventPayload = {
      runId: "run-fm",
      sessionKey: "main",
      state: "final",
    };
    expect(handleChatEvent(state, finalPayload)).toBe("final_model_switch");
    expect(state.chatRunId).toBe(null);
  });

  it("returns 'final' (not 'final_model_switch') when stream has no notification", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-normal",
      chatStream: "",
      chatStreamStartedAt: 100,
    });

    // delta without notification
    const deltaPayload: ChatEventPayload = {
      runId: "run-normal",
      sessionKey: "main",
      state: "delta",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "普通回复，没有模型切换" }],
      },
    };
    handleChatEvent(state, deltaPayload);

    // final — should be normal "final"
    const finalPayload: ChatEventPayload = {
      runId: "run-normal",
      sessionKey: "main",
      state: "final",
    };
    expect(handleChatEvent(state, finalPayload)).toBe("final");
  });

  it("does not leak switch detection between different runs", () => {
    const state = createState({
      sessionKey: "main",
      chatRunId: "run-A",
      chatStream: "",
      chatStreamStartedAt: 100,
    });

    // run-A delta with notification
    const notificationJson = JSON.stringify({
      type: "exhausted",
      providerName: "X",
      message: "额度已用完",
      showInChat: true,
    });
    handleChatEvent(state, {
      runId: "run-A",
      sessionKey: "main",
      state: "delta",
      message: {
        role: "assistant",
        content: [
          {
            type: "text",
            text: `<!--CLAWDBOT_FREE_MODEL_NOTIFICATION:${notificationJson}-->bye`,
          },
        ],
      },
    });

    // run-A final → should detect switch
    expect(
      handleChatEvent(state, {
        runId: "run-A",
        sessionKey: "main",
        state: "final",
      }),
    ).toBe("final_model_switch");

    // run-B: no notification → should NOT return final_model_switch
    state.chatRunId = "run-B";
    state.chatStreamStartedAt = 200;
    handleChatEvent(state, {
      runId: "run-B",
      sessionKey: "main",
      state: "delta",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "clean reply" }],
      },
    });
    expect(
      handleChatEvent(state, {
        runId: "run-B",
        sessionKey: "main",
        state: "final",
      }),
    ).toBe("final");
  });
});

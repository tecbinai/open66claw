/**
 * Tests for chat.ts modality-guard integration — Phase 1.
 *
 * Verifies that sendChatMessage calls checkModalityBeforeSend
 * before sending messages, and respects canProceed = false.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock modality-guard before importing chat
vi.mock("./modality-guard", () => ({
  checkModalityBeforeSend: vi.fn().mockResolvedValue({ canProceed: true }),
}));

// Mock error-hints to avoid DOM issues
vi.mock("../chat/error-hints", () => ({
  formatErrorHint: vi.fn().mockReturnValue({
    friendlyMessage: "Error",
    rawError: null,
  }),
}));

// Mock message-extract
vi.mock("../chat/message-extract", () => ({
  extractText: vi.fn().mockReturnValue(null),
  extractRawText: vi.fn().mockReturnValue(null),
}));

// Mock uuid
vi.mock("../uuid", () => ({
  generateUUID: vi.fn().mockReturnValue("mock-uuid-1"),
}));

import type { ChatState } from "./chat";

const { checkModalityBeforeSend } = await import("./modality-guard");
const { sendChatMessage } = await import("./chat");

const mockCheckModality = vi.mocked(checkModalityBeforeSend);

function createMockClient() {
  return {
    request: vi.fn().mockResolvedValue({}),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as import("../gateway").GatewayBrowserClient;
}

function createState(overrides: Partial<ChatState> = {}): ChatState {
  return {
    client: createMockClient(),
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
    lastError: null,
    failoverBanner: null,
    chatMediaToolActive: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckModality.mockResolvedValue({ canProceed: true });
});

describe("sendChatMessage with modality-guard", () => {
  it("calls checkModalityBeforeSend before sending", async () => {
    const state = createState();

    await sendChatMessage(state, "Hello world");

    expect(mockCheckModality).toHaveBeenCalledTimes(1);
    expect(mockCheckModality).toHaveBeenCalledWith({
      client: state.client,
      message: "Hello world",
      attachments: undefined,
    });
  });

  it("sends message when canProceed is true", async () => {
    mockCheckModality.mockResolvedValue({ canProceed: true });
    const state = createState();
    const client = state.client as unknown as { request: ReturnType<typeof vi.fn> };

    const result = await sendChatMessage(state, "Hello");

    expect(result).toBe(true);
    expect(client.request).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        sessionKey: "main",
        message: "Hello",
      }),
    );
  });

  it("blocks send when canProceed is false", async () => {
    mockCheckModality.mockResolvedValue({ canProceed: false });
    const state = createState();
    const client = state.client as unknown as { request: ReturnType<typeof vi.fn> };

    const result = await sendChatMessage(state, "analyze this");

    expect(result).toBe(false);
    // chat.send should NOT have been called
    expect(client.request).not.toHaveBeenCalled();
  });

  it("passes attachments to modality guard", async () => {
    const state = createState();
    const attachments = [
      {
        id: "att-1",
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
        mimeType: "image/png",
      },
    ];

    await sendChatMessage(state, "look at this", attachments);

    expect(mockCheckModality).toHaveBeenCalledWith({
      client: state.client,
      message: "look at this",
      attachments,
    });
  });

  it("does not call guard for empty messages without attachments", async () => {
    const state = createState();

    const result = await sendChatMessage(state, "");

    // Early return before guard is called
    expect(result).toBe(false);
    expect(mockCheckModality).not.toHaveBeenCalled();
  });

  it("does not call guard when not connected", async () => {
    const state = createState({ connected: false });

    const result = await sendChatMessage(state, "Hello");

    expect(result).toBe(false);
    expect(mockCheckModality).not.toHaveBeenCalled();
  });

  it("does not call guard when client is null", async () => {
    const state = createState({ client: null });

    const result = await sendChatMessage(state, "Hello");

    expect(result).toBe(false);
    expect(mockCheckModality).not.toHaveBeenCalled();
  });

  it("does not mutate state when guard blocks", async () => {
    mockCheckModality.mockResolvedValue({ canProceed: false });
    const state = createState();
    const originalMessages = [...state.chatMessages];

    await sendChatMessage(state, "blocked message");

    // State should not have been modified
    expect(state.chatMessages).toEqual(originalMessages);
    expect(state.chatSending).toBe(false);
    expect(state.chatRunId).toBeNull();
    expect(state.chatStream).toBeNull();
  });
});

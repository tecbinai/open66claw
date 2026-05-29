/**
 * Tests for modality-guard — pre-send capability check integration.
 *
 * Phase 1: Validates that checkModalityBeforeSend correctly:
 * - Extracts MIME types from attachments (both from dataUrl and fallback)
 * - Delegates to checkAndGuideModalityConfig
 * - Returns { canProceed } faithfully
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the modality-config-guide module to avoid DOM dependency
vi.mock("../views/modality-config-guide", () => ({
  checkAndGuideModalityConfig: vi.fn(),
}));

const { checkAndGuideModalityConfig } = await import("../views/modality-config-guide");
const mockCheckAndGuide = vi.mocked(checkAndGuideModalityConfig);

const { checkModalityBeforeSend } = await import("./modality-guard");

// Minimal GatewayBrowserClient stub
function createMockClient() {
  return {
    request: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as import("../gateway").GatewayBrowserClient;
}

beforeEach(() => {
  mockCheckAndGuide.mockReset();
});

describe("checkModalityBeforeSend", () => {
  it("returns canProceed: true when guide says OK", async () => {
    mockCheckAndGuide.mockResolvedValue({ needsConfiguration: false, canProceed: true });
    const client = createMockClient();

    const result = await checkModalityBeforeSend({
      client,
      message: "Hello",
      attachments: [],
    });

    expect(result.canProceed).toBe(true);
    expect(mockCheckAndGuide).toHaveBeenCalledTimes(1);
  });

  it("returns canProceed: false when guide says needs config", async () => {
    mockCheckAndGuide.mockResolvedValue({ needsConfiguration: true, canProceed: false });
    const client = createMockClient();

    const result = await checkModalityBeforeSend({
      client,
      message: "analyze this image",
      attachments: [
        {
          id: "att-1",
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
          mimeType: "image/png",
        },
      ],
    });

    expect(result.canProceed).toBe(false);
  });

  it("extracts MIME type from dataUrl (base64 prefix)", async () => {
    mockCheckAndGuide.mockResolvedValue({ needsConfiguration: false, canProceed: true });
    const client = createMockClient();

    await checkModalityBeforeSend({
      client,
      message: "",
      attachments: [
        {
          id: "att-1",
          dataUrl: "data:image/jpeg;base64,/9j/4AAQ=",
          mimeType: "image/png", // should be ignored because dataUrl takes priority
        },
      ],
    });

    const callArgs = mockCheckAndGuide.mock.calls[0][0];
    expect(callArgs.attachments).toEqual([{ mimeType: "image/jpeg" }]);
  });

  it("falls back to att.mimeType when dataUrl has no base64 prefix", async () => {
    mockCheckAndGuide.mockResolvedValue({ needsConfiguration: false, canProceed: true });
    const client = createMockClient();

    await checkModalityBeforeSend({
      client,
      message: "",
      attachments: [
        {
          id: "att-2",
          dataUrl: "blob:http://localhost/abc",
          mimeType: "image/webp",
        },
      ],
    });

    const callArgs = mockCheckAndGuide.mock.calls[0][0];
    expect(callArgs.attachments).toEqual([{ mimeType: "image/webp" }]);
  });

  it("passes message as prompt to the guide", async () => {
    mockCheckAndGuide.mockResolvedValue({ needsConfiguration: false, canProceed: true });
    const client = createMockClient();

    await checkModalityBeforeSend({
      client,
      message: "画一只猫",
      attachments: [],
    });

    const callArgs = mockCheckAndGuide.mock.calls[0][0];
    expect(callArgs.prompt).toBe("画一只猫");
  });

  it("passes client through to the guide", async () => {
    mockCheckAndGuide.mockResolvedValue({ needsConfiguration: false, canProceed: true });
    const client = createMockClient();

    await checkModalityBeforeSend({
      client,
      message: "test",
    });

    const callArgs = mockCheckAndGuide.mock.calls[0][0];
    expect(callArgs.client).toBe(client);
  });

  it("handles multiple attachments with different MIME types", async () => {
    mockCheckAndGuide.mockResolvedValue({ needsConfiguration: false, canProceed: true });
    const client = createMockClient();

    await checkModalityBeforeSend({
      client,
      message: "compare these images",
      attachments: [
        {
          id: "att-1",
          dataUrl: "data:image/png;base64,abc",
          mimeType: "image/png",
        },
        {
          id: "att-2",
          dataUrl: "data:image/gif;base64,def",
          mimeType: "image/gif",
        },
      ],
    });

    const callArgs = mockCheckAndGuide.mock.calls[0][0];
    expect(callArgs.attachments).toHaveLength(2);
    expect(callArgs.attachments![0].mimeType).toBe("image/png");
    expect(callArgs.attachments![1].mimeType).toBe("image/gif");
  });

  it("works with undefined attachments", async () => {
    mockCheckAndGuide.mockResolvedValue({ needsConfiguration: false, canProceed: true });
    const client = createMockClient();

    const result = await checkModalityBeforeSend({
      client,
      message: "just text",
    });

    expect(result.canProceed).toBe(true);
    const callArgs = mockCheckAndGuide.mock.calls[0][0];
    expect(callArgs.attachments).toEqual([]);
  });
});

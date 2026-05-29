import * as fs from "node:fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTelemetryHandler, getTelemetryFilePath } from "../cn-telemetry.js";
import type { AgentEndEvent, AgentEndContext } from "../cn-telemetry.js";
import * as otelExporter from "../otel-exporter.js";

vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock("../otel-exporter.js", () => ({
  exportRecordToOtel: vi.fn(),
  isValidOtelEndpoint: vi.fn((ep: string) => ep.startsWith("http")),
}));

const baseEvent: AgentEndEvent = {
  messages: [],
  success: true,
  durationMs: 1234,
};

const baseCtx: AgentEndContext = {
  agentId: "agent-001",
  sessionId: "session-001",
  channelId: "ch-001",
  messageProvider: "doubao",
};

describe("createTelemetryHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when telemetry is false", async () => {
    const handler = createTelemetryHandler(() => ({ telemetry: false }));
    await handler(baseEvent, baseCtx);
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });

  it("does nothing when telemetry is undefined (default off)", async () => {
    const handler = createTelemetryHandler(() => ({}));
    await handler(baseEvent, baseCtx);
    expect(fs.appendFileSync).not.toHaveBeenCalled();
  });

  it("writes JSONL when telemetry is true", async () => {
    const handler = createTelemetryHandler(() => ({ telemetry: true, securityTier: "balanced" }));
    await handler(baseEvent, baseCtx);

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(fs.appendFileSync).toHaveBeenCalledOnce();

    const written = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    expect(written.endsWith("\n")).toBe(true);

    const record = JSON.parse(written.trim());
    expect(record).toMatchObject({
      success: true,
      duration: 1234,
      agentId: "agent-001",
      sessionId: "session-001",
      channelId: "ch-001",
      securityTier: "balanced",
      version: "0.1.0",
      provider: "doubao",
    });
    expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("defaults securityTier to 'full' when not configured", async () => {
    const handler = createTelemetryHandler(() => ({ telemetry: true }));
    await handler(baseEvent, baseCtx);

    const written = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    const record = JSON.parse(written.trim());
    expect(record.securityTier).toBe("full");
  });

  it("sanitizes error to first line only", async () => {
    const handler = createTelemetryHandler(() => ({ telemetry: true }));
    const event: AgentEndEvent = {
      messages: [],
      success: false,
      error:
        "RateLimitError: too many requests\n    at fetch (/app/src/api.ts:42)\n    at main (/app/index.ts:10)",
      durationMs: 500,
    };
    await handler(event, baseCtx);

    const written = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    const record = JSON.parse(written.trim());
    expect(record.error).toBe("RateLimitError: too many requests");
    expect(record.error).not.toContain("\n");
  });

  it("does not include sensitive fields (messages, keys, IP)", async () => {
    const handler = createTelemetryHandler(() => ({ telemetry: true, searchApiKey: "sk-secret" }));
    const event: AgentEndEvent = {
      messages: [{ role: "user", content: "secret data" }],
      success: true,
      durationMs: 100,
    };
    await handler(event, { ...baseCtx, workspaceDir: "/home/user/project", sessionKey: "key-123" });

    const written = (fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    const record = JSON.parse(written.trim());
    // 不包含消息内容
    expect(record.messages).toBeUndefined();
    // 不包含 API key
    expect(record.searchApiKey).toBeUndefined();
    // 不包含工作目录
    expect(record.workspaceDir).toBeUndefined();
    // 不包含 session key
    expect(record.sessionKey).toBeUndefined();
    // 只包含预期字段
    const keys = Object.keys(record);
    expect(keys).not.toContain("messages");
    expect(keys).not.toContain("searchApiKey");
    expect(keys).not.toContain("workspaceDir");
    expect(keys).not.toContain("sessionKey");
  });

  it("handles fs write errors gracefully (does not throw)", async () => {
    (fs.appendFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const handler = createTelemetryHandler(() => ({ telemetry: true }));
    // Should not throw
    await expect(handler(baseEvent, baseCtx)).resolves.toBeUndefined();
  });

  it("writes to the correct file path", () => {
    const filePath = getTelemetryFilePath();
    expect(filePath).toContain(".openclaw");
    expect(filePath.endsWith("cn-telemetry.jsonl")).toBe(true);
  });

  it("calls exportRecordToOtel when otel is enabled", async () => {
    const handler = createTelemetryHandler(() => ({
      telemetry: true,
      otel: { enabled: true, endpoint: "http://localhost:4318" },
    }));
    await handler(baseEvent, baseCtx);

    expect(otelExporter.exportRecordToOtel).toHaveBeenCalledOnce();
    expect(otelExporter.exportRecordToOtel).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, duration: 1234 }),
      "http://localhost:4318",
    );
  });

  it("does not call exportRecordToOtel when otel is disabled", async () => {
    const handler = createTelemetryHandler(() => ({
      telemetry: true,
      otel: { enabled: false, endpoint: "http://localhost:4318" },
    }));
    await handler(baseEvent, baseCtx);

    expect(otelExporter.exportRecordToOtel).not.toHaveBeenCalled();
  });

  it("does not call exportRecordToOtel when endpoint is invalid", async () => {
    const handler = createTelemetryHandler(() => ({
      telemetry: true,
      otel: { enabled: true, endpoint: "not-a-url" },
    }));
    await handler(baseEvent, baseCtx);

    expect(otelExporter.exportRecordToOtel).not.toHaveBeenCalled();
  });
});

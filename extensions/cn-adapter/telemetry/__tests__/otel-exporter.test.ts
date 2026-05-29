import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TelemetryRecord } from "../cn-telemetry.js";
import {
  toOtlpSpan,
  buildExportRequest,
  exportSpans,
  exportRecordToOtel,
  isValidOtelEndpoint,
} from "../otel-exporter.js";

const baseRecord: TelemetryRecord = {
  timestamp: "2026-03-09T12:00:00.000Z",
  duration: 1500,
  success: true,
  agentId: "agent-001",
  sessionId: "session-001",
  channelId: "ch-001",
  securityTier: "full",
  version: "0.1.0",
  provider: "doubao",
};

describe("toOtlpSpan", () => {
  it("converts TelemetryRecord to OTLP span", () => {
    const span = toOtlpSpan(baseRecord);

    expect(span.traceId).toHaveLength(32); // 16 bytes hex
    expect(span.spanId).toHaveLength(16); // 8 bytes hex
    expect(span.name).toBe("cn-adapter.agent_end");
    expect(span.kind).toBe(1); // INTERNAL

    // Check timestamps
    const startMs = new Date("2026-03-09T12:00:00.000Z").getTime();
    expect(span.startTimeUnixNano).toBe(`${startMs}000000`);
    expect(span.endTimeUnixNano).toBe(`${startMs + 1500}000000`);

    // Check status
    expect(span.status.code).toBe(1); // OK
  });

  it("sets status ERROR for failed records", () => {
    const span = toOtlpSpan({ ...baseRecord, success: false, error: "timeout" });
    expect(span.status.code).toBe(2); // ERROR
  });

  it("includes all non-undefined attributes", () => {
    const span = toOtlpSpan(baseRecord);
    const attrKeys = span.attributes.map((a) => a.key);

    expect(attrKeys).toContain("cn.agent_id");
    expect(attrKeys).toContain("cn.session_id");
    expect(attrKeys).toContain("cn.channel_id");
    expect(attrKeys).toContain("cn.security_tier");
    expect(attrKeys).toContain("cn.version");
    expect(attrKeys).toContain("cn.provider");
    expect(attrKeys).toContain("cn.success");
    expect(attrKeys).toContain("cn.duration_ms");
  });

  it("excludes undefined attributes", () => {
    const span = toOtlpSpan({
      timestamp: "2026-03-09T12:00:00.000Z",
      success: true,
      securityTier: "full",
      version: "0.1.0",
    });
    const attrKeys = span.attributes.map((a) => a.key);
    expect(attrKeys).not.toContain("cn.agent_id");
    expect(attrKeys).not.toContain("cn.error");
  });

  it("handles zero duration", () => {
    const span = toOtlpSpan({ ...baseRecord, duration: 0 });
    expect(span.startTimeUnixNano).toBe(span.endTimeUnixNano);
  });

  it("handles undefined duration", () => {
    const span = toOtlpSpan({ ...baseRecord, duration: undefined });
    // endTime = startTime + 0
    expect(span.startTimeUnixNano).toBe(span.endTimeUnixNano);
  });
});

describe("buildExportRequest", () => {
  it("wraps spans in OTLP resourceSpans structure", () => {
    const span = toOtlpSpan(baseRecord);
    const req = buildExportRequest([span]);

    expect(req.resourceSpans).toHaveLength(1);
    const rs = req.resourceSpans[0];
    expect(rs.resource.attributes).toEqual(
      expect.arrayContaining([{ key: "service.name", value: { stringValue: "openclawcn" } }]),
    );
    expect(rs.scopeSpans).toHaveLength(1);
    expect(rs.scopeSpans[0].scope.name).toBe("cn-adapter");
    expect(rs.scopeSpans[0].spans).toEqual([span]);
  });

  it("handles empty spans array", () => {
    const req = buildExportRequest([]);
    expect(req.resourceSpans[0].scopeSpans[0].spans).toEqual([]);
  });
});

describe("isValidOtelEndpoint", () => {
  it("accepts http URLs", () => {
    expect(isValidOtelEndpoint("http://localhost:4318")).toBe(true);
  });

  it("accepts https URLs", () => {
    expect(isValidOtelEndpoint("https://otel.example.com")).toBe(true);
  });

  it("rejects non-http protocols", () => {
    expect(isValidOtelEndpoint("ftp://host")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isValidOtelEndpoint("not-a-url")).toBe(false);
    expect(isValidOtelEndpoint("")).toBe(false);
  });
});

describe("exportSpans", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true on empty spans", async () => {
    const result = await exportSpans("http://localhost:4318", []);
    expect(result).toBe(true);
  });

  it("returns false for invalid endpoint", async () => {
    const span = toOtlpSpan(baseRecord);
    const result = await exportSpans("not-a-url", [span]);
    expect(result).toBe(false);
  });

  it("sends POST to {endpoint}/v1/traces", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const span = toOtlpSpan(baseRecord);
    const result = await exportSpans("http://localhost:4318", [span]);

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:4318/v1/traces");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(opts.body);
    expect(body.resourceSpans).toHaveLength(1);
    expect(body.resourceSpans[0].scopeSpans[0].spans).toHaveLength(1);
  });

  it("strips trailing slashes from endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const span = toOtlpSpan(baseRecord);
    await exportSpans("http://localhost:4318///", [span]);

    expect(mockFetch.mock.calls[0][0]).toBe("http://localhost:4318/v1/traces");
  });

  it("returns false on HTTP error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const span = toOtlpSpan(baseRecord);
    const result = await exportSpans("http://localhost:4318", [span]);
    expect(result).toBe(false);
  });

  it("returns false on network error (does not throw)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const span = toOtlpSpan(baseRecord);
    const result = await exportSpans("http://localhost:4318", [span]);
    expect(result).toBe(false);
  });
});

describe("exportRecordToOtel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fires fetch and does not throw", () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    // Should not throw
    expect(() => exportRecordToOtel(baseRecord, "http://localhost:4318")).not.toThrow();
  });

  it("does not throw even when fetch rejects", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    expect(() => exportRecordToOtel(baseRecord, "http://localhost:4318")).not.toThrow();
  });

  it("does not throw on invalid endpoint", () => {
    expect(() => exportRecordToOtel(baseRecord, "not-a-url")).not.toThrow();
  });
});

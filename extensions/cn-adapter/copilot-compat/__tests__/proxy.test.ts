import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CnPluginConfig } from "../../hooks/cn-config.js";
import { extractProxyConfig, createCopilotRouteHandler } from "../proxy.js";

describe("extractProxyConfig", () => {
  it("returns null when copilotProxy is undefined", () => {
    expect(extractProxyConfig({})).toBeNull();
  });

  it("returns null when copilotProxy.enabled is false", () => {
    expect(
      extractProxyConfig({
        copilotProxy: { enabled: false, baseUrl: "http://localhost", model: "m" },
      }),
    ).toBeNull();
  });

  it("returns null when baseUrl is missing", () => {
    expect(
      extractProxyConfig({
        copilotProxy: { enabled: true, model: "m" },
      }),
    ).toBeNull();
  });

  it("returns null when model is missing", () => {
    expect(
      extractProxyConfig({
        copilotProxy: { enabled: true, baseUrl: "http://localhost" },
      }),
    ).toBeNull();
  });

  it("rejects non-http/https baseUrl (SSRF protection)", () => {
    expect(
      extractProxyConfig({
        copilotProxy: { enabled: true, baseUrl: "file:///etc/passwd", model: "m" },
      }),
    ).toBeNull();
    expect(
      extractProxyConfig({
        copilotProxy: { enabled: true, baseUrl: "ftp://host", model: "m" },
      }),
    ).toBeNull();
  });

  it("rejects invalid URL format", () => {
    expect(
      extractProxyConfig({
        copilotProxy: { enabled: true, baseUrl: "not-a-url", model: "m" },
      }),
    ).toBeNull();
  });

  it("returns config when fully specified", () => {
    const result = extractProxyConfig({
      copilotProxy: {
        enabled: true,
        provider: "siliconflow",
        baseUrl: "https://api.siliconflow.cn/",
        apiKey: "sk-test",
        model: "deepseek-coder",
      },
    });
    expect(result).toEqual({
      provider: "siliconflow",
      baseUrl: "https://api.siliconflow.cn",
      apiKey: "sk-test",
      model: "deepseek-coder",
    });
  });

  it("defaults provider to 'custom' and apiKey to empty string", () => {
    const result = extractProxyConfig({
      copilotProxy: {
        enabled: true,
        baseUrl: "http://localhost:8080",
        model: "test",
      },
    });
    expect(result!.provider).toBe("custom");
    expect(result!.apiKey).toBe("");
  });
});

// Helper to create a mock IncomingMessage
function createMockReq(method: string, url: string, body: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  // Simulate body sending
  process.nextTick(() => {
    req.emit("data", Buffer.from(body));
    req.emit("end");
  });
  return req;
}

// Helper to create a mock ServerResponse
function createMockRes(): ServerResponse & {
  _status: number;
  _headers: Record<string, string>;
  _body: string;
} {
  const res = {
    _status: 0,
    _headers: {} as Record<string, string>,
    _body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status;
      if (headers) Object.assign(res._headers, headers);
    },
    write(chunk: string) {
      res._body += chunk;
      return true;
    },
    end(data?: string) {
      if (data) res._body += data;
    },
  } as any;
  return res;
}

describe("createCopilotRouteHandler", () => {
  const disabledConfig: CnPluginConfig = {};
  const enabledConfig: CnPluginConfig = {
    copilotProxy: {
      enabled: true,
      baseUrl: "http://localhost:11434",
      model: "codestral",
      apiKey: "sk-test",
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects non-POST requests", async () => {
    const handler = createCopilotRouteHandler(() => enabledConfig);
    const req = createMockReq("GET", "/v1/chat/completions", "");
    const res = createMockRes();

    const handled = await handler(req, res);
    expect(handled).toBe(true);
    expect(res._status).toBe(405);
  });

  it("returns 503 when proxy not configured", async () => {
    const handler = createCopilotRouteHandler(() => disabledConfig);
    const req = createMockReq("POST", "/v1/chat/completions", '{"messages":[]}');
    const res = createMockRes();

    const handled = await handler(req, res);
    expect(handled).toBe(true);
    expect(res._status).toBe(503);
  });

  it("returns false for unrecognized /v1/ paths", async () => {
    const handler = createCopilotRouteHandler(() => enabledConfig);
    const req = createMockReq("POST", "/v1/models", "{}");
    const res = createMockRes();

    // Mock fetch to prevent actual calls
    vi.stubGlobal("fetch", vi.fn());

    const handled = await handler(req, res);
    expect(handled).toBe(false);
  });

  it("handles JSON parse error gracefully", async () => {
    const handler = createCopilotRouteHandler(() => enabledConfig);
    const req = createMockReq("POST", "/v1/chat/completions", "not-json");
    const res = createMockRes();

    const handled = await handler(req, res);
    expect(handled).toBe(true);
    expect(res._status).toBe(500);
    expect(res._body).toContain("Internal proxy error");
    // 不应泄露内部错误细节
    expect(res._body).not.toContain("JSON");
  });

  it("matches URL with query string", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            choices: [
              { message: { role: "assistant", content: "OK" }, index: 0, finish_reason: "stop" },
            ],
          }),
        ),
      body: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const handler = createCopilotRouteHandler(() => enabledConfig);
    const body = JSON.stringify({ messages: [{ role: "user", content: "Hi" }] });
    const req = createMockReq("POST", "/v1/chat/completions?stream=false", body);
    const res = createMockRes();

    const handled = await handler(req, res);
    expect(handled).toBe(true);
    expect(res._status).toBe(200);
  });

  it("forwards chat request to provider", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            choices: [
              {
                message: { role: "assistant", content: "Hello!" },
                index: 0,
                finish_reason: "stop",
              },
            ],
          }),
        ),
      body: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const handler = createCopilotRouteHandler(() => enabledConfig);
    const body = JSON.stringify({ messages: [{ role: "user", content: "Hi" }] });
    const req = createMockReq("POST", "/v1/chat/completions", body);
    const res = createMockRes();

    const handled = await handler(req, res);
    expect(handled).toBe(true);
    expect(res._status).toBe(200);

    const parsed = JSON.parse(res._body);
    expect(parsed.object).toBe("chat.completion");
    expect(parsed.choices[0].message.content).toBe("Hello!");

    // Verify fetch was called with correct URL
    const fetchCall = (fetch as any).mock.calls[0];
    expect(fetchCall[0]).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("forwards completion request to provider", async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            choices: [{ text: "world", index: 0, finish_reason: "stop" }],
          }),
        ),
      body: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const handler = createCopilotRouteHandler(() => enabledConfig);
    const body = JSON.stringify({ prompt: "function hello() {" });
    const req = createMockReq("POST", "/v1/engines/copilot-codex/completions", body);
    const res = createMockRes();

    const handled = await handler(req, res);
    expect(handled).toBe(true);
    expect(res._status).toBe(200);

    const parsed = JSON.parse(res._body);
    expect(parsed.object).toBe("text_completion");
    expect(parsed.choices[0].text).toBe("world");
  });

  it("handles provider error without leaking details", async () => {
    const mockResponse = {
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limited — API key: sk-secret-123"),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const handler = createCopilotRouteHandler(() => enabledConfig);
    const body = JSON.stringify({ messages: [{ role: "user", content: "Hi" }] });
    const req = createMockReq("POST", "/v1/chat/completions", body);
    const res = createMockRes();

    const handled = await handler(req, res);
    expect(handled).toBe(true);
    expect(res._status).toBe(429);
    expect(res._body).toContain("Upstream provider request failed");
    // 不应泄露 provider 内部错误细节
    expect(res._body).not.toContain("sk-secret");
  });

  it("forwards streaming chat with correct chunk transform", async () => {
    // 模拟 SSE streaming 响应
    const chunks = [
      'data: {"choices":[{"delta":{"role":"assistant","content":"Hi"},"index":0,"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"!"},"index":0,"finish_reason":null}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const encoder = new TextEncoder();
    let chunkIndex = 0;
    const mockStream = {
      getReader: () => ({
        read: async () => {
          if (chunkIndex < chunks.length) {
            return { done: false, value: encoder.encode(chunks[chunkIndex++]) };
          }
          return { done: true, value: undefined };
        },
      }),
    };
    const mockResponse = {
      ok: true,
      status: 200,
      body: mockStream,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const handler = createCopilotRouteHandler(() => enabledConfig);
    const body = JSON.stringify({ messages: [{ role: "user", content: "Hi" }], stream: true });
    const req = createMockReq("POST", "/v1/chat/completions", body);
    const res = createMockRes();

    const handled = await handler(req, res);
    expect(handled).toBe(true);
    expect(res._status).toBe(200);
    expect(res._headers["Content-Type"]).toBe("text/event-stream");

    // 解析 SSE 输出
    const events = res._body.split("\n\n").filter((e: string) => e.startsWith("data: "));
    // 第一个和第二个应该是 chunk 格式
    const chunk1 = JSON.parse(events[0].replace("data: ", ""));
    expect(chunk1.object).toBe("chat.completion.chunk");
    expect(chunk1.choices[0].delta.content).toBe("Hi");

    const chunk2 = JSON.parse(events[1].replace("data: ", ""));
    expect(chunk2.choices[0].delta.content).toBe("!");

    // 最后是 [DONE]
    expect(events[events.length - 1]).toBe("data: [DONE]");
  });
});

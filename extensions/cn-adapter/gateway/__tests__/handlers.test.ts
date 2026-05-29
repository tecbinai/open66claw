import { describe, it, expect, vi } from "vitest";
import { registerGatewayHandlers } from "../handlers.js";
import { registerInternalHandlers } from "../internal.js";

/**
 * 构造一个 mock OpenClawPluginApi，只实现 registerGatewayMethod。
 * 注册时把 handler 存到 methods map 里，测试时直接调用。
 */
function createMockApi(pluginConfig?: Record<string, unknown>) {
  const methods = new Map<string, (opts: any) => Promise<void>>();
  const api = {
    pluginConfig: pluginConfig ?? {},
    registerGatewayMethod: (name: string, handler: (opts: any) => Promise<void>) => {
      methods.set(name, handler);
    },
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
  return { api: api as any, methods };
}

/** 调用一个 gateway method 并返回 respond 收到的参数 */
async function callMethod(
  methods: Map<string, (opts: any) => Promise<void>>,
  name: string,
  params?: Record<string, unknown>,
  client?: unknown,
) {
  const handler = methods.get(name);
  if (!handler) throw new Error(`Method ${name} not registered`);

  let capturedOk: boolean | undefined;
  let capturedPayload: unknown;
  let capturedError: unknown;

  // 默认 client 拥有 admin scope（兼容 CLI 本地用户场景）
  const defaultClient = { connect: { scopes: ["operator.admin"] } };

  await handler({
    params: params ?? {},
    client: client ?? defaultClient,
    respond: (ok: boolean, payload?: unknown, error?: unknown) => {
      capturedOk = ok;
      capturedPayload = payload;
      capturedError = error;
    },
  });

  return { ok: capturedOk, payload: capturedPayload, error: capturedError };
}

// ============================================================
// 业务 Gateway Methods
// ============================================================

describe("registerGatewayHandlers", () => {
  it("registers business methods (support only, marketplace handled by ui bridge)", () => {
    const { api, methods } = createMockApi();
    registerGatewayHandlers(api);
    expect(methods.has("cn.support.qrcode")).toBe(true);
    // cn.marketplace.* is handled by the local-only ui bridge.
    expect(methods.has("cn.marketplace.search")).toBe(false);
    expect(methods.has("cn.marketplace.recommend")).toBe(false);
  });


  describe("cn.support.qrcode", () => {
    it("does not return a cloud support URL", async () => {
      const { api, methods } = createMockApi();
      registerGatewayHandlers(api);
      const { ok, payload } = await callMethod(methods, "cn.support.qrcode");
      expect(ok).toBe(true);
      expect(payload).toEqual({ url: null });
    });
  });
});

// ============================================================
// Internal RPC Methods
// ============================================================

describe("registerInternalHandlers", () => {
  it("registers all 3 internal methods", () => {
    const { api, methods } = createMockApi();
    registerInternalHandlers(api, "0.1.0");
    expect(methods.has("cn.internal.adapter.version")).toBe(true);
    expect(methods.has("cn.internal.adapter.health")).toBe(true);
    expect(methods.has("cn.internal.config.snapshot")).toBe(true);
    expect(methods.size).toBe(3);
  });

  describe("cn.internal.adapter.version", () => {
    it("returns version and apiVersion", async () => {
      const { api, methods } = createMockApi();
      registerInternalHandlers(api, "0.1.0");
      const { ok, payload } = await callMethod(methods, "cn.internal.adapter.version");
      expect(ok).toBe(true);
      expect(payload).toMatchObject({
        version: expect.any(String),
        apiVersion: expect.any(Number),
      });
    });
  });

  describe("cn.internal.adapter.health", () => {
    it("returns status ok with uptime", async () => {
      const { api, methods } = createMockApi();
      registerInternalHandlers(api, "0.1.0");
      const { ok, payload } = await callMethod(methods, "cn.internal.adapter.health");
      expect(ok).toBe(true);
      expect(payload).toMatchObject({
        status: "ok",
        uptime: expect.any(Number),
      });
    });
  });

  describe("cn.internal.config.snapshot", () => {
    it("returns CN config from pluginConfig", async () => {
      const { api, methods } = createMockApi({
        locale: "zh-CN",
        securityTier: "full",
      });
      registerInternalHandlers(api, "0.1.0");
      const { ok, payload } = await callMethod(methods, "cn.internal.config.snapshot");
      expect(ok).toBe(true);
      expect(payload).toMatchObject({
        locale: "zh-CN",
        securityTier: "full",
      });
    });

    it("returns defaults when pluginConfig is empty", async () => {
      const { api, methods } = createMockApi({});
      registerInternalHandlers(api, "0.1.0");
      const { ok, payload } = await callMethod(methods, "cn.internal.config.snapshot");
      expect(ok).toBe(true);
      expect(payload).toBeDefined();
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerBrandingGateway, getCurrentBrand, _resetBrandCache } from "../branding.js";

function createMockApi() {
  const methods = new Map<string, (opts: any) => Promise<void>>();
  const api = {
    pluginConfig: {},
    registerGatewayMethod: (name: string, handler: (opts: any) => Promise<void>) => {
      methods.set(name, handler);
    },
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
  return { api: api as any, methods };
}

async function callMethod(
  methods: Map<string, (opts: any) => Promise<void>>,
  name: string,
  params?: Record<string, unknown>,
) {
  const handler = methods.get(name);
  if (!handler) throw new Error(`Method ${name} not registered`);

  let capturedOk: boolean | undefined;
  let capturedPayload: unknown;
  let capturedError: unknown;

  await handler({
    params: params ?? {},
    respond: (ok: boolean, payload?: unknown, error?: unknown) => {
      capturedOk = ok;
      capturedPayload = payload;
      capturedError = error;
    },
  });

  return { ok: capturedOk, payload: capturedPayload, error: capturedError };
}

describe("getCurrentBrand", () => {
  beforeEach(() => {
    _resetBrandCache();
  });

  afterEach(() => {
    _resetBrandCache();
    delete process.env.OEM_ID;
  });

  it("returns default brand when OEM_ID is not set", () => {
    delete process.env.OEM_ID;
    const brand = getCurrentBrand();
    expect(brand.id).toBe("openclawcn");
    expect(brand.name).toBe("OpenClawCN");
  });

  it("caches brand across calls", () => {
    const brand1 = getCurrentBrand();
    const brand2 = getCurrentBrand();
    expect(brand1).toBe(brand2); // same reference
  });

  it("resets cache with _resetBrandCache", () => {
    const brand1 = getCurrentBrand();
    _resetBrandCache();
    const brand2 = getCurrentBrand();
    expect(brand1).not.toBe(brand2); // different reference
    expect(brand1).toEqual(brand2); // same content
  });
});

describe("registerBrandingGateway", () => {
  beforeEach(() => {
    _resetBrandCache();
    delete process.env.OEM_ID;
  });

  afterEach(() => {
    _resetBrandCache();
  });

  it("registers 2 gateway methods", () => {
    const { api, methods } = createMockApi();
    registerBrandingGateway(api);
    expect(methods.has("cn.branding.get")).toBe(true);
    expect(methods.has("cn.branding.identity")).toBe(true);
    expect(methods.size).toBe(2);
  });

  describe("cn.branding.get", () => {
    it("returns full brand config", async () => {
      const { api, methods } = createMockApi();
      registerBrandingGateway(api);
      const { ok, payload } = await callMethod(methods, "cn.branding.get");
      expect(ok).toBe(true);
      const p = payload as Record<string, unknown>;
      expect(p.id).toBe("openclawcn");
      expect(p.name).toBe("OpenClawCN");
      expect(p.displayName).toBe("OpenClaw 中国版");
      expect(p.version).toBe("0.1.0");
      expect(p.identity).toBeDefined();
      expect(p.defaults).toBeDefined();
      expect(p.ui).toBeDefined();
    });
  });

  describe("cn.branding.identity", () => {
    it("returns identity fields", async () => {
      const { api, methods } = createMockApi();
      registerBrandingGateway(api);
      const { ok, payload } = await callMethod(methods, "cn.branding.identity");
      expect(ok).toBe(true);
      const p = payload as Record<string, unknown>;
      expect(p.oemId).toBe("openclawcn");
      expect(typeof p.identifier).toBe("string");
      expect(typeof p.apiBaseUrl).toBe("string");
    });
  });
});

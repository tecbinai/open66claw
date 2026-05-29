import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock voice-router
const mockTranscribeResult = { ok: true, text: "你好", backend: "api-openai" };
const mockSynthesizeResult = {
  ok: true,
  audioBase64: "base64data",
  format: "mp3",
  backend: "edge-tts",
};
const mockStatus = {
  tier: { tier: "cpu-full", asrModel: null, ttsModel: null, reason: "test", hardware: {} },
  asrAvailable: false,
  asrBackend: "none",
  ttsAvailable: true,
  ttsBackend: "edge-tts",
  localInstallState: "not-installed",
  prefs: {},
};

vi.mock("../voice-router.js", () => ({
  unifiedTranscribe: vi.fn(async () => mockTranscribeResult),
  unifiedSynthesize: vi.fn(async () => mockSynthesizeResult),
  getVoiceSystemStatus: vi.fn(async () => mockStatus),
}));

// Mock voice-prefs
const mockPrefs = { asrProvider: "auto", ttsProvider: "edge" };
vi.mock("../voice-prefs.js", () => ({
  loadVoicePrefs: vi.fn(async () => ({ ...mockPrefs })),
  setVoicePrefs: vi.fn(async (patch: any) => ({ ...mockPrefs, ...patch })),
}));

import { registerVoiceHandlers } from "../handlers.js";

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

describe("registerVoiceHandlers", () => {
  it("registers all 5 voice methods", () => {
    const { api, methods } = createMockApi();
    registerVoiceHandlers(api);
    expect(methods.has("cn.voice.transcribe")).toBe(true);
    expect(methods.has("cn.voice.synthesize")).toBe(true);
    expect(methods.has("cn.voice.status")).toBe(true);
    expect(methods.has("cn.voice.prefs.get")).toBe(true);
    expect(methods.has("cn.voice.prefs.set")).toBe(true);
    expect(methods.size).toBe(5);
  });

  describe("cn.voice.transcribe", () => {
    it("returns transcribe result with valid audio", async () => {
      const { api, methods } = createMockApi();
      registerVoiceHandlers(api);
      const { ok, payload } = await callMethod(methods, "cn.voice.transcribe", {
        audioBase64: "dGVzdA==",
      });
      expect(ok).toBe(true);
      expect(payload).toMatchObject({ ok: true, text: "你好" });
    });

    it("returns error when audioBase64 is missing", async () => {
      const { api, methods } = createMockApi();
      registerVoiceHandlers(api);
      const { ok, error } = await callMethod(methods, "cn.voice.transcribe", {});
      expect(ok).toBe(false);
      expect(error).toMatchObject({
        code: "CN_INVALID_PARAMS",
        message: expect.stringContaining("audioBase64"),
      });
    });
  });

  describe("cn.voice.synthesize", () => {
    it("returns synthesize result with valid text", async () => {
      const { api, methods } = createMockApi();
      registerVoiceHandlers(api);
      const { ok, payload } = await callMethod(methods, "cn.voice.synthesize", {
        text: "你好世界",
      });
      expect(ok).toBe(true);
      expect(payload).toMatchObject({ ok: true, audioBase64: "base64data" });
    });

    it("returns error when text is missing", async () => {
      const { api, methods } = createMockApi();
      registerVoiceHandlers(api);
      const { ok, error } = await callMethod(methods, "cn.voice.synthesize", {});
      expect(ok).toBe(false);
      expect(error).toMatchObject({
        code: "CN_INVALID_PARAMS",
        message: expect.stringContaining("text"),
      });
    });
  });

  describe("cn.voice.status", () => {
    it("returns voice system status", async () => {
      const { api, methods } = createMockApi();
      registerVoiceHandlers(api);
      const { ok, payload } = await callMethod(methods, "cn.voice.status");
      expect(ok).toBe(true);
      expect(payload).toMatchObject({
        tier: expect.any(Object),
        asrAvailable: false,
        ttsAvailable: true,
        localInstallState: "not-installed",
      });
    });
  });

  describe("cn.voice.prefs.get", () => {
    it("returns voice preferences", async () => {
      const { api, methods } = createMockApi();
      registerVoiceHandlers(api);
      const { ok, payload } = await callMethod(methods, "cn.voice.prefs.get");
      expect(ok).toBe(true);
      expect(payload).toMatchObject({ asrProvider: "auto", ttsProvider: "edge" });
    });
  });

  describe("cn.voice.prefs.set", () => {
    it("updates voice preferences", async () => {
      const { api, methods } = createMockApi();
      registerVoiceHandlers(api);
      const { ok, payload } = await callMethod(methods, "cn.voice.prefs.set", {
        asrProvider: "openai",
      });
      expect(ok).toBe(true);
      expect(payload).toMatchObject({ asrProvider: "openai" });
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock hardware-detect
vi.mock("../hardware-detect.js", () => ({
  getHardwareSnapshot: () => ({
    gpu: null,
    totalRamMB: 16384,
    freeRamMB: 8192,
    cpuModel: "Intel Core i7",
    cpuCores: 8,
    platform: "win32",
    arch: "x64",
    timestamp: Date.now(),
  }),
  refreshHardwareSnapshot: () => ({
    gpu: null,
    totalRamMB: 16384,
    freeRamMB: 8192,
    cpuModel: "Intel Core i7",
    cpuCores: 8,
    platform: "win32",
    arch: "x64",
    timestamp: Date.now(),
  }),
}));

// Mock voice-prefs
const mockPrefs = {
  asrProvider: undefined as string | undefined,
  ttsProvider: undefined as string | undefined,
  ttsVoice: undefined as string | undefined,
  ttsModel: undefined as string | undefined,
};
vi.mock("../voice-prefs.js", () => ({
  getVoicePrefsSync: () => ({ ...mockPrefs }),
  isApiAsrProvider: (p: string | undefined) =>
    !!p &&
    p !== "auto" &&
    ["openai", "groq", "deepgram", "google", "dashscope", "volcengine"].includes(p),
  isApiTtsProvider: (p: string | undefined) =>
    !!p &&
    p !== "auto" &&
    ["openai", "elevenlabs", "edge", "dashscope", "volcengine", "minimax"].includes(p),
  loadVoicePrefs: async () => ({ ...mockPrefs }),
}));

// Mock node-edge-tts (uses ttsPromise which writes to file)
vi.mock("node-edge-tts", () => ({
  EdgeTTS: class MockEdgeTTS {
    constructor(_opts: any) {}
    async ttsPromise(_text: string, outputPath: string) {
      // Write fake mp3 data to the output path
      const fs = await import("node:fs");
      fs.writeFileSync(outputPath, Buffer.from("fake-mp3-data"));
    }
  },
}));

import {
  unifiedTranscribe,
  unifiedSynthesize,
  getVoiceSystemStatus,
  refreshVoiceTierStatus,
} from "../voice-router.js";

beforeEach(() => {
  mockPrefs.asrProvider = undefined;
  mockPrefs.ttsProvider = undefined;
  mockPrefs.ttsVoice = undefined;
  mockPrefs.ttsModel = undefined;
});

describe("unifiedTranscribe", () => {
  it("returns error when no ASR provider configured", async () => {
    const result = await unifiedTranscribe("base64audio");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("未配置");
  });

  it("returns error when ASR provider set but no API key", async () => {
    mockPrefs.asrProvider = "openai";
    const result = await unifiedTranscribe("base64audio");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("API Key");
  });

  it("calls API when provider and key are set", async () => {
    mockPrefs.asrProvider = "openai";

    // Mock fetch for OpenAI ASR
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "你好世界" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await unifiedTranscribe("base64audio", "sk-test-key");
    expect(result.ok).toBe(true);
    expect(result.text).toBe("你好世界");
    expect(result.backend).toBe("api-openai");

    vi.unstubAllGlobals();
  });

  it("returns error on API failure", async () => {
    mockPrefs.asrProvider = "openai";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await unifiedTranscribe("base64audio", "bad-key");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("401");

    vi.unstubAllGlobals();
  });
});

describe("unifiedSynthesize", () => {
  it("falls back to Edge TTS when no provider configured", async () => {
    const result = await unifiedSynthesize("你好");
    expect(result.ok).toBe(true);
    expect(result.backend).toBe("edge-tts");
    expect(result.audioBase64).toBeDefined();
  });

  it("uses Edge TTS when provider is explicitly 'edge'", async () => {
    mockPrefs.ttsProvider = "edge";
    const result = await unifiedSynthesize("你好");
    expect(result.ok).toBe(true);
    expect(result.backend).toBe("edge-tts");
  });

  it("falls back to Edge TTS when API key missing", async () => {
    mockPrefs.ttsProvider = "openai";
    const result = await unifiedSynthesize("你好");
    expect(result.ok).toBe(true);
    expect(result.backend).toBe("edge-tts");
  });

  it("calls API TTS when provider and key set", async () => {
    mockPrefs.ttsProvider = "openai";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await unifiedSynthesize("你好", "sk-test-key");
    expect(result.ok).toBe(true);
    expect(result.backend).toBe("api-openai");
    expect(result.format).toBe("mp3");

    vi.unstubAllGlobals();
  });
});

describe("getVoiceSystemStatus", () => {
  it("returns status with cloud-only info", async () => {
    const status = await getVoiceSystemStatus();
    expect(status.tier).toBeDefined();
    expect(status.tier.tier).toBeDefined();
    expect(status.localInstallState).toBe("not-installed");
    expect(status.prefs).toBeDefined();
  });

  it("reports ASR as unavailable when no provider configured", async () => {
    const status = await getVoiceSystemStatus();
    expect(status.asrAvailable).toBe(false);
    expect(status.asrBackend).toBe("none");
  });

  it("reports TTS as available (Edge TTS is always available)", async () => {
    const status = await getVoiceSystemStatus();
    expect(status.ttsAvailable).toBe(true);
    expect(status.ttsBackend).toBe("edge-tts");
  });
});

describe("refreshVoiceTierStatus", () => {
  it("returns a tier decision", () => {
    const decision = refreshVoiceTierStatus();
    expect(decision.tier).toBeDefined();
    expect(decision.hardware).toBeDefined();
  });
});

import { describe, it, expect } from "vitest";
import type { HardwareSnapshot } from "../types.js";
import { GPU_MODELS, CPU_MODELS } from "../voice-models.js";
import {
  classifyVoiceTier,
  getModelsForTier,
  describeTier,
  tierRequiresPython,
  tierDownloadSizeMB,
} from "../voice-tier.js";

function makeHw(overrides: Partial<HardwareSnapshot> = {}): HardwareSnapshot {
  return {
    gpu: null,
    totalRamMB: 16384,
    freeRamMB: 8192,
    cpuModel: "Intel Core i7",
    cpuCores: 8,
    platform: "win32",
    arch: "x64",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("classifyVoiceTier", () => {
  it("returns disabled when total RAM < 4 GB", () => {
    const hw = makeHw({ totalRamMB: 3000 });
    const result = classifyVoiceTier(hw);
    expect(result.tier).toBe("disabled");
    expect(result.asrModel).toBeNull();
    expect(result.ttsModel).toBeNull();
    expect(result.reason).toContain("内存不足");
  });

  it("returns gpu-full with 10GB+ NVIDIA GPU", () => {
    const hw = makeHw({
      gpu: {
        vendor: "nvidia",
        name: "RTX 4060",
        vramTotalMB: 10240,
        vramFreeMB: 9000,
        driverVersion: "572.16",
      },
    });
    const result = classifyVoiceTier(hw);
    expect(result.tier).toBe("gpu-full");
    expect(result.asrModel?.id).toBe("qwen3-asr-0.6b");
    expect(result.ttsModel?.id).toBe("qwen3-tts-0.6b");
  });

  it("returns gpu-asr with 6GB NVIDIA GPU (budget 70% = 4.2GB)", () => {
    const hw = makeHw({
      gpu: {
        vendor: "nvidia",
        name: "RTX 3060",
        vramTotalMB: 6144,
        vramFreeMB: 5500,
        driverVersion: "572.16",
      },
    });
    const result = classifyVoiceTier(hw);
    expect(result.tier).toBe("gpu-asr");
    expect(result.asrModel?.id).toBe("qwen3-asr-0.6b");
    expect(result.ttsModel?.id).toBe("edge-tts");
  });

  it("falls through to CPU when NVIDIA VRAM too low", () => {
    const hw = makeHw({
      gpu: {
        vendor: "nvidia",
        name: "GTX 1050",
        vramTotalMB: 2048,
        vramFreeMB: 1800,
        driverVersion: "460.00",
      },
      freeRamMB: 4000,
    });
    const result = classifyVoiceTier(hw);
    expect(result.tier).toBe("cpu-full");
  });

  it("returns cpu-full with 4GB+ free RAM", () => {
    const hw = makeHw({ freeRamMB: 4000 });
    const result = classifyVoiceTier(hw);
    expect(result.tier).toBe("cpu-full");
    expect(result.asrModel?.id).toBe("sensevoice-small");
    expect(result.ttsModel?.id).toBe("kokoro-82m");
  });

  it("returns cpu-asr with 1GB free RAM (budget 70% = 700MB)", () => {
    const hw = makeHw({ freeRamMB: 1000 });
    const result = classifyVoiceTier(hw);
    expect(result.tier).toBe("cpu-asr");
    expect(result.asrModel?.id).toBe("sensevoice-small");
    expect(result.ttsModel?.id).toBe("edge-tts");
  });

  it("returns disabled with very low free RAM", () => {
    const hw = makeHw({ freeRamMB: 500 });
    const result = classifyVoiceTier(hw);
    expect(result.tier).toBe("disabled");
  });

  it("ignores AMD GPU", () => {
    const hw = makeHw({
      gpu: {
        vendor: "amd",
        name: "RX 7900",
        vramTotalMB: 20480,
        vramFreeMB: 18000,
        driverVersion: "23.12",
      },
      freeRamMB: 4000,
    });
    const result = classifyVoiceTier(hw);
    // AMD is not supported, falls to CPU path
    expect(result.tier).toBe("cpu-full");
  });
});

describe("getModelsForTier", () => {
  it("returns correct models for each tier", () => {
    expect(getModelsForTier("gpu-full")).toEqual({
      asr: GPU_MODELS.qwen3Asr,
      tts: GPU_MODELS.qwen3Tts,
    });
    expect(getModelsForTier("gpu-asr")).toEqual({
      asr: GPU_MODELS.qwen3Asr,
      tts: CPU_MODELS.edgeTts,
    });
    expect(getModelsForTier("cpu-full")).toEqual({
      asr: CPU_MODELS.sensevoice,
      tts: CPU_MODELS.kokoro82m,
    });
    expect(getModelsForTier("cpu-asr")).toEqual({
      asr: CPU_MODELS.sensevoice,
      tts: CPU_MODELS.edgeTts,
    });
    expect(getModelsForTier("disabled")).toEqual({
      asr: null,
      tts: null,
    });
  });
});

describe("describeTier", () => {
  it("returns gold badge for gpu-full", () => {
    const hw = makeHw({
      gpu: {
        vendor: "nvidia",
        name: "RTX 4090",
        vramTotalMB: 24000,
        vramFreeMB: 22000,
        driverVersion: "572.16",
      },
    });
    const decision = classifyVoiceTier(hw);
    const desc = describeTier(decision);
    expect(desc.badge).toBe("gold");
    expect(desc.title).toContain("GPU");
  });

  it("returns disabled badge for disabled tier", () => {
    const hw = makeHw({ totalRamMB: 2000 });
    const decision = classifyVoiceTier(hw);
    const desc = describeTier(decision);
    expect(desc.badge).toBe("disabled");
  });
});

describe("tierRequiresPython", () => {
  it("returns true for GPU tiers", () => {
    expect(tierRequiresPython("gpu-full")).toBe(true);
    expect(tierRequiresPython("gpu-asr")).toBe(true);
  });

  it("returns false for CPU/disabled tiers", () => {
    expect(tierRequiresPython("cpu-full")).toBe(false);
    expect(tierRequiresPython("cpu-asr")).toBe(false);
    expect(tierRequiresPython("disabled")).toBe(false);
  });
});

describe("tierDownloadSizeMB", () => {
  it("returns non-zero for GPU tiers", () => {
    expect(tierDownloadSizeMB("gpu-full")).toBeGreaterThan(0);
    expect(tierDownloadSizeMB("gpu-asr")).toBeGreaterThan(0);
  });

  it("returns 0 for disabled", () => {
    expect(tierDownloadSizeMB("disabled")).toBe(0);
  });
});

/**
 * Voice Tier Decision Engine — maps hardware to optimal model selection.
 *
 * Pure functions, no I/O, no side effects. Easy to unit test.
 *
 * Decision rules:
 *   available_vram = gpu_total_vram * 70%
 *   available_ram  = free_ram * 70%
 *
 *   total RAM < 4 GB                        → disabled
 *   NVIDIA GPU && available_vram >= 6.3GB   → gpu-full  (Qwen3-ASR + Qwen3-TTS)
 *   NVIDIA GPU && available_vram >= 3.5GB   → gpu-asr   (Qwen3-ASR + Edge TTS)
 *   available_ram >= 1.9GB                  → cpu-full  (SenseVoice + Kokoro)
 *   available_ram >= 450MB                  → cpu-asr   (SenseVoice + Edge TTS)
 *   otherwise                               → disabled
 *
 * Adapted from clawdbot src/voice/voice-tier.ts.
 */

import type {
  HardwareSnapshot,
  VoiceModelSpec,
  VoiceTierDecision,
  VoiceTierLevel,
} from "./types.js";
import { CPU_MODELS, GPU_MODELS } from "./voice-models.js";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Budget ratio — only use 70% of available resources to leave room for other apps. */
const BUDGET_RATIO = 0.7;

/** Minimum total system RAM to enable any voice features. */
const MIN_TOTAL_RAM_MB = 4096;

// GPU VRAM thresholds (after 70% budget applied to total VRAM)
const GPU_FULL_VRAM_MB = 6300;
const GPU_ASR_ONLY_VRAM_MB = 3500;

// CPU RAM thresholds (after 70% budget applied to free RAM)
const CPU_FULL_RAM_MB = 1900;
const CPU_ASR_ONLY_RAM_MB = 450;

// ---------------------------------------------------------------------------
// Decision Logic
// ---------------------------------------------------------------------------

/**
 * Classify hardware into a voice tier.
 */
export function classifyVoiceTier(hw: HardwareSnapshot): VoiceTierDecision {
  if (hw.totalRamMB < MIN_TOTAL_RAM_MB) {
    return {
      tier: "disabled",
      asrModel: null,
      ttsModel: null,
      reason: `系统内存不足 (${hw.totalRamMB} MB < ${MIN_TOTAL_RAM_MB} MB)，无法运行语音功能`,
      hardware: hw,
    };
  }

  // Try GPU path first (NVIDIA only)
  if (hw.gpu?.vendor === "nvidia") {
    const availableVram = hw.gpu.vramTotalMB * BUDGET_RATIO;

    if (availableVram >= GPU_FULL_VRAM_MB) {
      return {
        tier: "gpu-full",
        asrModel: GPU_MODELS.qwen3Asr,
        ttsModel: GPU_MODELS.qwen3Tts,
        reason: `${hw.gpu.name} (${hw.gpu.vramTotalMB} MB VRAM) — 可同时运行 ASR + TTS`,
        hardware: hw,
      };
    }

    if (availableVram >= GPU_ASR_ONLY_VRAM_MB) {
      return {
        tier: "gpu-asr",
        asrModel: GPU_MODELS.qwen3Asr,
        ttsModel: CPU_MODELS.edgeTts,
        reason: `${hw.gpu.name} (${hw.gpu.vramTotalMB} MB VRAM) — 显存仅够运行 ASR，TTS 使用在线 Edge`,
        hardware: hw,
      };
    }
  }

  // CPU path
  const availableRam = hw.freeRamMB * BUDGET_RATIO;

  if (availableRam >= CPU_FULL_RAM_MB) {
    return {
      tier: "cpu-full",
      asrModel: CPU_MODELS.sensevoice,
      ttsModel: CPU_MODELS.kokoro82m,
      reason: `CPU 模式 (可用内存 ${Math.round(availableRam)} MB) — 可同时运行 ASR + TTS`,
      hardware: hw,
    };
  }

  if (availableRam >= CPU_ASR_ONLY_RAM_MB) {
    return {
      tier: "cpu-asr",
      asrModel: CPU_MODELS.sensevoice,
      ttsModel: CPU_MODELS.edgeTts,
      reason: `CPU 模式 (可用内存 ${Math.round(availableRam)} MB) — 内存仅够运行 ASR，TTS 使用在线 Edge`,
      hardware: hw,
    };
  }

  return {
    tier: "disabled",
    asrModel: null,
    ttsModel: null,
    reason: `可用内存不足 (${Math.round(availableRam)} MB)，无法运行语音功能`,
    hardware: hw,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the model specs for a given tier level.
 */
export function getModelsForTier(tier: VoiceTierLevel): {
  asr: VoiceModelSpec | null;
  tts: VoiceModelSpec | null;
} {
  switch (tier) {
    case "gpu-full":
      return { asr: GPU_MODELS.qwen3Asr, tts: GPU_MODELS.qwen3Tts };
    case "gpu-asr":
      return { asr: GPU_MODELS.qwen3Asr, tts: CPU_MODELS.edgeTts };
    case "cpu-full":
      return { asr: CPU_MODELS.sensevoice, tts: CPU_MODELS.kokoro82m };
    case "cpu-asr":
      return { asr: CPU_MODELS.sensevoice, tts: CPU_MODELS.edgeTts };
    case "disabled":
      return { asr: null, tts: null };
  }
}

/** UI badge for tier display. */
export type TierBadge = "gold" | "silver" | "bronze" | "disabled";

/**
 * User-facing tier description for the settings UI.
 */
export function describeTier(decision: VoiceTierDecision): {
  title: string;
  description: string;
  badge: TierBadge;
} {
  switch (decision.tier) {
    case "gpu-full":
      return {
        title: "GPU 全能语音",
        description: `Qwen3-ASR + Qwen3-TTS — 最高质量 (${decision.hardware.gpu?.name ?? "NVIDIA GPU"})`,
        badge: "gold",
      };
    case "gpu-asr":
      return {
        title: "GPU 语音识别",
        description: `Qwen3-ASR + Edge TTS (${decision.hardware.gpu?.name ?? "NVIDIA GPU"})`,
        badge: "silver",
      };
    case "cpu-full":
      return {
        title: "CPU 语音",
        description: "SenseVoice + Kokoro — 离线语音识别与合成",
        badge: "silver",
      };
    case "cpu-asr":
      return {
        title: "CPU 语音识别",
        description: "SenseVoice + Edge TTS — 离线识别，在线合成",
        badge: "bronze",
      };
    case "disabled":
      return {
        title: "语音功能已禁用",
        description: decision.reason,
        badge: "disabled",
      };
  }
}

/**
 * Whether a tier requires a Python environment (GPU tiers need it).
 */
export function tierRequiresPython(tier: VoiceTierLevel): boolean {
  return tier === "gpu-full" || tier === "gpu-asr";
}

/**
 * Total download size for a tier's models (in MB).
 */
export function tierDownloadSizeMB(tier: VoiceTierLevel): number {
  const { asr } = getModelsForTier(tier);
  return asr?.downloadSizeMB ?? 0;
}

/**
 * Voice Model Catalog — static definitions of available ASR/TTS models.
 *
 * Download sources with CN-first priority (benchmarked on Alibaba Cloud CN):
 *   1. ModelScope API — ~25 MB/s, official, fastest (302 redirect to CDN)
 *   2. ModelScope resolve — ~25 MB/s, HuggingFace-compatible URL format
 *   3. hf-mirror.com — ~0.2 MB/s for large files, slow but reliable fallback
 *
 * Adapted from clawdbot src/voice/voice-models.ts.
 */

import type { VoiceModelSpec } from "./types.js";

// ---------------------------------------------------------------------------
// URL Helpers
// ---------------------------------------------------------------------------

/** ModelScope official API — fastest, CDN redirect for all file sizes. */
function ms(modelId: string, filePath: string): string {
  return `https://modelscope.cn/api/v1/models/${modelId}/repo?Revision=master&FilePath=${encodeURIComponent(filePath)}`;
}

/** ModelScope resolve path — same CDN, HuggingFace-compatible URL. */
function ms2(modelId: string, filePath: string): string {
  return `https://modelscope.cn/models/${modelId}/resolve/master/${filePath}`;
}

/** hf-mirror.com — slow but works when ModelScope is down. */
function hf(repoId: string, filePath: string): string {
  return `https://hf-mirror.com/${repoId}/resolve/main/${filePath}`;
}

/** Build sources array for a file — 3 mirrors, ModelScope priority. */
function sources(msModel: string, hfRepo: string, file: string) {
  return [
    { label: "魔搭", url: ms(msModel, file) },
    { label: "魔搭备用", url: ms2(msModel, file) },
    { label: "hf-mirror", url: hf(hfRepo, file) },
  ];
}

// ---------------------------------------------------------------------------
// GPU Models (Python sidecar, NVIDIA CUDA)
// ---------------------------------------------------------------------------

const ASR_MS = "Qwen/Qwen3-ASR-0.6B";
const ASR_HF = "Qwen/Qwen3-ASR-0.6B";

const QWEN3_ASR_0_6B: VoiceModelSpec = {
  id: "qwen3-asr-0.6b",
  displayName: "Qwen3-ASR 0.6B (GPU)",
  backend: "python-sidecar",
  estimatedMemoryMB: 3000,
  downloadSizeMB: 1793,
  modelDirName: "qwen3-asr-0.6b",
  files: [
    {
      relativePath: "model.safetensors",
      sizeBytes: 1_876_091_704,
      sources: sources(ASR_MS, ASR_HF, "model.safetensors"),
    },
    {
      relativePath: "config.json",
      sizeBytes: 6_193,
      sources: sources(ASR_MS, ASR_HF, "config.json"),
    },
    {
      relativePath: "preprocessor_config.json",
      sizeBytes: 330,
      sources: sources(ASR_MS, ASR_HF, "preprocessor_config.json"),
    },
    {
      relativePath: "tokenizer_config.json",
      sizeBytes: 12_487,
      sources: sources(ASR_MS, ASR_HF, "tokenizer_config.json"),
    },
    {
      relativePath: "vocab.json",
      sizeBytes: 2_776_833,
      sources: sources(ASR_MS, ASR_HF, "vocab.json"),
    },
    {
      relativePath: "merges.txt",
      sizeBytes: 1_671_853,
      sources: sources(ASR_MS, ASR_HF, "merges.txt"),
    },
    {
      relativePath: "generation_config.json",
      sizeBytes: 142,
      sources: sources(ASR_MS, ASR_HF, "generation_config.json"),
    },
    {
      relativePath: "chat_template.json",
      sizeBytes: 1_161,
      sources: sources(ASR_MS, ASR_HF, "chat_template.json"),
    },
  ],
};

const TTS_MS = "Qwen/Qwen3-TTS-12Hz-0.6B-Base";
const TTS_HF = "Qwen/Qwen3-TTS-12Hz-0.6B-Base";

const QWEN3_TTS_0_6B: VoiceModelSpec = {
  id: "qwen3-tts-0.6b",
  displayName: "Qwen3-TTS 0.6B (GPU)",
  backend: "python-sidecar",
  estimatedMemoryMB: 2800,
  downloadSizeMB: 2400,
  modelDirName: "qwen3-tts-0.6b",
  files: [
    {
      relativePath: "model.safetensors",
      sizeBytes: 1_829_344_272,
      sources: sources(TTS_MS, TTS_HF, "model.safetensors"),
    },
    {
      relativePath: "speech_tokenizer/model.safetensors",
      sizeBytes: 682_293_092,
      sources: sources(TTS_MS, TTS_HF, "speech_tokenizer/model.safetensors"),
    },
    {
      relativePath: "speech_tokenizer/config.json",
      sizeBytes: 2_336,
      sources: sources(TTS_MS, TTS_HF, "speech_tokenizer/config.json"),
    },
    {
      relativePath: "speech_tokenizer/preprocessor_config.json",
      sizeBytes: 234,
      sources: sources(TTS_MS, TTS_HF, "speech_tokenizer/preprocessor_config.json"),
    },
    {
      relativePath: "config.json",
      sizeBytes: 4_494,
      sources: sources(TTS_MS, TTS_HF, "config.json"),
    },
    {
      relativePath: "preprocessor_config.json",
      sizeBytes: 127,
      sources: sources(TTS_MS, TTS_HF, "preprocessor_config.json"),
    },
    {
      relativePath: "tokenizer_config.json",
      sizeBytes: 7_344,
      sources: sources(TTS_MS, TTS_HF, "tokenizer_config.json"),
    },
    {
      relativePath: "vocab.json",
      sizeBytes: 2_776_833,
      sources: sources(TTS_MS, TTS_HF, "vocab.json"),
    },
    {
      relativePath: "merges.txt",
      sizeBytes: 1_671_839,
      sources: sources(TTS_MS, TTS_HF, "merges.txt"),
    },
    {
      relativePath: "generation_config.json",
      sizeBytes: 245,
      sources: sources(TTS_MS, TTS_HF, "generation_config.json"),
    },
  ],
};

// ---------------------------------------------------------------------------
// CPU Models (sherpa-onnx / Edge TTS)
// ---------------------------------------------------------------------------

const SV_MS = "pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue";
const SV_HF = "csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17";

const SENSEVOICE_SMALL: VoiceModelSpec = {
  id: "sensevoice-small",
  displayName: "SenseVoice (CPU)",
  backend: "sherpa-onnx",
  estimatedMemoryMB: 450,
  downloadSizeMB: 229,
  modelDirName: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17",
  files: [
    {
      relativePath: "model.int8.onnx",
      sizeBytes: 228_000_000,
      sources: sources(SV_MS, SV_HF, "model.int8.onnx"),
    },
    {
      relativePath: "tokens.txt",
      sizeBytes: 500_000,
      sources: sources(SV_MS, SV_HF, "tokens.txt"),
    },
  ],
};

const KK_MS = "csukuangfj/kokoro-multi-lang-v1_1-sherpa-onnx";
const KK_HF = "csukuangfj/kokoro-multi-lang-v1_1-sherpa-onnx";

const KOKORO_82M: VoiceModelSpec = {
  id: "kokoro-82m",
  displayName: "Kokoro TTS (CPU)",
  backend: "sherpa-onnx",
  estimatedMemoryMB: 1400,
  downloadSizeMB: 86,
  modelDirName: "kokoro-82m",
  files: [
    {
      relativePath: "model.onnx",
      sizeBytes: 86_000_000,
      sources: sources(KK_MS, KK_HF, "model.onnx"),
    },
    {
      relativePath: "voices.bin",
      sizeBytes: 34_000_000,
      sources: sources(KK_MS, KK_HF, "voices.bin"),
    },
    { relativePath: "tokens.txt", sizeBytes: 50_000, sources: sources(KK_MS, KK_HF, "tokens.txt") },
  ],
};

const EDGE_TTS: VoiceModelSpec = {
  id: "edge-tts",
  displayName: "Edge TTS (在线)",
  backend: "edge-tts",
  estimatedMemoryMB: 0,
  downloadSizeMB: 0,
  modelDirName: "",
  files: [],
};

// ---------------------------------------------------------------------------
// Public Exports
// ---------------------------------------------------------------------------

export const GPU_MODELS = {
  qwen3Asr: QWEN3_ASR_0_6B,
  qwen3Tts: QWEN3_TTS_0_6B,
} as const;

export const CPU_MODELS = {
  sensevoice: SENSEVOICE_SMALL,
  kokoro82m: KOKORO_82M,
  edgeTts: EDGE_TTS,
} as const;

/** All model specs indexed by id. */
export const ALL_MODELS: Record<string, VoiceModelSpec> = {
  [QWEN3_ASR_0_6B.id]: QWEN3_ASR_0_6B,
  [QWEN3_TTS_0_6B.id]: QWEN3_TTS_0_6B,
  [SENSEVOICE_SMALL.id]: SENSEVOICE_SMALL,
  [KOKORO_82M.id]: KOKORO_82M,
  [EDGE_TTS.id]: EDGE_TTS,
};

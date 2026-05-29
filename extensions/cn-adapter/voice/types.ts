/**
 * Voice System — Type Definitions (simplified for cloud-only routing).
 *
 * Adapted from clawdbot src/voice/types.ts.
 * GPU sidecar / KWS / install types omitted — reserved for Desktop Wave.
 */

// ---------------------------------------------------------------------------
// Hardware Detection
// ---------------------------------------------------------------------------

export type GpuVendor = "nvidia" | "amd" | "intel" | "none";

export interface GpuInfo {
  vendor: GpuVendor;
  name: string;
  /** Total VRAM in megabytes. */
  vramTotalMB: number;
  /** Currently free VRAM in megabytes. */
  vramFreeMB: number;
  driverVersion: string;
  /** CUDA version reported by nvidia-smi (NVIDIA only). */
  cudaVersion?: string;
}

export interface HardwareSnapshot {
  gpu: GpuInfo | null;
  totalRamMB: number;
  freeRamMB: number;
  cpuModel: string;
  cpuCores: number;
  platform: NodeJS.Platform;
  arch: string;
  /** Unix epoch ms when this snapshot was taken. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Tier Classification
// ---------------------------------------------------------------------------

/**
 * Voice capability tier levels, ordered from best to worst.
 *
 * - `gpu-full`  : Qwen3-ASR + Qwen3-TTS on NVIDIA GPU (~6.3 GB VRAM)
 * - `gpu-asr`   : Qwen3-ASR on GPU + Edge TTS online  (~3.5 GB VRAM)
 * - `cpu-full`  : SenseVoice + Kokoro on CPU            (~1.9 GB RAM)
 * - `cpu-asr`   : SenseVoice on CPU + Edge TTS          (~450 MB RAM)
 * - `disabled`  : Hardware too weak, all voice features off
 */
export type VoiceTierLevel = "gpu-full" | "gpu-asr" | "cpu-full" | "cpu-asr" | "disabled";

export interface VoiceTierDecision {
  tier: VoiceTierLevel;
  asrModel: VoiceModelSpec | null;
  ttsModel: VoiceModelSpec | null;
  /** Human-readable reason for this classification (Chinese). */
  reason: string;
  hardware: HardwareSnapshot;
}

// ---------------------------------------------------------------------------
// Model Specifications
// ---------------------------------------------------------------------------

/** Execution backend for a voice model. */
export type VoiceModelBackend = "sherpa-onnx" | "python-sidecar" | "edge-tts" | "api";

export interface VoiceModelDownloadSource {
  /** Mirror label for progress display (e.g. "ModelScope", "hf-mirror"). */
  label: string;
  /** Full URL to the file. */
  url: string;
  /** Expected SHA-256 hex digest for integrity verification. */
  sha256?: string;
}

export interface VoiceModelFile {
  /** Relative path within the model directory (e.g. "model.safetensors"). */
  relativePath: string;
  /** Approximate file size in bytes. */
  sizeBytes: number;
  /** Ordered download sources (primary, fallback, tertiary). */
  sources: VoiceModelDownloadSource[];
}

export interface VoiceModelSpec {
  /** Unique model identifier (e.g. "qwen3-asr-0.6b", "kokoro-82m"). */
  id: string;
  /** Human-readable display name. */
  displayName: string;
  /** Execution backend. */
  backend: VoiceModelBackend;
  /** Estimated runtime memory in MB (VRAM for GPU models, RAM for CPU). */
  estimatedMemoryMB: number;
  /** Total download size in MB (sum of all files). */
  downloadSizeMB: number;
  /** Directory name under ~/.openclawcn/voice-models/ */
  modelDirName: string;
  /** Individual files to download. */
  files: VoiceModelFile[];
}

// ---------------------------------------------------------------------------
// API Provider Selection (user preferences)
// ---------------------------------------------------------------------------

/** ASR provider the user can manually select. "auto" = hardware tier logic. */
export type VoiceAsrProvider =
  | "auto"
  | "openai"
  | "groq"
  | "deepgram"
  | "google"
  | "dashscope"
  | "volcengine";

/** TTS provider the user can manually select. "auto" = hardware tier logic. */
export type VoiceTtsProvider =
  | "auto"
  | "openai"
  | "elevenlabs"
  | "edge"
  | "dashscope"
  | "volcengine"
  | "minimax";

/** User-chosen voice backend preferences, saved to settings/voice-prefs.json. */
export interface VoicePrefs {
  asrProvider?: VoiceAsrProvider;
  asrModel?: string;
  ttsProvider?: VoiceTtsProvider;
  ttsModel?: string;
  ttsVoice?: string;
  /** TTS 语速 (0.2–3.0, 默认 1.0). */
  ttsSpeedRatio?: number;
  /** TTS 音调 (0.1–3.0, 默认 1.0). */
  ttsPitchRatio?: number;
  /** TTS 情感风格 (如 "happy", "pleased", "sorry", "professional", "serious"). */
  ttsEmotion?: string;
}

// ---------------------------------------------------------------------------
// Transcribe / Synthesize Results
// ---------------------------------------------------------------------------

export interface TranscribeResult {
  ok: boolean;
  text?: string;
  latencyMs?: number;
  backend?: string;
  error?: string;
}

export interface SynthesizeResult {
  ok: boolean;
  audioBase64?: string;
  format?: string;
  latencyMs?: number;
  backend?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Voice System Status (returned by cn.voice.status gateway method)
// ---------------------------------------------------------------------------

export interface VoiceSystemStatus {
  tier: VoiceTierDecision;
  /** Whether any ASR backend is available (local or API). */
  asrAvailable: boolean;
  asrBackend: VoiceModelBackend | "none";
  /** Whether any TTS backend is available (local or API). */
  ttsAvailable: boolean;
  ttsBackend: VoiceModelBackend | "none";
  /** Local model install state — always "not-installed" until Desktop Wave. */
  localInstallState: "not-installed" | "installed";
  /** User-selected voice backend preferences. */
  prefs?: VoicePrefs;
  /** Whether an API ASR provider is configured. */
  apiAsrConfigured?: boolean;
  /** Whether an API TTS provider is configured. */
  apiTtsConfigured?: boolean;
}

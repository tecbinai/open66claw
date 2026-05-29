/**
 * Voice System — module entry point.
 *
 * Re-exports public API for use by cn-adapter index.ts and other modules.
 */

// Handler registration (used by cn-adapter index.ts)
export { registerVoiceHandlers } from "./handlers.js";

// Router (cloud-only ASR/TTS)
export {
  unifiedTranscribe,
  unifiedSynthesize,
  getVoiceSystemStatus,
  refreshVoiceTierStatus,
} from "./voice-router.js";

// Tier classification (pure functions)
export {
  classifyVoiceTier,
  getModelsForTier,
  describeTier,
  tierRequiresPython,
  tierDownloadSizeMB,
} from "./voice-tier.js";
export type { TierBadge } from "./voice-tier.js";

// Hardware detection
export {
  getHardwareSnapshot,
  refreshHardwareSnapshot,
  detectNvidiaGpu,
} from "./hardware-detect.js";

// Model catalog
export { GPU_MODELS, CPU_MODELS, ALL_MODELS } from "./voice-models.js";

// User preferences
export {
  loadVoicePrefs,
  getVoicePrefsSync,
  setVoicePrefs,
  isApiAsrProvider,
  isApiTtsProvider,
} from "./voice-prefs.js";

// Types
export type {
  GpuVendor,
  GpuInfo,
  HardwareSnapshot,
  VoiceTierLevel,
  VoiceTierDecision,
  VoiceModelBackend,
  VoiceModelSpec,
  VoiceModelFile,
  VoiceModelDownloadSource,
  VoiceAsrProvider,
  VoiceTtsProvider,
  VoicePrefs,
  TranscribeResult,
  SynthesizeResult,
  VoiceSystemStatus,
} from "./types.js";

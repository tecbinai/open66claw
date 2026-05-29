/**
 * Voice Preferences — persistent user selection for ASR/TTS backends.
 *
 * Stores the user's preferred ASR/TTS provider (or "auto" for hardware tier logic)
 * in {stateDir}/settings/voice-prefs.json.
 *
 * Adapted from clawdbot src/voice/voice-prefs.ts.
 * Uses cn-adapter's config-path instead of clawdbot's resolveStateDir.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { resolveDefaultConfigPath } from "../utils/config-path.js";
import type { VoiceAsrProvider, VoicePrefs, VoiceTtsProvider } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ASR_PROVIDERS: VoiceAsrProvider[] = [
  "auto",
  "openai",
  "groq",
  "deepgram",
  "google",
  "dashscope",
  "volcengine",
];

const VALID_TTS_PROVIDERS: VoiceTtsProvider[] = [
  "auto",
  "openai",
  "elevenlabs",
  "edge",
  "dashscope",
  "volcengine",
  "minimax",
];

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function resolvePath(): string {
  const configPath = resolveDefaultConfigPath();
  const stateDir = path.dirname(configPath);
  return path.join(stateDir, "settings", "voice-prefs.json");
}

// ---------------------------------------------------------------------------
// Read / Write with lock
// ---------------------------------------------------------------------------

let lock: Promise<void> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock;
  let release: (() => void) | undefined;
  lock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release?.();
  }
}

async function readJSON<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJSONAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

function clampNumber(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== "number" || Number.isNaN(v)) return undefined;
  return Math.round(Math.max(min, Math.min(max, v)) * 100) / 100;
}

function sanitize(raw: Partial<VoicePrefs> | null | undefined): VoicePrefs {
  const prefs: VoicePrefs = {};

  if (raw?.asrProvider && VALID_ASR_PROVIDERS.includes(raw.asrProvider)) {
    prefs.asrProvider = raw.asrProvider;
  }
  if (typeof raw?.asrModel === "string" && raw.asrModel.trim()) {
    prefs.asrModel = raw.asrModel.trim();
  }
  if (raw?.ttsProvider && VALID_TTS_PROVIDERS.includes(raw.ttsProvider)) {
    prefs.ttsProvider = raw.ttsProvider;
  }
  if (typeof raw?.ttsModel === "string" && raw.ttsModel.trim()) {
    prefs.ttsModel = raw.ttsModel.trim();
  }
  if (typeof raw?.ttsVoice === "string" && raw.ttsVoice.trim()) {
    prefs.ttsVoice = raw.ttsVoice.trim();
  }
  const sr = clampNumber(raw?.ttsSpeedRatio, 0.2, 3.0);
  if (sr !== undefined) prefs.ttsSpeedRatio = sr;
  const pr = clampNumber(raw?.ttsPitchRatio, 0.1, 3.0);
  if (pr !== undefined) prefs.ttsPitchRatio = pr;
  if (typeof raw?.ttsEmotion === "string" && raw.ttsEmotion.trim()) {
    prefs.ttsEmotion = raw.ttsEmotion.trim();
  }

  return prefs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Synchronous in-memory cache for hot-path reads (voice-router). */
let _cachedPrefs: VoicePrefs | null = null;

/**
 * Load voice preferences. Returns defaults (all "auto") if file doesn't exist.
 */
export async function loadVoicePrefs(): Promise<VoicePrefs> {
  const filePath = resolvePath();
  const existing = await readJSON<VoicePrefs>(filePath);
  const prefs = sanitize(existing);
  _cachedPrefs = prefs;
  return prefs;
}

/**
 * Get cached voice preferences (sync). Falls back to defaults if never loaded.
 */
export function getVoicePrefsSync(): VoicePrefs {
  return _cachedPrefs ?? {};
}

/**
 * Save voice preferences (merge with existing).
 */
export async function setVoicePrefs(patch: Partial<VoicePrefs>): Promise<VoicePrefs> {
  const filePath = resolvePath();
  return await withLock(async () => {
    const existing = await readJSON<VoicePrefs>(filePath);
    const merged = sanitize({ ...existing, ...patch });
    await writeJSONAtomic(filePath, merged);
    _cachedPrefs = merged;
    return merged;
  });
}

/**
 * Check if a given ASR provider string is a valid API provider (not "auto").
 */
export function isApiAsrProvider(provider: string | undefined): boolean {
  return (
    !!provider && provider !== "auto" && VALID_ASR_PROVIDERS.includes(provider as VoiceAsrProvider)
  );
}

export function isApiTtsProvider(provider: string | undefined): boolean {
  return (
    !!provider && provider !== "auto" && VALID_TTS_PROVIDERS.includes(provider as VoiceTtsProvider)
  );
}

/**
 * Reset cached prefs (for testing).
 * @internal
 */
export function _resetPrefsCache(): void {
  _cachedPrefs = null;
}

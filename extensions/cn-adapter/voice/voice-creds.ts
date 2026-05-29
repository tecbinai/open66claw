/**
 * Voice Credentials — persistent storage for cloud voice service credentials.
 *
 * Currently supports volcengine (豆包语音).
 * Stores credentials in {stateDir}/settings/voice-creds.json alongside voice-prefs.json.
 *
 * Design:
 * - Same file pattern as voice-prefs.ts (JSON in settings/ dir)
 * - APP ID stored as-is (non-secret numeric ID)
 * - Access Token stored as-is (consistent with how openclaw.json stores apiKey)
 * - Masked values returned for UI display
 */

import fs from "node:fs/promises";
import path from "node:path";
import { resolveDefaultConfigPath } from "../utils/config-path.js";
import { createCnLogger } from "../utils/logger.js";

const log = createCnLogger("voice:creds");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VolcVoiceCredentials {
  appId: string;
  accessToken: string;
}

export interface VolcCredsStatus {
  configured: boolean;
  maskedAppId?: string;
  maskedToken?: string;
}

interface CredsFile {
  volcengine?: VolcVoiceCredentials;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function resolvePath(): string {
  const configPath = resolveDefaultConfigPath();
  const stateDir = path.dirname(configPath);
  return path.join(stateDir, "settings", "voice-creds.json");
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
// Masking
// ---------------------------------------------------------------------------

function maskString(s: string, showFirst: number, showLast: number): string {
  if (s.length <= showFirst + showLast) return "*".repeat(s.length);
  const stars = Math.min(s.length - showFirst - showLast, 12);
  return `${s.slice(0, showFirst)}${"*".repeat(stars)}${s.slice(-showLast)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** In-memory cache for hot-path reads (voice-router). */
let _cached: VolcVoiceCredentials | null = null;

/**
 * Save volcengine voice credentials.
 */
export async function saveVolcCredentials(appId: string, accessToken: string): Promise<void> {
  const filePath = resolvePath();
  await withLock(async () => {
    const existing = (await readJSON<CredsFile>(filePath)) ?? {};
    existing.volcengine = { appId, accessToken };
    await writeJSONAtomic(filePath, existing);
    _cached = existing.volcengine;
  });
  log.info("volcengine voice credentials saved");
}

/**
 * Load volcengine voice credentials (raw, for API calls).
 */
export async function loadVolcCredentials(): Promise<VolcVoiceCredentials | null> {
  if (_cached) return _cached;
  const filePath = resolvePath();
  const data = await readJSON<CredsFile>(filePath);
  const creds = data?.volcengine ?? null;
  if (creds?.appId && creds?.accessToken) {
    _cached = creds;
    return creds;
  }
  return null;
}

/**
 * Get cached volcengine credentials (sync). Returns null if never loaded.
 */
export function getVolcCredentialsSync(): VolcVoiceCredentials | null {
  return _cached;
}

/**
 * Get volcengine credentials status (masked, for UI display).
 */
export async function getVolcCredsStatus(): Promise<VolcCredsStatus> {
  const creds = await loadVolcCredentials();
  if (!creds) return { configured: false };
  return {
    configured: true,
    maskedAppId: maskString(creds.appId, 3, 3),
    maskedToken: maskString(creds.accessToken, 4, 4),
  };
}

/**
 * Reset cache (for testing).
 * @internal
 */
export function _resetCredsCache(): void {
  _cached = null;
}

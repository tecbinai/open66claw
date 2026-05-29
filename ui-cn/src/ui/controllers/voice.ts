/**
 * Voice Capability Controller — 语音能力状态管理。
 *
 * 管理 ASR 可用性检测、录音转写 RPC 调用、吉祥物显隐持久化。
 */

import type { GatewayBrowserClient } from "../gateway.js";
import type { RecordingState } from "../voice/audio-recorder.js";

// ── Types ───────────────────────────────────────────────

export type VoiceCapabilityState = {
  /** null = not yet checked */
  asrAvailable: boolean | null;
  mascotDismissed: boolean;
  recordingState: RecordingState;
  error: string | null;
};

// ── localStorage keys ───────────────────────────────────

const MASCOT_DISMISSED_KEY = "clawdbot:voice:mascot-dismissed";

// ── Persistence ─────────────────────────────────────────

export function isMascotDismissed(): boolean {
  try {
    return localStorage.getItem(MASCOT_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function dismissMascot(): void {
  try {
    localStorage.setItem(MASCOT_DISMISSED_KEY, "true");
  } catch {
    /* ignore */
  }
}

// ── Initial state ───────────────────────────────────────

export function createInitialVoiceState(): VoiceCapabilityState {
  return {
    asrAvailable: null,
    mascotDismissed: isMascotDismissed(),
    recordingState: "idle",
    error: null,
  };
}

// ── RPC calls ───────────────────────────────────────────

type AsrStatusResult = {
  available: boolean;
  model: string | null;
};

type AsrTranscribeResult = {
  text: string;
  latencyMs?: number;
  model?: string;
};

/**
 * Check if ASR is available (model installed).
 */
export async function checkAsrAvailability(client: GatewayBrowserClient): Promise<boolean> {
  try {
    const result = await client.request<AsrStatusResult>("asr.status");
    return result?.available ?? false;
  } catch {
    return false;
  }
}

/**
 * Transcribe a base64-encoded WAV audio clip (batch mode).
 * Returns transcribed text on success, or an error string.
 */
export async function transcribeAudio(
  client: GatewayBrowserClient,
  wavBase64: string,
): Promise<{ text: string } | { error: string }> {
  try {
    const result = await client.request<AsrTranscribeResult>("asr.transcribe", {
      audioBase64: wavBase64,
      format: "wav",
    });
    if (result?.text) {
      return { text: result.text };
    }
    return { error: "voice.error.transcriptionFailed" };
  } catch {
    return { error: "voice.error.transcriptionFailed" };
  }
}

// ── Streaming ASR RPC calls ────────────────────────────

type AsrStreamStatusResult = {
  available: boolean;
  model: string | null;
  method: string | null;
  streamingMode: string | null;
};

type AsrStreamStartResult = {
  sessionId: string;
};

type AsrStreamEndResult = {
  text: string;
};

/**
 * Check if streaming ASR is available (any backend: GPU/CPU/API).
 */
export async function checkStreamingAsrAvailability(
  client: GatewayBrowserClient,
): Promise<boolean> {
  try {
    const result = await client.request<AsrStreamStatusResult>("asr.stream.status");
    return result?.available ?? false;
  } catch {
    return false;
  }
}

/**
 * Start a streaming ASR session. Returns { sessionId } on success, null on failure.
 */
export async function startStreamingAsr(
  client: GatewayBrowserClient,
): Promise<{ sessionId: string } | null> {
  try {
    const result = await client.request<AsrStreamStartResult>("asr.stream.start");
    if (result?.sessionId) {
      return { sessionId: result.sessionId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Feed a PCM16 audio chunk to a streaming ASR session.
 * Fire-and-forget — results come via "asr.partial" server-push events.
 */
export async function feedStreamingAsr(
  client: GatewayBrowserClient,
  sessionId: string,
  pcmBase64: string,
): Promise<void> {
  try {
    await client.request("asr.stream.feed", { sessionId, pcmBase64 });
  } catch {
    // Non-fatal: individual chunk feed failures are tolerable
  }
}

/**
 * End a streaming ASR session. Returns the final transcription text.
 */
export async function endStreamingAsr(
  client: GatewayBrowserClient,
  sessionId: string,
): Promise<{ text: string } | null> {
  try {
    const result = await client.request<AsrStreamEndResult>("asr.stream.end", { sessionId });
    if (result?.text !== undefined) {
      return { text: result.text };
    }
    return null;
  } catch {
    return null;
  }
}

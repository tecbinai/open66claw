/**
 * Voice Router — cloud-only ASR/TTS routing.
 *
 * Routes transcription/synthesis requests to cloud API backends.
 * Local engine paths (GPU sidecar, sherpa-onnx, Kokoro) are stubbed out
 * and reserved for Desktop Wave.
 *
 * Adapted from clawdbot src/voice/voice-router.ts.
 */

import { createCnLogger } from "../utils/logger.js";
import { getHardwareSnapshot, refreshHardwareSnapshot } from "./hardware-detect.js";
import type {
  TranscribeResult,
  SynthesizeResult,
  VoiceSystemStatus,
  VoiceTierDecision,
} from "./types.js";
import {
  getVoicePrefsSync,
  isApiAsrProvider,
  isApiTtsProvider,
  loadVoicePrefs,
} from "./voice-prefs.js";
import { classifyVoiceTier } from "./voice-tier.js";

const log = createCnLogger("voice:router");

// ---------------------------------------------------------------------------
// Default voices/models per provider
// ---------------------------------------------------------------------------

const DEFAULT_ASR_MODELS: Record<string, string> = {
  openai: "whisper-1",
  groq: "whisper-large-v3-turbo",
  deepgram: "nova-2",
  google: "default",
  dashscope: "paraformer-realtime-v2",
  volcengine: "default",
};

const DEFAULT_TTS_MODELS: Record<string, string> = {
  openai: "gpt-4o-mini-tts",
  elevenlabs: "eleven_multilingual_v2",
  dashscope: "cosyvoice-v2",
  volcengine: "tts",
  minimax: "speech-02-hd",
};

const DEFAULT_TTS_VOICES: Record<string, string> = {
  openai: "alloy",
  elevenlabs: "pMsXgVXv3BLzUgSXRplE",
  edge: "zh-CN-XiaoxiaoNeural",
  dashscope: "longxiaochun",
  volcengine: "BV405_streaming",
  minimax: "male-qn-qingse",
};

const TTS_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  elevenlabs: "https://api.elevenlabs.io",
  dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  volcengine: "https://openspeech.bytedance.com/api/v1",
  minimax: "https://api.minimax.chat/v1",
};

const ASR_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  deepgram: "https://api.deepgram.com/v1",
  dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  volcengine: "https://openspeech.bytedance.com/api/v1",
};

// ---------------------------------------------------------------------------
// Unified Transcribe (cloud API only)
// ---------------------------------------------------------------------------

/**
 * Transcribe audio to text using a cloud API backend.
 *
 * Priority:
 *   0. User-selected API provider (if set)
 *   1. Desktop Wave: local engine support (stubbed)
 *   2. Error if nothing is available
 */
export async function unifiedTranscribe(
  audioBase64: string,
  apiKey?: string,
): Promise<TranscribeResult> {
  const prefs = getVoicePrefsSync();
  const provider = prefs.asrProvider;

  if (!isApiAsrProvider(provider)) {
    // Desktop Wave: local engine support
    return { ok: false, error: "未配置 ASR 云端提供商 (本地引擎需安装 Desktop 版)" };
  }

  if (!apiKey) {
    return { ok: false, error: `ASR 提供商 ${provider} 未配置 API Key` };
  }

  const model = prefs.asrModel || DEFAULT_ASR_MODELS[provider!] || "whisper-1";

  try {
    const start = Date.now();
    const result = await apiTranscribe(provider!, model, audioBase64, apiKey);
    result.latencyMs = Date.now() - start;
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`ASR (${provider}) failed: ${msg}`);
    return { ok: false, error: `ASR 失败: ${msg}`, backend: `api-${provider}` };
  }
}

// ---------------------------------------------------------------------------
// Unified Synthesize (cloud API only)
// ---------------------------------------------------------------------------

/**
 * Synthesize text to speech using a cloud API backend.
 *
 * Priority:
 *   0. User-selected API provider (if set)
 *   1. Edge TTS (free, no API key needed)
 *   2. Desktop Wave: local engine support (stubbed)
 *   3. Error
 */
export async function unifiedSynthesize(
  text: string,
  apiKey?: string,
  voice?: string,
): Promise<SynthesizeResult> {
  const prefs = getVoicePrefsSync();
  const provider = prefs.ttsProvider;

  // Edge TTS is always available (free, no API key)
  if (provider === "edge" || !provider || provider === "auto") {
    return edgeTtsSynthesize(text, voice || prefs.ttsVoice);
  }

  if (!isApiTtsProvider(provider)) {
    return { ok: false, error: "未配置 TTS 云端提供商" };
  }

  if (!apiKey) {
    // Fallback to Edge TTS if no API key
    log.warn(`TTS 提供商 ${provider} 未配置 API Key，降级为 Edge TTS`);
    return edgeTtsSynthesize(text, voice || prefs.ttsVoice);
  }

  try {
    const start = Date.now();
    const result = await apiSynthesize(
      text,
      provider,
      apiKey,
      prefs.ttsModel,
      voice || prefs.ttsVoice,
    );
    result.latencyMs = Date.now() - start;
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(`TTS (${provider}) failed: ${msg}`);
    // Fallback to Edge TTS
    log.info("TTS API 失败，降级为 Edge TTS");
    return edgeTtsSynthesize(text, voice || prefs.ttsVoice);
  }
}

// ---------------------------------------------------------------------------
// Cloud ASR Implementation
// ---------------------------------------------------------------------------

async function apiTranscribe(
  provider: string,
  model: string,
  audioBase64: string,
  apiKey: string,
): Promise<TranscribeResult> {
  const wavBuffer = Buffer.from(audioBase64, "base64");

  // OpenAI-compatible /audio/transcriptions endpoint
  const baseUrl = ASR_BASE_URLS[provider] ?? "https://api.openai.com/v1";

  if (provider === "deepgram") {
    // Deepgram uses a different API format
    const res = await fetch(`${baseUrl}/listen?model=nova-2&language=zh`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "audio/wav",
      },
      body: wavBuffer,
    });
    if (!res.ok) {
      return { ok: false, error: `Deepgram ASR 错误 (${res.status})`, backend: "api-deepgram" };
    }
    const json = (await res.json()) as {
      results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
    };
    const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    return { ok: true, text, backend: "api-deepgram" };
  }

  // Standard OpenAI-compatible multipart upload
  const formData = new FormData();
  formData.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "audio.wav");
  formData.append("model", model);
  formData.append("language", "zh");

  const url = `${baseUrl}/audio/transcriptions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    return { ok: false, error: `ASR API 错误 (${res.status})`, backend: `api-${provider}` };
  }

  const json = (await res.json()) as { text?: string };
  return { ok: true, text: json.text ?? "", backend: `api-${provider}` };
}

// ---------------------------------------------------------------------------
// Cloud TTS Implementation
// ---------------------------------------------------------------------------

async function apiSynthesize(
  text: string,
  provider: string,
  apiKey: string,
  model?: string,
  voice?: string,
): Promise<SynthesizeResult> {
  const resolvedModel = model || DEFAULT_TTS_MODELS[provider] || "tts-1";
  const resolvedVoice = voice || DEFAULT_TTS_VOICES[provider] || "alloy";
  const baseUrl = TTS_BASE_URLS[provider] ?? "https://api.openai.com/v1";

  // ElevenLabs has its own endpoint format
  if (provider === "elevenlabs") {
    const url = `${baseUrl}/v1/text-to-speech/${resolvedVoice}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: resolvedModel,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `ElevenLabs TTS 错误 (${res.status})`, backend: "api-elevenlabs" };
    }
    const audioBuffer = Buffer.from(await res.arrayBuffer());
    return {
      ok: true,
      audioBase64: audioBuffer.toString("base64"),
      format: "mp3",
      backend: "api-elevenlabs",
    };
  }

  // Generic OpenAI-compatible /audio/speech endpoint
  const url = `${baseUrl}/audio/speech`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolvedModel,
      input: text,
      voice: resolvedVoice,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    return { ok: false, error: `TTS API 错误 (${res.status})`, backend: `api-${provider}` };
  }

  const audioBuffer = Buffer.from(await res.arrayBuffer());
  return {
    ok: true,
    audioBase64: audioBuffer.toString("base64"),
    format: "mp3",
    backend: `api-${provider}`,
  };
}

// ---------------------------------------------------------------------------
// Edge TTS (free, no API key)
// ---------------------------------------------------------------------------

async function edgeTtsSynthesize(text: string, voice?: string): Promise<SynthesizeResult> {
  try {
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs");

    // Dynamic import — node-edge-tts may not be installed
    const { EdgeTTS } = await import("node-edge-tts");
    const tts = new EdgeTTS({
      voice: voice || "zh-CN-XiaoxiaoNeural",
      lang: "zh-CN",
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    });

    // node-edge-tts uses ttsPromise(text, outputPath)
    const tmpMp3 = path.join(os.tmpdir(), `openclawcn-edge-tts-${Date.now()}.mp3`);
    await tts.ttsPromise(text, tmpMp3);

    try {
      const audioBuffer = fs.readFileSync(tmpMp3);
      if (audioBuffer.length === 0) {
        return { ok: false, error: "Edge TTS 返回空数据", backend: "edge-tts" };
      }
      return {
        ok: true,
        audioBase64: audioBuffer.toString("base64"),
        format: "mp3",
        backend: "edge-tts",
      };
    } finally {
      try {
        fs.unlinkSync(tmpMp3);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Edge TTS 失败: ${msg}`, backend: "edge-tts" };
  }
}

// ---------------------------------------------------------------------------
// System Status
// ---------------------------------------------------------------------------

/**
 * Get comprehensive voice system status for the UI.
 */
export async function getVoiceSystemStatus(): Promise<VoiceSystemStatus> {
  const hw = getHardwareSnapshot();
  const decision = classifyVoiceTier(hw);
  const prefs = await loadVoicePrefs();

  // Cloud-only: check if API providers are configured
  const apiAsrConfigured = isApiAsrProvider(prefs.asrProvider);
  const apiTtsConfigured =
    isApiTtsProvider(prefs.ttsProvider) || prefs.ttsProvider === "edge" || !prefs.ttsProvider;

  return {
    tier: decision,
    asrAvailable: apiAsrConfigured,
    asrBackend: apiAsrConfigured ? "api" : "none",
    ttsAvailable: apiTtsConfigured,
    ttsBackend: apiTtsConfigured
      ? prefs.ttsProvider === "edge" || !prefs.ttsProvider
        ? "edge-tts"
        : "api"
      : "none",
    localInstallState: "not-installed", // Desktop Wave: local engine support
    prefs,
    apiAsrConfigured,
    apiTtsConfigured,
  };
}

/**
 * Force-refresh hardware detection and re-classify tier.
 */
export function refreshVoiceTierStatus(): VoiceTierDecision {
  const hw = refreshHardwareSnapshot();
  return classifyVoiceTier(hw);
}

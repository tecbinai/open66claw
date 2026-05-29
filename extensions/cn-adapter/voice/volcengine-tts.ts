/**
 * Volcengine (火山引擎) TTS — one-shot speech synthesis via WebSocket binary protocol.
 *
 * Uses the 豆包语音合成模型2.0 endpoint.
 * Binary protocol: 4-byte header + 4-byte payload size + payload.
 * Each WebSocket connection supports only one synthesis task.
 *
 * Protocol: wss://openspeech.bytedance.com/api/v1/tts/ws_binary
 * Docs: https://www.volcengine.com/docs/6561/1329505
 *
 * Adapted from clawdbot src/gateway/server-methods/tts-volcengine.ts
 */

import crypto from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import WebSocket from "ws";
import { createCnLogger } from "../utils/logger.js";

const log = createCnLogger("voice:volcengine-tts");

const VOLCENGINE_TTS_WS_URL = "wss://openspeech.bytedance.com/api/v1/tts/ws_binary";
const CONNECT_TIMEOUT_MS = 8_000;
const SYNTHESIS_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Binary protocol helpers
// ---------------------------------------------------------------------------

/**
 * Build a binary frame for the Volcengine TTS WebSocket protocol.
 *
 * Header (4 bytes):
 *   Byte 0: (protocol_version << 4) | header_size   → 0x11
 *   Byte 1: (message_type << 4) | message_flags
 *   Byte 2: (serialization << 4) | compression
 *   Byte 3: 0x00 (reserved)
 * Payload size (4 bytes, big-endian uint32)
 * Payload (N bytes)
 */
function buildFrame(
  messageType: number,
  messageFlags: number,
  serialization: number,
  compression: number,
  payload: Buffer,
): Buffer {
  const header = Buffer.alloc(8);
  header[0] = 0x11; // version 1, header size 1 (×4 = 4 bytes)
  header[1] = (messageType << 4) | (messageFlags & 0x0f);
  header[2] = (serialization << 4) | (compression & 0x0f);
  header[3] = 0x00;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

/**
 * Parse a server response frame.
 *
 * Response format: 4-byte header + 4-byte sequence + 4-byte payload size + payload.
 * Note: The request frame uses 4-byte header + 4-byte payload size (no sequence),
 * but the response includes a 4-byte sequence field between header and payload size.
 */
function parseFrame(data: Buffer): {
  messageType: number;
  flags: number;
  serialization: number;
  compression: number;
  payload: Buffer;
} | null {
  if (data.length < 12) return null;
  const headerSize = (data[0]! & 0x0f) * 4;
  const messageType = (data[1]! >> 4) & 0x0f;
  const flags = data[1]! & 0x0f;
  const serialization = (data[2]! >> 4) & 0x0f;
  const compression = data[2]! & 0x0f;
  // Skip 4-byte sequence field, then read payload size
  const payloadSize = data.readUInt32BE(headerSize + 4);
  const payloadStart = headerSize + 8;
  const payload = data.subarray(payloadStart, payloadStart + payloadSize);
  return { messageType, flags, serialization, compression, payload };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface VolcTtsParams {
  text: string;
  appId: string;
  accessToken: string;
  voice?: string;
  encoding?: string;
  sampleRate?: number;
  speedRatio?: number;
  pitchRatio?: number;
  emotion?: string;
  /** Cluster name: "volcano_tts" (default), "volcano_mega", "volcano_icl", etc. */
  cluster?: string;
}

export interface VolcTtsResult {
  ok: boolean;
  audioBase64?: string;
  format?: string;
  error?: string;
  latencyMs?: number;
}

/**
 * Synthesize speech using Volcengine TTS WebSocket binary protocol.
 * Returns base64-encoded audio.
 */
export async function volcengineTtsSynthesize(params: VolcTtsParams): Promise<VolcTtsResult> {
  const start = Date.now();
  const {
    text,
    appId,
    accessToken,
    voice = "BV405_streaming",
    encoding = "mp3",
    sampleRate = 24000,
    speedRatio = 1.0,
    pitchRatio,
    emotion = "happy",
    cluster = "volcano_tts",
  } = params;

  if (!text.trim()) {
    return { ok: false, error: "合成文本为空", latencyMs: 0 };
  }

  return new Promise<VolcTtsResult>((resolve) => {
    let resolved = false;
    const done = (result: VolcTtsResult) => {
      if (resolved) return;
      resolved = true;
      result.latencyMs = Date.now() - start;
      try { ws.close(); } catch { /* ignore */ }
      clearTimeout(timeout);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      done({ ok: false, error: "豆包 TTS 合成超时 (30s)" });
    }, SYNTHESIS_TIMEOUT_MS);

    let ws: WebSocket;
    try {
      ws = new WebSocket(VOLCENGINE_TTS_WS_URL, {
        headers: {
          Authorization: `Bearer; ${accessToken}`,
        },
        handshakeTimeout: CONNECT_TIMEOUT_MS,
        // Volcengine TTS sends binary audio data in text frames —
        // skip UTF-8 validation to prevent "invalid UTF-8 sequence" errors.
        skipUTF8Validation: true,
      });
    } catch (err) {
      clearTimeout(timeout);
      resolve({ ok: false, error: `TTS WebSocket 创建失败: ${err}`, latencyMs: Date.now() - start });
      return;
    }

    const audioChunks: Buffer[] = [];

    ws.on("open", () => {
      const reqid = crypto.randomUUID();
      // Volcengine TTS v1 nested JSON structure
      const request = {
        app: {
          appid: appId,
          token: accessToken,
          cluster,
        },
        user: {
          uid: "openclaw-cn",
        },
        audio: {
          voice_type: voice,
          encoding,
          sample_rate: sampleRate,
          speed_ratio: speedRatio,
          ...(pitchRatio !== undefined ? { pitch_ratio: pitchRatio } : {}),
          ...(emotion ? { emotion } : {}),
        },
        request: {
          reqid,
          text,
          operation: "query",
        },
      };

      const jsonBuf = Buffer.from(JSON.stringify(request), "utf8");
      const gzipped = gzipSync(jsonBuf);
      // message_type=1 (full_client_request), flags=0, serialization=1 (JSON), compression=1 (gzip)
      const frame = buildFrame(0x1, 0x0, 0x1, 0x1, gzipped);
      ws.send(frame);
    });

    ws.on("message", (raw) => {
      if (resolved) return;

      const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
      const frame = parseFrame(data);
      if (!frame) return;

      const { messageType, flags, compression, payload } = frame;

      // Audio response (message_type 0xB)
      if (messageType === 0xb) {
        if (payload.length > 0) {
          audioChunks.push(payload);
        }
        // Check if last chunk: flags bit 1 (0x2) set
        if (flags & 0x2) {
          const audioBuf = Buffer.concat(audioChunks);
          log.info(`TTS synthesis complete: ${audioBuf.length} bytes, ${Date.now() - start}ms`);
          done({
            ok: true,
            audioBase64: audioBuf.toString("base64"),
            format: encoding,
          });
        }
      }

      // Error response (message_type 0xF)
      if (messageType === 0xf) {
        let errMsg = "豆包 TTS 合成失败";
        try {
          let buf = payload;
          if (compression === 1) {
            try { buf = gunzipSync(payload); } catch { /* use raw */ }
          }
          const msg = JSON.parse(buf.toString("utf8"));
          errMsg = msg?.message ?? msg?.error ?? errMsg;
        } catch { /* ignore */ }
        log.warn(`TTS error: ${errMsg}`);
        done({ ok: false, error: errMsg });
      }
    });

    ws.on("error", (err) => {
      done({ ok: false, error: `TTS WebSocket 错误: ${err.message}` });
    });

    ws.on("close", () => {
      if (!resolved) {
        // If we got audio chunks, return them even if close came before "last" flag
        if (audioChunks.length > 0) {
          const audioBuf = Buffer.concat(audioChunks);
          done({
            ok: true,
            audioBase64: audioBuf.toString("base64"),
            format: encoding,
          });
        } else {
          done({ ok: false, error: "TTS WebSocket 意外断开" });
        }
      }
    });
  });
}

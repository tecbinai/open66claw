/**
 * Volcengine (火山引擎) ASR — batch transcription via WebSocket binary protocol.
 *
 * Uses the 豆包流式语音识别模型2.0 (bigmodel) endpoint in one-shot mode:
 * send full_client_request + all audio in one frame (last=true) → wait for final result.
 *
 * Protocol: wss://openspeech.bytedance.com/api/v3/sauc/bigmodel
 * Docs: https://www.volcengine.com/docs/6561/1354869
 *
 * Adapted from clawdbot src/gateway/server-methods/asr-streaming-volcengine.ts
 */

import crypto from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import WebSocket from "ws";
import { createCnLogger } from "../utils/logger.js";

const log = createCnLogger("voice:volcengine-asr");

const VOLCENGINE_ASR_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel";
const CONNECT_TIMEOUT_MS = 8_000;
const RESULT_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Binary protocol helpers (v3 bigmodel)
// ---------------------------------------------------------------------------

function buildFrameWithSeq(
  messageType: number,
  messageFlags: number,
  serialization: number,
  compression: number,
  sequence: number,
  payload: Buffer,
): Buffer {
  const header = Buffer.alloc(4);
  header[0] = 0x11; // version 1, header size 1 (×4 = 4 bytes)
  header[1] = (messageType << 4) | (messageFlags & 0x0f);
  header[2] = (serialization << 4) | (compression & 0x0f);
  header[3] = 0x00;

  const seqBuf = Buffer.alloc(4);
  seqBuf.writeInt32BE(sequence, 0);

  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(payload.length, 0);

  return Buffer.concat([header, seqBuf, sizeBuf, payload]);
}

/** Build a full_client_request frame (JSON, gzip compressed, seq=1). */
function buildFullClientRequest(json: object): Buffer {
  const jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const compressed = gzipSync(jsonBuf);
  return buildFrameWithSeq(0x1, 0x1, 0x1, 0x1, 1, compressed);
}

/** Build an audio frame with sequence number (gzip compressed). */
function buildAudioFrame(pcmBuffer: Buffer, isLast: boolean, sequence: number): Buffer {
  const compressed = gzipSync(pcmBuffer);
  const flags = isLast ? 0x3 : 0x1;
  const seq = isLast ? -sequence : sequence;
  return buildFrameWithSeq(0x2, flags, 0x0, 0x1, seq, compressed);
}

/** Parse a server response frame. */
function parseFrame(data: Buffer): {
  messageType: number;
  flags: number;
  compression: number;
  payload: Buffer;
} | null {
  if (data.length < 4) return null;
  const messageType = (data[1]! >> 4) & 0x0f;
  const flags = data[1]! & 0x0f;
  const compression = data[2]! & 0x0f;
  const headerSize = (data[0]! & 0x0f) * 4;

  if (data.length < headerSize + 8) return null;
  const payloadSize = data.readUInt32BE(headerSize + 4);
  const payloadStart = headerSize + 8;
  const payload = data.subarray(payloadStart, payloadStart + payloadSize);
  return { messageType, flags, compression, payload };
}

function parseJsonPayload(payload: Buffer, compression: number): any {
  let buf = payload;
  if (compression === 0x1) {
    buf = gunzipSync(payload);
  }
  return JSON.parse(buf.toString("utf8"));
}

// ---------------------------------------------------------------------------
// WAV → PCM conversion
// ---------------------------------------------------------------------------

/**
 * Extract raw PCM16 data from a WAV buffer.
 * If the buffer doesn't look like WAV, assume it's already raw PCM.
 */
function wavToPcm(wavBuffer: Buffer): { pcm: Buffer; sampleRate: number } {
  // Check RIFF header
  if (
    wavBuffer.length > 44 &&
    wavBuffer[0] === 0x52 && // R
    wavBuffer[1] === 0x49 && // I
    wavBuffer[2] === 0x46 && // F
    wavBuffer[3] === 0x46    // F
  ) {
    const sampleRate = wavBuffer.readUInt32LE(24);
    // Find "data" subchunk
    let offset = 12;
    while (offset < wavBuffer.length - 8) {
      const chunkId = wavBuffer.subarray(offset, offset + 4).toString("ascii");
      const chunkSize = wavBuffer.readUInt32LE(offset + 4);
      if (chunkId === "data") {
        return { pcm: wavBuffer.subarray(offset + 8, offset + 8 + chunkSize), sampleRate };
      }
      offset += 8 + chunkSize;
    }
    // Fallback: skip 44-byte header
    return { pcm: wavBuffer.subarray(44), sampleRate };
  }
  // Not WAV, assume raw PCM 16kHz
  return { pcm: wavBuffer, sampleRate: 16000 };
}

// ---------------------------------------------------------------------------
// Public API: one-shot transcribe
// ---------------------------------------------------------------------------

export interface VolcAsrResult {
  ok: boolean;
  text?: string;
  error?: string;
  latencyMs?: number;
}

/**
 * Transcribe audio using Volcengine bigmodel ASR (one-shot batch mode).
 *
 * Connects via WebSocket, sends full_client_request + entire audio as last frame,
 * waits for final result.
 */
export async function volcengineTranscribe(
  audioBase64: string,
  appId: string,
  accessToken: string,
): Promise<VolcAsrResult> {
  const start = Date.now();
  const wavBuffer = Buffer.from(audioBase64, "base64");
  const { pcm, sampleRate } = wavToPcm(wavBuffer);

  const connectId = crypto.randomUUID();

  return new Promise<VolcAsrResult>((resolve) => {
    let resolved = false;
    let finalText = "";

    const done = (result: VolcAsrResult) => {
      if (resolved) return;
      resolved = true;
      result.latencyMs = Date.now() - start;
      try { ws.close(); } catch { /* ignore */ }
      resolve(result);
    };

    // Timeout guard
    const timer = setTimeout(() => {
      done({ ok: false, error: "豆包 ASR 超时 (15s)" });
    }, RESULT_TIMEOUT_MS);

    let ws: WebSocket;
    try {
      ws = new WebSocket(VOLCENGINE_ASR_WS_URL, {
        headers: {
          "X-Api-App-Key": appId,
          "X-Api-Access-Key": accessToken,
          "X-Api-Resource-Id": "volc.bigasr.sauc.duration",
          "X-Api-Connect-Id": connectId,
        },
        handshakeTimeout: CONNECT_TIMEOUT_MS,
      });
    } catch (err) {
      clearTimeout(timer);
      resolve({ ok: false, error: `WebSocket 创建失败: ${err}`, latencyMs: Date.now() - start });
      return;
    }

    ws.on("error", (err) => {
      clearTimeout(timer);
      done({ ok: false, error: `WebSocket 错误: ${err.message}` });
    });

    ws.on("close", () => {
      clearTimeout(timer);
      if (!resolved) {
        // 服务端正常关闭后如果还没 resolve，说明已收到最终结果或无语音内容
        done({ ok: true, text: finalText });
      }
    });

    ws.on("message", (raw) => {
      const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
      const frame = parseFrame(data);
      if (!frame) return;

      const { messageType, flags, compression, payload } = frame;
      const isLast = (flags & 0x2) !== 0;

      // Server response with JSON (message_type 0x9)
      if (messageType === 0x9) {
        try {
          const msg = parseJsonPayload(payload, compression);
          // v3 bigmodel: result.text (string) or result.utterances[0].text
          const text =
            (typeof msg?.result?.text === "string" ? msg.result.text : "") ||
            (msg?.result?.utterances?.[0]?.text as string ?? "");
          if (text) {
            finalText += text;
          }
          if (isLast) {
            clearTimeout(timer);
            done({ ok: true, text: finalText });
          }
        } catch {
          /* parse error, ignore */
        }
      }

      // Server error (message_type 0xF)
      if (messageType === 0xf) {
        let errMsg = "豆包 ASR 服务错误";
        try {
          const msg = parseJsonPayload(payload, compression);
          errMsg = msg?.message ?? msg?.error ?? errMsg;
        } catch { /* ignore */ }
        clearTimeout(timer);
        done({ ok: false, error: errMsg });
      }
    });

    ws.on("open", () => {
      // Send full_client_request
      const clientRequest = {
        user: { uid: "openclaw-cn" },
        audio: {
          format: "pcm",
          rate: sampleRate,
          bits: 16,
          channel: 1,
          codec: "raw",
          language: "zh-CN",
        },
        request: {
          model_name: "bigmodel",
          enable_itn: true,
          enable_punc: true,
          result_type: "single",
          sequence: 1,
        },
      };

      ws.send(buildFullClientRequest(clientRequest));

      // Send entire audio as last frame (one-shot batch)
      ws.send(buildAudioFrame(pcm, true, 2));
    });
  });
}

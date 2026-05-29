/**
 * Wake Word Controller — browser-side KWS listening lifecycle.
 *
 * Uses StreamingAudioRecorder to capture mic audio and sends
 * PCM16 base64 chunks to gateway's voicewake.listen.feed RPC.
 * On `voicewake.detected` event, the app enters voice interaction mode.
 */

import type { GatewayBrowserClient } from "../gateway.ts";
import { StreamingAudioRecorder } from "../voice/streaming-audio-recorder.ts";

let _recorder: StreamingAudioRecorder | null = null;
let _sessionId: string | null = null;
let _stopping = false;

/** Max recording segment before auto-restart (2 min). */
const MAX_SEGMENT_MS = 120_000;

export type WakeWordHost = {
  client: GatewayBrowserClient | null;
  voiceWakeListening: boolean;
  voiceMode: boolean;
};

/** Create a StreamingAudioRecorder wired to the KWS session. */
function createKwsRecorder(host: WakeWordHost): StreamingAudioRecorder {
  return new StreamingAudioRecorder(
    {
      onStateChange: () => {},
      onError: (err) => {
        console.error("[wake-word] recorder error:", err);
        void stopWakeWordListening(host);
      },
      onVolume: () => {},
      onChunk: (pcmBase64) => {
        if (_sessionId && host.client) {
          host.client
            .request("voicewake.listen.feed", { sessionId: _sessionId, pcmBase64 })
            .catch(() => {
              // Session gone — stop gracefully
              void stopWakeWordListening(host);
            });
        }
      },
      onRecordingEnd: () => {
        // StreamingAudioRecorder.stop() sets state to "processing",
        // so start() on the same instance would be a no-op (requires "idle").
        // Create a fresh recorder to keep listening indefinitely.
        if (!_stopping && host.voiceWakeListening) {
          if (_recorder) {
            _recorder.dispose();
          }
          _recorder = createKwsRecorder(host);
          void _recorder.start();
        }
      },
    },
    MAX_SEGMENT_MS,
  );
}

export async function startWakeWordListening(host: WakeWordHost): Promise<void> {
  if (_recorder || _stopping) return;
  if (!host.client) return;
  if (host.voiceMode) return; // Don't listen for wake word during active voice mode

  const client = host.client;

  try {
    // Check KWS availability
    const status = await client.request<{ available: boolean }>("voicewake.listen.status");
    if (!status?.available) return;

    // Start KWS session on server
    const result = await client.request<{ sessionId: string }>("voicewake.listen.start");
    if (!result?.sessionId) return;
    _sessionId = result.sessionId;

    // Start streaming mic audio
    _recorder = createKwsRecorder(host);
    await _recorder.start();
    host.voiceWakeListening = true;
  } catch (err) {
    console.error("[wake-word] failed to start:", err);
    _recorder = null;
    _sessionId = null;
  }
}

export async function stopWakeWordListening(host: WakeWordHost): Promise<void> {
  _stopping = true;
  if (_recorder) {
    _recorder.dispose();
    _recorder = null;
  }
  if (_sessionId && host.client) {
    try {
      await host.client.request("voicewake.listen.stop", { sessionId: _sessionId });
    } catch {
      /* ignore */
    }
    _sessionId = null;
  }
  host.voiceWakeListening = false;
  _stopping = false;
}

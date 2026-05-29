/**
 * AudioRecorder — 浏览器录音封装。
 *
 * 使用 MediaRecorder API 捕获麦克风音频，
 * 录音完成后通过 wav-encoder 转换为 16kHz mono WAV 并以 Base64 输出。
 */

import { blobToWavBase64 } from "./wav-encoder.js";

export type RecordingState = "idle" | "requesting" | "recording" | "processing";

export type AudioRecorderCallbacks = {
  onStateChange: (state: RecordingState) => void;
  onError: (error: string) => void;
  onComplete: (wavBase64: string) => void;
};

const DEFAULT_MAX_DURATION_MS = 30_000;

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private state: RecordingState = "idle";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private maxDurationMs: number;

  constructor(
    private callbacks: AudioRecorderCallbacks,
    maxDurationMs?: number,
  ) {
    this.maxDurationMs = maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  }

  /** Check if browser supports audio recording. */
  static isSupported(): boolean {
    return Boolean(
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof MediaRecorder !== "undefined",
    );
  }

  getState(): RecordingState {
    return this.state;
  }

  /** Request microphone access and start recording. */
  async start(): Promise<void> {
    if (this.state !== "idle") return;

    if (!AudioRecorder.isSupported()) {
      this.callbacks.onError("voice.error.notSupported");
      return;
    }

    this.setState("requesting");

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.setState("idle");
      this.callbacks.onError("voice.error.noMic");
      return;
    }

    this.chunks = [];

    // Pick a supported MIME type
    const mimeType = pickMimeType();
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
    this.mediaRecorder = new MediaRecorder(this.stream, options);

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.onstop = () => {
      this.processRecording();
    };

    this.mediaRecorder.onerror = () => {
      this.cleanup();
      this.setState("idle");
      this.callbacks.onError("voice.error.recordingFailed");
    };

    this.mediaRecorder.start();
    this.setState("recording");

    // Auto-stop after max duration
    this.timer = setTimeout(() => {
      this.stop();
    }, this.maxDurationMs);
  }

  /** Stop recording and trigger processing. */
  stop(): void {
    if (this.state !== "recording" || !this.mediaRecorder) return;
    this.clearTimer();
    this.mediaRecorder.stop();
  }

  /** Cancel recording without processing. */
  cancel(): void {
    this.clearTimer();
    if (this.mediaRecorder && this.state === "recording") {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.cleanup();
    this.setState("idle");
  }

  /** Release all resources. */
  dispose(): void {
    this.cancel();
  }

  // ── Private ──────────────────────────────────────────

  private setState(next: RecordingState): void {
    this.state = next;
    this.callbacks.onStateChange(next);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async processRecording(): Promise<void> {
    this.setState("processing");

    try {
      const blob = new Blob(this.chunks, {
        type: this.chunks[0]?.type || "audio/webm",
      });
      this.cleanup();

      const wavBase64 = await blobToWavBase64(blob);
      // onComplete may trigger async work (e.g. transcription RPC).
      // The caller is responsible for resetting state to "idle"
      // via onStateChange once its async work completes.
      this.callbacks.onComplete(wavBase64);
    } catch {
      this.callbacks.onError("voice.error.encodingFailed");
      this.setState("idle");
    }
  }

  private cleanup(): void {
    this.mediaRecorder = null;
    this.chunks = [];
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }
}

/** Pick the best supported MIME type for MediaRecorder. */
function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return undefined;
}

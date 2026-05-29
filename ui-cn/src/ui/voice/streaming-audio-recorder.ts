/**
 * StreamingAudioRecorder — 流式录音器。
 *
 * 使用 ScriptProcessorNode 捕获原始 PCM 音频，
 * 降采样到 16kHz mono 并以 base64 PCM16 块流式输出。
 * 同时使用 AnalyserNode 实时检测音量驱动波纹 UI。
 */

export type RecordingState = "idle" | "requesting" | "recording" | "processing";

export type StreamingAudioRecorderCallbacks = {
  onStateChange: (state: RecordingState) => void;
  onError: (error: string) => void;
  /** ~60fps volume level (0..1), drives waveform UI. */
  onVolume: (rms: number) => void;
  /** ~4 times/second, base64-encoded PCM16 chunk at 16kHz mono. */
  onChunk: (pcmBase64: string) => void;
  /** Called when recording ends (auto-timeout or manual stop). */
  onRecordingEnd: () => void;
};

export type SilenceDetectionOptions = {
  /** RMS threshold below which audio is considered silent (0..1). Default: 0.03 */
  threshold?: number;
  /** Duration of continuous silence (ms) before triggering auto-stop. Default: 1500 */
  silenceDurationMs?: number;
  /** Minimum recording time (ms) before silence detection kicks in. Default: 800 */
  minRecordingMs?: number;
};

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;
const DEFAULT_MAX_DURATION_MS = 30_000;
/** Accumulate ~4000 samples at 16kHz (~250ms) before emitting a chunk. */
const CHUNK_THRESHOLD = 4000;

export class StreamingAudioRecorder {
  private state: RecordingState = "idle";
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private volumeRafId: number | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDurationMs: number;

  /** Accumulated downsampled PCM samples waiting to be flushed as a chunk. */
  private pendingSamples: number[] = [];

  // ── Silence detection ──
  private silenceOpts: SilenceDetectionOptions | null = null;
  /** Timestamp when continuous silence started (null = not silent). */
  private silenceStartedAt: number | null = null;
  /** Timestamp when recording actually started. */
  private recordingStartedAt = 0;
  /** Whether we already detected speech (prevents triggering on initial silence). */
  private speechDetected = false;

  constructor(
    private callbacks: StreamingAudioRecorderCallbacks,
    maxDurationMs?: number,
    silenceDetection?: SilenceDetectionOptions,
  ) {
    this.maxDurationMs = maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
    this.silenceOpts = silenceDetection ?? null;
  }

  static isSupported(): boolean {
    return Boolean(navigator.mediaDevices?.getUserMedia);
  }

  getState(): RecordingState {
    return this.state;
  }

  /** Request microphone and start streaming. */
  async start(): Promise<void> {
    if (this.state !== "idle") return;

    if (!StreamingAudioRecorder.isSupported()) {
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

    // Guard: cancel() may have been called while awaiting getUserMedia
    if ((this.state as string) !== "requesting") {
      this.releaseStream();
      return;
    }

    this.pendingSamples = [];
    this.silenceStartedAt = null;
    this.speechDetected = false;
    this.recordingStartedAt = Date.now();

    // Create AudioContext & nodes
    this.audioContext = new AudioContext();
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

    // AnalyserNode for volume
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.sourceNode.connect(this.analyserNode);

    // ScriptProcessorNode for raw PCM
    this.processorNode = this.audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
    const srcRate = this.audioContext.sampleRate;

    this.processorNode.onaudioprocess = (e: AudioProcessingEvent) => {
      const input = e.inputBuffer.getChannelData(0);
      const downsampled = downsample(input, srcRate, TARGET_SAMPLE_RATE);
      for (let i = 0; i < downsampled.length; i++) {
        this.pendingSamples.push(downsampled[i]);
      }
      // Flush when we have enough
      while (this.pendingSamples.length >= CHUNK_THRESHOLD) {
        const chunk = this.pendingSamples.splice(0, CHUNK_THRESHOLD);
        const base64 = float32ToPcm16Base64(chunk);
        this.callbacks.onChunk(base64);
      }
    };

    this.sourceNode.connect(this.processorNode);
    // ScriptProcessorNode requires connection to destination to fire events
    this.processorNode.connect(this.audioContext.destination);

    // Start volume polling via rAF
    this.startVolumeLoop();

    this.setState("recording");

    // Auto-stop
    this.maxDurationTimer = setTimeout(() => {
      this.stop();
    }, this.maxDurationMs);
  }

  /** Stop recording. Flushes remaining samples and calls onRecordingEnd. */
  stop(): void {
    if (this.state !== "recording") return;
    this.clearMaxDurationTimer();

    // Flush remaining accumulated samples
    if (this.pendingSamples.length > 0) {
      const base64 = float32ToPcm16Base64(this.pendingSamples);
      this.callbacks.onChunk(base64);
      this.pendingSamples = [];
    }

    this.cleanup();
    this.setState("processing");
    this.callbacks.onRecordingEnd();
  }

  /** Cancel recording without processing. */
  cancel(): void {
    this.clearMaxDurationTimer();
    this.pendingSamples = [];
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

  private clearMaxDurationTimer(): void {
    if (this.maxDurationTimer !== null) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }

  private startVolumeLoop(): void {
    if (!this.analyserNode) return;
    const dataArray = new Uint8Array(this.analyserNode.fftSize);

    const tick = () => {
      if (!this.analyserNode || this.state !== "recording") {
        this.callbacks.onVolume(0);
        return;
      }
      this.analyserNode.getByteTimeDomainData(dataArray);
      // Compute RMS
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      // Normalize to 0..1 range (raw RMS is typically 0..~0.5)
      const normalized = Math.min(1, rms * 3);
      this.callbacks.onVolume(normalized);

      // ── Silence detection ──
      if (this.silenceOpts) {
        this.checkSilence(normalized);
      }

      this.volumeRafId = requestAnimationFrame(tick);
    };

    this.volumeRafId = requestAnimationFrame(tick);
  }

  /** Check if sustained silence has been detected and auto-stop if so. */
  private checkSilence(normalizedVolume: number): void {
    if (!this.silenceOpts) return;
    const now = Date.now();
    const threshold = this.silenceOpts.threshold ?? 0.03;
    const silenceDuration = this.silenceOpts.silenceDurationMs ?? 1500;
    const minRecording = this.silenceOpts.minRecordingMs ?? 800;

    // Don't check until minimum recording time has passed
    if (now - this.recordingStartedAt < minRecording) return;

    if (normalizedVolume > threshold) {
      // Sound detected — reset silence timer, mark speech as detected
      this.speechDetected = true;
      this.silenceStartedAt = null;
      return;
    }

    // Below threshold — only count silence after speech has been detected
    if (!this.speechDetected) return;

    if (this.silenceStartedAt === null) {
      this.silenceStartedAt = now;
      return;
    }

    if (now - this.silenceStartedAt >= silenceDuration) {
      // Sustained silence detected — auto-stop
      this.stop();
    }
  }

  private cleanup(): void {
    // Stop volume loop
    if (this.volumeRafId !== null) {
      cancelAnimationFrame(this.volumeRafId);
      this.volumeRafId = null;
    }

    // Disconnect nodes
    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      try {
        this.processorNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.processorNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.sourceNode = null;
    }
    this.analyserNode = null;

    // Close AudioContext
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.releaseStream();
  }

  private releaseStream(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }
}

// ── Helpers ──────────────────────────────────────────────

/** Linear interpolation downsampling from srcRate to targetRate. */
function downsample(input: Float32Array, srcRate: number, targetRate: number): Float32Array {
  if (srcRate === targetRate) return input;
  const ratio = srcRate / targetRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, input.length - 1);
    const frac = srcIndex - low;
    output[i] = input[low] * (1 - frac) + input[high] * frac;
  }
  return output;
}

/** Convert float32 samples to PCM16 and encode as base64. */
function float32ToPcm16Base64(samples: number[] | Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(i * 2, int16, true);
  }
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode(...chunk));
  }
  return btoa(parts.join(""));
}

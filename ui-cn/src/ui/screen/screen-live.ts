/**
 * OpenClawCN: Screen Live — real-time screen sharing for AI vision.
 *
 * Captures the user's screen via getDisplayMedia, takes periodic screenshots,
 * and provides them as base64 JPEG for the vision model pipeline.
 *
 * Also controls the Tauri desktop overlay border (green screen-share indicator).
 */

export type ScreenShareState = "idle" | "requesting" | "active" | "error";

export type ScreenShareCallbacks = {
  onStateChange: (state: ScreenShareState) => void;
  /** Called each time a new frame is captured. */
  onFrame: (frameBase64: string, timestamp: number) => void;
  onError: (error: string) => void;
};

/** Default capture interval in milliseconds. */
const DEFAULT_INTERVAL_MS = 3000;
/** JPEG quality for screenshots (0-1). Lower = smaller payload, faster upload. */
const JPEG_QUALITY = 0.7;
/** Max screenshot dimension (resize if larger to reduce payload). */
const MAX_DIMENSION = 1280;

export class ScreenLive {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: ScreenShareState = "idle";
  private frameCount = 0;
  private intervalMs: number;
  /** Generation counter — incremented on each start/stop to detect races. */
  private generation = 0;

  constructor(
    private callbacks: ScreenShareCallbacks,
    intervalMs?: number,
  ) {
    this.intervalMs = intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  /** Check if the browser supports screen capture. */
  static isSupported(): boolean {
    return Boolean(typeof navigator.mediaDevices?.getDisplayMedia === "function");
  }

  getState(): ScreenShareState {
    return this.state;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  /** Start screen capture. Prompts the user to select a screen/window. */
  async start(): Promise<void> {
    if (this.state !== "idle") return;

    if (!ScreenLive.isSupported()) {
      this.callbacks.onError("screenShare.error.notSupported");
      return;
    }

    const gen = ++this.generation;
    this.setState("requesting");

    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: MAX_DIMENSION },
          height: { ideal: MAX_DIMENSION },
          frameRate: { ideal: 1, max: 5 },
        },
        audio: false,
      });
    } catch {
      if (gen !== this.generation) return; // stop() was called during await
      this.setState("idle");
      this.callbacks.onError("screenShare.error.denied");
      return;
    }

    // stop() was called while getDisplayMedia dialog was open — clean up acquired stream
    if (gen !== this.generation) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
      return;
    }

    // Detect when user clicks "Stop sharing" in the browser's built-in UI
    const track = this.stream.getVideoTracks()[0];
    if (track) {
      track.onended = () => {
        this.stop();
      };
    }

    // Create hidden video element to receive the stream
    this.video = document.createElement("video");
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    try {
      await this.video.play();
    } catch {
      // Autoplay blocked — clean up and report error
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
      this.video = null;
      if (gen !== this.generation) return;
      this.setState("idle");
      this.callbacks.onError("screenShare.error.playFailed");
      return;
    }

    // Final generation check after video.play() await
    if (gen !== this.generation) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
      this.video.srcObject = null;
      this.video = null;
      return;
    }

    // Create canvas for frame capture
    this.canvas = document.createElement("canvas");

    this.frameCount = 0;
    this.setState("active");

    // Show Tauri border overlay (desktop only)
    await this.showBorderOverlay();

    // Capture first frame immediately
    this.captureFrame();

    // Start periodic capture
    this.timer = setInterval(() => {
      this.captureFrame();
    }, this.intervalMs);
  }

  /** Stop screen capture and clean up. */
  async stop(): Promise<void> {
    if (this.state === "idle") return; // guard against re-entrant stop
    this.generation++; // invalidate any in-flight start()
    this.setState("idle"); // set idle first to block concurrent calls
    this.clearTimer();

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }

    this.canvas = null;

    // Hide Tauri border overlay
    await this.hideBorderOverlay();
  }

  /** Release all resources. */
  dispose(): void {
    void this.stop();
  }

  // ── Private ──────────────────────────────────────────

  private setState(next: ScreenShareState): void {
    this.state = next;
    this.callbacks.onStateChange(next);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private captureFrame(): void {
    if (!this.video || !this.canvas || this.state !== "active") return;

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (vw === 0 || vh === 0) return;

    // Scale down if needed
    let cw = vw;
    let ch = vh;
    if (cw > MAX_DIMENSION || ch > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(cw, ch);
      cw = Math.round(cw * scale);
      ch = Math.round(ch * scale);
    }

    this.canvas.width = cw;
    this.canvas.height = ch;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(this.video, 0, 0, cw, ch);

    // Convert to JPEG base64
    const dataUrl = this.canvas.toDataURL("image/jpeg", JPEG_QUALITY);

    this.frameCount++;
    this.callbacks.onFrame(dataUrl, Date.now());
  }

  /** Show the green screen-share border overlay via Tauri invoke. */
  private async showBorderOverlay(): Promise<void> {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    try {
      await invoke("show_screen_border");
    } catch (e) {
      console.warn("[ScreenLive] Failed to show border overlay:", e);
    }
  }

  /** Hide the screen-share border overlay via Tauri invoke. */
  private async hideBorderOverlay(): Promise<void> {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    try {
      await invoke("hide_screen_border");
    } catch (e) {
      console.warn("[ScreenLive] Failed to hide border overlay:", e);
    }
  }
}

// ── Tauri IPC helper ──────────────────────────────────

type InvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function getTauriInvoke(): InvokeFn | null {
  const win = window as unknown as Record<string, unknown>;
  const internals = win.__TAURI_INTERNALS__ as Record<string, unknown> | undefined;
  if (internals && typeof internals.invoke === "function") {
    return internals.invoke as InvokeFn;
  }
  const tauri = win.__TAURI__ as Record<string, unknown> | undefined;
  const core = tauri?.core as Record<string, unknown> | undefined;
  if (core && typeof core.invoke === "function") {
    return core.invoke as InvokeFn;
  }
  return null;
}

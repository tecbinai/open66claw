/**
 * Voice Mascot — 语音助手吉祥物组件。
 *
 * 当 ASR 可用时浮现在聊天输入框上方，邀请用户语音输入。
 * 包含吉祥物头像（SVG）+ 气泡提示 + 麦克风按钮。
 */

import { html, nothing } from "lit";
import { t } from "../i18n/index.js";
import { icons } from "../icons.js";
import type { RecordingState } from "../voice/audio-recorder.js";

// ── Types ───────────────────────────────────────────────

export type VoiceMascotProps = {
  visible: boolean;
  recordingState: RecordingState;
  error: string | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onDismiss: () => void;
};

// ── Render ──────────────────────────────────────────────

export function renderVoiceMascot(props: VoiceMascotProps) {
  if (!props.visible) return nothing;

  const isRecording = props.recordingState === "recording";
  const isProcessing = props.recordingState === "processing";
  const isRequesting = props.recordingState === "requesting";
  const isBusy = isProcessing || isRequesting;

  return html`
    <div class="voice-mascot ${isRecording ? "voice-mascot--recording" : ""}
                              ${isProcessing ? "voice-mascot--processing" : ""}">

      <!-- Dismiss button (visible on hover) -->
      <button
        class="voice-mascot__dismiss"
        @click=${props.onDismiss}
        aria-label=${t("common.close")}
        type="button"
      >${icons.x}</button>

      <!-- Mascot avatar + speech bubble (hidden during recording) -->
      ${
        !isRecording && !isBusy
          ? html`
        <div class="voice-mascot__hint">
          <div class="voice-mascot__avatar">
            ${renderMascotFace()}
          </div>
          <div class="voice-mascot__bubble">
            <span class="voice-mascot__bubble-text">${t("voice.mascot.hint")}</span>
            <div class="voice-mascot__bubble-arrow"></div>
          </div>
        </div>
      `
          : nothing
      }

      <!-- Status text (processing) -->
      ${
        isProcessing
          ? html`
        <span class="voice-mascot__status">${t("voice.processing")}</span>
      `
          : nothing
      }

      <!-- Microphone button -->
      <button
        class="voice-mascot__mic ${isRecording ? "voice-mascot__mic--active" : ""}"
        type="button"
        ?disabled=${isBusy}
        @click=${isRecording ? props.onStopRecording : props.onStartRecording}
        aria-label=${isRecording ? t("voice.stopRecording") : t("voice.startRecording")}
      >
        ${isRecording ? renderWaveform() : icons.mic}
      </button>

      <!-- Error message -->
      ${
        props.error
          ? html`
        <span class="voice-mascot__error" title=${t(props.error as Parameters<typeof t>[0])}>${t(props.error as Parameters<typeof t>[0])}</span>
      `
          : nothing
      }
    </div>
  `;
}

// ── Inline SVGs ─────────────────────────────────────────

/** Cute robot face mascot. */
function renderMascotFace() {
  return html`
    <svg viewBox="0 0 48 48" class="voice-mascot__face">
      <!-- Head -->
      <rect
        x="8"
        y="12"
        width="32"
        height="26"
        rx="8"
        ry="8"
        fill="var(--accent-subtle, rgba(108,140,255,0.15))"
        stroke="var(--accent)"
        stroke-width="2"
      />
      <!-- Antenna -->
      <line
        x1="24"
        y1="12"
        x2="24"
        y2="6"
        stroke="var(--accent)"
        stroke-width="2"
        stroke-linecap="round"
      />
      <circle cx="24" cy="5" r="2.5" fill="var(--accent)" />
      <!-- Eyes -->
      <circle cx="17" cy="23" r="2.5" fill="var(--accent)" class="voice-mascot__eye" />
      <circle cx="31" cy="23" r="2.5" fill="var(--accent)" class="voice-mascot__eye" />
      <!-- Smile -->
      <path
        d="M18 31 Q24 36 30 31"
        fill="none"
        stroke="var(--accent)"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  `;
}

/** Animated waveform bars (shown during recording). */
function renderWaveform() {
  return html`
    <svg viewBox="0 0 24 24" class="voice-mascot__waveform">
      <rect x="4" y="8" width="2" height="8" rx="1" fill="currentColor">
        <animate attributeName="height" values="8;14;8" dur="0.8s" repeatCount="indefinite" />
        <animate attributeName="y" values="8;5;8" dur="0.8s" repeatCount="indefinite" />
      </rect>
      <rect x="8" y="6" width="2" height="12" rx="1" fill="currentColor">
        <animate attributeName="height" values="12;6;12" dur="0.6s" repeatCount="indefinite" />
        <animate attributeName="y" values="6;9;6" dur="0.6s" repeatCount="indefinite" />
      </rect>
      <rect x="12" y="4" width="2" height="16" rx="1" fill="currentColor">
        <animate attributeName="height" values="16;8;16" dur="0.7s" repeatCount="indefinite" />
        <animate attributeName="y" values="4;8;4" dur="0.7s" repeatCount="indefinite" />
      </rect>
      <rect x="16" y="6" width="2" height="12" rx="1" fill="currentColor">
        <animate attributeName="height" values="12;6;12" dur="0.65s" repeatCount="indefinite" />
        <animate attributeName="y" values="6;9;6" dur="0.65s" repeatCount="indefinite" />
      </rect>
      <rect x="20" y="8" width="2" height="8" rx="1" fill="currentColor">
        <animate attributeName="height" values="8;14;8" dur="0.75s" repeatCount="indefinite" />
        <animate attributeName="y" values="8;5;8" dur="0.75s" repeatCount="indefinite" />
      </rect>
    </svg>
  `;
}

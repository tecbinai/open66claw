/**
 * Voice Tier Settings Card — rendered in the settings page.
 *
 * Shows:
 *   - Hardware summary (GPU, VRAM, RAM)
 *   - Tier badge (gold/silver/bronze/disabled)
 *   - Model status (ASR installed?, TTS installed?)
 *   - One-click install button + progress bar
 *   - GPU sidecar start/stop controls
 */

import { html, nothing, type TemplateResult } from "lit";
import type {
  VoiceTierUIState,
  VoiceTierLevel,
  VoiceApiProviderInfo,
} from "../controllers/voice-tier.js";
import { t } from "../i18n/index.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type VoiceTierCardProps = {
  state: VoiceTierUIState;
  onInstall: () => void;
  onRedetect: () => void;
  onSidecarStart: () => void;
  onSidecarStop: () => void;
  onAsrProviderChange?: (provider: string) => void;
  onTtsProviderChange?: (provider: string) => void;
};

// ---------------------------------------------------------------------------
// Badge colors
// ---------------------------------------------------------------------------

const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  gold: { bg: "#FFD700", fg: "#000" },
  silver: { bg: "#C0C0C0", fg: "#000" },
  bronze: { bg: "#CD7F32", fg: "#fff" },
  disabled: { bg: "#888", fg: "#fff" },
};

function tierToBadge(tier: VoiceTierLevel): string {
  switch (tier) {
    case "gpu-full":
      return "gold";
    case "gpu-asr":
      return "silver";
    case "cpu-full":
      return "silver";
    case "cpu-asr":
      return "bronze";
    case "disabled":
      return "disabled";
  }
}

function tierLabel(tier: VoiceTierLevel): string {
  switch (tier) {
    case "gpu-full":
      return t("voiceTier.tier.gpuFull");
    case "gpu-asr":
      return t("voiceTier.tier.gpuAsr");
    case "cpu-full":
      return t("voiceTier.tier.cpuFull");
    case "cpu-asr":
      return t("voiceTier.tier.cpuAsr");
    case "disabled":
      return t("voiceTier.tier.disabled");
  }
}

function badgeLabel(badge: string): string {
  switch (badge) {
    case "gold":
      return t("voiceTier.badge.gold");
    case "silver":
      return t("voiceTier.badge.silver");
    case "bronze":
      return t("voiceTier.badge.bronze");
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Backend selector helpers
// ---------------------------------------------------------------------------

function renderProviderSelect(
  label: string,
  providers: VoiceApiProviderInfo[],
  currentValue: string | undefined,
  onChange: ((provider: string) => void) | undefined,
): TemplateResult {
  const value = currentValue ?? "auto";
  return html`
		<div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
			<span style="font-size: 13px; white-space: nowrap;">${label}:</span>
			<select
				style="
					flex: 1;
					min-width: 0;
					padding: 4px 8px;
					border-radius: 6px;
					border: 1px solid var(--border);
					background: var(--bg);
					color: var(--fg);
					font-size: 13px;
					cursor: pointer;
				"
				@change=${(e: Event) => {
          const sel = (e.target as HTMLSelectElement).value;
          onChange?.(sel);
        }}
			>
				<option value="auto" ?selected=${value === "auto"}>${t("voiceTier.backend.auto")}</option>
				${providers.map(
          (p) => html`
					<option
						value=${p.id}
						?selected=${value === p.id}
						?disabled=${!p.configured}
					>${p.label}${!p.configured ? ` (${t("voiceTier.backend.needKey")})` : ""}</option>
				`,
        )}
			</select>
		</div>
	`;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderVoiceTierCard(props: VoiceTierCardProps): TemplateResult {
  const {
    state,
    onInstall,
    onRedetect,
    onSidecarStart,
    onSidecarStop,
    onAsrProviderChange,
    onTtsProviderChange,
  } = props;

  if (state.loading || !state.status) {
    return html`
			<div style="padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-lg, 8px); margin-bottom: 16px;">
				<h3 style="margin: 0 0 8px 0; font-size: 16px;">${t("voiceTier.title")}</h3>
				<p style="color: var(--fg-muted); margin: 0;">${t("voiceTier.detecting")}</p>
			</div>
		`;
  }

  const { status } = state;
  const tier = status.tier;
  const badge = tierToBadge(tier.tier);
  const colors = BADGE_COLORS[badge] ?? BADGE_COLORS.disabled!;
  const isInstalling =
    state.installProgress !== null &&
    state.installProgress.stage !== "complete" &&
    state.installProgress.stage !== "failed";

  return html`
		<div style="border: 1px solid var(--border); border-radius: var(--radius-lg, 8px); margin-bottom: 16px; overflow: hidden;">
			<!-- Header -->
			<div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--bg-surface, var(--bg));">
				<div style="display: flex; align-items: center; gap: 10px;">
					<h3 style="margin: 0; font-size: 16px;">${t("voiceTier.title")}</h3>
					<span style="
						display: inline-block;
						padding: 2px 10px;
						border-radius: 12px;
						font-size: 12px;
						font-weight: 600;
						background: ${colors.bg};
						color: ${colors.fg};
					">${tierLabel(tier.tier)}${badge !== "disabled" ? ` - ${badgeLabel(badge)}` : ""}</span>
				</div>
				<button
					style="all: unset; cursor: pointer; padding: 4px 12px; border-radius: 6px; font-size: 13px; color: var(--fg-muted); border: 1px solid var(--border);"
					@click=${onRedetect}
				>${t("voiceTier.redetect")}</button>
			</div>

			<!-- Hardware Info -->
			<div style="padding: 12px 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; font-size: 13px;">
				${
          tier.hardware.gpu
            ? html`
					<div>
						<span style="color: var(--fg-muted);">${t("voiceTier.gpu")}:</span>
						<span style="margin-left: 4px;">${tier.hardware.gpu.name}</span>
					</div>
					<div>
						<span style="color: var(--fg-muted);">${t("voiceTier.vram")}:</span>
						<span style="margin-left: 4px;">${Math.round((tier.hardware.gpu.vramTotalMB / 1024) * 10) / 10} GB</span>
					</div>
				`
            : nothing
        }
				<div>
					<span style="color: var(--fg-muted);">${t("voiceTier.ram")}:</span>
					<span style="margin-left: 4px;">${Math.round(tier.hardware.totalRamMB / 1024)} GB</span>
				</div>
			</div>

			<!-- Tier Reason -->
			<div style="padding: 0 16px 12px; font-size: 13px; color: var(--fg-muted);">
				${tier.reason}
			</div>

			<!-- Model Status -->
			${
        tier.tier !== "disabled"
          ? html`
				<div style="padding: 0 16px 12px; display: flex; gap: 16px; font-size: 13px;">
					<div style="display: flex; align-items: center; gap: 6px;">
						<span style="
							width: 8px; height: 8px; border-radius: 50%;
							background: ${status.asrAvailable ? "#22c55e" : "#ef4444"};
						"></span>
						<span>${t("voiceTier.asr")}:</span>
						<span style="color: var(--fg-muted);">
							${tier.asrModel?.displayName ?? "-"}
							(${status.asrAvailable ? t("voiceTier.installed") : t("voiceTier.notInstalled")})
						</span>
					</div>
					<div style="display: flex; align-items: center; gap: 6px;">
						<span style="
							width: 8px; height: 8px; border-radius: 50%;
							background: ${status.ttsAvailable ? "#22c55e" : "#ef4444"};
						"></span>
						<span>${t("voiceTier.tts")}:</span>
						<span style="color: var(--fg-muted);">
							${tier.ttsModel?.displayName ?? "-"}
							(${status.ttsAvailable ? t("voiceTier.installed") : t("voiceTier.notInstalled")})
						</span>
					</div>
				</div>
			`
          : nothing
      }

			<!-- Backend Selectors (API or auto) -->
			${
        state.apiProviders
          ? html`
				<div style="padding: 0 16px 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
					${renderProviderSelect(
            t("voiceTier.asr"),
            state.apiProviders.asrProviders,
            status.prefs?.asrProvider,
            onAsrProviderChange,
          )}
					${renderProviderSelect(
            t("voiceTier.tts"),
            state.apiProviders.ttsProviders,
            status.prefs?.ttsProvider,
            onTtsProviderChange,
          )}
				</div>
			`
          : nothing
      }

			<!-- Install Progress -->
			${
        isInstalling && state.installProgress
          ? html`
				<div style="padding: 0 16px 12px;">
					<div style="font-size: 13px; margin-bottom: 6px;">
						${state.installProgress.message}
						${state.installProgress.detail ? html`<span style="color: var(--fg-muted); margin-left: 8px;">${state.installProgress.detail}</span>` : nothing}
					</div>
					<div style="height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;">
						<div style="
							height: 100%;
							width: ${state.installProgress.percent}%;
							background: #3b82f6;
							border-radius: 3px;
							transition: width 0.3s ease;
						"></div>
					</div>
					${
            state.installProgress.mirrorUsed
              ? html`
						<div style="font-size: 11px; color: var(--fg-muted); margin-top: 4px;">
							${state.installProgress.mirrorUsed}
						</div>
					`
              : nothing
          }
				</div>
			`
          : nothing
      }

			<!-- Install Error -->
			${
        state.installProgress?.stage === "failed"
          ? html`
				<div style="padding: 0 16px 12px; color: #ef4444; font-size: 13px;">
					${t("voiceTier.installFailed")}: ${state.installProgress.error ?? ""}
				</div>
			`
          : nothing
      }

			<!-- Actions -->
			${
        tier.tier !== "disabled"
          ? html`
				<div style="padding: 8px 16px 12px; display: flex; gap: 8px; flex-wrap: wrap;">
					<!-- Install button -->
					${
            status.installState !== "complete"
              ? html`
						<button
							style="
								padding: 6px 16px;
								border-radius: 6px;
								border: none;
								background: #3b82f6;
								color: #fff;
								font-size: 13px;
								cursor: pointer;
								opacity: ${isInstalling ? "0.6" : "1"};
							"
							?disabled=${isInstalling}
							@click=${onInstall}
						>${isInstalling ? t("voiceTier.installing") : t("voiceTier.install")}</button>
					`
              : nothing
          }

					<!-- Download size hint -->
					${
            status.installState !== "complete" && tier.asrModel
              ? html`
						<span style="font-size: 12px; color: var(--fg-muted); align-self: center;">
							${t("voiceTier.downloadSize")}: ${
                (tier.asrModel.downloadSizeMB ?? 0) + (tier.ttsModel?.downloadSizeMB ?? 0)
              } MB
						</span>
					`
              : nothing
          }

					<!-- GPU Sidecar controls (only for GPU tiers) -->
					${
            (tier.tier === "gpu-full" || tier.tier === "gpu-asr") &&
            status.installState === "complete"
              ? html`
						${
              status.gpuSidecar?.status === "running"
                ? html`
							<button
								style="padding: 6px 16px; border-radius: 6px; border: 1px solid var(--border); background: transparent; font-size: 13px; cursor: pointer; color: var(--fg);"
								@click=${onSidecarStop}
							>${t("voiceTier.sidecar.stop")}</button>
							<span style="font-size: 12px; color: #22c55e; align-self: center;">
								${t("voiceTier.sidecar.running")} (PID ${status.gpuSidecar.pid ?? "?"})
							</span>
						`
                : html`
							<button
								style="padding: 6px 16px; border-radius: 6px; border: 1px solid var(--border); background: transparent; font-size: 13px; cursor: pointer; color: var(--fg);"
								@click=${onSidecarStart}
							>${t("voiceTier.sidecar.start")}</button>
							${
                status.gpuSidecar?.error
                  ? html`
								<span style="font-size: 12px; color: #ef4444; align-self: center;">
									${status.gpuSidecar.error}
								</span>
							`
                  : nothing
              }
						`
            }
					`
              : nothing
          }
				</div>
			`
          : nothing
      }
		</div>
	`;
}

/**
 * ImageGen Tier Settings Card -- rendered in the settings page.
 *
 * Shows:
 *   - Hardware summary (GPU, VRAM, RAM)
 *   - Tier badge (gold/silver/bronze/disabled)
 *   - Model status (installed model, sidecar state)
 *   - One-click install button + progress bar
 *   - sd.cpp sidecar start/stop controls
 *
 * Pattern follows views/voice-tier-card.ts.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { ImageGenTierUIState, ImageGenTierLevel } from "../controllers/imagegen-tier.js";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type ImageGenTierCardProps = {
  state: ImageGenTierUIState;
  onInstall: () => void;
  onRedetect: () => void;
  onSidecarStart: () => void;
  onSidecarStop: () => void;
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

function tierToBadge(tier: ImageGenTierLevel): string {
  switch (tier) {
    case "gpu-hq":
      return "gold";
    case "gpu-fast":
      return "silver";
    case "cpu":
      return "bronze";
    case "api-only":
      return "disabled";
    case "disabled":
      return "disabled";
  }
}

function tierLabel(tier: ImageGenTierLevel): string {
  switch (tier) {
    case "gpu-hq":
      return "GPU 高质量";
    case "gpu-fast":
      return "GPU 快速";
    case "cpu":
      return "CPU 模式";
    case "api-only":
      return "仅云端 API";
    case "disabled":
      return "未配置";
  }
}

function badgeLabel(badge: string): string {
  switch (badge) {
    case "gold":
      return "最佳";
    case "silver":
      return "良好";
    case "bronze":
      return "可用";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function renderImageGenTierCard(props: ImageGenTierCardProps): TemplateResult {
  const { state, onInstall, onRedetect, onSidecarStart, onSidecarStop } = props;

  if (state.loading || !state.status) {
    return html`
      <div
        style="
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg, 8px);
          margin-bottom: 16px;
        "
      >
        <h3 style="margin: 0 0 8px 0; font-size: 16px">本地生图</h3>
        <p style="color: var(--fg-muted); margin: 0">正在检测硬件...</p>
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
  const hasLocalTier = tier.tier !== "api-only" && tier.tier !== "disabled";

  return html`
		<div style="border: 1px solid var(--border); border-radius: var(--radius-lg, 8px); margin-bottom: 16px; overflow: hidden;">
			<!-- Header -->
			<div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--bg-surface, var(--bg));">
				<div style="display: flex; align-items: center; gap: 10px;">
					<h3 style="margin: 0; font-size: 16px;">本地生图</h3>
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
				>重新检测</button>
			</div>

			<!-- Hardware Info -->
			<div style="padding: 12px 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; font-size: 13px;">
				${
          tier.hardware.gpu
            ? html`
					<div>
						<span style="color: var(--fg-muted);">显卡:</span>
						<span style="margin-left: 4px;">${tier.hardware.gpu.name}</span>
					</div>
					<div>
						<span style="color: var(--fg-muted);">显存:</span>
						<span style="margin-left: 4px;">${Math.round((tier.hardware.gpu.vramTotalMB / 1024) * 10) / 10} GB</span>
					</div>
				`
            : nothing
        }
				<div>
					<span style="color: var(--fg-muted);">内存:</span>
					<span style="margin-left: 4px;">${Math.round(tier.hardware.totalRamMB / 1024)} GB</span>
				</div>
			</div>

			<!-- Tier Reason -->
			<div style="padding: 0 16px 12px; font-size: 13px; color: var(--fg-muted);">
				${tier.reason}
			</div>

			<!-- Model Status -->
			${
        hasLocalTier
          ? html`
				<div style="padding: 0 16px 12px; display: flex; gap: 16px; font-size: 13px;">
					<div style="display: flex; align-items: center; gap: 6px;">
						<span style="
							width: 8px; height: 8px; border-radius: 50%;
							background: ${status.localAvailable ? "#22c55e" : "#ef4444"};
						"></span>
						<span>模型:</span>
						<span style="color: var(--fg-muted);">
							${tier.model?.displayName ?? "未安装"}
							${status.installedModels.length > 0 ? "(已安装)" : "(未安装)"}
						</span>
					</div>
					${
            status.sidecar
              ? html`
						<div style="display: flex; align-items: center; gap: 6px;">
							<span style="
								width: 8px; height: 8px; border-radius: 50%;
								background: ${status.sidecar.status === "running" ? "#22c55e" : status.sidecar.status === "error" ? "#ef4444" : "#888"};
							"></span>
							<span>引擎:</span>
							<span style="color: var(--fg-muted);">
								${
                  status.sidecar.status === "running"
                    ? "运行中"
                    : status.sidecar.status === "starting"
                      ? "启动中..."
                      : status.sidecar.status === "error"
                        ? "错误"
                        : "已停止"
                }
							</span>
						</div>
					`
              : nothing
          }
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
							镜像: ${state.installProgress.mirrorUsed}
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
					安装失败: ${state.installProgress.error ?? ""}
				</div>
			`
          : nothing
      }

			<!-- Actions -->
			${
        hasLocalTier
          ? html`
				<div style="padding: 8px 16px 12px; display: flex; gap: 8px; flex-wrap: wrap;">
					<!-- Install button -->
					${
            status.installedModels.length === 0
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
						>${isInstalling ? "安装中..." : "一键安装本地生图"}</button>
					`
              : nothing
          }

					<!-- Download size hint -->
					${
            status.installedModels.length === 0 && tier.model
              ? html`
						<span style="font-size: 12px; color: var(--fg-muted); align-self: center;">
							需下载: ${tier.model.downloadSizeMB} MB
						</span>
					`
              : nothing
          }

					<!-- Sidecar controls (when model installed) -->
					${
            status.installedModels.length > 0 && status.sidecar
              ? html`
						${
              status.sidecar.status === "running"
                ? html`
							<button
								style="padding: 6px 16px; border-radius: 6px; border: 1px solid var(--border); background: transparent; font-size: 13px; cursor: pointer; color: var(--fg);"
								@click=${onSidecarStop}
							>停止引擎</button>
							<span style="font-size: 12px; color: #22c55e; align-self: center;">
								运行中 (PID ${status.sidecar.pid ?? "?"})
							</span>
						`
                : html`
							<button
								style="padding: 6px 16px; border-radius: 6px; border: 1px solid var(--border); background: transparent; font-size: 13px; cursor: pointer; color: var(--fg);"
								@click=${onSidecarStart}
							>启动引擎</button>
							${
                status.sidecar.error
                  ? html`
								<span style="font-size: 12px; color: #ef4444; align-self: center;">
									${status.sidecar.error}
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

			<!-- API-only hint -->
			${
        tier.tier === "api-only"
          ? html`
              <div style="padding: 8px 16px 12px; font-size: 13px; color: var(--fg-muted)">
                可通过设置 DashScope / SiliconFlow 等 API Key 来使用云端生图。 SiliconFlow Kolors 提供免费额度。
              </div>
            `
          : nothing
      }
		</div>
	`;
}

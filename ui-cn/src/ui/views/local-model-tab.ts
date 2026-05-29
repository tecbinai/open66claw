/**
 * Local Model Tab — pure render functions for the "本地" tab inside
 * capability cards, the device overview bar, and the local model management
 * modal.
 *
 * These are intentionally NOT web components; they return `TemplateResult`
 * fragments consumed by the host `model-config-view` LitElement, following
 * the same pattern as `voice-tier-card.ts` / `imagegen-tier-card.ts`.
 */

import { html, nothing, type TemplateResult } from "lit";
import {
  type LocalEngineStatus,
  type LocalEngineHardware,
  type LocalModelItem,
  type LocalEngineInstallProgress,
  type LocalModelStatus,
  runModeLabel,
  statusLabel,
  statusClass,
  fmtMB,
  gpuSummary,
  ramSummary,
  subCapLabel,
} from "../controllers/local-engine.js";

// ---------------------------------------------------------------------------
// Event callback types (the host binds these)
// ---------------------------------------------------------------------------

export type LocalModelAction = {
  onInstall: (modelId: string) => void;
  onUninstall: (modelId: string) => void;
  onStartSidecar: (domain: "voice" | "imagegen") => void;
  onStopSidecar: (domain: "voice" | "imagegen") => void;
  onRedetect: () => void;
  onInstallRecommended: () => void;
  onOpenManageModal: () => void;
};

// ---------------------------------------------------------------------------
// Device Overview Bar
//   Renders between capabilities grid and providers section, replacing <hr>.
// ---------------------------------------------------------------------------

/**
 * Render the device overview bar — shows GPU/RAM summary + quick stats.
 */
export function renderDeviceBar(
  status: LocalEngineStatus | null,
  actions: Pick<LocalModelAction, "onOpenManageModal" | "onInstallRecommended">,
): TemplateResult | typeof nothing {
  if (!status) return nothing;

  const hw = status.hardware;
  const { runningCount, installedCount, totalDiskUsageMB } = status.summary;
  // 一键安装只看语音组（ASR+TTS），图像生成走管理弹窗
  const voiceModels = status.models["voice"] ?? [];
  const hasRecommended = voiceModels.some((m) => m.recommended && m.status === "installable");

  return html`
		<div class="le-device-bar">
			<div class="le-device-bar__header">
				<span class="le-device-bar__title">本地模型</span>
			</div>
			<div class="le-device-bar__hw">
				<span class="le-device-bar__chip ${hw.gpu ? "has-gpu" : "no-gpu"}">
					${hw.gpu ? html`<span class="le-chip-icon">&#9881;</span> ${gpuSummary(hw)}` : html`<span class="le-chip-icon">&#128187;</span> ${hw.cpuModel}`}
				</span>
				<span class="le-device-bar__chip">${ramSummary(hw)}</span>
				${
          hw.platform === "win32"
            ? html`
                <span class="le-device-bar__chip">Windows</span>
              `
            : nothing
        }
				${
          hw.platform === "darwin"
            ? html`
                <span class="le-device-bar__chip">macOS</span>
              `
            : nothing
        }
				${
          hw.platform === "linux"
            ? html`
                <span class="le-device-bar__chip">Linux</span>
              `
            : nothing
        }
			</div>
			<div class="le-device-bar__stats">
				${runningCount > 0 ? html`<span class="le-stat le-stat--running">${runningCount} 运行中</span>` : nothing}
				${installedCount > 0 ? html`<span class="le-stat">${installedCount} 已安装 · ${fmtMB(totalDiskUsageMB)}</span>` : nothing}
				${
          hasRecommended
            ? html`<button class="le-device-bar__btn le-device-bar__btn--rec" @click=${(
                e: Event,
              ) => {
                e.stopPropagation();
                actions.onInstallRecommended();
              }}>一键安装推荐</button>`
            : nothing
        }
				<button class="le-device-bar__btn" @click=${actions.onOpenManageModal} title="管理本地模型">管理</button>
			</div>
		</div>
	`;
}

// ---------------------------------------------------------------------------
// Local Model Tab (inside capability card quick-switch panel)
// ---------------------------------------------------------------------------

/**
 * Render the "本地" tab content for a capability card.
 *
 * @param capGroupId  The user-cap group ID ("voice" | "image" | etc.)
 * @param status      Full local engine status
 * @param progress    Per-model install progress map
 * @param actions     Callback handlers
 */
export function renderLocalModelTab(
  capGroupId: string,
  status: LocalEngineStatus | null,
  progress: Record<string, LocalEngineInstallProgress>,
  actions: LocalModelAction,
): TemplateResult {
  if (!status) {
    return html`
      <div class="le-tab-empty">加载本地模型信息中...</div>
    `;
  }

  const models = status.models[capGroupId];
  if (!models || models.length === 0) {
    return html`
      <div class="le-tab-empty">该能力暂无可用的本地模型</div>
    `;
  }

  // Group by sub-capability (e.g. audio, tts under "voice")
  const subCaps = [...new Set(models.map((m) => m.capability))];
  const hasMultiSubs = subCaps.length > 1;

  return html`
		<div class="le-tab-content">
			${
        hasMultiSubs
          ? subCaps.map(
              (sc) => html`
					<div class="le-subcap-group">
						<div class="le-subcap-label">${subCapLabel(sc)}</div>
						${models
              .filter((m) => m.capability === sc)
              .map((m) => renderModelRow(m, progress[m.id], actions))}
					</div>
				`,
            )
          : models.map((m) => renderModelRow(m, progress[m.id], actions))
      }
			${renderRecommendedBanner(status, capGroupId, actions)}
		</div>
	`;
}

// ---------------------------------------------------------------------------
// Single Model Row
// ---------------------------------------------------------------------------

function renderModelRow(
  model: LocalModelItem,
  progress: LocalEngineInstallProgress | undefined,
  actions: LocalModelAction,
): TemplateResult {
  const isInstalling = progress && progress.stage !== "complete" && progress.stage !== "failed";
  const effectiveStatus: LocalModelStatus = isInstalling ? "installing" : model.status;

  return html`
		<div class="le-model-row le-model-row--${statusClass(effectiveStatus)} ${model.recommended ? "le-model-row--recommended" : ""}">
			<div class="le-model-row__main">
				<div class="le-model-row__header">
					<span class="le-model-row__name">${model.displayName}</span>
					<span class="le-run-mode le-run-mode--${model.runMode}">${runModeLabel(model.runMode)}</span>
					${
            model.recommended
              ? html`
                  <span class="le-badge-rec">推荐</span>
                `
              : nothing
          }
				</div>
				<div class="le-model-row__desc">${model.description}</div>
				<div class="le-model-row__meta">
					${model.downloadSizeMB > 0 ? html`<span>${fmtMB(model.downloadSizeMB)}</span>` : nothing}
					${model.runtimeMemoryMB > 0 ? html`<span>运行 ${fmtMB(model.runtimeMemoryMB)}</span>` : nothing}
				</div>
			</div>
			<div class="le-model-row__action">
				${renderModelAction(model, effectiveStatus, progress, actions)}
			</div>
		</div>
	`;
}

function renderModelAction(
  model: LocalModelItem,
  status: LocalModelStatus,
  progress: LocalEngineInstallProgress | undefined,
  actions: LocalModelAction,
): TemplateResult | typeof nothing {
  switch (status) {
    case "not_available":
      return html`<span class="le-status-text le-status-text--unavailable" title="${model.unavailableReason ?? ""}">${statusLabel(status)}</span>`;

    case "installable":
      return html`<button class="le-btn le-btn--install" @click=${(e: Event) => {
        e.stopPropagation();
        actions.onInstall(model.id);
      }}>安装</button>`;

    case "installing":
      return html`
				<div class="le-install-progress">
					<div class="le-progress-bar">
						<div class="le-progress-bar__fill" style="width:${progress?.percent ?? 0}%"></div>
					</div>
					<span class="le-progress-text">${progress?.message ?? "安装中..."}</span>
				</div>
			`;

    case "installed": {
      const domain =
        model.capability === "audio" || model.capability === "tts"
          ? ("voice" as const)
          : ("imagegen" as const);
      const canStart = model.runMode === "gpu";
      return html`
				<div class="le-installed-actions">
					${
            canStart
              ? html`<button class="le-btn le-btn--start" @click=${(e: Event) => {
                  e.stopPropagation();
                  actions.onStartSidecar(domain);
                }}>启动</button>`
              : nothing
          }
					<button class="le-btn le-btn--uninstall" @click=${(e: Event) => {
            e.stopPropagation();
            actions.onUninstall(model.id);
          }}>卸载</button>
				</div>
			`;
    }

    case "running": {
      const domain =
        model.capability === "audio" || model.capability === "tts"
          ? ("voice" as const)
          : ("imagegen" as const);
      return html`
				<div class="le-running-actions">
					<span class="le-status-dot le-status-dot--running"></span>
					<span class="le-status-text le-status-text--running">${statusLabel(status)}</span>
					<button class="le-btn le-btn--stop" @click=${(e: Event) => {
            e.stopPropagation();
            actions.onStopSidecar(domain);
          }}>停止</button>
				</div>
			`;
    }

    default:
      // 未知状态：显示状态文本而非空白，方便调试和向后兼容
      return html`<span class="le-status-text le-status-text--unknown" title="未知状态: ${status}">${statusLabel(status as LocalModelStatus)}</span>`;
  }
}

// ---------------------------------------------------------------------------
// Recommended install banner (shown at bottom of tab if there are installable recommended models)
// ---------------------------------------------------------------------------

function renderRecommendedBanner(
  status: LocalEngineStatus,
  capGroupId: string,
  actions: LocalModelAction,
): TemplateResult | typeof nothing {
  const models = status.models[capGroupId];
  if (!models) return nothing;
  const recommendedInstallable = models.filter((m) => m.recommended && m.status === "installable");
  if (recommendedInstallable.length === 0) return nothing;

  return html`
		<div class="le-rec-banner">
			<span class="le-rec-banner__text">
				根据您的硬件，推荐安装 ${recommendedInstallable.map((m) => m.displayName).join("、")}
			</span>
			<button class="le-btn le-btn--rec" @click=${(e: Event) => {
        e.stopPropagation();
        actions.onInstallRecommended();
      }}>
				一键安装推荐
			</button>
		</div>
	`;
}

// ---------------------------------------------------------------------------
// Management Modal — full local model management
// ---------------------------------------------------------------------------

/**
 * Render the local model management modal.
 */
export function renderLocalManageModal(
  status: LocalEngineStatus,
  progress: Record<string, LocalEngineInstallProgress>,
  actions: LocalModelAction & { onClose: () => void },
): TemplateResult {
  const hw = status.hardware;
  // 一键安装只看语音组（ASR+TTS）
  const voiceModels = status.models["voice"] ?? [];

  return html`
		<div class="modal-overlay" @click=${actions.onClose} @keydown=${(e: KeyboardEvent) => {
      if (e.key === "Escape") actions.onClose();
    }}>
			<div class="modal le-manage-modal" @click=${(e: Event) => e.stopPropagation()}>
				<div class="modal-header">
					<span class="modal-title">本地 AI 引擎管理</span>
					<button class="modal-close" @click=${actions.onClose}>&times;</button>
				</div>
				<div class="modal-body le-manage-body">
					<!-- One-click recommended install (top position for visibility) -->
					${renderGlobalRecommended(voiceModels, actions)}

					<!-- Hardware overview -->
					<div class="le-manage-hw">
						<div class="le-manage-hw__title">设备信息</div>
						<div class="le-manage-hw__grid">
							${
                hw.gpu
                  ? html`
								<div class="le-manage-hw__item">
									<span class="le-manage-hw__label">GPU</span>
									<span class="le-manage-hw__value">${hw.gpu.name}</span>
								</div>
								<div class="le-manage-hw__item">
									<span class="le-manage-hw__label">VRAM</span>
									<span class="le-manage-hw__value">${fmtMB(hw.gpu.vramTotalMB)} (${fmtMB(hw.gpu.vramFreeMB)} 空闲)</span>
								</div>
							`
                  : html`
                      <div class="le-manage-hw__item">
                        <span class="le-manage-hw__label">GPU</span>
                        <span class="le-manage-hw__value le-manage-hw__value--muted">无独立 GPU</span>
                      </div>
                    `
              }
							<div class="le-manage-hw__item">
								<span class="le-manage-hw__label">CPU</span>
								<span class="le-manage-hw__value">${hw.cpuModel} (${hw.cpuCores} 核)</span>
							</div>
							<div class="le-manage-hw__item">
								<span class="le-manage-hw__label">内存</span>
								<span class="le-manage-hw__value">${fmtMB(hw.totalRamMB)} (${fmtMB(hw.freeRamMB)} 空闲)</span>
							</div>
							<div class="le-manage-hw__item">
								<span class="le-manage-hw__label">系统</span>
								<span class="le-manage-hw__value">${platformLabel(hw.platform)} ${hw.arch}</span>
							</div>
						</div>
						<div class="le-manage-hw__tiers">
							<span class="le-tier-badge">语音: ${tierLabel(status.voiceTier)}</span>
							<span class="le-tier-badge">图像: ${tierLabel(status.imagegenTier)}</span>
						</div>
					</div>

					<!-- All models by group -->
					${Object.entries(status.models).map(
            ([groupId, models]) => html`
						<div class="le-manage-group">
							<div class="le-manage-group__title">${groupLabel(groupId)}</div>
							${models.map((m) => renderModelRow(m, progress[m.id], actions))}
						</div>
					`,
          )}
				</div>
			</div>
		</div>
	`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function renderGlobalRecommended(
  allModels: LocalModelItem[],
  actions: LocalModelAction,
): TemplateResult | typeof nothing {
  const recommended = allModels.filter((m) => m.recommended && m.status === "installable");
  if (recommended.length === 0) return nothing;

  const totalSize = recommended.reduce((s, m) => s + m.downloadSizeMB, 0);

  return html`
		<div class="le-global-rec">
			<div class="le-global-rec__info">
				<div class="le-global-rec__title">一键安装推荐配置</div>
				<div class="le-global-rec__desc">
					安装 ${recommended.length} 个推荐模型（共 ${fmtMB(totalSize)}），获得最佳本地 AI 体验
				</div>
			</div>
			<button class="le-btn le-btn--rec le-btn--lg" @click=${actions.onInstallRecommended}>
				一键安装
			</button>
		</div>
	`;
}

function platformLabel(platform: string): string {
  switch (platform) {
    case "win32":
      return "Windows";
    case "darwin":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return platform;
  }
}

function tierLabel(tier: string): string {
  switch (tier) {
    case "gpu-full":
      return "GPU 全功能";
    case "gpu-asr":
      return "GPU 语音";
    case "cpu-full":
      return "CPU 全功能";
    case "cpu-asr":
      return "CPU 语音";
    case "gpu-hq":
      return "GPU 高质量";
    case "gpu-fast":
      return "GPU 极速";
    case "cpu":
      return "CPU";
    case "api-only":
      return "仅 API";
    case "disabled":
      return "不可用";
    default:
      return tier;
  }
}

function groupLabel(groupId: string): string {
  switch (groupId) {
    case "voice":
      return "语音模型";
    case "image":
      return "图像模型";
    case "video":
      return "视频模型";
    default:
      return groupId;
  }
}

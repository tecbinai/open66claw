import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.js";
import { t } from "../i18n/index.js";

/**
 * 安装进度信息
 * 支持详细的下载进度显示
 */
export interface SkillInstallProgress {
  id: string;
  skillName: string;
  stage: "downloading" | "installing" | "verifying" | "complete" | "failed";
  message: string;
  percent?: number;
  logs?: string[];
  // 详细下载信息
  downloadInfo?: {
    speed?: string; // "2.5 MB/s"
    eta?: string; // "10s"
    downloaded?: string; // "15.2 MB"
    total?: string; // "50 MB"
  };
  // 是否使用国内镜像
  usingCNMirror?: boolean;
  // 当前安装的依赖名称
  currentDependency?: string;
}

/**
 * 获取阶段图标
 */
function getStageIcon(stage: SkillInstallProgress["stage"]): string {
  switch (stage) {
    case "downloading":
      return "⬇️";
    case "installing":
      return "📦";
    case "verifying":
      return "🔍";
    case "complete":
      return "✅";
    case "failed":
      return "❌";
    default:
      return "⏳";
  }
}

/**
 * 获取阶段标签
 */
function getStageLabel(stage: SkillInstallProgress["stage"]): string {
  switch (stage) {
    case "downloading":
      return t("skillInstall.progress.downloading");
    case "installing":
      return t("skillInstall.progress.installing");
    case "verifying":
      return t("skillInstall.progress.verifying");
    case "complete":
      return t("skillInstall.progress.complete");
    case "failed":
      return t("skillInstall.progress.failed");
    default:
      return t("skillInstall.progress.pending");
  }
}

/**
 * 渲染进度条
 */
function renderProgressBar(percent: number | undefined, stage: SkillInstallProgress["stage"]) {
  const progressPercent = percent ?? (stage === "complete" ? 100 : stage === "failed" ? 0 : 50);
  const isComplete = stage === "complete";
  const isFailed = stage === "failed";

  return html`
    <div class="skill-progress-bar">
      <div
        class="skill-progress-fill ${isComplete ? "skill-progress-success" : ""} ${isFailed ? "skill-progress-error" : ""}"
        style="width: ${progressPercent}%"
      ></div>
    </div>
  `;
}

/**
 * 渲染安装日志
 */
function renderLogs(logs: string[] | undefined) {
  if (!logs || logs.length === 0) return nothing;

  return html`
    <div class="skill-progress-logs">
      <div class="skill-progress-logs-title">${t("skillInstall.progress.logs")}</div>
      <div class="skill-progress-logs-content">
        ${logs.map((log) => html`<div class="skill-progress-log-line">${log}</div>`)}
      </div>
    </div>
  `;
}

/**
 * 渲染下载详情
 * 显示下载速度、剩余时间等
 */
function renderDownloadInfo(downloadInfo: SkillInstallProgress["downloadInfo"]) {
  if (!downloadInfo) return nothing;

  return html`
    <div class="skill-progress-download-info">
      ${
        downloadInfo.downloaded && downloadInfo.total
          ? html`
            <span class="skill-progress-download-size">
              ${downloadInfo.downloaded} / ${downloadInfo.total}
            </span>
          `
          : nothing
      }
      ${
        downloadInfo.speed
          ? html`<span class="skill-progress-download-speed">⚡ ${downloadInfo.speed}</span>`
          : nothing
      }
      ${
        downloadInfo.eta
          ? html`<span class="skill-progress-download-eta">⏱️ ${downloadInfo.eta}</span>`
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染国内镜像标识
 */
function renderCNExclusiveBadge(usingCNMirror?: boolean) {
  if (!usingCNMirror) return nothing;

  return html`
    <div class="skill-progress-cn-badge">
      <span class="skill-progress-cn-flag">🇨🇳</span>
      <span class="skill-progress-cn-text">SkillHub 中国镜像服务</span>
    </div>
  `;
}

/**
 * 渲染技能安装进度
 * 增强版进度显示
 */
export function renderSkillInstallProgress(state: AppViewState) {
  const progress = state.skillInstallProgress;
  if (!progress) return nothing;

  const isComplete = progress.stage === "complete";
  const isFailed = progress.stage === "failed";
  const isFinished = isComplete || isFailed;
  const isDownloading = progress.stage === "downloading";

  return html`
    <div class="skill-progress-overlay" role="status" aria-live="polite">
      <div class="skill-progress-card ${isComplete ? "skill-progress-card-success" : ""} ${isFailed ? "skill-progress-card-error" : ""}">
        ${renderCNExclusiveBadge(progress.usingCNMirror)}
        
        <div class="skill-progress-header">
          <div class="skill-progress-icon">${getStageIcon(progress.stage)}</div>
          <div class="skill-progress-header-text">
            <div class="skill-progress-title">${progress.skillName}</div>
            <div class="skill-progress-stage">
              ${getStageLabel(progress.stage)}
              ${
                progress.currentDependency
                  ? html` <span class="skill-progress-dependency">(${progress.currentDependency})</span>`
                  : nothing
              }
            </div>
          </div>
        </div>

        ${renderProgressBar(progress.percent, progress.stage)}
        
        ${
          progress.percent !== undefined
            ? html`<div class="skill-progress-percent">${progress.percent}%</div>`
            : nothing
        }

        ${isDownloading ? renderDownloadInfo(progress.downloadInfo) : nothing}

        <div class="skill-progress-message">${progress.message}</div>

        ${renderLogs(progress.logs)}

        ${
          isFinished
            ? html`
              <div class="skill-progress-actions">
                ${
                  isComplete
                    ? html`
                      <button
                        class="btn primary"
                        @click=${() => state.dismissSkillInstallProgress?.()}
                      >
                        ${t("skillInstall.progress.done")}
                      </button>
                    `
                    : html`
                      <button
                        class="btn"
                        @click=${() => state.retrySkillInstall?.()}
                      >
                        ${t("skillInstall.progress.retry")}
                      </button>
                      <button
                        class="btn danger"
                        @click=${() => state.dismissSkillInstallProgress?.()}
                      >
                        ${t("skillInstall.progress.close")}
                      </button>
                    `
                }
              </div>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

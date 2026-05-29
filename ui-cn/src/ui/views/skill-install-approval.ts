import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.js";
import { brand } from "../brand";
import { t } from "../i18n/index.js";

/**
 * 技能安装请求类型
 */
export interface SkillInstallRequest {
  id: string;
  request: {
    skillName: string;
    skillDescription?: string | null;
    missing: {
      bins: string[];
      env: string[];
      config: string[];
    };
    installSteps?: string[] | null;
    estimatedTime?: string | null;
    originalMessage?: string | null;
    sessionKey?: string | null;
  };
  createdAtMs: number;
  expiresAtMs: number;
}

/**
 * 格式化剩余时间
 */
function formatRemaining(ms: number): string {
  const remaining = Math.max(0, ms);
  const totalSeconds = Math.floor(remaining / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

/**
 * 渲染缺失依赖项
 */
function renderMissingDeps(missing: SkillInstallRequest["request"]["missing"]) {
  const hasBins = missing.bins.length > 0;
  const hasEnv = missing.env.length > 0;
  const hasConfig = missing.config.length > 0;

  if (!hasBins && !hasEnv && !hasConfig) {
    return nothing;
  }

  return html`
    <div class="skill-install-deps">
      <div class="skill-install-deps-title">${t("skillInstall.missingDeps")}</div>
      ${
        hasBins
          ? html`
            <div class="skill-install-deps-group">
              <span class="skill-install-deps-label">${t("skillInstall.deps.bins")}:</span>
              <div class="skill-install-deps-items">
                ${missing.bins.map(
                  (bin) =>
                    html`<span class="skill-install-dep-item skill-install-dep-bin">${bin}</span>`,
                )}
              </div>
            </div>
          `
          : nothing
      }
      ${
        hasEnv
          ? html`
            <div class="skill-install-deps-group">
              <span class="skill-install-deps-label">${t("skillInstall.deps.env")}:</span>
              <div class="skill-install-deps-items">
                ${missing.env.map(
                  (env) =>
                    html`<span class="skill-install-dep-item skill-install-dep-env">${env}</span>`,
                )}
              </div>
            </div>
          `
          : nothing
      }
      ${
        hasConfig
          ? html`
            <div class="skill-install-deps-group">
              <span class="skill-install-deps-label">${t("skillInstall.deps.config")}:</span>
              <div class="skill-install-deps-items">
                ${missing.config.map(
                  (cfg) =>
                    html`<span class="skill-install-dep-item skill-install-dep-config">${cfg}</span>`,
                )}
              </div>
            </div>
          `
          : nothing
      }
    </div>
  `;
}

/**
 * 渲染安装步骤预览
 */
function renderInstallSteps(steps: string[] | null | undefined) {
  if (!steps || steps.length === 0) return nothing;

  return html`
    <div class="skill-install-steps">
      <div class="skill-install-steps-title">${t("skillInstall.installSteps")}</div>
      <ol class="skill-install-steps-list">
        ${steps.map((step) => html`<li>${step}</li>`)}
      </ol>
    </div>
  `;
}

/**
 * 渲染技能安装确认弹框
 */
export function renderSkillInstallApproval(state: AppViewState) {
  const active = state.skillInstallQueue?.[0];
  if (!active) return nothing;

  const { request } = active;
  const remainingMs = active.expiresAtMs - Date.now();
  const remaining =
    remainingMs > 0
      ? `${t("skillInstall.expiresIn")} ${formatRemaining(remainingMs)}`
      : t("skillInstall.expired");
  const queueCount = state.skillInstallQueue?.length ?? 0;
  const hasOriginalMessage = !!request.originalMessage;

  return html`
    <div class="skill-install-overlay" role="dialog" aria-live="polite">
      <div class="skill-install-card">
        <div class="skill-install-header">
          <div class="skill-install-icon">🔧</div>
          <div class="skill-install-header-text">
            <div class="skill-install-title">${t("skillInstall.title")}</div>
            <div class="skill-install-sub">${remaining}</div>
          </div>
          ${
            queueCount > 1
              ? html`<div class="skill-install-queue">${queueCount} ${t("skillInstall.pending")}</div>`
              : nothing
          }
        </div>

        <div class="skill-install-info">
          <div class="skill-install-name">${request.skillName}</div>
          ${
            request.skillDescription
              ? html`<div class="skill-install-desc">${request.skillDescription}</div>`
              : nothing
          }
        </div>

        ${renderMissingDeps(request.missing)}
        ${renderInstallSteps(request.installSteps)}

        ${
          request.estimatedTime
            ? html`<div class="skill-install-time">
              <span class="skill-install-time-label">${t("skillInstall.estimatedTime")}:</span>
              <span>${request.estimatedTime}</span>
            </div>`
            : nothing
        }

        ${
          brand.skillMirrorHint
            ? html`
        <div class="skill-install-mirror-hint">
          <span class="skill-install-mirror-icon">🚀</span>
          <span>${brand.skillMirrorHint}</span>
        </div>
        `
            : nothing
        }

        ${
          state.skillInstallError
            ? html`<div class="skill-install-error">${state.skillInstallError}</div>`
            : nothing
        }

        <div class="skill-install-actions">
          ${
            hasOriginalMessage
              ? html`
                <button
                  class="btn primary skill-install-btn-continue"
                  ?disabled=${state.skillInstallBusy || remainingMs <= 0}
                  @click=${(e: Event) => {
                    (e.target as HTMLButtonElement).disabled = true;
                    state.handleSkillInstallDecision?.("install-continue");
                  }}
                >
                  ${state.skillInstallBusy ? t("skillInstall.installing") : t("skillInstall.installAndContinue")}
                </button>
              `
              : nothing
          }
          <button
            class="btn ${hasOriginalMessage ? "" : "primary"}"
            ?disabled=${state.skillInstallBusy || remainingMs <= 0}
            @click=${(e: Event) => {
              (e.target as HTMLButtonElement).disabled = true;
              state.handleSkillInstallDecision?.("install");
            }}
          >
            ${state.skillInstallBusy ? t("skillInstall.installing") : t("skillInstall.installOnly")}
          </button>
          <button
            class="btn danger"
            ?disabled=${state.skillInstallBusy}
            @click=${() => state.handleSkillInstallDecision?.("deny")}
          >
            ${t("skillInstall.cancel")}
          </button>
        </div>
      </div>
    </div>
  `;
}

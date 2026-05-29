/**
 * update-dialog.ts — 更新对话框
 *
 * 三种状态：
 * 1. 确认态：显示 changelog + 更新类型 + [立即更新] [稍后]
 * 2. 进度态：进度条 + 阶段文字（下载中/应用中/校验中）
 * 3. 完成态：成功(重启) / 失败(重试) / installer 重定向(下载链接)
 */

import { html, nothing, type TemplateResult } from "lit";
import { t, tMaybe } from "../i18n/index.js";

/** 仅允许 https: 协议的 URL 被 window.open 打开，防止 javascript:/data: XSS */
function safeOpenUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      window.open(url, "_blank");
    }
  } catch {
    /* invalid URL, ignore */
  }
}

export type UpdateAvailableInfo = {
  version: string;
  updateType: "delta" | "full" | "installer";
  changelog?: { "zh-CN"?: string; "en-US"?: string };
  summary?: string;
  mandatory?: boolean;
  installerUrl?: string;
};

export type UpdateProgress = {
  stage: "checking" | "downloading" | "applying" | "verifying" | "complete" | "error";
  percent: number;
  message: string;
};

export type UpdateResult = {
  ok: boolean;
  status?: string;
  error?: string;
  version?: string;
  installerUrl?: string;
};

export type UpdateDialogProps = {
  info: UpdateAvailableInfo;
  executing: boolean;
  progress: UpdateProgress | null;
  result: UpdateResult | null;
  onExecute: () => void;
  onDismiss: () => void;
  onClose: () => void;
  onRetry: () => void;
  onRestart: () => void;
};

function getChangelog(info: UpdateAvailableInfo): string {
  if (!info.changelog) return "";
  // Prefer zh-CN, fallback to en-US
  return info.changelog["zh-CN"] || info.changelog["en-US"] || "";
}

function renderConfirmState(props: UpdateDialogProps): TemplateResult {
  const { info } = props;
  const changelog = getChangelog(info);
  const typeKey =
    info.updateType === "delta"
      ? "update.dialog.typeDelta"
      : info.updateType === "full"
        ? "update.dialog.typeFull"
        : "update.dialog.typeInstaller";

  return html`
    <div style="padding: 0 24px 16px;">
      <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600;">
        ${t("update.dialog.version", { version: info.version })}
      </p>
      <div style="display: flex; gap: 6px; margin-bottom: 12px;">
        <span style="
          font-size: 11px; padding: 2px 8px; border-radius: 4px;
          background: rgba(59,130,246,0.12); color: #3b82f6;
        ">${t(typeKey)}</span>
        ${
          info.mandatory
            ? html`<span style="
          font-size: 11px; padding: 2px 8px; border-radius: 4px;
          background: #ef4444; color: #fff;
        ">${t("update.dialog.mandatory")}</span>`
            : nothing
        }
      </div>
      ${
        changelog
          ? html`
        <div style="
          max-height: 200px; overflow-y: auto; padding: 10px 12px;
          background: var(--surface-2, #f8f9fa); border-radius: 6px;
          font-size: 13px; line-height: 1.6; white-space: pre-wrap;
          margin-bottom: 16px;
        ">${changelog}</div>
      `
          : nothing
      }
      ${
        info.summary
          ? html`
        <p style="margin: 0 0 16px; font-size: 13px; color: var(--fg-muted, #6b7280);">
          ${info.summary}
        </p>
      `
          : nothing
      }
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        ${
          !info.mandatory
            ? html`
          <button class="btn btn--sm" type="button" @click=${props.onDismiss}>
            ${t("update.dialog.laterBtn")}
          </button>
        `
            : nothing
        }
        ${
          info.updateType === "installer"
            ? html`
          <button class="btn btn--sm btn--primary" type="button" @click=${() => {
            if (info.installerUrl) safeOpenUrl(info.installerUrl);
          }}>
            ${t("update.dialog.downloadBtn")}
          </button>
        `
            : html`
          <button class="btn btn--sm btn--primary" type="button" @click=${props.onExecute}>
            ${t("update.dialog.confirmBtn")}
          </button>
        `
        }
      </div>
    </div>
  `;
}

function renderProgressState(progress: UpdateProgress): TemplateResult {
  const pct = Math.max(0, Math.min(100, progress.percent));
  return html`
    <div style="padding: 0 24px 24px;">
      <div style="
        height: 6px; border-radius: 3px;
        background: var(--surface-2, #e5e7eb); overflow: hidden;
        margin-bottom: 12px;
      ">
        <div style="
          height: 100%; border-radius: 3px;
          background: var(--primary, #3b82f6);
          width: ${pct}%;
          transition: width 300ms ease;
        "></div>
      </div>
      <p style="margin: 0; font-size: 13px; color: var(--fg-muted, #6b7280); text-align: center;">
        ${progress.message || tMaybe(`update.progress.${progress.stage}`)}
      </p>
    </div>
  `;
}

function renderResultState(props: UpdateDialogProps): TemplateResult {
  const { result } = props;
  if (!result) return html``;

  if (result.status === "installer-redirect") {
    return html`
      <div style="padding: 0 24px 24px; text-align: center;">
        <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600;">
          ${t("update.result.installerRedirect")}
        </p>
        <p style="margin: 0 0 16px; font-size: 13px; color: var(--fg-muted, #6b7280);">
          ${t("update.result.installerRedirectDesc")}
        </p>
        <div style="display: flex; justify-content: center; gap: 8px;">
          <button class="btn btn--sm" type="button" @click=${props.onClose}>
            ${t("update.dialog.closeBtn")}
          </button>
          ${
            result.installerUrl
              ? html`
            <button class="btn btn--sm btn--primary" type="button" @click=${() => {
              if (result.installerUrl) safeOpenUrl(result.installerUrl);
            }}>
              ${t("update.dialog.downloadBtn")}
            </button>
          `
              : nothing
          }
        </div>
      </div>
    `;
  }

  if (result.ok) {
    return html`
      <div style="padding: 0 24px 24px; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 8px;">&#x2705;</div>
        <p style="margin: 0 0 16px; font-size: 14px;">
          ${t("update.result.success")}
        </p>
        <button class="btn btn--sm btn--primary" type="button" @click=${props.onRestart}>
          ${t("update.dialog.restartBtn")}
        </button>
      </div>
    `;
  }

  // Error state
  return html`
    <div style="padding: 0 24px 24px; text-align: center;">
      <div style="font-size: 40px; margin-bottom: 8px;">&#x274C;</div>
      <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600;">
        ${t("update.progress.error")}
      </p>
      <p style="margin: 0 0 16px; font-size: 12px; color: var(--fg-muted, #6b7280); word-break: break-all;">
        ${result.error || "Unknown error"}
      </p>
      <div style="display: flex; justify-content: center; gap: 8px;">
        <button class="btn btn--sm" type="button" @click=${props.onClose}>
          ${t("update.dialog.closeBtn")}
        </button>
        <button class="btn btn--sm btn--primary" type="button" @click=${props.onRetry}>
          ${t("update.dialog.retryBtn")}
        </button>
      </div>
    </div>
  `;
}

export function renderUpdateDialog(
  props: UpdateDialogProps | null,
): TemplateResult | typeof nothing {
  if (!props) return nothing;

  const { executing, progress, result } = props;
  // Determine which state to render
  const hasResult = result != null;
  const isInProgress = executing && !hasResult;
  // CR-13: executing=true 但 progress 还没到达时，显示初始进度态（而非闪回确认界面）
  const showProgress = isInProgress;
  const effectiveProgress = progress ?? { stage: "checking" as const, percent: 0, message: "" };

  return html`
    <!-- Backdrop -->
    <div
      @click=${!executing ? props.onClose : undefined}
      style="
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 9100;
        animation: updateDialogBgIn 200ms ease both;
      "
    ></div>
    <!-- Dialog -->
    <div style="
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 440px; max-width: 90vw;
      max-height: 80vh; overflow-y: auto;
      background: var(--surface-1, #fff);
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      z-index: 9101;
      animation: updateDialogIn 250ms ease both;
    ">
      <!-- Header -->
      <div style="
        display: flex; align-items: center; justify-content: space-between;
        padding: 18px 24px 12px;
      ">
        <h3 style="margin: 0; font-size: 17px; font-weight: 700;">
          ${t("update.dialog.title")}
        </h3>
        ${
          !executing
            ? html`
          <button
            type="button"
            style="
              background: none; border: none; cursor: pointer;
              font-size: 20px; color: var(--fg-muted, #6b7280);
              padding: 2px 6px; line-height: 1;
            "
            @click=${props.onClose}
          >&times;</button>
        `
            : nothing
        }
      </div>

      ${
        hasResult
          ? renderResultState(props)
          : showProgress
            ? renderProgressState(effectiveProgress)
            : renderConfirmState(props)
      }
    </div>
  `;
}

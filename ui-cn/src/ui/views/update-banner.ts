/**
 * update-banner.ts — 更新通知横幅
 *
 * 渲染在聊天视图顶部（参照 failover-banner 位置），
 * 当有可用更新时显示版本号 + 摘要 + [查看] + [稍后] 按钮。
 */

import { html, nothing, type TemplateResult } from "lit";
import { t } from "../i18n/index.js";

export type UpdateBannerProps = {
  version: string;
  summary?: string;
  mandatory?: boolean;
  onView: () => void;
  onDismiss: () => void;
};

export function renderUpdateBanner(
  props: UpdateBannerProps | null,
): TemplateResult | typeof nothing {
  if (!props) return nothing;

  return html`
    <div class="callout info update-banner" style="
      display: flex; align-items: center; gap: 10px;
      padding: 8px 14px; margin-bottom: 6px;
      animation: updateBannerIn 300ms ease both;
    ">
      <span style="font-size: 16px; flex-shrink: 0;">&#x1F4E6;</span>
      <span style="flex: 1; font-size: 13px;">
        <strong>${t("update.banner.available", { version: props.version })}</strong>
        ${props.summary ? html` &mdash; ${props.summary}` : nothing}
        ${
          props.mandatory
            ? html`<span style="
          font-size: 10px; padding: 1px 6px; border-radius: 3px;
          background: #ef4444; color: #fff; margin-left: 6px;
          vertical-align: middle;
        ">${t("update.dialog.mandatory")}</span>`
            : nothing
        }
      </span>
      <button
        class="btn btn--sm btn--primary"
        type="button"
        style="flex-shrink: 0; font-size: 12px; padding: 3px 10px;"
        @click=${props.onView}
      >${t("update.banner.view")}</button>
      ${
        !props.mandatory
          ? html`
        <button
          class="btn btn--sm"
          type="button"
          style="flex-shrink: 0; font-size: 12px; padding: 3px 10px;"
          @click=${props.onDismiss}
        >${t("update.banner.later")}</button>
      `
          : nothing
      }
    </div>
  `;
}

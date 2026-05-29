import { html, nothing } from "lit";
import { t } from "../i18n/index.js";

export type WorkspaceProps = {
  connected: boolean;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  workspace: string;
  fsWorkspaceOnly: boolean;
  memoryWatch: boolean;
  memoryFlush: boolean;
  onWorkspaceChange: (v: string) => void;
  onFsWorkspaceOnlyChange: (v: boolean) => void;
  onMemoryWatchChange: (v: boolean) => void;
  onMemoryFlushChange: (v: boolean) => void;
  onSave: () => void;
};

export function renderWorkspace(props: WorkspaceProps) {
  return html`
    <div class="ws-page">
      <!-- 默认项目目录 -->
      <section class="ws-card">
        <div class="ws-card__header">
          <h3 class="ws-card__title">${t("workspace.defaultDir")}</h3>
          <p class="ws-card__desc">${t("workspace.defaultDirDesc")}</p>
        </div>
        <div class="ws-card__body">
          <div class="ws-dir-input">
            <input
              class="ws-dir-input__field"
              type="text"
              .value=${props.workspace}
              @input=${(e: Event) => props.onWorkspaceChange((e.target as HTMLInputElement).value)}
              placeholder="~/.openclaw/workspace"
            />
          </div>
        </div>
      </section>

      <!-- 限制文件访问范围 -->
      <section class="ws-card">
        <div class="ws-card__row">
          <div class="ws-card__info">
            <h3 class="ws-card__title">${t("workspace.restrictAccess")}</h3>
            <p class="ws-card__desc">${t("workspace.restrictAccessDesc")}</p>
          </div>
          <label class="ws-toggle">
            <input
              type="checkbox"
              .checked=${props.fsWorkspaceOnly}
              @change=${(e: Event) =>
                props.onFsWorkspaceOnlyChange((e.target as HTMLInputElement).checked)}
            />
            <span class="ws-toggle__slider"></span>
          </label>
        </div>
      </section>

      <!-- 自动保存上下文 -->
      <section class="ws-card">
        <div class="ws-card__row">
          <div class="ws-card__info">
            <h3 class="ws-card__title">${t("workspace.autoSaveContext")}</h3>
            <p class="ws-card__desc">${t("workspace.autoSaveContextDesc")}</p>
          </div>
          <label class="ws-toggle">
            <input
              type="checkbox"
              .checked=${props.memoryFlush}
              @change=${(e: Event) =>
                props.onMemoryFlushChange((e.target as HTMLInputElement).checked)}
            />
            <span class="ws-toggle__slider"></span>
          </label>
        </div>
      </section>

      <!-- 文件监听 -->
      <section class="ws-card">
        <div class="ws-card__row">
          <div class="ws-card__info">
            <h3 class="ws-card__title">${t("workspace.fileWatch")}</h3>
            <p class="ws-card__desc">${t("workspace.fileWatchDesc")}</p>
          </div>
          <label class="ws-toggle">
            <input
              type="checkbox"
              .checked=${props.memoryWatch}
              @change=${(e: Event) =>
                props.onMemoryWatchChange((e.target as HTMLInputElement).checked)}
            />
            <span class="ws-toggle__slider"></span>
          </label>
        </div>
      </section>

      <!-- 保存按钮 -->
      ${
        props.dirty
          ? html`
      <div class="ws-save-bar">
        <span class="ws-save-bar__hint">${t("workspace.unsavedChanges")}</span>
        <button
          class="btn primary"
          ?disabled=${props.saving || !props.connected}
          @click=${props.onSave}
        >
          ${props.saving ? t("workspace.saving") : t("workspace.save")}
        </button>
      </div>
      `
          : nothing
      }
    </div>
  `;
}

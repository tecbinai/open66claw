import { html, nothing } from "lit";
import { formatMs } from "../format";
import { t } from "../i18n/index.js";
import {
  formatCronPayload,
  formatCronSchedule,
  formatCronState,
  formatNextRun,
} from "../presenter";
import type { ChannelUiMetaEntry, CronJob, CronRunLogEntry, CronStatus } from "../types";
import type { CronFormState } from "../ui-types";

export type CronProps = {
  loading: boolean;
  status: CronStatus | null;
  jobs: CronJob[];
  error: string | null;
  busy: boolean;
  form: CronFormState;
  channels: string[];
  channelLabels?: Record<string, string>;
  channelMeta?: ChannelUiMetaEntry[];
  runsJobId: string | null;
  runs: CronRunLogEntry[];
  onFormChange: (patch: Partial<CronFormState>) => void;
  onRefresh: () => void;
  onAdd: () => void;
  onToggle: (job: CronJob, enabled: boolean) => void;
  onRun: (job: CronJob) => void;
  onRemove: (job: CronJob) => void;
  onLoadRuns: (jobId: string) => void;
};

function buildChannelOptions(props: CronProps): string[] {
  const options = ["last", ...props.channels.filter(Boolean)];
  const current = props.form.channel?.trim();
  if (current && !options.includes(current)) {
    options.push(current);
  }
  const seen = new Set<string>();
  return options.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function resolveChannelLabel(props: CronProps, channel: string): string {
  if (channel === "last") return "last";
  const meta = props.channelMeta?.find((entry) => entry.id === channel);
  if (meta?.label) return meta.label;
  return props.channelLabels?.[channel] ?? channel;
}

// ============================================================================
// SVG icons
// ============================================================================

function _clockIcon() {
  return html`
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  `;
}

function _calendarIcon() {
  return html`
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  `;
}

function _playIcon() {
  return html`
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  `;
}

function _listIcon() {
  return html`
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  `;
}

function _historyIcon() {
  return html`
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
  `;
}

function _plusIcon() {
  return html`
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  `;
}

function _refreshIcon() {
  return html`
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  `;
}

/** Color icon for job card based on schedule type */
function jobCardIcon(job: CronJob) {
  const sched = job.schedule;
  if ("at" in sched) {
    return html`
      <div class="skills-color-icon" style="background: #f59e0b">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="18" rx="3" fill="#fff" />
          <path d="M3 9h18" stroke="#f59e0b" stroke-width="2" />
          <path d="M8 2v4M16 2v4" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" />
          <rect x="7" y="12" width="3" height="3" rx="0.5" fill="#f59e0b" />
        </svg>
      </div>
    `;
  }
  if ("every" in sched) {
    return html`
      <div class="skills-color-icon" style="background: #5bb5de">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="2" />
          <polyline
            points="12 7 12 12 16 14"
            stroke="#fff"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    `;
  }
  // cron expression
  return html`
    <div class="skills-color-icon" style="background: #6366f1">
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="2" y="3" width="20" height="18" rx="3" fill="#fff" />
        <path
          d="M7 9l3 3-3 3"
          stroke="#6366f1"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path d="M13 15h4" stroke="#6366f1" stroke-width="2" stroke-linecap="round" />
      </svg>
    </div>
  `;
}

// ============================================================================
// Main render — two-column glassmorphism layout
// ============================================================================

export function renderCron(props: CronProps) {
  const channelOptions = buildChannelOptions(props);
  const enabledJobs = props.jobs.filter((j) => j.enabled).length;
  const disabledJobs = props.jobs.length - enabledJobs;

  return html`
    <div class="cron-layout">
      <!-- ==================== Sidebar ==================== -->
      <aside class="cron-sidebar">
        <!-- Stats dashboard -->
        <div class="cron-sidebar__stats">
          <div class="cron-sidebar__stat-card cron-sidebar__stat-card--enabled">
            <div class="cron-sidebar__stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </div>
            <div class="cron-sidebar__stat-num">
              ${
                props.status
                  ? props.status.enabled
                    ? t("common.yes")
                    : t("common.no")
                  : t("common.na")
              }
            </div>
            <div class="cron-sidebar__stat-label">${t("cron.scheduler")}</div>
          </div>
          <div class="cron-sidebar__stat-card cron-sidebar__stat-card--jobs">
            <div class="cron-sidebar__stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/></svg>
            </div>
            <div class="cron-sidebar__stat-num">${props.status?.jobs ?? 0}</div>
            <div class="cron-sidebar__stat-label">${t("cron.jobsTitle")}</div>
          </div>
          <div class="cron-sidebar__stat-card cron-sidebar__stat-card--next">
            <div class="cron-sidebar__stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="cron-sidebar__stat-num" style="font-size:14px;">${formatNextRun(props.status?.nextWakeAtMs ?? null)}</div>
            <div class="cron-sidebar__stat-label">${t("cron.nextWake")}</div>
          </div>
          <div class="cron-sidebar__stat-card cron-sidebar__stat-card--active">
            <div class="cron-sidebar__stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div class="cron-sidebar__stat-num">${enabledJobs}<span style="font-size:12px;font-weight:400;color:#999;">/${props.jobs.length}</span></div>
            <div class="cron-sidebar__stat-label">${t("cron.enabled")}</div>
          </div>
        </div>

        <!-- Refresh button -->
        <button class="cron-sidebar__refresh-btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15A9 9 0 1 1 18 5.6L23 10"/></svg>
          ${props.loading ? t("common.loading") : t("common.refresh")}
        </button>
        ${props.error ? html`<div style="font-size:12px;color:#ef4444;padding:4px 0;">${props.error}</div>` : nothing}

        <!-- Section title -->
        <div class="cron-sidebar__section-title">
          ${_listIcon()}
          ${t("cron.jobsTitle")}
          <span style="margin-left:auto;font-size:11px;font-weight:400;color:#999;">${props.jobs.length}</span>
        </div>

        <!-- Job list -->
        <div class="cron-sidebar__list">
          ${
            props.jobs.length === 0
              ? html`<div class="cron-sidebar__empty">${t("cron.noJobs")}</div>`
              : props.jobs.map((job) => renderSidebarJobItem(job, props))
          }
        </div>
      </aside>

      <!-- ==================== Main Area ==================== -->
      <div class="cron-main">
        <div class="cron-main__sticky-header">
          <div class="cron-main__header-row">
            <div class="cron-main__title">${t("cron.title")}</div>
          </div>
          <div class="cron-main__subtitle">${t("cron.schedulerDesc")}</div>
        </div>

        <div class="cron-main__scroll">
          <!-- New job form -->
          ${renderNewJobForm(props, channelOptions)}

          <!-- Job cards grid -->
          ${
            props.jobs.length > 0
              ? html`
                <div class="cron-glass-section">
                  <div class="cron-glass-section__title">
                    <span class="cron-glass-section__title-icon" style="color:#34d399;">
                      ${_listIcon()}
                    </span>
                    ${t("cron.jobsTitle")}
                    <span style="font-size:12px;font-weight:400;color:#999;margin-left:4px;">(${props.jobs.length})</span>
                  </div>
                  <div class="cron-glass-section__desc">${t("cron.jobsDesc")}</div>
                  <div class="cron-glass-grid">
                    ${props.jobs.map((job) => renderJobCard(job, props))}
                  </div>
                </div>
              `
              : nothing
          }

          <!-- Run history -->
          ${renderRunHistory(props)}
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Sidebar — Job item
// ============================================================================

function renderSidebarJobItem(job: CronJob, props: CronProps) {
  const isSelected = props.runsJobId === job.id;
  return html`
    <div
      class="cron-sidebar__item ${isSelected ? "cron-sidebar__item--selected" : ""}"
      @click=${() => props.onLoadRuns(job.id)}
    >
      <div class="cron-sidebar__item-icon">${jobCardIcon(job)}</div>
      <div class="cron-sidebar__item-info">
        <div class="cron-sidebar__item-name">${job.name}</div>
        <div class="cron-sidebar__item-desc">${formatCronSchedule(job)}</div>
        <div class="cron-sidebar__item-chips">
          <span class="cron-sidebar__chip ${job.enabled ? "cron-sidebar__chip--enabled" : "cron-sidebar__chip--disabled"}">
            ${job.enabled ? t("common.enabled") : t("common.disabled")}
          </span>
          <span class="cron-sidebar__chip cron-sidebar__chip--schedule">${job.sessionTarget}</span>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// New Job Form — glassmorphism card
// ============================================================================

function renderNewJobForm(props: CronProps, channelOptions: string[]) {
  return html`
    <div class="cron-glass-form">
      <div class="cron-glass-form__title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        ${t("cron.newJob")}
      </div>
      <div class="cron-glass-form__desc">${t("cron.newJobDesc")}</div>

      <!-- Basic fields -->
      <div class="cron-form-grid">
        <div class="cron-form-field">
          <span class="cron-form-field__label">${t("common.name")}</span>
          <input
            type="text"
            .value=${props.form.name}
            @input=${(e: Event) => props.onFormChange({ name: (e.target as HTMLInputElement).value })}
          />
        </div>
        <div class="cron-form-field">
          <span class="cron-form-field__label">${t("common.description")}</span>
          <input
            type="text"
            .value=${props.form.description}
            @input=${(e: Event) => props.onFormChange({ description: (e.target as HTMLInputElement).value })}
          />
        </div>
        <div class="cron-form-field">
          <span class="cron-form-field__label">${t("cron.agentId")}</span>
          <input
            type="text"
            .value=${props.form.agentId}
            @input=${(e: Event) => props.onFormChange({ agentId: (e.target as HTMLInputElement).value })}
            placeholder="${t("common.default")}"
          />
        </div>
        <div class="cron-form-field">
          <span class="cron-form-field__label">${t("common.enabled")}</span>
          <label class="cron-form-checkbox">
            <input
              type="checkbox"
              .checked=${props.form.enabled}
              @change=${(e: Event) => props.onFormChange({ enabled: (e.target as HTMLInputElement).checked })}
            />
            ${props.form.enabled ? t("common.yes") : t("common.no")}
          </label>
        </div>
      </div>

      <div class="cron-form-separator"></div>

      <!-- Schedule -->
      <div class="cron-form-grid">
        <div class="cron-form-section-title">
          ${_clockIcon()}
          ${t("cron.schedule")}
        </div>
        <div class="cron-form-field">
          <span class="cron-form-field__label">${t("cron.schedule")}</span>
          <select
            .value=${props.form.scheduleKind}
            @change=${(e: Event) =>
              props.onFormChange({
                scheduleKind: (e.target as HTMLSelectElement)
                  .value as CronFormState["scheduleKind"],
              })}
          >
            <option value="every">${t("cron.scheduleEvery")}</option>
            <option value="at">${t("cron.scheduleAt")}</option>
            <option value="cron">${t("cron.scheduleCron")}</option>
          </select>
        </div>
        ${renderScheduleFields(props)}
      </div>

      <div class="cron-form-separator"></div>

      <!-- Session & Wake -->
      <div class="cron-form-grid cron-form-grid--three">
        <div class="cron-form-field">
          <span class="cron-form-field__label">${t("cron.session")}</span>
          <select
            .value=${props.form.sessionTarget}
            @change=${(e: Event) =>
              props.onFormChange({
                sessionTarget: (e.target as HTMLSelectElement)
                  .value as CronFormState["sessionTarget"],
              })}
          >
            <option value="main">${t("cron.sessionMain")}</option>
            <option value="isolated">${t("cron.sessionIsolated")}</option>
          </select>
        </div>
        <div class="cron-form-field">
          <span class="cron-form-field__label">${t("cron.wakeMode")}</span>
          <select
            .value=${props.form.wakeMode}
            @change=${(e: Event) =>
              props.onFormChange({
                wakeMode: (e.target as HTMLSelectElement).value as CronFormState["wakeMode"],
              })}
          >
            <option value="next-heartbeat">${t("cron.wakeModeNextHeartbeat")}</option>
            <option value="now">${t("cron.wakeModeNow")}</option>
          </select>
        </div>
        <div class="cron-form-field">
          <span class="cron-form-field__label">${t("cron.payload")}</span>
          <select
            .value=${props.form.payloadKind}
            @change=${(e: Event) =>
              props.onFormChange({
                payloadKind: (e.target as HTMLSelectElement).value as CronFormState["payloadKind"],
              })}
          >
            <option value="systemEvent">${t("cron.payloadSystemEvent")}</option>
            <option value="agentTurn">${t("cron.payloadAgentTurn")}</option>
          </select>
        </div>
      </div>

      <!-- Payload text -->
      <div class="cron-form-grid" style="margin-top:12px;">
        <div class="cron-form-field cron-form-field--full">
          <span class="cron-form-field__label">
            ${props.form.payloadKind === "systemEvent" ? t("cron.systemText") : t("cron.agentMessage")}
          </span>
          <textarea
            .value=${props.form.payloadText}
            @input=${(e: Event) =>
              props.onFormChange({
                payloadText: (e.target as HTMLTextAreaElement).value,
              })}
            rows="3"
          ></textarea>
        </div>
      </div>

      <!-- Delivery (agentTurn only) -->
      ${
        props.form.payloadKind === "agentTurn"
          ? html`
            <div class="cron-form-separator"></div>
            <div class="cron-form-grid">
              <div class="cron-form-section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                ${t("cron.deliver")}
              </div>
              <div class="cron-form-field">
                <span class="cron-form-field__label">${t("cron.deliver")}</span>
                <label class="cron-form-checkbox">
                  <input
                    type="checkbox"
                    .checked=${props.form.deliver}
                    @change=${(e: Event) =>
                      props.onFormChange({
                        deliver: (e.target as HTMLInputElement).checked,
                      })}
                  />
                  ${props.form.deliver ? t("common.yes") : t("common.no")}
                </label>
              </div>
              <div class="cron-form-field">
                <span class="cron-form-field__label">${t("sessions.channel")}</span>
                <select
                  .value=${props.form.channel || "last"}
                  @change=${(e: Event) =>
                    props.onFormChange({
                      channel: (e.target as HTMLSelectElement).value as CronFormState["channel"],
                    })}
                >
                  ${channelOptions.map(
                    (channel) =>
                      html`<option value=${channel}>${resolveChannelLabel(props, channel)}</option>`,
                  )}
                </select>
              </div>
              <div class="cron-form-field">
                <span class="cron-form-field__label">${t("cron.to")}</span>
                <input
                  type="text"
                  .value=${props.form.to}
                  @input=${(e: Event) => props.onFormChange({ to: (e.target as HTMLInputElement).value })}
                  placeholder="${t("cron.toPlaceholder")}"
                />
              </div>
              <div class="cron-form-field">
                <span class="cron-form-field__label">${t("cron.timeoutSeconds")}</span>
                <input
                  type="text"
                  .value=${props.form.timeoutSeconds}
                  @input=${(e: Event) =>
                    props.onFormChange({
                      timeoutSeconds: (e.target as HTMLInputElement).value,
                    })}
                />
              </div>
              ${
                props.form.sessionTarget === "isolated"
                  ? html`
                    <div class="cron-form-field">
                      <span class="cron-form-field__label">${t("cron.postToMainPrefix")}</span>
                      <input
                        type="text"
                        .value=${props.form.postToMainPrefix}
                        @input=${(e: Event) =>
                          props.onFormChange({
                            postToMainPrefix: (e.target as HTMLInputElement).value,
                          })}
                      />
                    </div>
                  `
                  : nothing
              }
            </div>
          `
          : nothing
      }

      <!-- Submit -->
      <div style="margin-top:16px; display:flex; justify-content:flex-end;">
        <button class="cron-pill-btn cron-pill-btn--primary" ?disabled=${props.busy} @click=${props.onAdd}>
          ${_plusIcon()}
          ${props.busy ? t("common.loading") : t("cron.addJob")}
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// Schedule fields (dynamic based on kind)
// ============================================================================

function renderScheduleFields(props: CronProps) {
  const form = props.form;
  if (form.scheduleKind === "at") {
    return html`
      <div class="cron-form-field">
        <span class="cron-form-field__label">${t("cron.runAt")}</span>
        <input
          type="datetime-local"
          .value=${form.scheduleAt}
          @input=${(e: Event) =>
            props.onFormChange({
              scheduleAt: (e.target as HTMLInputElement).value,
            })}
        />
      </div>
    `;
  }
  if (form.scheduleKind === "every") {
    return html`
      <div class="cron-form-field">
        <span class="cron-form-field__label">${t("cron.scheduleEvery")}</span>
        <input
          type="text"
          .value=${form.everyAmount}
          @input=${(e: Event) =>
            props.onFormChange({
              everyAmount: (e.target as HTMLInputElement).value,
            })}
        />
      </div>
      <div class="cron-form-field">
        <span class="cron-form-field__label">${t("cron.unit")}</span>
        <select
          .value=${form.everyUnit}
          @change=${(e: Event) =>
            props.onFormChange({
              everyUnit: (e.target as HTMLSelectElement).value as CronFormState["everyUnit"],
            })}
        >
          <option value="minutes">${t("cron.unitMinutes")}</option>
          <option value="hours">${t("cron.unitHours")}</option>
          <option value="days">${t("cron.unitDays")}</option>
        </select>
      </div>
    `;
  }
  // cron expression
  return html`
    <div class="cron-form-field">
      <span class="cron-form-field__label">${t("cron.expression")}</span>
      <input
        type="text"
        .value=${form.cronExpr}
        @input=${(e: Event) => props.onFormChange({ cronExpr: (e.target as HTMLInputElement).value })}
      />
    </div>
    <div class="cron-form-field">
      <span class="cron-form-field__label">${t("cron.timezone")}</span>
      <input
        type="text"
        .value=${form.cronTz}
        @input=${(e: Event) => props.onFormChange({ cronTz: (e.target as HTMLInputElement).value })}
      />
    </div>
  `;
}

// ============================================================================
// Job card (glass card style like skills)
// ============================================================================

function renderJobCard(job: CronJob, props: CronProps) {
  const isSelected = props.runsJobId === job.id;
  return html`
    <div
      class="cron-glass-card ${isSelected ? "cron-glass-card--selected" : ""}"
      @click=${() => props.onLoadRuns(job.id)}
    >
      <div class="cron-glass-card__header">
        <div class="cron-glass-card__icon">${jobCardIcon(job)}</div>
        <div class="cron-glass-card__body">
          <div class="cron-glass-card__name-row">
            <span class="cron-glass-card__name">${job.name}</span>
            <span class="cron-glass-card__badge ${job.enabled ? "cron-glass-card__badge--enabled" : "cron-glass-card__badge--disabled"}">
              ${job.enabled ? t("common.enabled") : t("common.disabled")}
            </span>
          </div>
          <div class="cron-glass-card__desc">${formatCronSchedule(job)}</div>
          <div class="cron-glass-card__meta">
            <span class="cron-glass-card__meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              ${formatCronPayload(job)}
            </span>
            ${
              job.agentId
                ? html`<span class="cron-glass-card__meta-item">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="5"/><path d="M3 21v-2a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v2"/></svg>
                  ${job.agentId}
                </span>`
                : nothing
            }
            <span class="cron-glass-card__meta-item">${job.sessionTarget}</span>
            <span class="cron-glass-card__meta-item">${job.wakeMode}</span>
          </div>
          <div class="cron-glass-card__state">${formatCronState(job)}</div>
        </div>
      </div>
      <div class="cron-glass-card__divider"></div>
      <div class="cron-glass-card__footer">
        <button
          class="cron-pill-btn cron-pill-btn--sm cron-pill-btn--accent"
          ?disabled=${props.busy}
          @click=${(event: Event) => {
            event.stopPropagation();
            props.onToggle(job, !job.enabled);
          }}
        >${job.enabled ? t("common.disable") : t("common.enable")}</button>
        <button
          class="cron-pill-btn cron-pill-btn--sm"
          ?disabled=${props.busy}
          @click=${(event: Event) => {
            event.stopPropagation();
            props.onRun(job);
          }}
        >${t("cron.run")}</button>
        <button
          class="cron-pill-btn cron-pill-btn--sm"
          ?disabled=${props.busy}
          @click=${(event: Event) => {
            event.stopPropagation();
            props.onLoadRuns(job.id);
          }}
        >${t("cron.runs")}</button>
        <button
          class="cron-pill-btn cron-pill-btn--sm cron-pill-btn--danger"
          ?disabled=${props.busy}
          @click=${(event: Event) => {
            event.stopPropagation();
            props.onRemove(job);
          }}
        >${t("common.remove")}</button>
      </div>
    </div>
  `;
}

// ============================================================================
// Run history section
// ============================================================================

function renderRunHistory(props: CronProps) {
  return html`
    <div class="cron-glass-history">
      <div class="cron-glass-history__title">
        <span class="cron-glass-section__title-icon" style="color:#f59e0b;">
          ${_historyIcon()}
        </span>
        ${t("cron.runHistory")}
      </div>
      <div class="cron-glass-history__desc">
        ${t("cron.runHistoryDesc", { jobId: props.runsJobId ?? t("cron.selectJob") })}
      </div>
      ${
        props.runsJobId == null
          ? html`<div class="cron-glass-history__empty">${t("cron.selectJobHint")}</div>`
          : props.runs.length === 0
            ? html`<div class="cron-glass-history__empty">${t("cron.noRuns")}</div>`
            : props.runs.map((entry) => renderRunEntry(entry))
      }
    </div>
  `;
}

function renderRunEntry(entry: CronRunLogEntry) {
  const statusClass =
    entry.status === "ok"
      ? "cron-glass-run__status--ok"
      : entry.status === "error"
        ? "cron-glass-run__status--error"
        : "cron-glass-run__status--skipped";

  const statusIcon =
    entry.status === "ok"
      ? html`
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        `
      : entry.status === "error"
        ? html`
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          `
        : html`
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          `;

  return html`
    <div class="cron-glass-run">
      <div class="cron-glass-run__status ${statusClass}">
        ${statusIcon}
      </div>
      <div class="cron-glass-run__body">
        <div class="cron-glass-run__summary">${entry.summary ?? entry.status}</div>
        ${entry.error ? html`<div class="cron-glass-run__error">${entry.error}</div>` : nothing}
      </div>
      <div class="cron-glass-run__meta">
        <div class="cron-glass-run__time">${formatMs(entry.ts)}</div>
        <div class="cron-glass-run__duration">${entry.durationMs ?? 0}ms</div>
      </div>
    </div>
  `;
}

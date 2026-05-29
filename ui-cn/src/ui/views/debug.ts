import { html, nothing } from "lit";
import type { EventLogEntry } from "../app-events";
import { t } from "../i18n/index.js";
import { formatEventPayload } from "../presenter";

export type DebugProps = {
  loading: boolean;
  status: Record<string, unknown> | null;
  health: Record<string, unknown> | null;
  models: unknown[];
  heartbeat: unknown;
  eventLog: EventLogEntry[];
  callMethod: string;
  callParams: string;
  callResult: string | null;
  callError: string | null;
  onCallMethodChange: (next: string) => void;
  onCallParamsChange: (next: string) => void;
  onRefresh: () => void;
  onCall: () => void;
};

export function renderDebug(props: DebugProps) {
  const securityAudit =
    props.status && typeof props.status === "object"
      ? (props.status as { securityAudit?: { summary?: Record<string, number> } }).securityAudit
      : null;
  const securitySummary = securityAudit?.summary ?? null;
  const critical = securitySummary?.critical ?? 0;
  const warn = securitySummary?.warn ?? 0;
  const info = securitySummary?.info ?? 0;
  const securityTone = critical > 0 ? "danger" : warn > 0 ? "warn" : "success";
  const securityLabel =
    critical > 0
      ? t("debug.securityCritical", { count: critical })
      : warn > 0
        ? t("debug.securityWarnings", { count: warn })
        : t("debug.securityNoCritical");

  return html`
    <!-- 帮助说明卡片 -->
    <section class="card help-card">
      <details>
        <summary class="help-card__summary">
          ${t("debug.help.title")}
        </summary>
        <div class="help-card__content">
          <p class="help-card__text">${t("debug.help.description")}</p>
          
          <div class="help-card__section">
            <strong>${t("debug.help.snapshots")}</strong>
            <p class="help-card__text">${t("debug.help.snapshotsDesc")}</p>
          </div>
          
          <div class="help-card__section">
            <strong>${t("debug.help.rpc")}</strong>
            <p class="help-card__text">${t("debug.help.rpcDesc")}</p>
            <p class="help-card__hint">${t("debug.help.rpcExample")}</p>
          </div>
          
          <div class="help-card__section">
            <strong>${t("debug.help.commonMethods")}</strong>
            <ul class="help-card__list help-card__list--mono">
              <li>${t("debug.help.methodPresence")}</li>
              <li>${t("debug.help.methodHealth")}</li>
              <li>${t("debug.help.methodModelsList")}</li>
            </ul>
          </div>
        </div>
      </details>
    </section>

    <section class="grid grid-cols-2">
      <div class="card">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">${t("debug.snapshots")}</div>
            <div class="card-sub">${t("debug.snapshotsDesc")}</div>
          </div>
          <button class="btn" style="white-space: nowrap; flex-shrink: 0;" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? t("common.loading") : t("common.refresh")}
          </button>
        </div>
        <div class="stack" style="margin-top: 12px;">
          <div>
            <div class="muted">${t("debug.status")}</div>
            ${
              securitySummary
                ? html`<div class="callout ${securityTone}" style="margin-top: 8px;">
                  ${t("debug.securityAudit", { label: securityLabel })}${info > 0 ? ` · ${t("debug.securityInfo", { count: info })}` : ""}
                </div>`
                : nothing
            }
            <pre class="code-block">${JSON.stringify(props.status ?? {}, null, 2)}</pre>
          </div>
          <div>
            <div class="muted">${t("debug.health")}</div>
            <pre class="code-block">${JSON.stringify(props.health ?? {}, null, 2)}</pre>
          </div>
          <div>
            <div class="muted">${t("debug.lastHeartbeat")}</div>
            <pre class="code-block">${JSON.stringify(props.heartbeat ?? {}, null, 2)}</pre>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">${t("debug.manualRPC")}</div>
        <div class="card-sub">${t("debug.manualRPCDesc")}</div>
        <div style="display: grid; gap: 12px; margin-top: 16px;">
          <label class="field">
            <span>${t("debug.method")}</span>
            <input
              .value=${props.callMethod}
              @input=${(e: Event) => props.onCallMethodChange((e.target as HTMLInputElement).value)}
              placeholder="system-presence"
            />
          </label>
          <label class="field">
            <span>${t("debug.params")}</span>
            <textarea
              .value=${props.callParams}
              @input=${(e: Event) =>
                props.onCallParamsChange((e.target as HTMLTextAreaElement).value)}
              rows="8"
              style="font-family: var(--mono); font-size: 13px;"
            ></textarea>
          </label>
        </div>
        <div class="row" style="margin-top: 12px;">
          <button class="btn primary" @click=${props.onCall}>${t("debug.call")}</button>
        </div>
        ${
          props.callError
            ? html`<div class="callout danger" style="margin-top: 12px;">
              ${props.callError}
            </div>`
            : nothing
        }
        ${
          props.callResult
            ? html`<pre class="code-block" style="margin-top: 12px;">${props.callResult}</pre>`
            : nothing
        }
      </div>
    </section>

    <section class="card">
      <div class="card-title">${t("debug.models")}</div>
      <div class="card-sub">${t("debug.modelsDesc")}</div>
      <pre class="code-block" style="margin-top: 12px;">${JSON.stringify(
        props.models ?? [],
        null,
        2,
      )}</pre>
    </section>

    <section class="card">
      <div class="card-title">${t("debug.eventLog")}</div>
      <div class="card-sub">${t("debug.eventLogDesc")}</div>
      ${
        props.eventLog.length === 0
          ? html`<div class="muted" style="margin-top: 12px;">${t("debug.noEvents")}</div>`
          : html`
            <div class="list" style="margin-top: 12px;">
              ${props.eventLog.map(
                (evt) => html`
                  <div class="list-item">
                    <div class="list-main">
                      <div class="list-title">${evt.event}</div>
                      <div class="list-sub">${new Date(evt.ts).toLocaleTimeString()}</div>
                    </div>
                    <div class="list-meta">
                      <pre class="code-block">${formatEventPayload(evt.payload)}</pre>
                    </div>
                  </div>
                `,
              )}
            </div>
          `
      }
    </section>
  `;
}

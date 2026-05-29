import { html, nothing } from "lit";
import { t } from "../i18n/index.js";
import { formatPresenceAge, formatPresenceSummary } from "../presenter";
import type { PresenceEntry } from "../types";

export type InstancesProps = {
  loading: boolean;
  entries: PresenceEntry[];
  lastError: string | null;
  statusMessage: string | null;
  onRefresh: () => void;
};

export function renderInstances(props: InstancesProps) {
  return html`
    <section class="card" style="margin-bottom: 16px;">
      <div class="card-title">${t("instances.whatIsInstance")}</div>
      <div class="card-sub" style="margin-bottom: 10px;">${t("instances.description")}</div>
      <div style="font-size: 0.88em; color: var(--text-muted, #888); line-height: 1.7;">
        <div>&bull; ${t("instances.descGateway")}</div>
        <div>&bull; ${t("instances.descUI")}</div>
        <div>&bull; ${t("instances.descNode")}</div>
        <div>&bull; ${t("instances.descChips")}</div>
      </div>
    </section>
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("instances.connectedInstances")}</div>
          <div class="card-sub">${t("instances.subtitle")}</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? t("instances.loading") : t("instances.refresh")}
        </button>
      </div>
      ${
        props.lastError
          ? html`<div class="callout danger" style="margin-top: 12px;">
            ${props.lastError}
          </div>`
          : nothing
      }
      ${
        props.statusMessage
          ? html`<div class="callout" style="margin-top: 12px;">
            ${props.statusMessage}
          </div>`
          : nothing
      }
      ${
        props.entries.length === 0
          ? html`<div class="callout" style="margin-top: 16px;">
            <div class="muted">${t("instances.noInstances")}</div>
            <div class="muted" style="margin-top: 8px; font-size: 0.85em;">
              ${t("instances.networkingHint")}
            </div>
          </div>`
          : nothing
      }
      <div class="list" style="margin-top: 16px;">
        ${props.entries.map((entry) => renderEntry(entry))}
      </div>
    </section>
  `;
}

function renderEntry(entry: PresenceEntry) {
  const lastInput =
    entry.lastInputSeconds != null
      ? `${entry.lastInputSeconds}s ${t("instances.ago")}`
      : t("instances.na");
  const mode = entry.mode ?? t("instances.unknownMode");
  const roles = Array.isArray((entry as any).roles) ? (entry as any).roles.filter(Boolean) : [];
  const scopes = Array.isArray((entry as any).scopes) ? (entry as any).scopes.filter(Boolean) : [];
  const scopesLabel =
    scopes.length > 0
      ? scopes.length > 3
        ? t("instances.scopesCount").replace("{count}", String(scopes.length))
        : `${t("instances.scopes")}: ${scopes.join(", ")}`
      : null;
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${entry.host ?? t("instances.unknownHost")}</div>
        <div class="list-sub">${formatPresenceSummary(entry)}</div>
        <div class="chip-row">
          <span class="chip">${mode}</span>
          ${roles.map((role: string) => html`<span class="chip">${role}</span>`)}
          ${scopesLabel ? html`<span class="chip">${scopesLabel}</span>` : nothing}
          ${entry.platform ? html`<span class="chip">${entry.platform}</span>` : nothing}
          ${entry.deviceFamily ? html`<span class="chip">${entry.deviceFamily}</span>` : nothing}
          ${
            entry.modelIdentifier
              ? html`<span class="chip">${entry.modelIdentifier}</span>`
              : nothing
          }
          ${entry.version ? html`<span class="chip">${entry.version}</span>` : nothing}
        </div>
      </div>
      <div class="list-meta">
        <div>${formatPresenceAge(entry)}</div>
        <div class="muted">${t("instances.lastInput")} ${lastInput}</div>
        <div class="muted">${t("instances.reason")} ${entry.reason ?? ""}</div>
      </div>
    </div>
  `;
}

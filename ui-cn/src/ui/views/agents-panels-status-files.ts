import { html, nothing } from "lit";
import { formatRelativeTimestamp } from "../format.ts";
import { t } from "../i18n/index.js";
import {
  formatCronPayload,
  formatCronSchedule,
  formatCronState,
  formatNextRun,
} from "../presenter.ts";
import type {
  AgentFileEntry,
  AgentsFilesListResult,
  ChannelAccountSnapshot,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
} from "../types.ts";
import type { ChannelRouteEntry } from "./channels.types.ts";
import { formatBytes, type AgentContext } from "./agents-utils.ts";

function renderAgentContextCard(context: AgentContext, subtitle: string) {
  return html`
    <section class="card">
      <div class="card-title">${t("agents.contextTitle")}</div>
      <div class="card-sub">${subtitle}</div>
      <div class="agents-overview-grid" style="margin-top: 14px;">
        <div class="agent-kv">
          <div class="label">${t("agents.workspace")}</div>
          <div class="mono">${context.workspace}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.primaryModel")}</div>
          <div class="mono">${context.model}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.identityName")}</div>
          <div>${context.identityName}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.identityEmoji")}</div>
          <div>${context.identityEmoji}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.skillsFilter")}</div>
          <div>${context.skillsLabel}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("agents.default")}</div>
          <div>${context.isDefault ? t("agents.yes") : t("agents.no")}</div>
        </div>
      </div>
    </section>
  `;
}

type ChannelSummaryEntry = {
  id: string;
  label: string;
  accounts: ChannelAccountSnapshot[];
};

const CHANNEL_CN_LABELS: Record<string, string> = {
  feishu: "飞书",
  dingtalk: "钉钉",
  wecom: "企业微信",
  wechat: "微信",
  qq: "QQ",
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
  whatsapp: "WhatsApp",
  mattermost: "Mattermost",
};

function resolveChannelLabel(_snapshot: ChannelsStatusSnapshot, id: string) {
  return CHANNEL_CN_LABELS[id] ?? id;
}

function resolveChannelEntries(snapshot: ChannelsStatusSnapshot | null): ChannelSummaryEntry[] {
  if (!snapshot) {
    return [];
  }
  const ids = new Set<string>();
  for (const id of snapshot.channelOrder ?? []) {
    ids.add(id);
  }
  for (const entry of snapshot.channelMeta ?? []) {
    ids.add(entry.id);
  }
  for (const id of Object.keys(snapshot.channelAccounts ?? {})) {
    ids.add(id);
  }
  const ordered: string[] = [];
  const seed = snapshot.channelOrder?.length ? snapshot.channelOrder : Array.from(ids);
  for (const id of seed) {
    if (!ids.has(id)) {
      continue;
    }
    ordered.push(id);
    ids.delete(id);
  }
  for (const id of ids) {
    ordered.push(id);
  }
  return ordered.map((id) => ({
    id,
    label: resolveChannelLabel(snapshot, id),
    accounts: snapshot.channelAccounts?.[id] ?? [],
  }));
}

const CHANNEL_EXTRA_FIELDS = ["groupPolicy", "streamMode", "dmPolicy"] as const;

function resolveChannelConfigValue(
  configForm: Record<string, unknown> | null,
  channelId: string,
): Record<string, unknown> | null {
  if (!configForm) {
    return null;
  }
  const channels = (configForm.channels ?? {}) as Record<string, unknown>;
  const fromChannels = channels[channelId];
  if (fromChannels && typeof fromChannels === "object") {
    return fromChannels as Record<string, unknown>;
  }
  const fallback = configForm[channelId];
  if (fallback && typeof fallback === "object") {
    return fallback as Record<string, unknown>;
  }
  return null;
}

function formatChannelExtraValue(raw: unknown): string {
  if (raw == null) {
    return "n/a";
  }
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return "n/a";
  }
}

function resolveChannelExtras(
  configForm: Record<string, unknown> | null,
  channelId: string,
): Array<{ label: string; value: string }> {
  const value = resolveChannelConfigValue(configForm, channelId);
  if (!value) {
    return [];
  }
  return CHANNEL_EXTRA_FIELDS.flatMap((field) => {
    if (!(field in value)) {
      return [];
    }
    return [{ label: field, value: formatChannelExtraValue(value[field]) }];
  });
}

function summarizeChannelAccounts(accounts: ChannelAccountSnapshot[]) {
  let connected = 0;
  let configured = 0;
  let enabled = 0;
  for (const account of accounts) {
    const probeOk =
      account.probe && typeof account.probe === "object" && "ok" in account.probe
        ? Boolean((account.probe as { ok?: unknown }).ok)
        : false;
    const isConnected = account.connected === true || account.running === true || probeOk;
    if (isConnected) {
      connected += 1;
    }
    if (account.configured) {
      configured += 1;
    }
    if (account.enabled) {
      enabled += 1;
    }
  }
  return {
    total: accounts.length,
    connected,
    configured,
    enabled,
  };
}

export function renderAgentChannels(params: {
  agentId: string;
  context: AgentContext;
  configForm: Record<string, unknown> | null;
  snapshot: ChannelsStatusSnapshot | null;
  routeSummary: ChannelRouteEntry[] | null;
  loading: boolean;
  error: string | null;
  lastSuccess: number | null;
  onRefresh: () => void;
  dmScopeStatus?: {
    recommended: string;
    current: string;
    isExplicit: boolean;
    shouldUpgrade: boolean;
    reason: string;
    configuredChannelCount: number;
    totalAccounts: number;
    multiUserChannels: string[];
  } | null;
  onDmScopeApply?: () => void;
}) {
  // Filter routes to only those bound to this agent
  const agentRoutes = (params.routeSummary ?? []).filter(
    (r) => r.targetType === "agent" && r.targetId === params.agentId,
  );
  // Also include routes via team projects where this agent is the supervisor
  const projectRoutes = (params.routeSummary ?? []).filter(
    (r) => r.targetType === "project",
  );
  // For now, only show direct agent bindings (project routes are shown on team page)
  const boundChannelKeys = new Set(
    agentRoutes.map((r) => r.accountId ? `${r.channel}:${r.accountId}` : r.channel),
  );

  // Resolve channel entries that are bound to this agent
  const allEntries = resolveChannelEntries(params.snapshot);
  const boundEntries: Array<{
    id: string;
    label: string;
    accounts: ChannelAccountSnapshot[];
    routeAccountIds: Set<string>;
  }> = [];

  for (const route of agentRoutes) {
    const entry = allEntries.find((e) => e.id === route.channel);
    if (!entry) continue;
    // Find existing or create a bound entry for this channel
    let be = boundEntries.find((b) => b.id === route.channel);
    if (!be) {
      be = { id: entry.id, label: entry.label, accounts: entry.accounts, routeAccountIds: new Set() };
      boundEntries.push(be);
    }
    if (route.accountId) {
      be.routeAccountIds.add(route.accountId);
    }
  }

  const lastSuccessLabel = params.lastSuccess
    ? formatRelativeTimestamp(params.lastSuccess)
    : t("agents.never");
  return html`
    <section class="grid grid-cols-2">
      ${renderAgentContextCard(params.context, t("agents.contextChannelsSub"))}
      <section class="card">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">${t("agents.channelsTitle")}</div>
            <div class="card-sub">${t("agents.channelsBoundSub")}</div>
          </div>
          <button class="btn btn--sm" ?disabled=${params.loading} @click=${params.onRefresh}>
            ${params.loading ? t("agents.refreshing") : t("overview.refresh")}
          </button>
        </div>
        <div class="muted" style="margin-top: 8px;">
          ${t("agents.lastRefresh")} ${lastSuccessLabel}
        </div>
        ${
          params.dmScopeStatus?.shouldUpgrade
            ? html`
                <div class="callout warning" style="margin-top: 12px;">
                  <div style="font-weight: 600; margin-bottom: 4px;">${t("agents.dmScopeWarningTitle")}</div>
                  <div>${(() => {
                    const curKey = `config.value.session.dmScope.${params.dmScopeStatus!.current}`;
                    const recKey = `config.value.session.dmScope.${params.dmScopeStatus!.recommended}`;
                    const curLabel =
                      (t as (k: string) => string)(curKey) !== curKey
                        ? (t as (k: string) => string)(curKey)
                        : params.dmScopeStatus!.current;
                    const recLabel =
                      (t as (k: string) => string)(recKey) !== recKey
                        ? (t as (k: string) => string)(recKey)
                        : params.dmScopeStatus!.recommended;
                    return (t as (k: string, vars?: Record<string, string>) => string)(
                      "agents.dmScopeWarningBody",
                      {
                        current: curLabel,
                        recommended: recLabel,
                        channels: params.dmScopeStatus!.multiUserChannels.join(", ") || "-",
                      },
                    );
                  })()}</div>
                  ${
                    params.onDmScopeApply
                      ? html`<button class="btn btn--sm" style="margin-top: 8px;" @click=${params.onDmScopeApply}>${t("agents.dmScopeApply")}</button>`
                      : nothing
                  }
                </div>
              `
            : nothing
        }
        ${
          params.error
            ? html`<div class="callout danger" style="margin-top: 12px;">${params.error}</div>`
            : nothing
        }
        ${
          !params.snapshot
            ? html`
                <div class="callout info" style="margin-top: 12px">${t("agents.loadChannels")}</div>
              `
            : nothing
        }
        ${
          params.snapshot && boundEntries.length === 0
            ? html`
                <div class="callout info" style="margin-top: 16px">${t("agents.noChannelsBound")}</div>
              `
            : html`
                <div class="list" style="margin-top: 16px;">
                  ${boundEntries.map((entry) => {
                    // If specific accounts are bound, only show those
                    const accounts = entry.routeAccountIds.size > 0
                      ? entry.accounts.filter((a) => entry.routeAccountIds.has(a.accountId))
                      : entry.accounts;
                    const summary = summarizeChannelAccounts(accounts);
                    const status = summary.total
                      ? t("agents.connectedCount", {
                          connected: summary.connected,
                          total: summary.total,
                        })
                      : t("agents.noAccounts");
                    const config = summary.configured
                      ? t("agents.configuredCount", { count: summary.configured })
                      : t("agents.notConfigured");
                    const enabled = summary.total
                      ? t("agents.enabledCount", { count: summary.enabled })
                      : t("agents.channelDisabled");
                    const extras = resolveChannelExtras(params.configForm, entry.id);
                    return html`
                      <div class="list-item">
                        <div class="list-main">
                          <div class="list-title">${entry.label}</div>
                          <div class="list-sub mono">${entry.id}</div>
                        </div>
                        <div class="list-meta">
                          <div>${status}</div>
                          <div>${config}</div>
                          <div>${enabled}</div>
                          ${
                            extras.length > 0
                              ? extras.map(
                                  (extra) => html`<div>${extra.label}: ${extra.value}</div>`,
                                )
                              : nothing
                          }
                        </div>
                      </div>
                    `;
                  })}
                </div>
              `
        }
      </section>
    </section>
  `;
}

export function renderAgentCron(params: {
  context: AgentContext;
  agentId: string;
  jobs: CronJob[];
  status: CronStatus | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const jobs = params.jobs.filter((job) => job.agentId === params.agentId);
  return html`
    <section class="grid grid-cols-2">
      ${renderAgentContextCard(params.context, t("agents.contextCronSub"))}
      <section class="card">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">${t("agents.schedulerTitle")}</div>
            <div class="card-sub">${t("agents.schedulerSub")}</div>
          </div>
          <button class="btn btn--sm" ?disabled=${params.loading} @click=${params.onRefresh}>
            ${params.loading ? t("agents.refreshing") : t("overview.refresh")}
          </button>
        </div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat">
            <div class="stat-label">${t("agents.schedulerEnabled")}</div>
            <div class="stat-value">
              ${params.status ? (params.status.enabled ? t("agents.yes") : t("agents.no")) : "n/a"}
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("agents.jobs")}</div>
            <div class="stat-value">${params.status?.jobs ?? "n/a"}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${t("agents.nextWake")}</div>
            <div class="stat-value">${formatNextRun(params.status?.nextWakeAtMs ?? null)}</div>
          </div>
        </div>
        ${
          params.error
            ? html`<div class="callout danger" style="margin-top: 12px;">${params.error}</div>`
            : nothing
        }
      </section>
    </section>
    <section class="card">
      <div class="card-title">${t("agents.cronJobsTitle")}</div>
      <div class="card-sub">${t("agents.cronJobsSub")}</div>
      ${
        jobs.length === 0
          ? html`
              <div class="muted" style="margin-top: 16px">${t("agents.noJobs")}</div>
            `
          : html`
              <div class="list" style="margin-top: 16px;">
                ${jobs.map(
                  (job) => html`
                    <div class="list-item">
                      <div class="list-main">
                        <div class="list-title">${job.name}</div>
                        ${
                          job.description
                            ? html`<div class="list-sub">${job.description}</div>`
                            : nothing
                        }
                        <div class="chip-row" style="margin-top: 6px;">
                          <span class="chip">${formatCronSchedule(job)}</span>
                          <span class="chip ${job.enabled ? "chip-ok" : "chip-warn"}">
                            ${job.enabled ? t("agents.cronEnabled") : t("agents.cronDisabled")}
                          </span>
                          <span class="chip">${job.sessionTarget}</span>
                        </div>
                      </div>
                      <div class="list-meta">
                        <div class="mono">${formatCronState(job)}</div>
                        <div class="muted">${formatCronPayload(job)}</div>
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

export function renderAgentFiles(params: {
  agentId: string;
  agentFilesList: AgentsFilesListResult | null;
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;
  onLoadFiles: (agentId: string) => void;
  onSelectFile: (name: string) => void;
  onFileDraftChange: (name: string, content: string) => void;
  onFileReset: (name: string) => void;
  onFileSave: (name: string) => void;
}) {
  const list = params.agentFilesList?.agentId === params.agentId ? params.agentFilesList : null;
  const files = list?.files ?? [];
  const active = params.agentFileActive ?? null;
  const activeEntry = active ? (files.find((file) => file.name === active) ?? null) : null;
  const baseContent = active ? (params.agentFileContents[active] ?? "") : "";
  const draft = active ? (params.agentFileDrafts[active] ?? baseContent) : "";
  const isDirty = active ? draft !== baseContent : false;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">${t("agents.coreFiles")}</div>
          <div class="card-sub">${t("agents.coreFilesSub")}</div>
        </div>
        <button
          class="btn btn--sm"
          ?disabled=${params.agentFilesLoading}
          @click=${() => params.onLoadFiles(params.agentId)}
        >
          ${params.agentFilesLoading ? t("agents.loading") : t("overview.refresh")}
        </button>
      </div>
      ${
        list
          ? html`<div class="muted mono" style="margin-top: 8px;">${t("agents.workspaceLabel")} ${list.workspace}</div>`
          : nothing
      }
      ${
        params.agentFilesError
          ? html`<div class="callout danger" style="margin-top: 12px;">${params.agentFilesError}</div>`
          : nothing
      }
      ${
        !list
          ? html`
              <div class="callout info" style="margin-top: 12px">
                ${t("agents.loadFilesHint")}
              </div>
            `
          : html`
              <div class="agent-files-grid" style="margin-top: 16px;">
                <div class="agent-files-list">
                  ${
                    files.length === 0
                      ? html`
                          <div class="muted">${t("agents.noFiles")}</div>
                        `
                      : files.map((file) =>
                          renderAgentFileRow(file, active, () => params.onSelectFile(file.name)),
                        )
                  }
                </div>
                <div class="agent-files-editor">
                  ${
                    !activeEntry
                      ? html`
                          <div class="muted">${t("agents.selectFileHint")}</div>
                        `
                      : html`
                          <div class="agent-file-header">
                            <div>
                              <div class="agent-file-title mono">${activeEntry.name}</div>
                              <div class="agent-file-sub mono">${activeEntry.path}</div>
                            </div>
                            <div class="agent-file-actions">
                              <button
                                class="btn btn--sm"
                                ?disabled=${!isDirty}
                                @click=${() => params.onFileReset(activeEntry.name)}
                              >
                                ${t("agents.reset")}
                              </button>
                              <button
                                class="btn btn--sm primary"
                                ?disabled=${params.agentFileSaving || !isDirty}
                                @click=${() => params.onFileSave(activeEntry.name)}
                              >
                                ${params.agentFileSaving ? t("agents.saving") : t("agents.save")}
                              </button>
                            </div>
                          </div>
                          ${
                            activeEntry.missing
                              ? html`
                                  <div class="callout info" style="margin-top: 10px">
                                    ${t("agents.fileMissingHint")}
                                  </div>
                                `
                              : nothing
                          }
                          <label class="field" style="margin-top: 12px;">
                            <span>${t("agents.content")}</span>
                            <textarea
                              .value=${draft}
                              rows="12"
                              style="min-height: 200px; font-family: inherit; line-height: 1.6;"
                              @input=${(e: Event) =>
                                params.onFileDraftChange(
                                  activeEntry.name,
                                  (e.target as HTMLTextAreaElement).value,
                                )}
                            ></textarea>
                          </label>
                        `
                  }
                </div>
              </div>
            `
      }
    </section>
  `;
}

function renderAgentFileRow(file: AgentFileEntry, active: string | null, onSelect: () => void) {
  const status = file.missing
    ? t("agents.fileMissing")
    : `${formatBytes(file.size)} · ${formatRelativeTimestamp(file.updatedAtMs ?? null)}`;
  return html`
    <button
      type="button"
      class="agent-file-row ${active === file.name ? "active" : ""}"
      @click=${onSelect}
    >
      <div>
        <div class="agent-file-name mono">${file.name}</div>
        <div class="agent-file-meta">${status}</div>
      </div>
      ${
        file.missing
          ? html`
              <span class="agent-pill warn">${t("agents.missing")}</span>
            `
          : nothing
      }
    </button>
  `;
}

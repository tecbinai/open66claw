/**
 * Team Projects View
 *
 * Renders team project sidebar groups and project detail panels.
 * Pure render functions following the same pattern as agents.ts.
 */

import { html, nothing, type TemplateResult } from "lit";
import { t } from "../i18n/index.js";
import { icons } from "../icons.js";
import type {
  AgentsListResult,
  AgentIdentityResult,
  TeamProjectSummary,
  TeamProjectDetail,
  TeamProjectHealthResult,
  TeamProjectStatsResult,
  TeamSharedMemoryEntry,
  TeamMemberHealthState,
  TeamActivityEvent,
  ProjectWorkspaceFilesResult,
} from "../types.js";
import { normalizeAgentLabel, resolveAgentInitial } from "./agents-utils.js";

// ── Types ───────────────────────────────────────────────────────────────

export type ProjectDetailTab = "members" | "activity" | "stats" | "settings" | "memory" | "files";

export type ProjectSidebarProps = {
  projects: TeamProjectSummary[] | null;
  agents: AgentsListResult | null;
  agentIdentityById: Record<string, AgentIdentityResult>;
  selectedProjectId: string | null;
  selectedAgentId: string | null;
  defaultAgentId: string | null;
  collapsedProjects: Set<string>;
  onSelectProject: (projectId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onToggleCollapse: (projectId: string) => void;
  /** Delete all agents in an orphan orchestration group. */
  onDeleteOrchGroup?: (agentIds: string[]) => void;
};

export type ProjectDetailProps = {
  detail: TeamProjectDetail | null;
  detailLoading: boolean;
  health: TeamProjectHealthResult | null;
  stats: TeamProjectStatsResult | null;
  memory: TeamSharedMemoryEntry[] | null;
  activity: TeamActivityEvent[] | null;
  tab: ProjectDetailTab;
  busy: boolean;
  agentIdentityById: Record<string, AgentIdentityResult>;
  /** All available agents for "add member" picker */
  allAgents?: AgentsListResult | null;
  /** Error feedback for user-visible toast */
  error?: string | null;
  onSelectTab: (tab: ProjectDetailTab) => void;
  onPause: (projectId: string) => void;
  onResume: (projectId: string) => void;
  onDelete: (projectId: string) => void;
  onLoadStats: (projectId: string) => void;
  onLoadMemory: (projectId: string) => void;
  onClearMemory: (projectId: string) => void;
  onLoadActivity: (projectId: string) => void;
  onUpdateSettings?: (projectId: string, updates: Record<string, unknown>) => void;
  onRemoveMember?: (projectId: string, agentId: string) => void;
  onAddMember?: (projectId: string, agentId: string, name: string, role: string) => void;
  onSelectAgent?: (agentId: string) => void;
  onDismissError?: () => void;
  /** Workspace files grouped by member agent */
  files?: ProjectWorkspaceFilesResult | null;
  onLoadFiles?: (projectId: string) => void;
};

// ── Sidebar: Project Groups ─────────────────────────────────────────────

export function renderProjectSidebarGroups(
  props: ProjectSidebarProps,
): TemplateResult | typeof nothing {
  // Filter out federation meta-projects — they are invisible wrappers and
  // should never appear as separate entries in the sidebar.
  const projects = props.projects?.filter((p) => !p.isFederation) ?? null;
  const allAgents = props.agents?.agents ?? [];
  if (!projects || projects.length === 0) {
    // No projects — render all agents as standalone (handled by caller)
    return nothing;
  }

  // Build set of all agents that belong to at least one project
  const assignedAgentIds = new Set<string>();
  for (const p of projects) {
    for (const mid of p.memberIds) {
      assignedAgentIds.add(mid);
    }
  }

  // Standalone agents = not in any project
  const standaloneAgents = allAgents.filter((a) => !assignedAgentIds.has(a.id));

  // Collect orch prefixes that are already represented by a project.
  // If any project member has the same orch prefix, the orphan agents
  // with that prefix belong to the project and should not be shown separately.
  const assignedOrchPrefixes = new Set<string>();
  for (const id of assignedAgentIds) {
    const m = /^(orch-[^-]+-[^-]+)--/.exec(id);
    if (m) assignedOrchPrefixes.add(m[1]);
  }

  // Further split standalone agents: group orchestrator agents by orch prefix,
  // truly standalone agents are those without an orch- prefix.
  const orchGroups = new Map<string, typeof standaloneAgents>();
  const trulyStandalone: typeof standaloneAgents = [];
  for (const agent of standaloneAgents) {
    const orchMatch = /^(orch-[^-]+-[^-]+)--/.exec(agent.id);
    if (orchMatch) {
      const orchId = orchMatch[1];
      // If this orch prefix is already used by agents in a project, skip —
      // these agents logically belong to the project and should not show
      // as orphans.
      if (assignedOrchPrefixes.has(orchId)) continue;
      let group = orchGroups.get(orchId);
      if (!group) {
        group = [];
        orchGroups.set(orchId, group);
      }
      group.push(agent);
    } else {
      trulyStandalone.push(agent);
    }
  }

  return html`
    ${projects.map((project) => renderProjectGroup(project, props))}
    ${
      orchGroups.size > 0
        ? [...orchGroups.entries()].map(
            ([_orchId, agents]) => html`
      <div class="orch-group">
        <div class="orch-group-header">
          <span class="project-status-dot project-status-dot--warn"></span>
          <span class="orch-group-name">${t("team.orchGroup")}</span>
          <span class="project-group-count">${agents.length}</span>
          ${
            props.onDeleteOrchGroup
              ? html`
            <button
              type="button"
              class="orch-group-delete"
              title="${t("team.orchGroupDelete")}"
              @click=${(e: Event) => {
                e.stopPropagation();
                const ids = agents.map((a) => a.id);
                if (confirm(t("team.orchGroupDeleteConfirm", { count: ids.length }))) {
                  props.onDeleteOrchGroup!(ids);
                }
              }}
            >
              <svg viewBox="0 0 24 24" width="12" height="12"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" fill="none"/></svg>
            </button>
          `
              : nothing
          }
        </div>
        <div class="project-group-agents">
          ${agents.map((agent) => {
            const initial = resolveAgentInitial(agent, props.agentIdentityById[agent.id] ?? null);
            const isAgentSelected = props.selectedAgentId === agent.id && !props.selectedProjectId;
            return html`
              <button
                type="button"
                class="agent-row agent-row--nested ${isAgentSelected ? "active" : ""}"
                @click=${() => props.onSelectAgent(agent.id)}
              >
                <div class="agent-avatar agent-avatar--sm">${initial}</div>
                <div class="agent-info">
                  <div class="agent-title">${normalizeAgentLabel(agent)}</div>
                </div>
              </button>
            `;
          })}
        </div>
      </div>
    `,
          )
        : nothing
    }
    ${
      trulyStandalone.length > 0
        ? html`
      <div class="standalone-divider">
        <span>${t("team.standalone")}</span>
      </div>
      ${trulyStandalone.map((agent) => {
        const badge = agent.id === props.defaultAgentId ? t("agents.default") : null;
        const initial = resolveAgentInitial(agent, props.agentIdentityById[agent.id] ?? null);
        return html`
          <button
            type="button"
            class="agent-row ${props.selectedAgentId === agent.id && !props.selectedProjectId ? "active" : ""}"
            @click=${() => props.onSelectAgent(agent.id)}
          >
            <div class="agent-avatar">${initial}</div>
            <div class="agent-info">
              <div class="agent-title">${normalizeAgentLabel(agent)}</div>
              <div class="agent-sub mono">${agent.id}</div>
            </div>
            ${badge ? html`<span class="agent-pill">${badge}</span>` : nothing}
          </button>
        `;
      })}
    `
        : nothing
    }
  `;
}

function renderProjectGroup(
  project: TeamProjectSummary,
  props: ProjectSidebarProps,
): TemplateResult {
  const allAgents = props.agents?.agents ?? [];
  const agentMap = new Map(allAgents.map((a) => [a.id, a]));
  // Left join: show all memberIds, even if the agent hasn't appeared in agents.list yet
  const memberAgents = project.memberIds.map((id) => agentMap.get(id) ?? { id, name: id });
  const isCollapsed = props.collapsedProjects.has(project.projectId);
  const isSelected = props.selectedProjectId === project.projectId;

  return html`
    <div class="project-group ${isSelected ? "project-group--selected" : ""}">
      <div
        class="project-group-header"
        role="button"
        tabindex="0"
        @click=${() => {
          if (isSelected) {
            // Already selected — toggle collapse
            props.onToggleCollapse(project.projectId);
          } else {
            // Selecting a different project — select and ensure expanded
            props.onSelectProject(project.projectId);
            if (isCollapsed) props.onToggleCollapse(project.projectId);
          }
        }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (isSelected) {
              props.onToggleCollapse(project.projectId);
            } else {
              props.onSelectProject(project.projectId);
              if (isCollapsed) props.onToggleCollapse(project.projectId);
            }
          }
        }}
      >
        <span class="project-status-dot project-status-dot--${project.status}"></span>
        <span class="project-group-icon">${icons.users}</span>
        <span class="project-group-name">${project.name}</span>
        <span class="project-group-count">${project.memberCount}</span>
        <button
          type="button"
          class="project-group-chevron ${isCollapsed ? "collapsed" : ""}"
          @click=${(e: Event) => {
            e.stopPropagation();
            props.onToggleCollapse(project.projectId);
          }}
          aria-label="${t("team.members")}"
        >
          <svg viewBox="0 0 24 24" width="14" height="14"><path d="m6 9 6 6 6-6"/></svg>
        </button>
      </div>
      <div class="project-group-agents ${isCollapsed ? "project-group-agents--collapsed" : ""}">
        ${memberAgents.map((agent) => {
          const isSupervisor = agent.id === project.supervisorId;
          const initial = resolveAgentInitial(agent, props.agentIdentityById[agent.id] ?? null);
          const isAgentSelected = props.selectedAgentId === agent.id && !props.selectedProjectId;
          return html`
            <button
              type="button"
              class="agent-row agent-row--nested ${isSupervisor ? "agent-row--supervisor" : ""} ${isAgentSelected ? "active" : ""}"
              @click=${() => props.onSelectAgent(agent.id)}
            >
              <div class="agent-avatar agent-avatar--sm ${isSupervisor ? "agent-avatar--supervisor" : "agent-avatar--sub"}">${initial}</div>
              <div class="agent-info">
                <div class="agent-title">${normalizeAgentLabel(agent)}</div>
              </div>
              ${isSupervisor ? html`<span class="agent-pill ${project.autoSupervisor ? "auto-supervisor" : ""}">${t("team.supervisor")}</span>` : nothing}
            </button>
          `;
        })}
      </div>
    </div>
  `;
}

// ── Main Panel: Project Detail ──────────────────────────────────────────

export function renderProjectDetail(props: ProjectDetailProps): TemplateResult {
  if (props.detailLoading && !props.detail) {
    return html`<div class="card"><div class="muted">${t("agents.loading")}</div></div>`;
  }
  if (!props.detail) {
    return html`
      <div class="card">
        <div class="card-title">${t("team.detail.selectProject")}</div>
        <div class="card-sub">${t("team.detail.selectProjectHint")}</div>
      </div>
    `;
  }

  const project = props.detail.project;

  return html`
    ${
      props.error
        ? html`
      <div class="callout danger" style="margin-bottom: 8px;">
        ${props.error}
        ${
          props.onDismissError
            ? html`
          <button class="btn btn--xs" style="margin-left: 8px;" @click=${props.onDismissError}>×</button>
        `
            : nothing
        }
      </div>
    `
        : nothing
    }
    ${renderProjectHeader(project, props)}
    ${renderProjectTabs(props.tab, props.onSelectTab)}
    ${props.tab === "members" ? renderProjectMembers(project, props) : nothing}
    ${props.tab === "activity" ? renderProjectActivityPanel(project, props) : nothing}
    ${props.tab === "stats" ? renderProjectStatsPanel(project, props) : nothing}
    ${props.tab === "settings" ? renderProjectSettings(project, props) : nothing}
    ${props.tab === "memory" ? renderProjectMemoryPanel(project, props) : nothing}
    ${props.tab === "files" ? renderProjectFilesPanel(project, props) : nothing}
  `;
}

// ── Header ──────────────────────────────────────────────────────────────

function renderProjectHeader(
  project: TeamProjectDetail["project"],
  props: ProjectDetailProps,
): TemplateResult {
  const statusClass =
    project.status === "active"
      ? "ok"
      : project.status === "paused"
        ? "warn"
        : project.status === "error"
          ? "danger"
          : "";

  return html`
    <div class="card agent-header">
      <div class="agent-header-main">
        <div class="agent-avatar agent-avatar--lg">
          <span class="agent-avatar-icon">${icons.users}</span>
        </div>
        <div>
          <div class="card-title" style="margin-bottom: 4px;">${project.name}</div>
          <div class="card-sub">${project.description || "\u2014"}</div>
        </div>
      </div>
      <div class="agent-header-meta">
        <span class="agent-pill ${statusClass}">${t(`team.status.${project.status}` as any)}</span>
        ${
          project.status === "active"
            ? html`
          <button class="btn btn--sm btn--outline" ?disabled=${props.busy} @click=${() => props.onPause(project.projectId)}>
            ${t("team.action.pause")}
          </button>
        `
            : nothing
        }
        ${
          project.status === "paused"
            ? html`
          <button class="btn btn--sm" ?disabled=${props.busy} @click=${() => props.onResume(project.projectId)}>
            ${t("team.action.resume")}
          </button>
        `
            : nothing
        }
        <button
          class="btn btn--sm btn--danger"
          ?disabled=${props.busy}
          @click=${() => {
            if (
              confirm(
                (t as (k: string, v?: Record<string, string>) => string)(
                  "team.action.deleteConfirm",
                  { name: project.name },
                ),
              )
            ) {
              props.onDelete(project.projectId);
            }
          }}
        >${t("team.action.delete")}</button>
      </div>
    </div>
  `;
}

// ── Tabs ────────────────────────────────────────────────────────────────

function renderProjectTabs(
  active: ProjectDetailTab,
  onSelect: (tab: ProjectDetailTab) => void,
): TemplateResult {
  const tabs: { id: ProjectDetailTab; label: string }[] = [
    { id: "members", label: t("team.members") },
    { id: "activity", label: t("team.activity") },
    { id: "stats", label: t("team.stats") },
    { id: "settings", label: t("team.settings") },
    { id: "memory", label: t("team.memory") },
    { id: "files", label: t("team.files") },
  ];

  return html`
    <div class="agent-tabs">
      ${tabs.map(
        (tab) => html`
        <button
          type="button"
          class="agent-tab ${active === tab.id ? "active" : ""}"
          @click=${() => onSelect(tab.id)}
        >${tab.label}</button>
      `,
      )}
    </div>
  `;
}

// ── Tooltip helper ──────────────────────────────────────────────────────

function helpIcon(key: string): TemplateResult {
  return html`
    <span class="team-help-icon" title="${t(key as any)}">
      <svg viewBox="0 0 16 16" width="14" height="14" style="vertical-align: -2px; opacity: 0.5;">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <text x="8" y="12" text-anchor="middle" font-size="10" fill="currentColor">?</text>
      </svg>
    </span>
  `;
}

// ── Members (Enhanced) Panel ───────────────────────────────────────────

function renderProjectMembers(
  project: TeamProjectDetail["project"],
  props: ProjectDetailProps,
): TemplateResult {
  const health = props.health;
  const members = project.members;

  // Find agents not yet in this project (for "add member" picker)
  const allAgentsList = props.allAgents?.agents ?? [];
  const memberIdSet = new Set(project.memberIds);
  const availableAgents = allAgentsList.filter((a) => !memberIdSet.has(a.id));

  return html`
    <div class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 12px;">
        <div class="card-title">${t("team.members")} (${members.length})</div>
        ${
          props.onAddMember && availableAgents.length > 0
            ? html`
          <div class="project-add-member-row">
            <select
              class="input input--sm"
              id="add-member-select"
              ?disabled=${props.busy}
            >
              <option value="">${t("team.action.addMemberHint")}</option>
              ${availableAgents.map(
                (a) => html`
                <option value="${a.id}">${normalizeAgentLabel(a)}</option>
              `,
              )}
            </select>
            <button
              class="btn btn--sm"
              ?disabled=${props.busy}
              @click=${() => {
                const sel = document.getElementById(
                  "add-member-select",
                ) as HTMLSelectElement | null;
                if (!sel || !sel.value) return;
                const agent = allAgentsList.find((a) => a.id === sel.value);
                if (!agent) return;
                const name = normalizeAgentLabel(agent);
                props.onAddMember!(project.projectId, agent.id, name, "");
                sel.value = "";
              }}
            >${t("team.action.addMember")}</button>
          </div>
        `
            : nothing
        }
      </div>
      <div class="project-members-cards">
        ${(() => {
          const supervisor = members.find((m) => m.id === project.supervisorId);
          const workers = members.filter((m) => m.id !== project.supervisorId);

          const renderMemberCard = (m: (typeof members)[0], isSupervisor: boolean) => {
            const h = health?.members.find((hm) => hm.agentId === m.id);
            const state: TeamMemberHealthState = h?.state ?? "healthy";
            const identity = props.agentIdentityById[m.id];
            const nameInitial = [...(m.name || m.id)][0]?.toUpperCase() ?? "A";
            const toolProfile = m.toolProfile ?? "";
            const modelTier = m.modelTier ?? "";
            const keywords = m.keywords ?? [];

            return html`
              <div class="project-member-card ${isSupervisor ? "project-member-card--supervisor" : ""}">
                <div class="project-member-card-header">
                  <div class="agent-avatar agent-avatar--sm ${isSupervisor ? "agent-avatar--supervisor" : "agent-avatar--sub"}">${nameInitial}</div>
                  <div class="project-member-card-info">
                    <div class="agent-title">
                      ${m.name}
                      ${isSupervisor ? html`<span class="agent-pill ${project.autoSupervisor ? "auto-supervisor" : ""}" style="margin-left: 6px;">${t("team.supervisor")}</span>` : nothing}
                    </div>
                    <div class="agent-sub">${m.role}</div>
                  </div>
                  <span class="project-health-badge project-health-badge--${state}">
                    <span class="project-status-dot project-status-dot--${state === "healthy" ? "active" : state === "degraded" ? "paused" : "error"}"></span>
                    ${t(`team.health.${state}` as any)}
                  </span>
                </div>
                <div class="project-member-card-meta">
                  ${modelTier ? html`<span class="agent-pill" title="${t("team.detail.modelTier")}">${modelTier}</span>` : nothing}
                  ${toolProfile ? html`<span class="agent-pill" title="${t("team.detail.toolProfile")}">${toolProfile}</span>` : nothing}
                  ${
                    (h?.totalSuccesses ?? 0) > 0 || (h?.totalFailures ?? 0) > 0
                      ? html`
                    <span class="mono" style="font-size: 11px; color: var(--muted);">
                      ${h?.totalSuccesses ?? 0}/${(h?.totalSuccesses ?? 0) + (h?.totalFailures ?? 0)}
                    </span>
                  `
                      : nothing
                  }
                </div>
                ${
                  keywords.length > 0
                    ? html`
                  <div class="project-member-card-keywords">
                    ${keywords.slice(0, 6).map((kw) => html`<span class="keyword-chip">${kw}</span>`)}
                    ${keywords.length > 6 ? html`<span class="keyword-chip">+${keywords.length - 6}</span>` : nothing}
                  </div>
                `
                    : nothing
                }
                ${
                  h?.lastError
                    ? html`
                  <div class="agent-sub" style="margin-top: 4px; color: var(--danger); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${h.lastError}">${h.lastError}</div>
                `
                    : nothing
                }
                <div class="project-member-card-actions">
                  ${
                    props.onSelectAgent
                      ? html`
                    <button class="btn btn--xs btn--outline" @click=${() => props.onSelectAgent!(m.id)}>${t("team.action.chat")}</button>
                  `
                      : nothing
                  }
                  ${
                    !isSupervisor && props.onRemoveMember
                      ? html`
                    <button
                      class="btn btn--xs btn--danger"
                      ?disabled=${props.busy}
                      @click=${() => {
                        if (
                          confirm(
                            (t as (k: string, v?: Record<string, string>) => string)(
                              "team.action.removeMemberConfirm",
                              { name: m.name },
                            ),
                          )
                        ) {
                          props.onRemoveMember!(project.projectId, m.id);
                        }
                      }}
                    >${t("team.action.remove")}</button>
                  `
                      : nothing
                  }
                </div>
              </div>
            `;
          };

          return html`
            ${
              supervisor
                ? html`
              <div class="project-members-divider">${t("team.supervisor")}</div>
              ${renderMemberCard(supervisor, true)}
            `
                : nothing
            }
            ${
              workers.length > 0
                ? html`
              <div class="project-members-divider">${t("team.members")}</div>
              ${workers.map((m) => renderMemberCard(m, false))}
            `
                : nothing
            }
          `;
        })()}
      </div>
    </div>
  `;
}

// ── Activity Feed Panel ─────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatRouteMethod(method: string): string {
  const key =
    `team.activity.routeMethod.${method === "supervisor-llm" ? "supervisorLlm" : method}` as any;
  return t(key) || method;
}

function renderProjectActivityPanel(
  project: TeamProjectDetail["project"],
  props: ProjectDetailProps,
): TemplateResult {
  const events = props.activity;

  if (events === null) {
    return html`<div class="card"><div class="muted">${t("agents.loading")}</div></div>`;
  }

  if (events.length === 0) {
    return html`
      <div class="card">
        <div class="muted">${t("team.activity.noEvents")}</div>
      </div>
    `;
  }

  return html`
    <div class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 12px;">
        <div class="card-title">${t("team.activity")}</div>
        <span class="team-activity-live">
          <span class="team-activity-live-dot"></span>
          ${t("team.activity.live")}
        </span>
      </div>
      <div class="team-activity-feed">
        ${events.map((ev) => {
          const member = project.members.find((m) => m.id === ev.agentId);
          const name = ev.agentName || member?.name || ev.agentId;
          const nameInitial = [...name][0]?.toUpperCase() ?? "A";
          const statusClass = ev.success === false ? "danger" : ev.error ? "warn" : "ok";
          const statusText =
            ev.success === false
              ? ev.error
                ? t("team.activity.failed")
                : t("team.activity.timeout")
              : t("team.activity.success");

          return html`
            <div class="team-activity-event">
              <div class="team-activity-event-time mono">${formatTime(ev.timestamp)}</div>
              <div class="team-activity-event-line"></div>
              <div class="team-activity-event-body">
                <div class="team-activity-event-header">
                  <span class="agent-avatar agent-avatar--xs">${nameInitial}</span>
                  <span class="agent-title" style="font-size: 13px;">${name}</span>
                  <span class="agent-sub" style="margin-left: 4px;">${t("team.activity.replied")} ${ev.peerId ?? ""}</span>
                </div>
                ${
                  ev.replySummary
                    ? html`
                  <div class="team-activity-event-summary">${ev.replySummary}</div>
                `
                    : nothing
                }
                <div class="team-activity-event-meta">
                  <span class="keyword-chip">${formatRouteMethod(ev.method)}</span>
                  ${ev.matchedPattern ? html`<span class="keyword-chip">"${ev.matchedPattern}"</span>` : nothing}
                  <span class="keyword-chip">${(ev.confidence * 100).toFixed(0)}%</span>
                  ${ev.durationMs != null ? html`<span class="mono" style="font-size: 11px; color: var(--muted);">${(ev.durationMs / 1000).toFixed(1)}s</span>` : nothing}
                  <span class="agent-pill ${statusClass}" style="font-size: 10px;">${statusText}</span>
                </div>
              </div>
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

// ── Stats Panel ─────────────────────────────────────────────────────────

function renderProjectStatsPanel(
  project: TeamProjectDetail["project"],
  props: ProjectDetailProps,
): TemplateResult {
  const stats = props.stats;

  if (!stats) {
    return html`<div class="card"><div class="muted">${t("agents.loading")}</div></div>`;
  }

  const maxCalls = Math.max(...stats.members.map((m) => m.callCount), 1);

  return html`
    <div class="card">
      <div class="agents-overview-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 16px;">
        <div class="agent-kv">
          <div class="label">${t("team.detail.totalCalls")}</div>
          <div>${stats.totalCalls}</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("team.detail.avgDuration")}</div>
          <div>${stats.avgDurationMs}ms</div>
        </div>
        <div class="agent-kv">
          <div class="label">${t("team.members")}</div>
          <div>${stats.members.length}</div>
        </div>
      </div>
      <div class="card-title" style="margin-bottom: 12px;">${t("team.detail.callCount")}</div>
      ${stats.members.map((m) => {
        const member = project.members.find((pm) => pm.id === m.agentId);
        const pct = maxCalls > 0 ? Math.round((m.callCount / maxCalls) * 100) : 0;
        return html`
          <div class="project-stat-row">
            <span class="project-stat-label">${member?.name ?? m.agentId}</span>
            <div class="project-stat-bar-bg">
              <div class="project-stat-bar" style="width: ${pct}%;"></div>
            </div>
            <span class="project-stat-value mono">${m.callCount}</span>
            <span class="agent-sub">${m.avgDurationMs}ms ${t("team.detail.msAvg")}</span>
          </div>
        `;
      })}
    </div>
  `;
}

// ── Settings Panel (Editable, with tooltips + new sections) ─────────────

function renderProjectSettings(
  project: TeamProjectDetail["project"],
  props: ProjectDetailProps,
): TemplateResult {
  const bindings = project.bindings ?? [];
  const canEdit = !!props.onUpdateSettings;
  const constraints = (project as any).constraints as
    | { brandRules?: { userAddress?: string; forbidden?: string[]; safetyRules?: string[] } }
    | undefined;
  const fastPath = project.coordination.fastPath as
    | {
        sessionAffinityEnabled?: boolean;
        affinityTimeoutMinutes?: number;
        keywordConfidenceThreshold?: number;
      }
    | undefined;

  const handleSave = (field: string, value: unknown) => {
    if (!props.onUpdateSettings) return;
    // Backend expects nested objects for coordination/visibility fields
    const coordFields = [
      "supervisorStyle",
      "hopLimit",
      "memberTimeoutSeconds",
      "supervisorFallbackEnabled",
      "handoffStyle",
    ];
    const fastPathFields = [
      "sessionAffinityEnabled",
      "affinityTimeoutMinutes",
      "keywordConfidenceThreshold",
    ];
    if (coordFields.includes(field)) {
      props.onUpdateSettings(project.projectId, { coordination: { [field]: value } });
    } else if (fastPathFields.includes(field)) {
      props.onUpdateSettings(project.projectId, { coordination: { fastPath: { [field]: value } } });
    } else if (field === "visibilityMode") {
      props.onUpdateSettings(project.projectId, { visibility: { mode: value } });
    } else if (field === "displayName") {
      props.onUpdateSettings(project.projectId, { visibility: { displayName: value } });
    } else if (field === "displayEmoji") {
      props.onUpdateSettings(project.projectId, { visibility: { displayEmoji: value } });
    } else if (field === "description") {
      props.onUpdateSettings(project.projectId, { description: value });
    } else if (field === "userAddress") {
      props.onUpdateSettings(project.projectId, {
        constraints: { brandRules: { userAddress: value } },
      });
    } else if (field === "forbidden") {
      props.onUpdateSettings(project.projectId, {
        constraints: { brandRules: { forbidden: value } },
      });
    } else if (field === "safetyRules") {
      props.onUpdateSettings(project.projectId, {
        constraints: { brandRules: { safetyRules: value } },
      });
    } else {
      props.onUpdateSettings(project.projectId, { [field]: value });
    }
  };

  return html`
    <!-- Basic Info -->
    <div class="card">
      <div class="card-title" style="margin-bottom: 12px;">${t("team.detail.description")}</div>
      <div class="project-settings-grid">
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.displayName")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <input
                type="text"
                class="input input--sm"
                .value=${project.visibility.displayName ?? ""}
                placeholder="${project.name}"
                @change=${(e: Event) => handleSave("displayName", (e.target as HTMLInputElement).value)}
                ?disabled=${props.busy}
              />
            `
                : html`<span>${project.visibility.displayName || project.name}</span>`
            }
          </div>
        </div>
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.displayEmoji")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <input
                type="text"
                class="input input--sm"
                style="width: 60px;"
                .value=${project.visibility.displayEmoji ?? ""}
                @change=${(e: Event) => handleSave("displayEmoji", (e.target as HTMLInputElement).value)}
                ?disabled=${props.busy}
              />
            `
                : html`<span>${project.visibility.displayEmoji || "\u2014"}</span>`
            }
          </div>
        </div>
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.description")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <input
                type="text"
                class="input input--sm"
                .value=${project.description ?? ""}
                @change=${(e: Event) => handleSave("description", (e.target as HTMLInputElement).value)}
                ?disabled=${props.busy}
              />
            `
                : html`<span>${project.description || "\u2014"}</span>`
            }
          </div>
        </div>
      </div>
    </div>

    <!-- Coordination -->
    <div class="card" style="margin-top: 12px;">
      <div class="card-title" style="margin-bottom: 12px;">${t("team.detail.coordinationStyle")}</div>
      <div class="project-settings-grid">
        <!-- Supervisor -->
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.supervisor")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <select
                class="input input--sm"
                .value=${project.supervisorId}
                @change=${(e: Event) => handleSave("supervisorId", (e.target as HTMLSelectElement).value)}
                ?disabled=${props.busy}
              >
                ${project.members.map(
                  (m) => html`
                  <option value="${m.id}" ?selected=${m.id === project.supervisorId}>${m.name}</option>
                `,
                )}
              </select>
            `
                : html`<span>${project.members.find((m) => m.id === project.supervisorId)?.name ?? project.supervisorId}</span>`
            }
          </div>
        </div>

        <!-- Visibility -->
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.visibility")} ${helpIcon("team.help.visibility")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <select
                class="input input--sm"
                .value=${project.visibility.mode}
                @change=${(e: Event) => handleSave("visibilityMode", (e.target as HTMLSelectElement).value)}
                ?disabled=${props.busy}
              >
                <option value="unified" ?selected=${project.visibility.mode === "unified"}>${t("team.visibility.unified")}</option>
                <option value="team" ?selected=${project.visibility.mode === "team"}>${t("team.visibility.team")}</option>
                <option value="transparent" ?selected=${project.visibility.mode === "transparent"}>${t("team.visibility.transparent")}</option>
              </select>
            `
                : html`<span>${t(`team.visibility.${project.visibility.mode}` as any)}</span>`
            }
          </div>
        </div>

        <!-- Coordination Style -->
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.coordinationStyle")} ${helpIcon("team.help.coordination")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <select
                class="input input--sm"
                .value=${project.coordination.supervisorStyle}
                @change=${(e: Event) => handleSave("supervisorStyle", (e.target as HTMLSelectElement).value)}
                ?disabled=${props.busy}
              >
                <option value="concierge" ?selected=${project.coordination.supervisorStyle === "concierge"}>${t("team.coordination.concierge")}</option>
                <option value="delegate-only" ?selected=${project.coordination.supervisorStyle === "delegate-only"}>${t("team.coordination.delegateOnly")}</option>
              </select>
            `
                : html`<span>${t(`team.coordination.${project.coordination.supervisorStyle === "delegate-only" ? "delegateOnly" : project.coordination.supervisorStyle}` as any)}</span>`
            }
          </div>
        </div>

        <!-- Handoff Style -->
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.handoffStyle")} ${helpIcon("team.help.handoff")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <select
                class="input input--sm"
                .value=${project.coordination.handoffStyle ?? "notify"}
                @change=${(e: Event) => handleSave("handoffStyle", (e.target as HTMLSelectElement).value)}
                ?disabled=${props.busy}
              >
                <option value="silent" ?selected=${project.coordination.handoffStyle === "silent"}>${t("team.handoff.silent")}</option>
                <option value="notify" ?selected=${project.coordination.handoffStyle === "notify" || !project.coordination.handoffStyle}>${t("team.handoff.notify")}</option>
                <option value="introduce" ?selected=${project.coordination.handoffStyle === "introduce"}>${t("team.handoff.introduce")}</option>
              </select>
            `
                : html`<span>${t(`team.handoff.${project.coordination.handoffStyle ?? "notify"}` as any)}</span>`
            }
          </div>
        </div>

        <!-- Memory Mode -->
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.memoryMode")} ${helpIcon("team.help.memoryMode")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <select
                class="input input--sm"
                .value=${project.memory.mode}
                @change=${(e: Event) => handleSave("memoryMode", (e.target as HTMLSelectElement).value)}
                ?disabled=${props.busy}
              >
                <option value="isolated" ?selected=${project.memory.mode === "isolated"}>${t("team.memory.isolated")}</option>
                <option value="read-shared" ?selected=${project.memory.mode === "read-shared"}>${t("team.memory.readShared")}</option>
              </select>
            `
                : html`<span>${t(`team.memory.${project.memory.mode === "read-shared" ? "readShared" : project.memory.mode}` as any)}</span>`
            }
          </div>
        </div>
      </div>
    </div>

    <!-- Safety / Limits -->
    <div class="card" style="margin-top: 12px;">
      <div class="card-title" style="margin-bottom: 12px;">${t("team.detail.hopLimit")}</div>
      <div class="project-settings-grid">
        <!-- Hop Limit -->
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.hopLimit")} ${helpIcon("team.help.hopLimit")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <input
                type="number"
                class="input input--sm"
                style="width: 80px;"
                .value=${String(project.coordination.hopLimit)}
                min="1" max="20"
                @change=${(e: Event) => handleSave("hopLimit", Number((e.target as HTMLInputElement).value))}
                ?disabled=${props.busy}
              />
            `
                : html`<span>${project.coordination.hopLimit}</span>`
            }
          </div>
        </div>

        <!-- Member Timeout -->
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.memberTimeout")} ${helpIcon("team.help.memberTimeout")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <input
                type="number"
                class="input input--sm"
                style="width: 80px;"
                .value=${String(project.coordination.memberTimeoutSeconds)}
                min="5" max="300"
                @change=${(e: Event) => handleSave("memberTimeoutSeconds", Number((e.target as HTMLInputElement).value))}
                ?disabled=${props.busy}
              /><span class="agent-sub" style="margin-left: 4px;">s</span>
            `
                : html`<span>${project.coordination.memberTimeoutSeconds}s</span>`
            }
          </div>
        </div>

        <!-- Supervisor Fallback -->
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.supervisorFallback")} ${helpIcon("team.help.fallback")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <label class="toggle-label">
                <input
                  type="checkbox"
                  .checked=${project.coordination.supervisorFallbackEnabled}
                  @change=${(e: Event) => handleSave("supervisorFallbackEnabled", (e.target as HTMLInputElement).checked)}
                  ?disabled=${props.busy}
                />
                <span>${project.coordination.supervisorFallbackEnabled ? t("agents.yes") : t("agents.no")}</span>
              </label>
            `
                : html`<span>${project.coordination.supervisorFallbackEnabled ? t("agents.yes") : t("agents.no")}</span>`
            }
          </div>
        </div>
      </div>
    </div>

    <!-- Fast Path / Routing Tuning -->
    <div class="card" style="margin-top: 12px;">
      <div class="card-title" style="margin-bottom: 12px;">${t("team.detail.fastPath")}</div>
      <div class="project-settings-grid">
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.affinityEnabled")} ${helpIcon("team.help.affinity")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <label class="toggle-label">
                <input
                  type="checkbox"
                  .checked=${fastPath?.sessionAffinityEnabled !== false}
                  @change=${(e: Event) => handleSave("sessionAffinityEnabled", (e.target as HTMLInputElement).checked)}
                  ?disabled=${props.busy}
                />
                <span>${fastPath?.sessionAffinityEnabled !== false ? t("agents.yes") : t("agents.no")}</span>
              </label>
            `
                : html`<span>${fastPath?.sessionAffinityEnabled !== false ? t("agents.yes") : t("agents.no")}</span>`
            }
          </div>
        </div>
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.affinityTimeout")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <input
                type="number"
                class="input input--sm"
                style="width: 80px;"
                .value=${String(fastPath?.affinityTimeoutMinutes ?? 30)}
                min="1" max="1440"
                @change=${(e: Event) => handleSave("affinityTimeoutMinutes", Number((e.target as HTMLInputElement).value))}
                ?disabled=${props.busy}
              />
            `
                : html`<span>${fastPath?.affinityTimeoutMinutes ?? 30}</span>`
            }
          </div>
        </div>
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.keywordThreshold")} ${helpIcon("team.help.confidence")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <input
                type="number"
                class="input input--sm"
                style="width: 80px;"
                .value=${String(fastPath?.keywordConfidenceThreshold ?? 0.15)}
                min="0" max="1" step="0.05"
                @change=${(e: Event) => handleSave("keywordConfidenceThreshold", Number((e.target as HTMLInputElement).value))}
                ?disabled=${props.busy}
              />
            `
                : html`<span>${fastPath?.keywordConfidenceThreshold ?? 0.15}</span>`
            }
          </div>
        </div>
      </div>
    </div>

    <!-- Brand Rules -->
    <div class="card" style="margin-top: 12px;">
      <div class="card-title" style="margin-bottom: 12px;">${t("team.detail.brandRules")}</div>
      <div class="project-settings-grid">
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.userAddress")}</label>
          <div class="project-settings-value">
            ${
              canEdit
                ? html`
              <input
                type="text"
                class="input input--sm"
                style="width: 120px;"
                .value=${constraints?.brandRules?.userAddress ?? ""}
                placeholder="\u60a8"
                @change=${(e: Event) => handleSave("userAddress", (e.target as HTMLInputElement).value)}
                ?disabled=${props.busy}
              />
            `
                : html`<span>${constraints?.brandRules?.userAddress || "\u2014"}</span>`
            }
          </div>
        </div>
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.forbidden")}</label>
          <div class="project-settings-value">
            <div class="project-tag-list">
              ${(constraints?.brandRules?.forbidden ?? []).map(
                (word, idx) => html`
                <span class="keyword-chip">
                  ${word}
                  ${
                    canEdit
                      ? html`<button class="keyword-chip-remove" @click=${() => {
                          const next = [...(constraints?.brandRules?.forbidden ?? [])];
                          next.splice(idx, 1);
                          handleSave("forbidden", next);
                        }}>\u00d7</button>`
                      : nothing
                  }
                </span>
              `,
              )}
              ${
                canEdit
                  ? html`
                <input
                  type="text"
                  class="input input--sm"
                  style="width: 100px;"
                  placeholder="${t("team.detail.addItem")}"
                  ?disabled=${props.busy}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                      const inp = e.target as HTMLInputElement;
                      const val = inp.value.trim();
                      if (!val) return;
                      const next = [...(constraints?.brandRules?.forbidden ?? []), val];
                      handleSave("forbidden", next);
                      inp.value = "";
                    }
                  }}
                />
              `
                  : nothing
              }
            </div>
          </div>
        </div>
        <div class="project-settings-row">
          <label class="project-settings-label">${t("team.detail.safetyRules")}</label>
          <div class="project-settings-value">
            <div class="project-tag-list">
              ${(constraints?.brandRules?.safetyRules ?? []).map(
                (rule, idx) => html`
                <span class="keyword-chip">
                  ${rule}
                  ${
                    canEdit
                      ? html`<button class="keyword-chip-remove" @click=${() => {
                          const next = [...(constraints?.brandRules?.safetyRules ?? [])];
                          next.splice(idx, 1);
                          handleSave("safetyRules", next);
                        }}>\u00d7</button>`
                      : nothing
                  }
                </span>
              `,
              )}
              ${
                canEdit
                  ? html`
                <input
                  type="text"
                  class="input input--sm"
                  style="width: 200px;"
                  placeholder="${t("team.detail.addItem")}"
                  ?disabled=${props.busy}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                      const inp = e.target as HTMLInputElement;
                      const val = inp.value.trim();
                      if (!val) return;
                      const next = [...(constraints?.brandRules?.safetyRules ?? []), val];
                      handleSave("safetyRules", next);
                      inp.value = "";
                    }
                  }}
                />
              `
                  : nothing
              }
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bound Channels -->
    <div class="card" style="margin-top: 12px;">
      <div class="card-title" style="margin-bottom: 12px;">${t("team.detail.boundChannels")}</div>
      ${
        bindings.length > 0
          ? html`
          <div class="project-binding-chips">
            ${bindings.map(
              (b) => html`
                <span class="agent-pill">
                  ${b.channel}${b.accountId ? ` (${b.accountId})` : ""}
                </span>
              `,
            )}
          </div>
        `
          : html`
          <div class="muted">${t("team.detail.noBindings")}</div>
        `
      }
    </div>
  `;
}

// ── Memory Panel ────────────────────────────────────────────────────────

function renderProjectMemoryPanel(
  project: TeamProjectDetail["project"],
  props: ProjectDetailProps,
): TemplateResult {
  const memory = props.memory;
  const memoryMode = project.memory?.mode ?? "isolated";

  // Show clear explanation when memory mode is isolated
  if (memoryMode !== "read-shared") {
    return html`
      <div class="card">
        <div class="callout" style="text-align: center;">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 6px;">${t("team.detail.memoryIsolated")}</div>
          <div class="muted" style="font-size: 12px;">${t("team.detail.memoryIsolatedHint")}</div>
        </div>
      </div>
    `;
  }

  if (memory === null) {
    return html`<div class="card"><div class="muted">${t("agents.loading")}</div></div>`;
  }

  if (memory.length === 0) {
    return html`
      <div class="card">
        <div class="muted">${t("team.detail.noMemory")}</div>
      </div>
    `;
  }

  return html`
    <div class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 12px;">
        <div class="card-title">${t("team.memory")} (${memory.length})</div>
        <button
          class="btn btn--sm btn--danger"
          ?disabled=${props.busy}
          @click=${() => props.onClearMemory(project.projectId)}
        >${t("team.detail.clearMemory")}</button>
      </div>
      <div class="project-memory-list">
        ${memory.map(
          (entry) => html`
          <div class="project-memory-entry">
            <div class="project-memory-key mono">${entry.key}</div>
            <div class="project-memory-value">${entry.value}</div>
            ${entry.agentId ? html`<div class="agent-sub">${t("team.detail.memoryBy")} ${entry.agentId}</div>` : nothing}
          </div>
        `,
        )}
      </div>
    </div>
  `;
}

// ── Files Panel ─────────────────────────────────────────────────────────

function formatFileSize(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatRelativeTime(ms: number | undefined): string {
  if (ms == null) return "—";
  const diff = Date.now() - ms;
  if (diff < 0) return t("team.files.justNow");
  if (diff < 60_000) return t("team.files.justNow");
  if (diff < 3_600_000)
    return (t as (k: string, v?: Record<string, string | number>) => string)("team.files.minAgo", {
      count: Math.floor(diff / 60_000),
    });
  if (diff < 86_400_000)
    return (t as (k: string, v?: Record<string, string | number>) => string)(
      "team.files.hoursAgo",
      { count: Math.floor(diff / 3_600_000) },
    );
  return (t as (k: string, v?: Record<string, string | number>) => string)("team.files.daysAgo", {
    count: Math.floor(diff / 86_400_000),
  });
}

function renderProjectFilesPanel(
  project: TeamProjectDetail["project"],
  props: ProjectDetailProps,
): TemplateResult {
  const data = props.files;

  if (data === undefined || data === null) {
    return html`<div class="card"><div class="muted">${t("agents.loading")}</div></div>`;
  }

  const memberList = data.members ?? [];
  const totalFiles = memberList.reduce((n, m) => n + m.files.length, 0);

  return html`
    <div class="card">
      <div class="row" style="justify-content: space-between; margin-bottom: 12px;">
        <div class="card-title">${t("team.files")} (${totalFiles})</div>
        <button
          class="btn btn--sm btn--outline"
          ?disabled=${props.busy}
          @click=${() => props.onLoadFiles?.(project.projectId)}
        >${t("team.files.refresh")}</button>
      </div>
      ${
        totalFiles === 0
          ? html`<div class="muted">${t("team.files.empty")}</div>`
          : memberList.map(
              (member) => html`
          <div class="project-files-group" style="margin-bottom: 16px;">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px;">
              ${member.agentEmoji ? html`<span style="margin-right: 4px;">${member.agentEmoji}</span>` : nothing}${member.agentName}
            </div>
            ${
              member.files.length === 0
                ? html`<div class="muted" style="font-size: 12px; padding-left: 8px;">${t("team.files.noFiles")}</div>`
                : html`
                <div class="agent-files-list" style="font-size: 12px;">
                  ${member.files.map(
                    (f) => html`
                    <div class="agent-files-row" style="display: flex; align-items: center; gap: 12px; padding: 4px 8px; border-bottom: 1px solid var(--border-color, #eee);">
                      <span class="mono" style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${f.name}</span>
                      <span class="muted" style="white-space: nowrap;">${formatFileSize(f.size)}</span>
                      <span class="muted" style="white-space: nowrap;">${formatRelativeTime(f.updatedAtMs)}</span>
                    </div>
                  `,
                  )}
                </div>
              `
            }
          </div>
        `,
            )
      }
    </div>
  `;
}

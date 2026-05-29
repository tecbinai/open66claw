import { html, nothing, type TemplateResult } from "lit";
import { t } from "../i18n/index.js";
import { brand } from "../brand.js";
import { showConfirmModal } from "./confirm-modal.js";
import type {
  AgentIdentityResult,
  AgentsFilesListResult,
  AgentsListResult,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
  SkillStatusReport,
  TeamProjectSummary,
  TeamProjectDetail,
  TeamProjectHealthResult,
  TeamProjectStatsResult,
  TeamSharedMemoryEntry,
  TeamActivityEvent,
} from "../types.ts";
import type { ChannelRouteEntry } from "./channels.types.ts";
import { renderAgentChatPanel, type AgentChatPanelProps } from "./agent-chat-panel.ts";
import { renderAgentOutputs } from "./agents-panels-outputs.ts";
import {
  renderAgentFiles,
  renderAgentChannels,
  renderAgentCron,
} from "./agents-panels-status-files.ts";
import { renderAgentTools, renderAgentSkills } from "./agents-panels-tools-skills.ts";
import {
  agentBadgeText,
  buildAgentContext,
  buildModelOptions,
  normalizeAgentLabel,
  normalizeModelValue,
  parseFallbackList,
  resolveAgentConfig,
  resolveAgentEmoji,
  resolveAgentInitial,
  resolveModelFallbacks,
  resolveModelLabel,
  resolveModelPrimary,
} from "./agents-utils.ts";
import {
  renderProjectSidebarGroups,
  renderProjectDetail,
  type ProjectDetailTab,
} from "./team-projects.ts";

export type AgentsPanel =
  | "overview"
  | "outputs"
  | "files"
  | "tools"
  | "skills"
  | "channels"
  | "cron"
  | "chat";

export type AgentsProps = {
  loading: boolean;
  error: string | null;
  agentsList: AgentsListResult | null;
  selectedAgentId: string | null;
  activePanel: AgentsPanel;
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  channelsLoading: boolean;
  channelsError: string | null;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsLastSuccess: number | null;
  channelRouteSummary: ChannelRouteEntry[] | null;
  cronLoading: boolean;
  cronStatus: CronStatus | null;
  cronJobs: CronJob[];
  cronError: string | null;
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;
  // Agent outputs (workspace files)
  agentOutputsLoading: boolean;
  agentOutputsError: string | null;
  agentOutputsList: import("../types.ts").AgentOutputsListResult | null;
  agentOutputActive: string | null;
  agentOutputContent: string | null;
  agentOutputContentLoading: boolean;
  onLoadOutputs: (agentId: string) => void;
  onSelectOutput: (agentId: string, filePath: string, relativeName: string) => void;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  agentIdentityById: Record<string, AgentIdentityResult>;
  agentSkillsLoading: boolean;
  agentSkillsReport: SkillStatusReport | null;
  agentSkillsError: string | null;
  agentSkillsAgentId: string | null;
  skillsFilter: string;
  agentCreating: boolean;
  agentCreateError: string | null;
  agentCreateSuccess: boolean;
  agentDeleting: boolean;
  agentDeleteError: string | null;
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectPanel: (panel: AgentsPanel) => void;
  onLoadFiles: (agentId: string) => void;
  onSelectFile: (name: string) => void;
  onFileDraftChange: (name: string, content: string) => void;
  onFileReset: (name: string) => void;
  onFileSave: (name: string) => void;
  onToolsProfileChange: (agentId: string, profile: string | null, clearAllow: boolean) => void;
  onToolsOverridesChange: (agentId: string, alsoAllow: string[], deny: string[]) => void;
  onConfigReload: () => void;
  onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
  onChannelsRefresh: () => void;
  onCronRefresh: () => void;
  onSkillsFilterChange: (next: string) => void;
  onSkillsRefresh: () => void;
  onAgentSkillToggle: (agentId: string, skillName: string, enabled: boolean) => void;
  onAgentSkillsClear: (agentId: string) => void;
  onAgentSkillsDisableAll: (agentId: string) => void;
  onOpenWizard: () => void;
  onDeleteAgent: (agentId: string) => Promise<void>;
  onStartChat: (agentId: string) => void;
  // Embedded agent chat
  agentChatProps: Omit<AgentChatPanelProps, "agentId" | "agentName" | "agentEmoji"> | null;
  // dmScope auto-detection status
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
  // OpenClawCN: Orchestrator (智能组队) entry
  orchestratorEntryHtml?: TemplateResult | typeof nothing;
  orchestratorHtml?: TemplateResult | typeof nothing;
  // Team Projects
  teamProjects: TeamProjectSummary[] | null;
  teamProjectSelectedId: string | null;
  teamProjectDetail: TeamProjectDetail | null;
  teamProjectDetailLoading: boolean;
  teamProjectHealth: TeamProjectHealthResult | null;
  teamProjectStats: TeamProjectStatsResult | null;
  teamProjectMemory: TeamSharedMemoryEntry[] | null;
  teamProjectActivity: TeamActivityEvent[] | null;
  teamProjectFiles: import("../types.js").ProjectWorkspaceFilesResult | null;
  teamProjectTab: ProjectDetailTab;
  teamProjectBusy: boolean;
  teamCollapsedProjects: Set<string>;
  onSelectProject: (projectId: string) => void;
  onSelectProjectTab: (tab: ProjectDetailTab) => void;
  onPauseProject: (projectId: string) => void;
  onResumeProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onLoadProjectStats: (projectId: string) => void;
  onLoadProjectMemory: (projectId: string) => void;
  onLoadProjectActivity: (projectId: string) => void;
  onLoadProjectFiles: (projectId: string) => void;
  onClearProjectMemory: (projectId: string) => void;
  onToggleProjectCollapse: (projectId: string) => void;
  onDeleteOrchGroup?: (agentIds: string[]) => void;
  // Team project detail: settings + member management
  onUpdateProjectSettings?: (projectId: string, updates: Record<string, unknown>) => void;
  onRemoveProjectMember?: (projectId: string, agentId: string) => void;
  onSelectAgentFromProject?: (agentId: string) => void;
  // Overview: inline identity update
  onIdentityUpdate?: (agentId: string, name: string, emoji: string) => Promise<boolean>;
  // Overview: inline SOUL.md load/save
  onSoulLoad?: (agentId: string) => Promise<string>;
  onSoulSave?: (agentId: string, content: string) => Promise<boolean>;
  // Force UI re-render (for module-scoped state)
  requestUpdate?: () => void;
};

export type AgentContext = {
  workspace: string;
  model: string;
  identityName: string;
  identityEmoji: string;
  skillsLabel: string;
  isDefault: boolean;
};

/* ── Overview identity editing state ── */
const overviewIdentity = { name: "", emoji: "", dirty: false, agentId: "" };

/* ── Overview SOUL.md editing state ── */
const overviewSoul = { content: "", draft: "", loaded: false, dirty: false, agentId: "" };

/* ── Advanced section collapse state ── */
let overviewAdvancedOpen = false;

export function renderAgents(props: AgentsProps) {
  const agents = props.agentsList?.agents ?? [];
  const defaultId = props.agentsList?.defaultId ?? null;
  const selectedId = props.selectedAgentId ?? defaultId ?? agents[0]?.id ?? null;
  const selectedAgent = selectedId
    ? (agents.find((agent) => agent.id === selectedId) ?? null)
    : null;
  const isOnlyDefault = agents.length <= 1;

  return html`
    <div class="agents-wrapper">
    ${props.orchestratorHtml && props.orchestratorHtml !== nothing ? html`<div class="orch-overlay">${props.orchestratorHtml}</div>` : nothing}
    <div class="agents-layout">
      <section class="agents-sidebar">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="agents-sidebar__title">${t("agents.title")}</div>
            <div class="card-sub">${agents.length} ${t("agents.configured")}</div>
          </div>
          <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? t("agents.loading") : t("overview.refresh")}
          </button>
        </div>
        ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}
        ${props.orchestratorEntryHtml ?? nothing}
        <div class="agent-list">
          ${
            agents.length === 0
              ? html`<div class="muted">${t("agents.noAgents")}</div>`
              : hasTeamProjects(props.teamProjects)
                ? renderProjectSidebarGroups({
                    projects: props.teamProjects,
                    agents: props.agentsList,
                    agentIdentityById: props.agentIdentityById,
                    selectedProjectId: props.teamProjectSelectedId,
                    selectedAgentId: selectedId,
                    defaultAgentId: defaultId,
                    collapsedProjects: props.teamCollapsedProjects,
                    onSelectProject: props.onSelectProject,
                    onSelectAgent: props.onSelectAgent,
                    onToggleCollapse: props.onToggleProjectCollapse,
                    onDeleteOrchGroup: props.onDeleteOrchGroup,
                  })
                : agents.map((agent) => {
                    const badge = agentBadgeText(agent.id, defaultId);
                    const initial = resolveAgentInitial(
                      agent,
                      props.agentIdentityById[agent.id] ?? null,
                    );
                    return html`
                      <button
                        type="button"
                        class="agent-row ${selectedId === agent.id ? "active" : ""}"
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
                  })
          }
          <!-- Wizard button (primary) -->
          <div style="margin-top: 12px;">
            <button
              class="btn primary"
              style="width: 100%;"
              @click=${() => props.onOpenWizard()}
            >
              + ${t("agents.wizardBtn")}
            </button>
          </div>
        </div>
      </section>
      <section class="agents-main">
        ${isOnlyDefault && !hasTeamProjects(props.teamProjects) ? renderMultiAgentGuide() : nothing}
        ${
          props.teamProjectSelectedId
            ? renderProjectDetail({
                detail: props.teamProjectDetail,
                detailLoading: props.teamProjectDetailLoading,
                health: props.teamProjectHealth,
                stats: props.teamProjectStats,
                memory: props.teamProjectMemory,
                activity: props.teamProjectActivity,
                files: props.teamProjectFiles,
                tab: props.teamProjectTab,
                busy: props.teamProjectBusy,
                agentIdentityById: props.agentIdentityById,
                allAgents: props.agentsList,
                onSelectTab: props.onSelectProjectTab,
                onPause: props.onPauseProject,
                onResume: props.onResumeProject,
                onDelete: props.onDeleteProject,
                onLoadStats: props.onLoadProjectStats,
                onLoadMemory: props.onLoadProjectMemory,
                onLoadActivity: props.onLoadProjectActivity,
                onLoadFiles: props.onLoadProjectFiles,
                onClearMemory: props.onClearProjectMemory,
                onUpdateSettings: props.onUpdateProjectSettings,
                onRemoveMember: props.onRemoveProjectMember,
                onSelectAgent: props.onSelectAgentFromProject,
              })
            : !selectedAgent
              ? html`
                <div class="card">
                  <div class="card-title">${t("agents.selectAgent")}</div>
                  <div class="card-sub">${t("agents.selectAgentHint")}</div>
                </div>
              `
              : html`
                <div class="agents-main-fixed">
                ${renderAgentHeader(
                  selectedAgent,
                  defaultId,
                  props.agentIdentityById[selectedAgent.id] ?? null,
                  props,
                )}
                ${renderAgentTabs(props.activePanel, (panel) => props.onSelectPanel(panel), {
                  hideChannels: isTeamChildAgent(selectedAgent.id, defaultId, props.teamProjects),
                })}
                </div>
                <div class="agents-main-scroll">
                ${
                  props.agentCreateSuccess
                    ? html`
                      <div class="callout info" style="margin-bottom: 12px;">
                        <div style="font-weight: 600; margin-bottom: 4px;">${t("agents.createSuccessTitle")}</div>
                        <div>${t("agents.createSuccessBody")}</div>
                      </div>
                    `
                    : nothing
                }
                ${
                  props.activePanel === "overview"
                    ? renderAgentOverview({
                        agent: selectedAgent,
                        defaultId,
                        configForm: props.configForm,
                        agentFilesList: props.agentFilesList,
                        agentIdentity: props.agentIdentityById[selectedAgent.id] ?? null,
                        agentIdentityError: props.agentIdentityError,
                        agentIdentityLoading: props.agentIdentityLoading,
                        configLoading: props.configLoading,
                        configSaving: props.configSaving,
                        configDirty: props.configDirty,
                        onConfigReload: props.onConfigReload,
                        onConfigSave: props.onConfigSave,
                        onModelChange: props.onModelChange,
                        onModelFallbacksChange: props.onModelFallbacksChange,
                        dmScopeStatus: props.dmScopeStatus ?? null,
                        onIdentityUpdate: props.onIdentityUpdate,
                        onSoulLoad: props.onSoulLoad,
                        onSoulSave: props.onSoulSave,
                        requestUpdate: props.requestUpdate ?? (() => {}),
                        // Team context — drives supervisor/member banner
                        teamProjects: props.teamProjects,
                        agentIdentityById: props.agentIdentityById,
                        onSelectProject: props.onSelectProject,
                        onPauseProject: props.onPauseProject,
                        onResumeProject: props.onResumeProject,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "files"
                    ? renderAgentFiles({
                        agentId: selectedAgent.id,
                        agentFilesList: props.agentFilesList,
                        agentFilesLoading: props.agentFilesLoading,
                        agentFilesError: props.agentFilesError,
                        agentFileActive: props.agentFileActive,
                        agentFileContents: props.agentFileContents,
                        agentFileDrafts: props.agentFileDrafts,
                        agentFileSaving: props.agentFileSaving,
                        onLoadFiles: props.onLoadFiles,
                        onSelectFile: props.onSelectFile,
                        onFileDraftChange: props.onFileDraftChange,
                        onFileReset: props.onFileReset,
                        onFileSave: props.onFileSave,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "tools"
                    ? renderAgentTools({
                        agentId: selectedAgent.id,
                        configForm: props.configForm,
                        configLoading: props.configLoading,
                        configSaving: props.configSaving,
                        configDirty: props.configDirty,
                        onProfileChange: props.onToolsProfileChange,
                        onOverridesChange: props.onToolsOverridesChange,
                        onConfigReload: props.onConfigReload,
                        onConfigSave: props.onConfigSave,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "skills"
                    ? renderAgentSkills({
                        agentId: selectedAgent.id,
                        report: props.agentSkillsReport,
                        loading: props.agentSkillsLoading,
                        error: props.agentSkillsError,
                        activeAgentId: props.agentSkillsAgentId,
                        configForm: props.configForm,
                        configLoading: props.configLoading,
                        configSaving: props.configSaving,
                        configDirty: props.configDirty,
                        filter: props.skillsFilter,
                        onFilterChange: props.onSkillsFilterChange,
                        onRefresh: props.onSkillsRefresh,
                        onToggle: props.onAgentSkillToggle,
                        onClear: props.onAgentSkillsClear,
                        onDisableAll: props.onAgentSkillsDisableAll,
                        onConfigReload: props.onConfigReload,
                        onConfigSave: props.onConfigSave,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "channels" &&
                  !isTeamChildAgent(selectedAgent.id, defaultId, props.teamProjects)
                    ? renderAgentChannels({
                        agentId: selectedAgent.id,
                        context: buildAgentContext(
                          selectedAgent,
                          props.configForm,
                          props.agentFilesList,
                          defaultId,
                          props.agentIdentityById[selectedAgent.id] ?? null,
                        ),
                        configForm: props.configForm,
                        snapshot: props.channelsSnapshot,
                        routeSummary: props.channelRouteSummary,
                        loading: props.channelsLoading,
                        error: props.channelsError,
                        lastSuccess: props.channelsLastSuccess,
                        onRefresh: props.onChannelsRefresh,
                        dmScopeStatus: props.dmScopeStatus ?? null,
                        onDmScopeApply: props.onDmScopeApply,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "cron"
                    ? renderAgentCron({
                        context: buildAgentContext(
                          selectedAgent,
                          props.configForm,
                          props.agentFilesList,
                          defaultId,
                          props.agentIdentityById[selectedAgent.id] ?? null,
                        ),
                        agentId: selectedAgent.id,
                        jobs: props.cronJobs,
                        status: props.cronStatus,
                        loading: props.cronLoading,
                        error: props.cronError,
                        onRefresh: props.onCronRefresh,
                      })
                    : nothing
                }
                ${
                  props.activePanel === "outputs"
                    ? renderAgentOutputs({
                        agentId: selectedAgent.id,
                        agentOutputsList: props.agentOutputsList,
                        agentOutputsLoading: props.agentOutputsLoading,
                        agentOutputsError: props.agentOutputsError,
                        agentOutputActive: props.agentOutputActive,
                        agentOutputContent: props.agentOutputContent,
                        agentOutputContentLoading: props.agentOutputContentLoading,
                        onLoadOutputs: props.onLoadOutputs,
                        onSelectOutput: props.onSelectOutput,
                        requestUpdate: props.requestUpdate ?? (() => {}),
                      })
                    : nothing
                }
                ${
                  props.activePanel === "chat" && props.agentChatProps
                    ? renderAgentChatPanel({
                        agentId: selectedAgent.id,
                        agentName: normalizeAgentLabel(selectedAgent),
                        agentEmoji: resolveAgentInitial(
                          selectedAgent,
                          props.agentIdentityById[selectedAgent.id] ?? null,
                        ),
                        ...props.agentChatProps,
                      })
                    : nothing
                }
                </div>
              `
        }
      </section>
    </div>
    </div>
  `;
}

function hasTeamProjects(projects: TeamProjectSummary[] | null): boolean {
  return !!projects && projects.length > 0;
}

/**
 * Check if an agent is a child member of a team project (not a supervisor
 * and not the default agent). Child members should not have their own
 * channel bindings — messages reach them via their Supervisor.
 */
function isTeamChildAgent(
  agentId: string,
  defaultId: string | null,
  projects: TeamProjectSummary[] | null,
): boolean {
  if (!projects || projects.length === 0) {
    return false;
  }
  if (agentId === defaultId) {
    return false;
  }
  // If this agent is a supervisor in ANY project, it needs channel access
  if (projects.some((p) => p.supervisorId === agentId)) {
    return false;
  }
  // Otherwise, if it's a member of any project, it's a child agent
  return projects.some((p) => p.memberIds.includes(agentId));
}

function renderAgentHeader(
  agent: AgentsListResult["agents"][number],
  defaultId: string | null,
  agentIdentity: AgentIdentityResult | null,
  props: AgentsProps,
) {
  const badge = agentBadgeText(agent.id, defaultId);
  const displayName = normalizeAgentLabel(agent);
  const subtitle = agent.identity?.theme?.trim() || t("agents.defaultSubtitle");
  const initial = resolveAgentInitial(agent, agentIdentity);
  const isDefault = agent.id === defaultId;
  return html`
    <section class="card agent-header">
      <div class="agent-header-main">
        <div class="agent-avatar agent-avatar--lg">${initial}</div>
        <div>
          <div class="card-title">${displayName}</div>
          <div class="card-sub">${subtitle}</div>
        </div>
      </div>
      <div class="agent-header-meta">
        <div class="mono">${agent.id}</div>
        ${badge ? html`<span class="agent-pill">${badge}</span>` : nothing}
        <button
          class="btn btn--sm primary"
          style="margin-left: 8px;"
          @click=${() => props.onStartChat(agent.id)}
        >
          ${t("agents.startChat")}
        </button>
        ${
          !isDefault
            ? html`
            <button
              class="btn btn--sm"
              style="margin-left: 8px; color: var(--danger, #d33);"
              ?disabled=${props.agentDeleting}
              @click=${async () => {
                const ok = await showConfirmModal({
                  title: t("agents.deleteAgent"),
                  message: t("agents.deleteConfirm", { name: displayName }),
                  confirmText: t("agents.deleteAgent"),
                  cancelText: t("wizard.back"),
                  danger: true,
                  icon: "\u26A0\uFE0F",
                });
                if (ok) {
                  void props.onDeleteAgent(agent.id);
                }
              }}
            >
              ${t("agents.deleteAgent")}
            </button>
          `
            : nothing
        }
      </div>
      ${
        props.agentDeleteError
          ? html`<div class="callout danger" style="margin-top: 8px;">${props.agentDeleteError}</div>`
          : nothing
      }
    </section>
  `;
}

function renderAgentTabs(
  active: AgentsPanel,
  onSelect: (panel: AgentsPanel) => void,
  opts?: { hideChannels?: boolean },
) {
  const tabs: Array<{ id: AgentsPanel; label: string }> = [
    { id: "overview", label: t("agents.tabOverview") },
    { id: "chat", label: t("agents.tabChat") },
    { id: "tools", label: t("agents.tabTools") },
    { id: "skills", label: t("agents.tabSkills") },
    ...(opts?.hideChannels
      ? []
      : [{ id: "channels" as AgentsPanel, label: t("agents.tabChannels") }]),
    { id: "cron", label: t("agents.tabCron") },
    // { id: "outputs", label: t("agents.tabOutputs") },  // TODO: backend agents.outputs.list/get not implemented yet
    { id: "files", label: t("agents.tabFiles") },
  ];
  return html`
    <div class="agent-tabs">
      ${tabs.map(
        (tab) => html`
          <button
            class="agent-tab ${active === tab.id ? "active" : ""}"
            type="button"
            @click=${() => onSelect(tab.id)}
          >
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

// ── Supervisor / Team Banner ─────────────────────────────────────────────

/**
 * Renders a team context banner at the top of the agent overview.
 * - Supervisor agent: full banner with member avatars + pause/resume action
 * - Sub-member agent: compact read-only banner (team name + status + view button)
 * - Unaffiliated agent: returns nothing
 */
function renderSupervisorBanner(
  agentId: string,
  teamProjects: TeamProjectSummary[] | null,
  agentIdentityById: Record<string, AgentIdentityResult>,
  onSelectProject: (projectId: string) => void,
  onPauseProject?: (projectId: string) => void,
  onResumeProject?: (projectId: string) => void,
): TemplateResult | typeof nothing {
  if (!teamProjects || teamProjects.length === 0) {
    return nothing;
  }

  const supervisorProject = teamProjects.find((p) => p.supervisorId === agentId) ?? null;
  const memberProject = supervisorProject
    ? null
    : (teamProjects.find((p) => p.memberIds.includes(agentId)) ?? null);

  const project = supervisorProject ?? memberProject;
  if (!project) {
    return nothing;
  }

  const isSupervisor = supervisorProject !== null;

  // Map project status to CSS dot modifier.
  // All statuses (active/paused/error/deploying/archived) have dedicated CSS classes.
  const statusDot = project.status;

  const statusLabel =
    project.status === "active"
      ? t("team.status.active")
      : project.status === "paused"
        ? t("team.status.paused")
        : project.status === "error"
          ? t("team.status.error")
          : project.status === "deploying"
            ? t("team.status.deploying")
            : project.status;

  if (isSupervisor) {
    const memberIds = project.memberIds ?? [];
    const maxAvatars = 4;
    const visibleIds = memberIds.slice(0, maxAvatars);
    const extraCount = memberIds.length - visibleIds.length;

    return html`
      <section class="card supervisor-banner">
        <div class="row" style="align-items:center; justify-content:space-between; margin-bottom:10px;">
          <div class="row" style="align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="agent-pill auto-supervisor" style="font-size:12px;">👑 ${t("team.supervisor")}</span>
            <span class="card-title" style="margin:0; font-size:14px;">${project.name}</span>
            <span class="project-status-dot project-status-dot--${statusDot}" style="margin-left:2px;"></span>
            <span class="agent-sub">${statusLabel}</span>
          </div>
          <button
            class="btn btn--sm btn--outline"
            style="white-space:nowrap; flex-shrink:0;"
            @click=${() => onSelectProject(project.projectId)}
          >${t("team.action.viewTeam")} →</button>
        </div>

        <div class="agent-sub" style="margin-bottom:8px;">
          ${t("team.supervisorBanner.managing", { count: String(memberIds.length) })}
        </div>

        ${
          memberIds.length > 0
            ? html`
          <div class="row" style="gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">
            ${visibleIds.map((mid) => {
              const identity = agentIdentityById[mid];
              const name = identity?.name ?? mid;
              const initial = Array.from(name)[0]?.toUpperCase() ?? "A";
              return html`
                <div class="agent-avatar agent-avatar--sm" title="${name}">
                  ${initial}
                </div>
              `;
            })}
            ${extraCount > 0 ? html`<span class="agent-sub">+${extraCount}</span>` : nothing}
          </div>
        `
            : nothing
        }

        <div class="row" style="gap:8px;">
          ${
            project.status === "active" && onPauseProject
              ? html`
            <button class="btn btn--sm" @click=${() => onPauseProject(project.projectId)}>
              ${t("team.action.pause")}
            </button>
          `
              : nothing
          }
          ${
            project.status === "paused" && onResumeProject
              ? html`
            <button class="btn btn--sm" @click=${() => onResumeProject(project.projectId)}>
              ${t("team.action.resume")}
            </button>
          `
              : nothing
          }
        </div>
      </section>
    `;
  }

  // Compact read-only banner for sub-members
  return html`
    <section class="card supervisor-banner supervisor-banner--member">
      <div class="row" style="align-items:center; gap:8px; flex-wrap:wrap;">
        <span class="agent-sub" style="flex-shrink:0;">${t("team.supervisorBanner.belongsTo")}</span>
        <span class="agent-pill">${project.name}</span>
        <span class="project-status-dot project-status-dot--${statusDot}"></span>
        <span class="agent-sub">${statusLabel}</span>
        <button
          class="btn btn--xs btn--outline"
          style="margin-left:auto; flex-shrink:0;"
          @click=${() => onSelectProject(project.projectId)}
        >${t("team.action.viewTeam")} →</button>
      </div>
    </section>
  `;
}

// ── Agent Overview ────────────────────────────────────────────────────────

function renderAgentOverview(params: {
  agent: AgentsListResult["agents"][number];
  defaultId: string | null;
  configForm: Record<string, unknown> | null;
  agentFilesList: AgentsFilesListResult | null;
  agentIdentity: AgentIdentityResult | null;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  onConfigReload: () => void;
  onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
  dmScopeStatus: AgentsProps["dmScopeStatus"] | null;
  onIdentityUpdate?: AgentsProps["onIdentityUpdate"];
  onSoulLoad?: AgentsProps["onSoulLoad"];
  onSoulSave?: AgentsProps["onSoulSave"];
  requestUpdate: () => void;
  // Team context — drives supervisor/member banner
  teamProjects?: TeamProjectSummary[] | null;
  agentIdentityById?: Record<string, AgentIdentityResult>;
  onSelectProject?: (projectId: string) => void;
  onPauseProject?: (projectId: string) => void;
  onResumeProject?: (projectId: string) => void;
}) {
  const {
    agent,
    configForm,
    agentFilesList,
    agentIdentity,
    agentIdentityLoading: _agentIdentityLoading,
    agentIdentityError: _agentIdentityError,
    configLoading,
    configSaving,
    configDirty,
    onConfigReload,
    onConfigSave,
    onModelChange,
    onModelFallbacksChange,
    requestUpdate,
  } = params;
  const config = resolveAgentConfig(configForm, agent.id);
  const workspaceFromFiles =
    agentFilesList && agentFilesList.agentId === agent.id ? agentFilesList.workspace : null;
  const workspace =
    workspaceFromFiles || config.entry?.workspace || config.defaults?.workspace || "default";
  const model = config.entry?.model
    ? resolveModelLabel(config.entry?.model)
    : resolveModelLabel(config.defaults?.model);
  const defaultModel = resolveModelLabel(config.defaults?.model);
  const modelPrimary =
    resolveModelPrimary(config.entry?.model) || (model !== "-" ? normalizeModelValue(model) : null);
  const defaultPrimary =
    resolveModelPrimary(config.defaults?.model) ||
    (defaultModel !== "-" ? normalizeModelValue(defaultModel) : null);
  const effectivePrimary = modelPrimary ?? defaultPrimary ?? null;
  const modelFallbacks = resolveModelFallbacks(config.entry?.model);
  const fallbackText = modelFallbacks ? modelFallbacks.join(", ") : "";
  const identityName =
    agentIdentity?.name?.trim() ||
    agent.identity?.name?.trim() ||
    agent.name?.trim() ||
    config.entry?.name ||
    "-";
  const resolvedEmoji = resolveAgentEmoji(agent, agentIdentity);
  const identityEmoji = resolvedEmoji || "-";
  const skillFilter = Array.isArray(config.entry?.skills) ? config.entry?.skills : null;
  const skillCount = skillFilter?.length ?? null;
  const isDefault = Boolean(params.defaultId && agent.id === params.defaultId);

  // Sync identity editing state when agent changes
  if (overviewIdentity.agentId !== agent.id) {
    overviewIdentity.agentId = agent.id;
    overviewIdentity.name = identityName !== "-" ? identityName : "";
    overviewIdentity.emoji = identityEmoji !== "-" ? identityEmoji : "";
    overviewIdentity.dirty = false;
  }

  // Auto-load SOUL.md when agent changes
  if (overviewSoul.agentId !== agent.id) {
    overviewSoul.agentId = agent.id;
    overviewSoul.content = "";
    overviewSoul.draft = "";
    overviewSoul.loaded = false;
    overviewSoul.dirty = false;
    if (params.onSoulLoad) {
      void params.onSoulLoad(agent.id).then((content) => {
        if (overviewSoul.agentId === agent.id) {
          overviewSoul.content = content;
          overviewSoul.draft = content;
          overviewSoul.loaded = true;
          requestUpdate();
        }
      });
    }
  }

  const identityDirty = overviewIdentity.dirty;
  const soulDirty = overviewSoul.dirty;

  return html`
    ${renderSupervisorBanner(
      agent.id,
      params.teamProjects ?? null,
      params.agentIdentityById ?? {},
      params.onSelectProject ?? (() => {}),
      params.onPauseProject,
      params.onResumeProject,
    )}
    <!-- Card 1: Identity (editable) -->
    <section class="card">
      <div class="card-title">${t("agents.identityTitle")}</div>
      <div class="card-sub">${t("agents.identitySub")}</div>
      <div style="margin-top: 12px;">
        <label class="field">
          <span>${t("agents.identityName")}</span>
          <input
            type="text"
            .value=${overviewIdentity.name}
            placeholder=${t("agents.identityNamePlaceholder")}
            style="box-sizing: border-box; width: 100%;"
            @input=${(e: Event) => {
              overviewIdentity.name = (e.target as HTMLInputElement).value;
              overviewIdentity.dirty = true;
              requestUpdate();
            }}
          />
        </label>
      </div>
      ${
        identityDirty && params.onIdentityUpdate
          ? html`
          <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 8px;">
            <button class="btn btn--sm" @click=${() => {
              overviewIdentity.name = identityName !== "-" ? identityName : "";
              overviewIdentity.emoji = identityEmoji !== "-" ? identityEmoji : "";
              overviewIdentity.dirty = false;
              requestUpdate();
            }}>${t("agents.reset")}</button>
            <button class="btn btn--sm primary" @click=${async () => {
              const ok = await params.onIdentityUpdate!(
                agent.id,
                overviewIdentity.name.trim(),
                overviewIdentity.emoji.trim(),
              );
              if (ok) {
                overviewIdentity.dirty = false;
              }
              requestUpdate();
            }}>${t("agents.save")}</button>
          </div>
        `
          : nothing
      }
    </section>

    <!-- Card 2: Role Description (SOUL.md) -->
    <section class="card">
      <div class="card-title">${t("agents.soulTitle")}</div>
      <div class="card-sub">${t("agents.soulSub")}</div>
      ${
        !overviewSoul.loaded
          ? html`<div class="muted" style="margin-top: 12px;">${t("agents.loading")}</div>`
          : html`
          <label class="field" style="margin-top: 12px;">
            <textarea
              .value=${overviewSoul.draft}
              rows="8"
              placeholder=${t("agents.soulPlaceholder")}
              style="min-height: 120px; font-family: inherit; line-height: 1.6;"
              @input=${(e: Event) => {
                overviewSoul.draft = (e.target as HTMLTextAreaElement).value;
                overviewSoul.dirty = overviewSoul.draft !== overviewSoul.content;
                requestUpdate();
              }}
            ></textarea>
          </label>
          ${
            soulDirty && params.onSoulSave
              ? html`
              <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 8px;">
                <button class="btn btn--sm" @click=${() => {
                  overviewSoul.draft = overviewSoul.content;
                  overviewSoul.dirty = false;
                  requestUpdate();
                }}>${t("agents.reset")}</button>
                <button class="btn btn--sm primary" @click=${async () => {
                  const ok = await params.onSoulSave!(agent.id, overviewSoul.draft);
                  if (ok) {
                    overviewSoul.content = overviewSoul.draft;
                    overviewSoul.dirty = false;
                  }
                  requestUpdate();
                }}>${t("agents.save")}</button>
              </div>
            `
              : nothing
          }
        `
      }
    </section>

    <!-- Card 3: Model Selection -->
    <section class="card">
      <div class="card-title">${t("agents.modelSelection")}</div>
      <div class="card-sub">${t("agents.modelSelectionSub")}</div>
      <div class="row" style="gap: 12px; flex-wrap: wrap; margin-top: 12px;">
        <label class="field" style="min-width: 260px; flex: 1;">
          <span>${isDefault ? t("agents.primaryModelDefault") : t("agents.primaryModelLabel")}</span>
          <select
            .value=${effectivePrimary ?? ""}
            ?disabled=${!configForm || configLoading || configSaving}
            @change=${(e: Event) =>
              onModelChange(agent.id, (e.target as HTMLSelectElement).value || null)}
          >
            ${
              isDefault
                ? nothing
                : html`
                    <option value="">
                      ${defaultPrimary ? t("agents.inheritDefaultWithModel", { model: defaultPrimary }) : t("agents.inheritDefault")}
                    </option>
                  `
            }
            ${buildModelOptions(configForm, effectivePrimary ?? undefined)}
          </select>
        </label>
        <label class="field" style="min-width: 260px; flex: 1;">
          <span>${t("agents.fallbacks")}</span>
          <input
            .value=${fallbackText}
            ?disabled=${!configForm || configLoading || configSaving}
            placeholder="provider/model, provider/model"
            @input=${(e: Event) =>
              onModelFallbacksChange(
                agent.id,
                parseFallbackList((e.target as HTMLInputElement).value),
              )}
          />
        </label>
      </div>
      <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 8px;">
        <button class="btn btn--sm" ?disabled=${configLoading} @click=${onConfigReload}>
          ${t("agents.reloadConfig")}
        </button>
        <button
          class="btn btn--sm primary"
          ?disabled=${configSaving || !configDirty}
          @click=${onConfigSave}
        >
          ${configSaving ? t("agents.saving") : t("agents.save")}
        </button>
      </div>
    </section>

    <!-- Card 4: Advanced (collapsed by default) -->
    <section class="card">
      <button
        type="button"
        class="overview-advanced-toggle"
        @click=${() => {
          overviewAdvancedOpen = !overviewAdvancedOpen;
          requestUpdate();
        }}
      >
        <span>${overviewAdvancedOpen ? "▾" : "▸"} ${t("agents.advancedTitle")}</span>
      </button>
      ${
        overviewAdvancedOpen
          ? html`
          <div class="card-sub" style="margin-top: 4px;">${t("agents.advancedSub")}</div>
          <div class="agents-overview-grid" style="margin-top: 12px;">
            <div class="agent-kv">
              <div class="label">${t("agents.workspace")}</div>
              <div class="mono">${workspace}</div>
            </div>
            <div class="agent-kv">
              <div class="label">${t("agents.primaryModel")}</div>
              <div class="mono">${model}</div>
            </div>
            <div class="agent-kv">
              <div class="label">${t("agents.default")}</div>
              <div>${isDefault ? t("agents.yes") : t("agents.no")}</div>
            </div>
            <div class="agent-kv">
              <div class="label">${t("agents.skillsFilter")}</div>
              <div>${skillFilter ? `${skillCount} ${t("agents.selectedSkills")}` : t("agents.allSkills")}</div>
            </div>
            <div class="agent-kv">
              <div class="label">${t("agents.sessionIsolation")}</div>
              <div>
                ${
                  params.dmScopeStatus
                    ? (() => {
                        const k = `dmScope.label.${params.dmScopeStatus.current}`;
                        const v = (t as (k: string) => string)(k);
                        return v !== k ? v : params.dmScopeStatus.current;
                      })()
                    : "-"
                }
                ${params.dmScopeStatus?.shouldUpgrade ? html`<span class="agent-pill warn">${t("agents.dmScopeUpgradeNeeded")}</span>` : params.dmScopeStatus && params.dmScopeStatus.current !== "main" ? html`<span class="agent-pill">${t("agents.dmScopeOk")}</span>` : nothing}
              </div>
            </div>
          </div>
        `
          : nothing
      }
    </section>
  `;
}

/* ── Multi-agent onboarding guide ── */
function renderMultiAgentGuide() {
  return html`
    <div class="callout info" style="margin-bottom: 16px;">
      <div style="font-weight: 600; margin-bottom: 6px;">${t("agents.guideTitle")}</div>
      <div style="margin-bottom: 8px;">${t("agents.guideIntro")}</div>
      <div style="margin-bottom: 4px;">1. ${t("agents.guideStep1")}</div>
      <div style="margin-bottom: 4px;">2. ${t("agents.guideStep2")}</div>
      <div style="margin-bottom: 8px;">3. ${t("agents.guideStep3")}</div>
      <div style="font-weight: 600; margin-bottom: 4px;">${t("agents.guideRoutingTitle")}</div>
      <div style="margin-bottom: 8px;">${t("agents.guideRoutingBody")}</div>
      <div class="muted mono" style="font-size: 12px;">${t("agents.guideCli", { cliName: brand.cliName })}</div>
    </div>
  `;
}

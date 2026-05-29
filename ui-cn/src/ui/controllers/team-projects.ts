/**
 * Team Projects Controller
 *
 * Gateway RPC functions for managing agent-team projects.
 * Pattern: same as agents.ts — export plain functions
 * that mutate the Lit reactive state proxy.
 */

import type { GatewayBrowserClient } from "../gateway.js";
import type {
  TeamProjectSummary,
  TeamProjectDetail,
  TeamProjectHealthResult,
  TeamProjectStatsResult,
  TeamSharedMemoryEntry,
  TeamActivityEvent,
  ProjectWorkspaceFilesResult,
} from "../types.js";
import { loadAgents, type AgentsState } from "./agents.js";

// ── State Slice ─────────────────────────────────────────────────────────

export type TeamProjectsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  teamProjectsLoading: boolean;
  teamProjectsList: TeamProjectSummary[] | null;
  teamProjectsError: string | null;
  teamProjectSelectedId: string | null;
  teamProjectDetail: TeamProjectDetail | null;
  teamProjectDetailLoading: boolean;
  teamProjectHealth: TeamProjectHealthResult | null;
  teamProjectStats: TeamProjectStatsResult | null;
  teamProjectMemory: TeamSharedMemoryEntry[] | null;
  teamProjectActivity: TeamActivityEvent[] | null;
  teamProjectFiles: ProjectWorkspaceFilesResult | null;
  teamProjectTab: "members" | "activity" | "stats" | "settings" | "memory" | "files";
  teamProjectBusy: boolean;
};

// ── Health polling ──────────────────────────────────────────────────────

let _healthPollTimer: ReturnType<typeof setInterval> | null = null;

export function startProjectHealthPoll(state: TeamProjectsState): void {
  stopProjectHealthPoll();
  _healthPollTimer = setInterval(() => {
    if (state.teamProjectSelectedId) {
      void loadProjectHealth(state, state.teamProjectSelectedId);
    }
  }, 30_000);
}

export function stopProjectHealthPoll(): void {
  if (_healthPollTimer) {
    clearInterval(_healthPollTimer);
    _healthPollTimer = null;
  }
}

// ── List ─────────────────────────────────────────────────────────────────

/** Pending load promise so callers that arrive while a load is in-flight
 *  can wait for the same result instead of being silently discarded. */
let _pendingLoad: Promise<void> | null = null;

export async function loadTeamProjects(state: TeamProjectsState, force = false): Promise<void> {
  if (!state.client || !state.connected) return;

  // If a load is already in-flight, wait for it to finish, then re-fetch
  // when `force` is set (e.g. after deploying a new team).
  if (state.teamProjectsLoading && _pendingLoad) {
    if (force) {
      await _pendingLoad;
      // Re-check client after awaiting — it may have disconnected
      if (!state.client || !state.connected) return;
      // Fall through to do another fetch below
    } else {
      return _pendingLoad;
    }
  }

  const client = state.client;
  state.teamProjectsLoading = true;
  state.teamProjectsError = null;

  _pendingLoad = (async () => {
    try {
      const res = (await client.request("team.project.list", {})) as
        | { projects: TeamProjectSummary[] }
        | undefined;
      state.teamProjectsList = res?.projects ?? [];
    } catch (err) {
      state.teamProjectsError = String(err);
    } finally {
      state.teamProjectsLoading = false;
      _pendingLoad = null;
    }
  })();

  return _pendingLoad;
}

// ── Detail ──────────────────────────────────────────────────────────────

export async function loadProjectDetail(
  state: TeamProjectsState,
  projectId: string,
): Promise<void> {
  if (!state.client || !state.connected) return;
  state.teamProjectDetailLoading = true;
  try {
    const res = (await state.client.request("team.project.get", { projectId })) as
      | TeamProjectDetail
      | undefined;
    // Guard: only write if this project is still selected (prevents stale data on rapid switch)
    if (res && state.teamProjectSelectedId === projectId) state.teamProjectDetail = res;
  } catch {
    if (state.teamProjectSelectedId === projectId) state.teamProjectDetail = null;
  } finally {
    if (state.teamProjectSelectedId === projectId) state.teamProjectDetailLoading = false;
  }
}

// ── Health ───────────────────────────────────────────────────────────────

export async function loadProjectHealth(
  state: TeamProjectsState,
  projectId: string,
): Promise<void> {
  if (!state.client || !state.connected) return;
  try {
    const res = (await state.client.request("team.project.health", { projectId })) as
      | TeamProjectHealthResult
      | undefined;
    // Guard: only write if this project is still selected
    if (res && state.teamProjectSelectedId === projectId) state.teamProjectHealth = res;
  } catch {
    // silent — health is best-effort
  }
}

// ── Stats ────────────────────────────────────────────────────────────────

export async function loadProjectStats(state: TeamProjectsState, projectId: string): Promise<void> {
  if (!state.client || !state.connected) return;
  try {
    const res = (await state.client.request("team.project.stats", { projectId })) as
      | TeamProjectStatsResult
      | undefined;
    if (res && state.teamProjectSelectedId === projectId) state.teamProjectStats = res;
  } catch {
    // Prevent infinite re-render loop: set empty stats so view stops retrying
    if (state.teamProjectSelectedId === projectId) {
      state.teamProjectStats = { projectId, members: [], totalCalls: 0, avgDurationMs: 0 };
    }
  }
}

// ── Activity Feed ────────────────────────────────────────────────────────

export async function loadProjectActivity(
  state: TeamProjectsState,
  projectId: string,
): Promise<void> {
  if (!state.client || !state.connected) return;
  try {
    const res = (await state.client.request("team.project.activity", { projectId, limit: 50 })) as
      | { events: TeamActivityEvent[] }
      | undefined;
    if (state.teamProjectSelectedId === projectId) {
      state.teamProjectActivity = res?.events ?? [];
    }
  } catch {
    if (state.teamProjectSelectedId === projectId) {
      state.teamProjectActivity = [];
    }
  }
}

// ── Shared Memory ────────────────────────────────────────────────────────

export async function loadSharedMemory(state: TeamProjectsState, projectId: string): Promise<void> {
  if (!state.client || !state.connected) return;
  try {
    const res = (await state.client.request("team.shared-memory.list", { projectId })) as
      | { entries: TeamSharedMemoryEntry[] }
      | undefined;
    state.teamProjectMemory = res?.entries ?? [];
  } catch {
    state.teamProjectMemory = [];
  }
}

export async function clearSharedMemory(
  state: TeamProjectsState,
  projectId: string,
): Promise<void> {
  if (!state.client || !state.connected) return;
  state.teamProjectBusy = true;
  try {
    await state.client.request("team.shared-memory.clear", { projectId });
    state.teamProjectMemory = [];
  } catch {
    // silent
  } finally {
    state.teamProjectBusy = false;
  }
}

// ── Workspace Files ─────────────────────────────────────────────────────

let _pendingFilesLoad: Promise<void> | null = null;

export async function loadProjectFiles(state: TeamProjectsState, projectId: string): Promise<void> {
  if (!state.client || !state.connected) return;
  // Deduplicate in-flight requests — prevent rapid tab switching from spawning concurrent loads
  if (_pendingFilesLoad) return _pendingFilesLoad;
  _pendingFilesLoad = (async () => {
    try {
      const res = (await state.client!.request("team.project.files.list", { projectId })) as
        | ProjectWorkspaceFilesResult
        | undefined;
      if (res && state.teamProjectSelectedId === projectId) {
        state.teamProjectFiles = res;
      }
    } catch {
      if (state.teamProjectSelectedId === projectId) {
        state.teamProjectFiles = { projectId, members: [] };
      }
    } finally {
      _pendingFilesLoad = null;
    }
  })();
  return _pendingFilesLoad;
}

// ── Pause / Resume ──────────────────────────────────────────────────────

export async function pauseProject(state: TeamProjectsState, projectId: string): Promise<void> {
  if (!state.client || !state.connected) return;
  state.teamProjectBusy = true;
  try {
    await state.client.request("team.project.pause", { projectId });
    await loadTeamProjects(state);
    if (state.teamProjectSelectedId === projectId) {
      await loadProjectDetail(state, projectId);
    }
  } catch {
    // silent
  } finally {
    state.teamProjectBusy = false;
  }
}

export async function resumeProject(state: TeamProjectsState, projectId: string): Promise<void> {
  if (!state.client || !state.connected) return;
  state.teamProjectBusy = true;
  try {
    await state.client.request("team.project.resume", { projectId });
    await loadTeamProjects(state);
    if (state.teamProjectSelectedId === projectId) {
      await loadProjectDetail(state, projectId);
    }
  } catch {
    // silent
  } finally {
    state.teamProjectBusy = false;
  }
}

// ── Delete ───────────────────────────────────────────────────────────────

export async function deleteProject(state: TeamProjectsState, projectId: string): Promise<void> {
  if (!state.client || !state.connected) return;
  state.teamProjectBusy = true;
  try {
    console.log(`[team-projects] deleteProject: projectId=${projectId}, deleteAgents=true`);
    await state.client.request("team.project.delete", { projectId, deleteAgents: true });
    console.log(`[team-projects] deleteProject: RPC returned OK`);
    if (state.teamProjectSelectedId === projectId) {
      state.teamProjectSelectedId = null;
      state.teamProjectDetail = null;
      state.teamProjectHealth = null;
      state.teamProjectStats = null;
      state.teamProjectMemory = null;
      state.teamProjectActivity = null;
      state.teamProjectFiles = null;
      stopProjectHealthPoll();
    }
    await Promise.all([loadTeamProjects(state), loadAgents(state as unknown as AgentsState)]);
  } catch {
    // silent
  } finally {
    state.teamProjectBusy = false;
  }
}

// ── Update Project Settings ──────────────────────────────────────────────

export async function updateProjectSettings(
  state: TeamProjectsState,
  projectId: string,
  updates: Record<string, unknown>,
): Promise<boolean> {
  if (!state.client || !state.connected) return false;
  state.teamProjectBusy = true;
  try {
    await state.client.request("team.project.update", { projectId, ...updates });
    await Promise.all([loadProjectDetail(state, projectId), loadTeamProjects(state)]);
    return true;
  } catch {
    return false;
  } finally {
    state.teamProjectBusy = false;
  }
}

// ── Add / Remove Members ────────────────────────────────────────────────

export async function addProjectMember(
  state: TeamProjectsState,
  projectId: string,
  agentId: string,
  name: string,
  role: string,
  emoji?: string,
  keywords?: string[],
): Promise<boolean> {
  if (!state.client || !state.connected) return false;
  state.teamProjectBusy = true;
  try {
    const detail = state.teamProjectDetail;
    if (!detail) return false;
    const project = detail.project;
    const newMemberIds = [...project.memberIds, agentId];
    const newMembers = [...project.members, { id: agentId, name, role, emoji, keywords }];
    await state.client.request("team.project.update", {
      projectId,
      memberIds: newMemberIds,
      members: newMembers,
    });
    await Promise.all([
      loadProjectDetail(state, projectId),
      loadProjectHealth(state, projectId),
      loadTeamProjects(state),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    state.teamProjectBusy = false;
  }
}

export async function removeProjectMember(
  state: TeamProjectsState,
  projectId: string,
  agentId: string,
): Promise<boolean> {
  if (!state.client || !state.connected) return false;
  state.teamProjectBusy = true;
  try {
    const detail = state.teamProjectDetail;
    if (!detail) return false;
    const project = detail.project;
    if (agentId === project.supervisorId) return false;
    const newMemberIds = project.memberIds.filter((id) => id !== agentId);
    const newMembers = project.members.filter((m) => m.id !== agentId);
    await state.client.request("team.project.update", {
      projectId,
      memberIds: newMemberIds,
      members: newMembers,
    });
    await Promise.all([loadProjectDetail(state, projectId), loadTeamProjects(state)]);
    return true;
  } catch {
    return false;
  } finally {
    state.teamProjectBusy = false;
  }
}

// ── Select Project ──────────────────────────────────────────────────────

export async function selectProject(state: TeamProjectsState, projectId: string): Promise<void> {
  state.teamProjectSelectedId = projectId;
  state.teamProjectTab = "members";
  state.teamProjectDetail = null;
  state.teamProjectHealth = null;
  state.teamProjectStats = null;
  state.teamProjectMemory = null;
  state.teamProjectActivity = null;
  state.teamProjectFiles = null;

  // Load detail + health + activity in parallel
  await Promise.all([
    loadProjectDetail(state, projectId),
    loadProjectHealth(state, projectId),
    loadProjectActivity(state, projectId),
  ]);

  // Start health polling
  startProjectHealthPoll(state);
}

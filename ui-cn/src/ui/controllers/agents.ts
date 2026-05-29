import type { AppViewState } from "../app-view-state";
import type { GatewayBrowserClient } from "../gateway";
import type { AgentsListResult } from "../types";

export type AgentsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  agentsLoading: boolean;
  agentsError: string | null;
  agentsList: AgentsListResult | null;
  agentCreating: boolean;
  agentCreateError: string | null;
  agentDeleting: boolean;
  agentDeleteError: string | null;
  agentsSelectedId: string | null;
  dmScopeStatus?: AppViewState["dmScopeStatus"];
};

export async function loadAgents(state: AgentsState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.agentsLoading) {
    return;
  }
  state.agentsLoading = true;
  state.agentsError = null;
  try {
    const res = await state.client.request("agents.list", {});
    if (res) {
      state.agentsList = res;
    }
  } catch (err) {
    state.agentsError = String(err);
  } finally {
    state.agentsLoading = false;
  }
}

export async function createAgent(
  state: AgentsState,
  params: { id: string; name: string; workspace: string },
): Promise<{ ok: boolean; agentId?: string }> {
  if (!state.client || !state.connected) {
    return { ok: false };
  }
  state.agentCreating = true;
  state.agentCreateError = null;
  try {
    // Backend derives agentId from name via normalizeAgentId().
    // Schema is { name, workspace, emoji?, avatar? } — no 'id' field.
    // We pass the English ID as name so the backend can generate a valid agentId.
    const res = await state.client.request("agents.create", {
      name: params.id,
      workspace: params.workspace,
    });

    const agentId = res?.agentId ?? params.id;

    // If the user provided a separate display name (e.g. Chinese), update it.
    if (params.name && params.name !== params.id) {
      try {
        await state.client.request("agents.update", {
          agentId,
          name: params.name,
        });
      } catch {
        // Non-fatal: agent was created, display name update failed silently.
      }
    }

    await loadAgents(state);
    state.agentsSelectedId = agentId;
    return { ok: true, agentId };
  } catch (err) {
    state.agentCreateError = String(err);
    return { ok: false };
  } finally {
    state.agentCreating = false;
  }
}

export async function loadDmScopeStatus(state: AgentsState) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const res = await state.client.request("sessions.dmScopeStatus", {});
    if (res) {
      state.dmScopeStatus = res;
    }
  } catch {
    // Non-fatal: dmScope status is optional
  }
}

export async function deleteAgent(
  state: AgentsState,
  params: { agentId: string; deleteFiles?: boolean },
): Promise<boolean> {
  if (!state.client || !state.connected) {
    return false;
  }
  state.agentDeleting = true;
  state.agentDeleteError = null;
  try {
    await state.client.request("agents.delete", params);
    if (state.agentsSelectedId === params.agentId) {
      state.agentsSelectedId = null;
    }
    // Force reload: reset agentsLoading to bypass the re-entrancy guard
    state.agentsLoading = false;
    await loadAgents(state);
    return true;
  } catch (err) {
    state.agentDeleteError = String(err);
    return false;
  } finally {
    state.agentDeleting = false;
  }
}

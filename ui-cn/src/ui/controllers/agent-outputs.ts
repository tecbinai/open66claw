/**
 * Agent Outputs Controller — manages state for the Outputs tab
 * that displays agent-generated workspace files.
 *
 * Follows the same pattern as agent-files.ts.
 */

import type { GatewayBrowserClient } from "../gateway.ts";
import type { AgentOutputsListResult, AgentOutputsGetResult } from "../types.ts";

export type AgentOutputsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  agentOutputsLoading: boolean;
  agentOutputsError: string | null;
  agentOutputsList: AgentOutputsListResult | null;
  agentOutputActive: string | null;
  agentOutputContent: string | null;
  agentOutputContentLoading: boolean;
};

export async function loadAgentOutputs(state: AgentOutputsState, agentId: string) {
  if (!state.client || !state.connected || state.agentOutputsLoading) return;
  state.agentOutputsLoading = true;
  state.agentOutputsError = null;
  try {
    const res = await state.client.request<AgentOutputsListResult | null>("agents.outputs.list", {
      agentId,
    });
    if (res) {
      state.agentOutputsList = res;
      // Reset active selection if it no longer exists
      if (state.agentOutputActive && !res.entries.some((e) => e.name === state.agentOutputActive)) {
        state.agentOutputActive = null;
        state.agentOutputContent = null;
      }
    }
  } catch (err) {
    state.agentOutputsError = String(err);
  } finally {
    state.agentOutputsLoading = false;
  }
}

export async function loadAgentOutputContent(
  state: AgentOutputsState,
  agentId: string,
  filePath: string,
  relativeName: string,
) {
  if (!state.client || !state.connected || state.agentOutputContentLoading) return;
  state.agentOutputContentLoading = true;
  state.agentOutputActive = relativeName;
  state.agentOutputContent = null;
  try {
    const res = await state.client.request<AgentOutputsGetResult | null>("agents.outputs.get", {
      agentId,
      path: filePath,
    });
    if (res?.entry?.content !== undefined) {
      state.agentOutputContent = res.entry.content;
    }
  } catch (err) {
    state.agentOutputsError = String(err);
  } finally {
    state.agentOutputContentLoading = false;
  }
}

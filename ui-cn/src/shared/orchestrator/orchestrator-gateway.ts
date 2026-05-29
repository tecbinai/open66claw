/**
 * Orchestrator Gateway Communication
 *
 * Frontend functions that call gateway methods via callGateway.
 * Used by the orchestrator view to interact with the backend.
 *
 * Note: In the actual UI integration, these will use the existing
 * callGateway function from the main app's gateway/call module.
 * This module provides typed wrappers.
 */

import type { CommunityTemplate, DeployProgress } from "./orchestrator-state.js";
import type { SceneTemplate } from "./types.js";

// ── Gateway Call Type ────────────────────────────────────────────────────

export type GatewayCallFn = (method: string, params: Record<string, unknown>) => Promise<unknown>;

// ── Response Types ───────────────────────────────────────────────────────

export type TemplateListResponse = {
  templates: SceneTemplate[];
};

export type QuickDeployResponse = {
  planId: string;
  status: string;
};

export type DeployStatusResponse = {
  planId: string;
  status: string;
  agents: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
    error?: string;
  }>;
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  plan: {
    teamDescription: string;
    agentCount: number;
    mode: string;
    usageGuide?: string;
  };
};

// ── Gateway Methods ──────────────────────────────────────────────────────

/**
 * Fetch available templates from the gateway.
 */
export async function fetchTemplates(callGateway: GatewayCallFn): Promise<SceneTemplate[]> {
  const result = (await callGateway("orchestrator.templates.list", {})) as TemplateListResponse;
  return result.templates ?? [];
}

/**
 * Quick deploy a template.
 */
export async function quickDeployTemplate(
  callGateway: GatewayCallFn,
  templateId: string,
): Promise<QuickDeployResponse> {
  return callGateway("orchestrator.quick_deploy", { templateId }) as Promise<QuickDeployResponse>;
}

/**
 * Poll deployment status.
 */
export async function pollDeployStatus(
  callGateway: GatewayCallFn,
  planId: string,
): Promise<DeployStatusResponse> {
  return callGateway("orchestrator.deploy.status", { planId }) as Promise<DeployStatusResponse>;
}

// ── Guided Flow ──────────────────────────────────────────────────────

export type GuidedProposeResponse = {
  planId: string;
  teamName: string;
  teamDescription: string;
  agents: Array<{
    id: string;
    name: string;
    role: string;
    emoji?: string;
    modelTier: string;
    tools: string[];
    abilities?: string[];
    skills?: string[];
    modelName?: string;
  }>;
  costEstimate?: string;
  coverageScore?: number;
  feasibilityScore?: number;
  refinementSummary?: string;
};

/**
 * Propose a team based on requirement + gathered answers.
 */
export async function proposeTeam(
  callGateway: GatewayCallFn,
  requirement: string,
  answers: Record<string, string>,
): Promise<GuidedProposeResponse> {
  return callGateway("orchestrator.guided_propose", {
    requirement,
    userContext: JSON.stringify(answers),
  }) as Promise<GuidedProposeResponse>;
}

/**
 * Deploy a proposed plan.
 */
export async function deployProposal(
  callGateway: GatewayCallFn,
  planId: string,
): Promise<{ planId: string; status: string }> {
  return callGateway("orchestrator.guided_deploy", { planId }) as Promise<{
    planId: string;
    status: string;
  }>;
}

// ── Community Templates ─────────────────────────────────────────────

export type CommunityListResponse = {
  templates: CommunityTemplate[];
};

/**
 * Fetch community-shared templates from the gateway.
 * The gateway proxies the request to a remote CDN / community API.
 */
export async function fetchCommunityTemplates(
  callGateway: GatewayCallFn,
): Promise<CommunityTemplate[]> {
  const result = (await callGateway("orchestrator.community.list", {})) as CommunityListResponse;
  return result.templates ?? [];
}

/**
 * Convert a DeployStatusResponse to a DeployProgress object for the UI state.
 */
export function toDeployProgress(response: DeployStatusResponse): DeployProgress {
  return {
    total: response.progress.total,
    completed: response.progress.completed,
    failed: response.progress.failed,
    agents: response.agents.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status as DeployProgress["agents"][0]["status"],
      error: a.error,
    })),
  };
}

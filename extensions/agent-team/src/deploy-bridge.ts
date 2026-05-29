/**
 * Deploy Bridge — Orchestrator → Agent Team (SKELETON)
 *
 * Bridges the orchestrator's deploy output to the agent-team plugin.
 * When the orchestrator finishes deploying agents, this module creates
 * the corresponding Project entity with FULL capability binding.
 *
 * CURRENT STATUS: SKELETON — callGateway is not yet implemented in the
 * plugin SDK (see index.ts:334-339). The 7-step deployment flow requires
 * callGateway to function. This module exports types and the function
 * signature so other modules can import and reference them, but the
 * implementation is a TODO.
 *
 * TODO: Implement when one of these is available:
 *   A) Plugin SDK provides api.callGateway()
 *   B) Gateway methods are callable from within plugins
 *   C) A gateway proxy is injected at registration time
 *
 * Migrated from clawdbot extensions/agent-team/src/deploy-bridge.ts (796 lines)
 * Full implementation preserved in clawdbot reference for when callGateway becomes available.
 */

import { extractKeywordsFromRole } from "./keyword-router.js";
import { generateProjectId, sanitizeProjectId } from "./project-id.js";
import { saveProject } from "./state.js";
import type {
  CallGatewayFn,
  MemberInfo,
  Project,
  ProjectDeployReport,
  TeamConstraints,
} from "./types.js";

// ── Orchestrator Plan Shape (read-only, minimal surface) ─────────────────

export type OrchestratorPlanAgent = {
  id: string;
  name: string;
  role: string;
  emoji?: string;
  tools?: {
    allow?: string[];
    deny?: string[];
    profile?: string;
    skills?: string[];
    mcpServers?: string[];
  };
  modelTier?: string;
  routingKeywords?: string[];
  inferredCapabilities?: Record<string, unknown>;
};

export type OrchestratorPlan = {
  planId: string;
  teamName?: string;
  teamDescription: string;
  agents: OrchestratorPlanAgent[];
  templateId?: string;
  mode?: string;
};

// ── Public API Types ─────────────────────────────────────────────────────

export type CreateFromPlanParams = {
  planId: string;
  name?: string;
  constraints?: TeamConstraints;
  orchestratorStateDir: string;
};

export type CreateFromPlanResult = {
  project: Project;
  report: ProjectDeployReport;
};

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Create a Project entity from an orchestrator deployment plan.
 *
 * SKELETON: This function is not yet functional because callGateway
 * is not available in the current plugin SDK. When callGateway becomes
 * available, the full 7-step deployment flow from clawdbot will be
 * restored:
 *
 *   Step 1: Read orchestrator plan + state
 *   Step 2: Build member info (with keywords, tool profile, model tier)
 *   Step 3: Create Project entity and save to disk
 *   Step 4: Write Supervisor SOUL.md (mandatory)
 *   Step 5: Write tool policy for each agent via config.patch
 *   Step 6: Validate deployment
 *   Step 7: Return structured deploy report
 *
 * @throws Always throws — not yet implemented
 */
export async function createProjectFromPlan(
  _callGateway: CallGatewayFn,
  params: CreateFromPlanParams,
): Promise<CreateFromPlanResult> {
  // Validate planId to prevent path traversal (this part works)
  sanitizeProjectId(params.planId);

  // TODO: Full 7-step implementation requires callGateway.
  // See clawdbot reference: extensions/agent-team/src/deploy-bridge.ts
  //
  // Blocked by: callGateway is a stub (index.ts:334-339)
  // Unblock conditions:
  //   - Plugin SDK adds api.callGateway() method
  //   - Or: gateway methods become callable from within plugins
  //   - Or: a gateway proxy is injected at plugin registration time
  //
  // When unblocked, restore the full implementation from clawdbot which includes:
  //   - readOrchestratorPlan() / readOrchestratorState() from disk
  //   - Auto-create supervisor agent via callGateway("agents.create")
  //   - Write SOUL.md/AGENTS.md/TOOLS.md via callGateway("agents.files.set")
  //   - Unified config.patch for tool policies + A2A communication
  //   - Retry logic with exponential backoff
  //   - Multi-language error detection (EN + CN)
  //   - CJK-safe truncation
  //   - Template-category-aware default configs

  throw new Error(
    `[deploy-bridge] createProjectFromPlan is not yet implemented. ` +
      `callGateway is required but not available in the current plugin SDK. ` +
      `planId="${params.planId}"`,
  );
}

// ── Helper exports (used by other modules, work without callGateway) ─────

/**
 * Extract routing keywords from a member role, or use provided ones.
 * This helper works standalone — no callGateway needed.
 */
export function buildMemberKeywords(routingKeywords: string[] | undefined, role: string): string[] {
  return routingKeywords?.length ? routingKeywords : extractKeywordsFromRole(role);
}

/**
 * CJK-safe truncation helper.
 */
export function truncateCJKSafe(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const codePoints = Array.from(s);
  if (codePoints.length <= maxLen) return s;
  return codePoints.slice(0, maxLen).join("");
}

/**
 * Fast Path Router — Deterministic message routing for agent teams.
 *
 * 3-layer cascade:
 *   1. Session Affinity  (<5ms)  — sticky routing to previously used agent
 *   2. Keyword Match     (<10ms) — CJK-aware pattern matching from member roles
 *   3. null → Supervisor LLM     — fallback, message goes to supervisor as-is
 *
 * Returns null when no deterministic match is found, signaling that the
 * message should be handled by the Supervisor agent's LLM for routing.
 *
 * Migrated from clawdbot extensions/agent-team/src/fast-path-router.ts
 */

import { matchKeywordRoute } from "./keyword-router.js";
import { isRoutable } from "./member-health.js";
import { resolveAffinityAgent } from "./session-affinity.js";
import type {
  FastPathConfig,
  FastPathResult,
  KeywordRoute,
  MemberHealth,
  Project,
} from "./types.js";

// ── Default Config ───────────────────────────────────────────────────────

export const DEFAULT_FAST_PATH_CONFIG: FastPathConfig = {
  sessionAffinityEnabled: true,
  affinityTimeoutMinutes: 30,
  keywordConfidenceThreshold: 0.1,
};

// ── Route Table Cache ────────────────────────────────────────────────────

const routeTableCache = new Map<string, KeywordRoute[]>();

export function setRouteTable(projectId: string, routes: KeywordRoute[]): void {
  routeTableCache.set(projectId, routes);
}

export function getRouteTable(projectId: string): KeywordRoute[] {
  return routeTableCache.get(projectId) ?? [];
}

export function clearRouteTable(projectId: string): void {
  routeTableCache.delete(projectId);
}

export function resetAllRouteTables(): void {
  routeTableCache.clear();
}

// ── Core Router ──────────────────────────────────────────────────────────

export type RouteMessageParams = {
  /** Raw user message text */
  message: string;
  /** The project to route within */
  project: Project;
  /** Sender/peer identifier */
  peerId: string;
  /** Current health state of all members */
  healthMap: Map<string, MemberHealth>;
};

/**
 * Attempt deterministic routing for a message within a team project.
 *
 * Returns a FastPathResult if a deterministic route is found,
 * or null if the message should fall through to Supervisor LLM.
 */
export function routeMessage(params: RouteMessageParams): FastPathResult | null {
  const { message, project, peerId, healthMap } = params;

  if (!message.trim()) return null;

  const config: FastPathConfig = {
    ...DEFAULT_FAST_PATH_CONFIG,
    ...project.coordination.fastPath,
  };

  // Filter out agents that are not routable (health state = "down")
  const routableMembers = new Set(
    project.memberIds.filter((id) => {
      // Never route directly to the supervisor — that's the fallback
      if (id === project.supervisorId) return false;
      const health = healthMap.get(id);
      return !health || isRoutable(health);
    }),
  );

  if (routableMembers.size === 0) return null;

  // ── Layer 1: Session Affinity ──────────────────────────────────────
  if (config.sessionAffinityEnabled) {
    const affinitizedAgent = resolveAffinityAgent(
      project.projectId,
      peerId,
      config.affinityTimeoutMinutes,
    );

    if (affinitizedAgent && routableMembers.has(affinitizedAgent)) {
      return {
        agentId: affinitizedAgent,
        method: "affinity",
        confidence: 0.9,
      };
    }
  }

  // ── Layer 2: Keyword Match ─────────────────────────────────────────
  const routes = getRouteTable(project.projectId);
  if (routes.length > 0) {
    const routableRoutes = routes.filter((r) => routableMembers.has(r.agentId));

    const match = matchKeywordRoute(message, routableRoutes);
    if (match && match.confidence >= config.keywordConfidenceThreshold) {
      return {
        agentId: match.agentId,
        method: "keyword",
        confidence: match.confidence,
        matchedPattern: match.matchedPattern,
      };
    }
  }

  // ── Layer 3: null → Supervisor LLM fallback ────────────────────────
  return null;
}

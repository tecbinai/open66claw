/**
 * Member Stats — Call tracking for team agents.
 *
 * Migrated from clawdbot extensions/agent-team/src/member-stats.ts
 */

import type { MemberStats } from "./types.js";

/**
 * Create initial stats for a new team member.
 */
export function createInitialMemberStats(agentId: string): MemberStats {
  return {
    agentId,
    callCount: 0,
    totalDurationMs: 0,
  };
}

/**
 * Record a call to a member agent.
 */
export function recordMemberCall(stats: MemberStats, durationMs?: number): MemberStats {
  return {
    ...stats,
    callCount: stats.callCount + 1,
    totalDurationMs: stats.totalDurationMs + (durationMs ?? 0),
    lastCallAt: new Date().toISOString(),
  };
}

/**
 * Compute average call duration.
 */
export function computeAverageDuration(stats: MemberStats): number {
  if (stats.callCount === 0) return 0;
  return Math.round(stats.totalDurationMs / stats.callCount);
}

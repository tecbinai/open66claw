/**
 * Member Health State Machine
 *
 * Three-state FSM tracking agent reliability within a team:
 *   healthy ──(consecutive failures ≥ 2)──→ degraded
 *   degraded ──(consecutive failures ≥ 5)──→ down
 *   down ──(1 probe success)──→ degraded
 *   degraded ──(consecutive successes ≥ 3)──→ healthy
 *
 * Migrated from clawdbot extensions/agent-team/src/member-health.ts
 */

import type { MemberHealth, MemberHealthState } from "./types.js";

// ── Thresholds ───────────────────────────────────────────────────────────

/** Consecutive failures to transition healthy → degraded */
const DEGRADED_THRESHOLD = 2;
/** Consecutive failures to transition degraded → down */
const DOWN_THRESHOLD = 5;
/** Consecutive successes to transition degraded → healthy */
const RECOVERY_THRESHOLD = 3;

// ── Factory ──────────────────────────────────────────────────────────────

/**
 * Create initial health record for a new team member.
 */
export function createInitialMemberHealth(agentId: string): MemberHealth {
  return {
    agentId,
    state: "healthy",
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    totalFailures: 0,
    totalSuccesses: 0,
  };
}

// ── State Transitions ────────────────────────────────────────────────────

/**
 * Record a successful agent execution. Returns updated health.
 */
export function recordMemberSuccess(health: MemberHealth): MemberHealth {
  const now = new Date().toISOString();
  const updated: MemberHealth = {
    ...health,
    consecutiveSuccesses: health.consecutiveSuccesses + 1,
    consecutiveFailures: 0,
    totalSuccesses: health.totalSuccesses + 1,
    lastSuccessAt: now,
  };

  // Transition: down → degraded (1 success)
  if (health.state === "down") {
    updated.state = "degraded";
    updated.consecutiveSuccesses = 1;
  }
  // Transition: degraded → healthy (3 consecutive successes)
  else if (health.state === "degraded" && updated.consecutiveSuccesses >= RECOVERY_THRESHOLD) {
    updated.state = "healthy";
  }

  return updated;
}

/**
 * Record a failed agent execution. Returns updated health.
 */
export function recordMemberFailure(health: MemberHealth, error?: string): MemberHealth {
  const now = new Date().toISOString();
  const updated: MemberHealth = {
    ...health,
    consecutiveFailures: health.consecutiveFailures + 1,
    consecutiveSuccesses: 0,
    totalFailures: health.totalFailures + 1,
    lastFailureAt: now,
    lastError: error,
  };

  // Transition: healthy → degraded
  if (health.state === "healthy" && updated.consecutiveFailures >= DEGRADED_THRESHOLD) {
    updated.state = "degraded";
  }
  // Transition: degraded → down
  else if (health.state === "degraded" && updated.consecutiveFailures >= DOWN_THRESHOLD) {
    updated.state = "down";
  }

  return updated;
}

// ── Queries ──────────────────────────────────────────────────────────────

/**
 * Get the current health state.
 */
export function getMemberHealthStatus(health: MemberHealth): MemberHealthState {
  return health.state;
}

/**
 * Whether this member can receive routed messages.
 * Returns false only when state is "down".
 */
export function isRoutable(health: MemberHealth): boolean {
  return health.state !== "down";
}

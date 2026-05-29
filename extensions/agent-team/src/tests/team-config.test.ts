/**
 * Agent Team Config Tests — types, project-id, member-health, member-stats
 */

import { describe, it, expect } from "vitest";
import {
  createInitialMemberHealth,
  recordMemberSuccess,
  recordMemberFailure,
  isRoutable,
  getMemberHealthStatus,
} from "../member-health.js";
import {
  createInitialMemberStats,
  recordMemberCall,
  computeAverageDuration,
} from "../member-stats.js";
import { generateProjectId, sanitizeProjectId, isValidProjectId } from "../project-id.js";

// ── Project ID ───────────────────────────────────────────────────────────

describe("project-id", () => {
  it("generates valid project ID with correct format", () => {
    const id = generateProjectId();
    expect(id).toMatch(/^proj-\d{8}-[a-f0-9]{8}$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateProjectId()));
    expect(ids.size).toBe(100);
  });

  it("sanitizeProjectId accepts valid IDs", () => {
    expect(sanitizeProjectId("proj-20260101-abc12345")).toBe("proj-20260101-abc12345");
    expect(sanitizeProjectId("my_project-123")).toBe("my_project-123");
  });

  it("sanitizeProjectId rejects path traversal", () => {
    expect(() => sanitizeProjectId("../etc/passwd")).toThrow("Invalid projectId");
    expect(() => sanitizeProjectId("proj/../hack")).toThrow("Invalid projectId");
    expect(() => sanitizeProjectId("")).toThrow("Invalid projectId");
  });

  it("isValidProjectId returns correct booleans", () => {
    expect(isValidProjectId("proj-20260101-abc12345")).toBe(true);
    expect(isValidProjectId("../hack")).toBe(false);
    expect(isValidProjectId("")).toBe(false);
  });
});

// ── Member Health FSM ────────────────────────────────────────────────────

describe("member-health", () => {
  it("creates initial healthy state", () => {
    const health = createInitialMemberHealth("agent-1");
    expect(health.state).toBe("healthy");
    expect(health.agentId).toBe("agent-1");
    expect(health.consecutiveFailures).toBe(0);
    expect(health.consecutiveSuccesses).toBe(0);
    expect(isRoutable(health)).toBe(true);
  });

  it("stays healthy after 1 failure", () => {
    let health = createInitialMemberHealth("agent-1");
    health = recordMemberFailure(health, "timeout");
    expect(health.state).toBe("healthy");
    expect(health.consecutiveFailures).toBe(1);
    expect(health.totalFailures).toBe(1);
  });

  it("transitions healthy → degraded after 2 failures", () => {
    let health = createInitialMemberHealth("agent-1");
    health = recordMemberFailure(health, "err1");
    health = recordMemberFailure(health, "err2");
    expect(health.state).toBe("degraded");
    expect(isRoutable(health)).toBe(true); // degraded is still routable
  });

  it("transitions degraded → down after 5 more failures", () => {
    let health = createInitialMemberHealth("agent-1");
    // healthy → degraded (2 failures)
    health = recordMemberFailure(health);
    health = recordMemberFailure(health);
    expect(health.state).toBe("degraded");
    // degraded → down (5 more failures)
    for (let i = 0; i < 5; i++) {
      health = recordMemberFailure(health);
    }
    expect(health.state).toBe("down");
    expect(isRoutable(health)).toBe(false);
  });

  it("transitions down → degraded with 1 success", () => {
    let health = createInitialMemberHealth("agent-1");
    // Force to down
    for (let i = 0; i < 7; i++) {
      health = recordMemberFailure(health);
    }
    expect(health.state).toBe("down");

    health = recordMemberSuccess(health);
    expect(health.state).toBe("degraded");
    expect(isRoutable(health)).toBe(true);
  });

  it("transitions degraded → healthy with 3 consecutive successes", () => {
    let health = createInitialMemberHealth("agent-1");
    // Force to degraded
    health = recordMemberFailure(health);
    health = recordMemberFailure(health);
    expect(health.state).toBe("degraded");

    health = recordMemberSuccess(health);
    health = recordMemberSuccess(health);
    expect(health.state).toBe("degraded"); // Still degraded after 2
    health = recordMemberSuccess(health);
    expect(health.state).toBe("healthy"); // Recovered after 3
  });

  it("success resets consecutive failures", () => {
    let health = createInitialMemberHealth("agent-1");
    health = recordMemberFailure(health);
    expect(health.consecutiveFailures).toBe(1);
    health = recordMemberSuccess(health);
    expect(health.consecutiveFailures).toBe(0);
  });

  it("getMemberHealthStatus returns current state", () => {
    const health = createInitialMemberHealth("agent-1");
    expect(getMemberHealthStatus(health)).toBe("healthy");
  });
});

// ── Member Stats ─────────────────────────────────────────────────────────

describe("member-stats", () => {
  it("creates initial stats with zero values", () => {
    const stats = createInitialMemberStats("agent-1");
    expect(stats.agentId).toBe("agent-1");
    expect(stats.callCount).toBe(0);
    expect(stats.totalDurationMs).toBe(0);
    expect(stats.lastCallAt).toBeUndefined();
  });

  it("records calls and accumulates duration", () => {
    let stats = createInitialMemberStats("agent-1");
    stats = recordMemberCall(stats, 100);
    expect(stats.callCount).toBe(1);
    expect(stats.totalDurationMs).toBe(100);
    expect(stats.lastCallAt).toBeDefined();

    stats = recordMemberCall(stats, 200);
    expect(stats.callCount).toBe(2);
    expect(stats.totalDurationMs).toBe(300);
  });

  it("handles undefined duration", () => {
    let stats = createInitialMemberStats("agent-1");
    stats = recordMemberCall(stats);
    expect(stats.callCount).toBe(1);
    expect(stats.totalDurationMs).toBe(0);
  });

  it("computes average duration", () => {
    let stats = createInitialMemberStats("agent-1");
    stats = recordMemberCall(stats, 100);
    stats = recordMemberCall(stats, 300);
    expect(computeAverageDuration(stats)).toBe(200);
  });

  it("computes zero average for zero calls", () => {
    const stats = createInitialMemberStats("agent-1");
    expect(computeAverageDuration(stats)).toBe(0);
  });
});

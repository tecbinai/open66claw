/**
 * Performance & Stress Tests
 *
 * Tests that the system remains performant under load:
 * - Keyword routing with many routes
 * - Health state machine with rapid transitions
 * - Shared profile with max entries
 * - Session affinity store with many entries
 * - Large member lists
 */
import { describe, expect, it, beforeEach } from "vitest";
import { routeMessage, setRouteTable, resetAllRouteTables } from "../fast-path-router.js";
import {
  matchKeywordRoute,
  extractKeywordsFromRole,
  buildRoutesFromMembers,
} from "../keyword-router.js";
import {
  recordMemberSuccess,
  recordMemberFailure,
  createInitialMemberHealth,
} from "../member-health.js";
import {
  recordMemberCall,
  createInitialMemberStats,
  computeAverageDuration,
} from "../member-stats.js";
import {
  setAffinity,
  getAffinity,
  purgeExpiredAffinities,
  resetAllAffinities,
} from "../session-affinity.js";
import {
  upsertSharedEntry,
  formatSharedProfileForPrompt,
  computeSharedEntryScore,
  SHARED_PROFILE_MAX_ENTRIES,
} from "../shared-profile-store.js";
import type { SharedProfile, SharedProfileEntry } from "../shared-profile-store.js";
import { generateSupervisorSoul } from "../supervisor-soul.js";
import { buildTeamContextBlock } from "../system-prompt.js";
import type { MemberInfo, KeywordRoute, MemberHealth } from "../types.js";
import { makeProject } from "./test-helpers.js";

describe("performance — keyword routing", () => {
  it("matchKeywordRoute with 1000 routes completes under 10ms", () => {
    const routes: KeywordRoute[] = Array.from({ length: 1000 }, (_, i) => ({
      pattern: `keyword_${i}_unique_pattern`,
      agentId: `agent-${i}`,
      priority: 50,
    }));

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      matchKeywordRoute("I need help with keyword_500_unique_pattern please", routes);
    }
    const elapsed = performance.now() - start;

    // 100 iterations should complete under 100ms (1ms each)
    expect(elapsed).toBeLessThan(100);
  });

  it("extractKeywordsFromRole with very long description", () => {
    const longRole = Array.from({ length: 100 }, (_, i) => `specialty_${i}`).join(", ");
    const start = performance.now();
    const result = extractKeywordsFromRole(longRole);
    const elapsed = performance.now() - start;

    expect(result.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });

  it("buildRoutesFromMembers with 8 members (max)", () => {
    const members: MemberInfo[] = Array.from({ length: 8 }, (_, i) => ({
      id: `agent-${i}`,
      name: `Agent ${i}`,
      role: `Handles category ${i} requests, specialty area ${i}`,
    }));

    const start = performance.now();
    const routes = buildRoutesFromMembers(members);
    const elapsed = performance.now() - start;

    expect(routes.length).toBeGreaterThan(8); // At least name routes
    expect(elapsed).toBeLessThan(10);
  });
});

describe("performance — fast-path routing", () => {
  beforeEach(() => {
    resetAllRouteTables();
    resetAllAffinities();
  });

  it("routeMessage with large route table completes quickly", () => {
    const project = makeProject();
    const routes: KeywordRoute[] = Array.from({ length: 500 }, (_, i) => ({
      pattern: `pattern_${i}`,
      agentId: i % 2 === 0 ? "agent-a" : "agent-b",
      priority: 50,
    }));
    setRouteTable(project.projectId, routes);

    const healthMap = new Map<string, MemberHealth>();

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      routeMessage({
        message: `I need help with pattern_250 please`,
        project,
        peerId: `peer-${i}`,
        healthMap,
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
  });
});

describe("performance — session affinity", () => {
  beforeEach(() => resetAllAffinities());

  it("handles 10000 affinities without degradation", () => {
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      setAffinity("proj-1", `peer-${i}`, `agent-${i % 10}`);
    }
    const writeElapsed = performance.now() - start;

    const readStart = performance.now();
    for (let i = 0; i < 10000; i++) {
      getAffinity("proj-1", `peer-${i}`);
    }
    const readElapsed = performance.now() - readStart;

    expect(writeElapsed).toBeLessThan(500);
    expect(readElapsed).toBeLessThan(200);
  });

  it("purgeExpiredAffinities with 10000 entries completes quickly", () => {
    for (let i = 0; i < 10000; i++) {
      setAffinity("proj-1", `peer-${i}`, `agent-${i % 10}`);
    }

    const start = performance.now();
    // timeout=0 means all entries are expired
    const purged = purgeExpiredAffinities(0);
    const elapsed = performance.now() - start;

    expect(purged).toBe(10000);
    expect(elapsed).toBeLessThan(500);
  });
});

describe("performance — health state machine", () => {
  it("10000 state transitions complete quickly", () => {
    let h = createInitialMemberHealth("agent");

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      if (i % 3 === 0) {
        h = recordMemberFailure(h, `error-${i}`);
      } else {
        h = recordMemberSuccess(h);
      }
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(h.totalSuccesses + h.totalFailures).toBe(10000);
  });
});

describe("performance — member stats", () => {
  it("10000 call recordings without precision loss", () => {
    let s = createInitialMemberStats("agent");

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      s = recordMemberCall(s, 150);
    }
    const elapsed = performance.now() - start;

    expect(s.callCount).toBe(10000);
    expect(s.totalDurationMs).toBe(1_500_000);
    expect(computeAverageDuration(s)).toBe(150);
    expect(elapsed).toBeLessThan(100);
  });
});

describe("performance — shared profile operations", () => {
  it("upsertSharedEntry at max capacity: sort+truncate performance", () => {
    // Build a profile at max capacity
    let profile: SharedProfile = { version: 1, entries: [] };
    for (let i = 0; i < SHARED_PROFILE_MAX_ENTRIES; i++) {
      profile = upsertSharedEntry(profile, {
        category: "fact",
        key: `key-${i}`,
        value: `value-${i}`,
        sourceAgentId: `agent-${i % 5}`,
      });
    }
    expect(profile.entries).toHaveLength(SHARED_PROFILE_MAX_ENTRIES);

    // Now add 100 more entries (each triggers eviction sort)
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      profile = upsertSharedEntry(profile, {
        category: "fact",
        key: `overflow-${i}`,
        value: `overflow-value-${i}`,
        sourceAgentId: "agent-overflow",
      });
    }
    const elapsed = performance.now() - start;

    expect(profile.entries).toHaveLength(SHARED_PROFILE_MAX_ENTRIES);
    expect(elapsed).toBeLessThan(100);
  });

  it("formatSharedProfileForPrompt with max entries", () => {
    const entries: SharedProfileEntry[] = Array.from(
      { length: SHARED_PROFILE_MAX_ENTRIES },
      (_, i) => ({
        category: (["fact", "identity", "preference"] as const)[i % 3],
        key: `key-${i}`,
        value: `value-${i}-with-some-text`,
        createdAt: Date.now() - i * 1000,
        updatedAt: Date.now() - i * 1000,
        hits: Math.floor(Math.random() * 10) + 1,
        sourceAgentId: `agent-${i % 5}`,
      }),
    );
    const profile: SharedProfile = { version: 1, entries };

    const start = performance.now();
    const result = formatSharedProfileForPrompt(profile);
    const elapsed = performance.now() - start;

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(1500);
    expect(elapsed).toBeLessThan(50);
  });

  it("computeSharedEntryScore: 10000 computations", () => {
    const entry: SharedProfileEntry = {
      category: "fact",
      key: "test",
      value: "value",
      createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
      updatedAt: Date.now() - 3600000,
      hits: 5,
      sourceAgentId: "agent",
    };

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      computeSharedEntryScore(entry);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});

describe("performance — SOUL generation", () => {
  it("generateSupervisorSoul with max members", () => {
    const members: MemberInfo[] = Array.from({ length: 8 }, (_, i) => ({
      id: `agent-${i}`,
      name: `Agent Number ${i}`,
      role: `Specialist in area ${i}, handles complex ${i}-type requests, certified ${i}-expert`,
      emoji: ["🔧", "💡", "📊", "🎯", "💼", "🔬", "📱", "🎨"][i],
    }));

    const project = makeProject({
      memberIds: ["supervisor", ...members.map((m) => m.id)],
      members: [{ id: "supervisor", name: "Supervisor", role: "Team coordinator" }, ...members],
      constraints: {
        brandRules: {
          userAddress: "尊敬的客户",
          forbidden: ["竞品A", "竞品B", "低级错误"],
          safetyRules: ["不得泄露内部价格策略", "不得承诺未经授权的折扣"],
        },
      },
    });

    const start = performance.now();
    const soul = generateSupervisorSoul(project, members);
    const elapsed = performance.now() - start;

    expect(soul.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(20);

    // Verify all members appear
    for (const m of members) {
      expect(soul).toContain(m.name);
    }
  });

  it("buildTeamContextBlock: performance with shared memory mode", () => {
    const project = makeProject({
      memory: { mode: "read-shared" },
    });

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      buildTeamContextBlock(project, "supervisor");
      buildTeamContextBlock(project, "agent-a");
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});

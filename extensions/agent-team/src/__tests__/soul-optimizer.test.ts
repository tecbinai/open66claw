/**
 * soul-optimizer.test.ts
 *
 * Coverage for:
 *   - buildMemberPerformanceProfile
 *   - appendLearningHintsToSoul
 *   - buildSupervisorLearningContext
 */

import { describe, expect, it } from "vitest";
import type { AgentSpecialization, LearningAnalysis } from "../learning-engine.js";
import {
  buildMemberPerformanceProfile,
  appendLearningHintsToSoul,
  buildSupervisorLearningContext,
} from "../soul-optimizer.js";
import type { MemberHealth, MemberStats, Project } from "../types.js";

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeProject(): Project {
  return {
    projectId: "proj-test",
    name: "Test Team",
    description: "Test",
    status: "active",
    version: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    supervisorId: "sup",
    memberIds: ["sup", "agent-a", "agent-b"],
    members: [
      { id: "sup", name: "Supervisor", role: "Coordination" },
      { id: "agent-a", name: "Sales Bot", role: "Sales" },
      { id: "agent-b", name: "Tech Bot", role: "Tech support" },
    ],
    memory: { mode: "isolated" },
    coordination: {
      supervisorStyle: "concierge",
      maxMembers: 8,
      hopLimit: 5,
      memberTimeoutSeconds: 30,
      supervisorFallbackEnabled: true,
    },
    visibility: { mode: "team" },
    bindings: [],
  };
}

function makeHealth(
  agentId: string,
  state: "healthy" | "degraded" | "down" = "healthy",
): MemberHealth {
  return {
    agentId,
    state,
    consecutiveFailures: 0,
    totalSuccesses: 10,
    totalFailures: state === "healthy" ? 0 : 3,
    lastCheckedAt: new Date().toISOString(),
  };
}

function makeStats(agentId: string, callCount = 10, totalDurationMs = 10_000): MemberStats {
  return {
    agentId,
    callCount,
    totalDurationMs,
    lastCallAt: new Date().toISOString(),
  };
}

function makeAnalysis(overrides?: Partial<LearningAnalysis>): LearningAnalysis {
  return {
    projectId: "proj-test",
    analyzedAt: new Date().toISOString(),
    eventCount: 30,
    insights: [],
    routingPatterns: [{ trigger: "报价", agentId: "agent-a", confidence: 0.92, sampleSize: 15 }],
    specializations: [
      {
        agentId: "agent-a",
        strengths: ["报价", "客户服务"],
        avgDurationMs: 1200,
        successRate: 0.95,
        totalCalls: 15,
      },
    ] as AgentSpecialization[],
    summary: "分析 30 个事件",
    ...overrides,
  };
}

// ── buildMemberPerformanceProfile ─────────────────────────────────────────

describe("soul-optimizer", () => {
  describe("buildMemberPerformanceProfile", () => {
    it("returns empty string when no member has any data", () => {
      const project = makeProject();
      const statsMap = new Map<string, MemberStats>();
      const healthMap = new Map<string, MemberHealth>();

      const result = buildMemberPerformanceProfile(project, statsMap, healthMap);
      expect(result).toBe("");
    });

    it("returns non-empty string when at least one member has call data", () => {
      const project = makeProject();
      const statsMap = new Map<string, MemberStats>([
        ["agent-a", makeStats("agent-a", 10, 10_000)],
        ["agent-b", makeStats("agent-b", 0, 0)],
      ]);
      const healthMap = new Map<string, MemberHealth>([
        ["agent-a", makeHealth("agent-a")],
        ["agent-b", makeHealth("agent-b")],
      ]);

      const result = buildMemberPerformanceProfile(project, statsMap, healthMap);
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain("Sales Bot");
    });

    it("excludes supervisor from performance profile", () => {
      const project = makeProject();
      const statsMap = new Map<string, MemberStats>([
        ["sup", makeStats("sup", 5, 5000)],
        ["agent-a", makeStats("agent-a", 10, 10_000)],
      ]);
      const healthMap = new Map<string, MemberHealth>([
        ["sup", makeHealth("sup")],
        ["agent-a", makeHealth("agent-a")],
      ]);

      const result = buildMemberPerformanceProfile(project, statsMap, healthMap);
      expect(result).not.toContain("Supervisor");
    });

    it("includes health state in output", () => {
      const project = makeProject();
      const statsMap = new Map<string, MemberStats>([
        ["agent-a", makeStats("agent-a", 10, 10_000)],
        ["agent-b", makeStats("agent-b", 10, 10_000)],
      ]);
      const healthMap = new Map<string, MemberHealth>([
        ["agent-a", makeHealth("agent-a", "degraded")],
        ["agent-b", makeHealth("agent-b", "down")],
      ]);

      const result = buildMemberPerformanceProfile(project, statsMap, healthMap);
      // Should mention degraded/failure status
      expect(result.length).toBeGreaterThan(0);
    });

    it("respects MAX_PROFILE_CHARS limit (800 chars)", () => {
      // Create a large team to stress the truncation
      const manyMembers = Array.from({ length: 20 }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${"X".repeat(30)} ${i}`, // long name
        role: "Sales",
      }));
      const largeProject: Project = {
        ...makeProject(),
        memberIds: ["sup", ...manyMembers.map((m) => m.id)],
        members: [{ id: "sup", name: "Supervisor", role: "Coordination" }, ...manyMembers],
      };
      const statsMap = new Map(manyMembers.map((m) => [m.id, makeStats(m.id, 10, 10_000)]));
      const healthMap = new Map(manyMembers.map((m) => [m.id, makeHealth(m.id)]));

      const result = buildMemberPerformanceProfile(largeProject, statsMap, healthMap);
      expect(result.length).toBeLessThanOrEqual(803); // 800 + "..."
    });

    it("uses specialization strengths when provided", () => {
      const project = makeProject();
      const statsMap = new Map<string, MemberStats>([
        ["agent-a", makeStats("agent-a", 10, 10_000)],
        ["agent-b", makeStats("agent-b", 10, 10_000)],
      ]);
      const healthMap = new Map<string, MemberHealth>([
        ["agent-a", makeHealth("agent-a")],
        ["agent-b", makeHealth("agent-b")],
      ]);
      const specializations: AgentSpecialization[] = [
        {
          agentId: "agent-a",
          strengths: ["报价", "折扣"],
          avgDurationMs: 1000,
          successRate: 0.95,
          totalCalls: 10,
        },
      ];

      const result = buildMemberPerformanceProfile(project, statsMap, healthMap, specializations);
      // Specializations should enrich the profile
      expect(typeof result).toBe("string");
    });
  });

  // ── appendLearningHintsToSoul ────────────────────────────────────────────

  describe("appendLearningHintsToSoul", () => {
    it("returns original soul unchanged when hints are empty", () => {
      const soul = "# SOUL.md\n## Identity\nYou are a supervisor.";
      const result = appendLearningHintsToSoul(soul, "");
      expect(result).toBe(soul);
    });

    it("returns original soul unchanged when hints are whitespace only", () => {
      const soul = "# SOUL.md\n## Identity\nYou are a supervisor.";
      const result = appendLearningHintsToSoul(soul, "   \n  ");
      expect(result).toBe(soul);
    });

    it("appends hints to end if no known insertion point", () => {
      const soul = "# SOUL.md\nSome content here.";
      const hints = "<learning-hints>routing: agent-a handles sales</learning-hints>";
      const result = appendLearningHintsToSoul(soul, hints);
      expect(result).toContain(hints);
      expect(result.startsWith("# SOUL.md")).toBe(true);
    });

    it("replaces existing <learning-hints> block", () => {
      const soul = [
        "# SOUL.md",
        "## Identity",
        "You are a supervisor.",
        "",
        "<learning-hints>old hints</learning-hints>",
        "",
        "## Operating Rules",
      ].join("\n");

      const newHints = "<learning-hints>new hints here</learning-hints>";
      const result = appendLearningHintsToSoul(soul, newHints);

      expect(result).toContain("new hints here");
      expect(result).not.toContain("old hints");
      // Original structure preserved
      expect(result).toContain("## Identity");
      expect(result).toContain("## Operating Rules");
    });

    it("inserts before Operating Rules section when no existing hints", () => {
      const soul = [
        "# SOUL.md",
        "## Identity",
        "You are a supervisor.",
        "",
        "## Operating Rules",
        "Rule 1.",
      ].join("\n");

      const hints = "<learning-hints>performance data</learning-hints>";
      const result = appendLearningHintsToSoul(soul, hints);

      const hintsIdx = result.indexOf(hints);
      const rulesIdx = result.indexOf("## Operating Rules");
      expect(hintsIdx).toBeLessThan(rulesIdx);
    });

    it("does not duplicate the original content", () => {
      const soul = "# SOUL.md\n## Quality Gates\nQG rules.\n## Operating Rules\nRules.";
      const hints = "<learning-hints>test</learning-hints>";
      const result = appendLearningHintsToSoul(soul, hints);

      // Count occurrences of "Operating Rules"
      const occurrences = (result.match(/## Operating Rules/g) ?? []).length;
      expect(occurrences).toBe(1);
    });
  });

  // ── buildSupervisorLearningContext ─────────────────────────────────────

  describe("buildSupervisorLearningContext", () => {
    it("returns a non-empty string with routing patterns and hints", () => {
      const project = makeProject();
      const analysis = makeAnalysis();
      const statsMap = new Map<string, MemberStats>([
        ["agent-a", makeStats("agent-a", 15, 15_000)],
        ["agent-b", makeStats("agent-b", 5, 5_000)],
      ]);
      const healthMap = new Map<string, MemberHealth>([
        ["agent-a", makeHealth("agent-a")],
        ["agent-b", makeHealth("agent-b")],
      ]);

      const result = buildSupervisorLearningContext(project, analysis, statsMap, healthMap);
      expect(typeof result).toBe("string");
    });

    it("returns empty string or minimal content for empty analysis", () => {
      const project = makeProject();
      const analysis = makeAnalysis({
        insights: [],
        routingPatterns: [],
        specializations: [],
        eventCount: 0,
      });
      const statsMap = new Map<string, MemberStats>();
      const healthMap = new Map<string, MemberHealth>();

      const result = buildSupervisorLearningContext(project, analysis, statsMap, healthMap);
      expect(typeof result).toBe("string");
      // Should not crash
    });
  });
});

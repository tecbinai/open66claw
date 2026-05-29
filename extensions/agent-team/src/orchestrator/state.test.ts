import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  initStateDir,
  savePlan,
  loadPlan,
  listPlanIds,
  saveState,
  loadState,
  createInitialState,
  updateAgentStatus,
  generatePlanId,
} from "./state.js";
import type { OrchestrationPlan, OrchestrationState } from "./types.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "orch-test-"));
  initStateDir(tempDir);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

function makePlan(overrides: Partial<OrchestrationPlan> = {}): OrchestrationPlan {
  return {
    planId: "test-plan-001",
    createdAt: "2026-02-22T00:00:00Z",
    requirement: "test requirement",
    agents: [
      {
        name: "Agent A",
        id: "agent-a",
        role: "role A",
        soul: "# SOUL A",
        modelTier: "mid",
        tools: { allow: ["group:memory"] },
      },
      {
        name: "Agent B",
        id: "agent-b",
        role: "role B",
        soul: "# SOUL B",
        modelTier: "cheap",
        tools: { allow: ["group:fs"] },
        dependsOn: ["agent-a"],
      },
    ],
    teamDescription: "Test team",
    ...overrides,
  };
}

describe("state", () => {
  describe("generatePlanId", () => {
    it("returns id in expected format", () => {
      const id = generatePlanId();
      expect(id).toMatch(/^orch-\d{8}-[a-f0-9]{8}$/);
    });

    it("generates unique ids", () => {
      const ids = new Set(Array.from({ length: 100 }, () => generatePlanId()));
      expect(ids.size).toBe(100);
    });
  });

  describe("savePlan / loadPlan", () => {
    it("round-trips a plan", async () => {
      const plan = makePlan();
      await savePlan(plan);
      const loaded = await loadPlan("test-plan-001");
      expect(loaded).toEqual(plan);
    });

    it("returns null for nonexistent plan", async () => {
      const loaded = await loadPlan("nonexistent");
      expect(loaded).toBeNull();
    });
  });

  describe("listPlanIds", () => {
    it("lists saved plans sorted", async () => {
      await savePlan(makePlan({ planId: "orch-20260222-bbbb" }));
      await savePlan(makePlan({ planId: "orch-20260222-aaaa" }));
      const ids = await listPlanIds();
      expect(ids).toEqual(["orch-20260222-aaaa", "orch-20260222-bbbb"]);
    });

    it("returns empty array when no plans", async () => {
      const ids = await listPlanIds();
      expect(ids).toEqual([]);
    });
  });

  describe("saveState / loadState", () => {
    it("round-trips a state", async () => {
      const state: OrchestrationState = {
        planId: "test-plan-001",
        status: "confirming",
        agents: [{ agentId: "agent-a", blueprintId: "agent-a", status: "pending" }],
      };
      await saveState(state);
      const loaded = await loadState("test-plan-001");
      expect(loaded).toEqual(state);
    });

    it("returns null for nonexistent state", async () => {
      expect(await loadState("nope")).toBeNull();
    });
  });

  describe("createInitialState", () => {
    it("creates state with all agents pending", () => {
      const plan = makePlan();
      const state = createInitialState(plan);
      expect(state.planId).toBe("test-plan-001");
      expect(state.status).toBe("confirming");
      expect(state.agents).toHaveLength(2);
      expect(state.agents.every((a) => a.status === "pending")).toBe(true);
      expect(state.agents[0].agentId).toBe("agent-a");
      expect(state.agents[1].agentId).toBe("agent-b");
    });
  });

  describe("updateAgentStatus", () => {
    it("transitions agent to ready with timestamp", () => {
      const state: OrchestrationState = {
        planId: "p1",
        status: "deploying",
        agents: [{ agentId: "a1", blueprintId: "a1", status: "pending" }],
      };
      const next = updateAgentStatus(state, "a1", "ready");
      expect(next.agents[0].status).toBe("ready");
      expect(next.agents[0].readyAt).toBeDefined();
      // Overall should become deployed (all ready)
      expect(next.status).toBe("deployed");
      expect(next.deployFinishedAt).toBeDefined();
    });

    it("transitions to failed with error", () => {
      const state: OrchestrationState = {
        planId: "p1",
        status: "deploying",
        agents: [
          { agentId: "a1", blueprintId: "a1", status: "creating" },
          { agentId: "a2", blueprintId: "a2", status: "pending" },
        ],
      };
      const next = updateAgentStatus(state, "a1", "failed", "network error");
      expect(next.agents[0].status).toBe("failed");
      expect(next.agents[0].error).toBe("network error");
      expect(next.status).toBe("failed");
      expect(next.error).toBe("network error");
    });

    it("preserves error when transitioning to non-failed without explicit error", () => {
      const state: OrchestrationState = {
        planId: "p1",
        status: "deploying",
        agents: [{ agentId: "a1", blueprintId: "a1", status: "failed", error: "old error" }],
      };
      // Reset to pending (e.g., during rollback) — error should be cleared
      const next = updateAgentStatus(state, "a1", "pending");
      expect(next.agents[0].status).toBe("pending");
      expect(next.agents[0].error).toBeUndefined();
    });

    it("does not change overall status if not deploying", () => {
      const state: OrchestrationState = {
        planId: "p1",
        status: "confirming",
        agents: [{ agentId: "a1", blueprintId: "a1", status: "pending" }],
      };
      const next = updateAgentStatus(state, "a1", "ready");
      // Should stay "confirming" because overall auto-transition only in "deploying"
      expect(next.status).toBe("confirming");
    });

    it("returns new object (immutable)", () => {
      const state: OrchestrationState = {
        planId: "p1",
        status: "deploying",
        agents: [{ agentId: "a1", blueprintId: "a1", status: "pending" }],
      };
      const next = updateAgentStatus(state, "a1", "creating");
      expect(next).not.toBe(state);
      expect(next.agents).not.toBe(state.agents);
      // Original unchanged
      expect(state.agents[0].status).toBe("pending");
    });
  });
});

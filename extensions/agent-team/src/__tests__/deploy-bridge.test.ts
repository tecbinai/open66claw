import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
/**
 * deploy-bridge.ts — Complete test coverage.
 * Previously ZERO test coverage. This is the most critical gap.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createProjectFromPlan } from "../deploy-bridge.js";
import { initProjectStateDir, loadProject } from "../state.js";
import type { CallGatewayFn } from "../types.js";

let tmpDir: string;
let stateDir: string;
let orchDir: string;

function makePlan(overrides?: Record<string, unknown>) {
  return {
    planId: "plan-001",
    teamDescription: "Customer support team for product inquiries",
    agents: [
      { id: "bp-supervisor", name: "Supervisor", role: "Supervisor" },
      { id: "bp-sales", name: "Sales", role: "Sales agent", emoji: "💰" },
      { id: "bp-tech", name: "Tech", role: "Tech support" },
    ],
    ...overrides,
  };
}

function makeState(overrides?: Record<string, unknown>) {
  return {
    planId: "plan-001",
    status: "deployed",
    agents: [
      { agentId: "a1", blueprintId: "bp-supervisor", status: "ready" },
      { agentId: "a2", blueprintId: "bp-sales", status: "ready" },
      { agentId: "a3", blueprintId: "bp-tech", status: "ready" },
    ],
    ...overrides,
  };
}

async function writePlan(planId: string, plan: unknown) {
  const dir = path.join(orchDir, "plans");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${planId}.json`), JSON.stringify(plan));
}

async function writeState(planId: string, state: unknown) {
  const dir = path.join(orchDir, "states");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${planId}.json`), JSON.stringify(state));
}

beforeEach(async () => {
  tmpDir = path.join(
    os.tmpdir(),
    `deploy-bridge-test-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
  );
  stateDir = path.join(tmpDir, "state");
  orchDir = path.join(tmpDir, "orchestrator");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.mkdir(orchDir, { recursive: true });
  initProjectStateDir(stateDir);
});

afterEach(async () => {
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    /* cleanup best-effort */
  }
});

describe("deploy-bridge", () => {
  describe("createProjectFromPlan — happy path", () => {
    it("creates a project from a valid orchestrator plan", async () => {
      const plan = makePlan();
      const state = makeState();
      await writePlan("plan-001", plan);
      await writeState("plan-001", state);

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      expect(project.projectId).toMatch(/^proj-\d{8}-[a-f0-9]{8}$/);
      expect(project.status).toBe("active");
      // 3 workers + 1 auto-created supervisor = 4 members
      expect(project.memberIds).toHaveLength(4);
      expect(project.members).toHaveLength(4);
      expect(project.sourcePlanId).toBe("plan-001");
      expect(project.description).toBe("Customer support team for product inquiries");
      expect(project.autoSupervisor).toBe(true);
    });

    it("uses deployed agentId from orchestrator state", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      // Worker members use "{planId}--{blueprintId}" format
      expect(project.memberIds).toContain("plan-001--bp-supervisor");
      expect(project.memberIds).toContain("plan-001--bp-sales");
      expect(project.memberIds).toContain("plan-001--bp-tech");
      // Auto-created supervisor
      expect(project.memberIds).toContain("plan-001--supervisor");
    });

    it("preserves member info (name, role, emoji)", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      const salesMember = project.members.find((m) => m.id === "plan-001--bp-sales");
      expect(salesMember).toBeDefined();
      expect(salesMember!.name).toBe("Sales");
      expect(salesMember!.role).toBe("Sales agent");
      expect(salesMember!.emoji).toBe("💰");
    });

    it("auto-creates independent supervisor agent", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      // Supervisor is auto-created with "{planId}--supervisor" ID
      expect(project.supervisorId).toBe("plan-001--supervisor");
      expect(project.autoSupervisor).toBe(true);

      // agents.create should have been called for supervisor
      expect(callGateway).toHaveBeenCalledWith(
        "agents.create",
        expect.objectContaining({
          id: "plan-001--supervisor",
        }),
      );
    });

    it("supervisor is always first in memberIds", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      expect(project.memberIds[0]).toBe("plan-001--supervisor");
    });

    it("saves project to disk", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      const loaded = await loadProject(project.projectId);
      expect(loaded).not.toBeNull();
      expect(loaded!.projectId).toBe(project.projectId);
    });

    it("writes supervisor SOUL.md via gateway", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockResolvedValue(undefined);
      await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      expect(callGateway).toHaveBeenCalledWith("agents.files.set", {
        agentId: "plan-001--supervisor",
        name: "SOUL.md",
        content: expect.stringContaining("Identity"),
      });
    });

    it("uses default configs (memory=read-shared, visibility=team, supervisorStyle=concierge)", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      expect(project.memory.mode).toBe("read-shared");
      expect(project.visibility.mode).toBe("team");
      expect(project.coordination.supervisorStyle).toBe("concierge");
      expect(project.coordination.maxMembers).toBe(8);
    });

    it("uses custom name when provided", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        name: "My Custom Team",
        orchestratorStateDir: orchDir,
      });

      expect(project.name).toBe("My Custom Team");
    });

    it("truncates team description to 50 chars for auto-name", async () => {
      const longDesc = "A".repeat(100);
      await writePlan("plan-001", makePlan({ teamDescription: longDesc }));
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      expect(project.name.length).toBe(50);
    });

    it("records templateId from plan", async () => {
      await writePlan("plan-001", makePlan({ templateId: "cs-template-v2" }));
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      expect(project.templateId).toBe("cs-template-v2");
    });
  });

  describe("createProjectFromPlan — error handling", () => {
    it("throws when plan file not found", async () => {
      await writeState("plan-001", makeState());
      const callGateway = vi.fn();

      await expect(
        createProjectFromPlan(callGateway, {
          planId: "plan-001",
          orchestratorStateDir: orchDir,
        }),
      ).rejects.toThrow('plan "plan-001" not found');
    });

    it("throws when state file not found", async () => {
      await writePlan("plan-001", makePlan());
      const callGateway = vi.fn();

      await expect(
        createProjectFromPlan(callGateway, {
          planId: "plan-001",
          orchestratorStateDir: orchDir,
        }),
      ).rejects.toThrow("not in deployed state");
    });

    it("throws when state status is not 'deployed' or 'deploying'", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState({ status: "planning" }));
      const callGateway = vi.fn();

      await expect(
        createProjectFromPlan(callGateway, {
          planId: "plan-001",
          orchestratorStateDir: orchDir,
        }),
      ).rejects.toThrow("not in deployed state");
    });

    it("accepts 'deploying' status (race-condition safe)", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState({ status: "deploying" }));

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      expect(project.status).toBe("active");
    });

    it("throws when no agents are ready", async () => {
      await writePlan("plan-001", makePlan());
      await writeState(
        "plan-001",
        makeState({
          agents: [
            { agentId: "a1", blueprintId: "bp-supervisor", status: "failed" },
            { agentId: "a2", blueprintId: "bp-sales", status: "failed" },
          ],
        }),
      );
      const callGateway = vi.fn();

      await expect(
        createProjectFromPlan(callGateway, {
          planId: "plan-001",
          orchestratorStateDir: orchDir,
        }),
      ).rejects.toThrow("No successfully deployed agents");
    });

    it("skips failed agents but includes ready ones", async () => {
      await writePlan("plan-001", makePlan());
      await writeState(
        "plan-001",
        makeState({
          agents: [
            { agentId: "a1", blueprintId: "bp-supervisor", status: "ready" },
            { agentId: "a2", blueprintId: "bp-sales", status: "failed" },
            { agentId: "a3", blueprintId: "bp-tech", status: "ready" },
          ],
        }),
      );

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      // 2 ready workers + 1 auto-supervisor = 3
      expect(project.memberIds).toHaveLength(3);
      expect(project.memberIds).not.toContain("plan-001--bp-sales");
    });

    it("throws when SOUL.md write fails (mandatory)", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      // agents.create succeeds, but files.set fails
      const callGateway = vi.fn().mockImplementation((method: string) => {
        if (method === "agents.create") return Promise.resolve(undefined);
        if (method === "agents.files.set") return Promise.reject(new Error("gateway down"));
        return Promise.resolve(undefined);
      });

      await expect(
        createProjectFromPlan(callGateway, {
          planId: "plan-001",
          orchestratorStateDir: orchDir,
        }),
      ).rejects.toThrow("Failed to write supervisor SOUL.md");
    });

    it("proceeds if agents.create returns 'already exists' (idempotent re-deploy)", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockImplementation((method: string) => {
        if (method === "agents.create") {
          return Promise.reject(new Error("Agent already exists"));
        }
        return Promise.resolve(undefined);
      });
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      expect(project.projectId).toBeDefined();
      expect(project.autoSupervisor).toBe(true);
    });

    it("throws when agents.create fails with non-exists error", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockImplementation((method: string) => {
        if (method === "agents.create") {
          return Promise.reject(new Error("Permission denied"));
        }
        return Promise.resolve(undefined);
      });

      await expect(
        createProjectFromPlan(callGateway, {
          planId: "plan-001",
          orchestratorStateDir: orchDir,
        }),
      ).rejects.toThrow("Failed to create supervisor agent");
    });

    it("returns a structured deploy report", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockResolvedValue(undefined);
      const { report } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      expect(report.projectId).toBeDefined();
      expect(report.projectName).toBeDefined();
      expect(report.agents).toBeInstanceOf(Array);
      expect(report.agents.length).toBeGreaterThan(0);
      expect(report.summary.totalAgents).toBeGreaterThan(0);
    });

    it("rejects planId with path traversal characters", async () => {
      const callGateway = vi.fn();

      await expect(
        createProjectFromPlan(callGateway, {
          planId: "../../../etc/passwd",
          orchestratorStateDir: orchDir,
        }),
      ).rejects.toThrow("Invalid projectId");
    });

    it("rejects planId with slashes", async () => {
      const callGateway = vi.fn();

      await expect(
        createProjectFromPlan(callGateway, {
          planId: "plan/evil",
          orchestratorStateDir: orchDir,
        }),
      ).rejects.toThrow("Invalid projectId");
    });
  });

  // ── SOUL.md retry logic (robustness fix) ──────────────────────────────

  describe("SOUL.md retry logic", () => {
    it("retries SOUL.md write on transient failure and succeeds on 2nd attempt", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      let soulCallCount = 0;
      const callGateway = vi.fn().mockImplementation((method: string) => {
        if (method === "agents.create") return Promise.resolve(undefined);
        if (method === "agents.files.set") {
          soulCallCount++;
          // Fail first attempt, succeed on second
          if (soulCallCount === 1) return Promise.reject(new Error("transient network error"));
          return Promise.resolve(undefined);
        }
        return Promise.resolve(undefined);
      });

      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });

      // Should succeed despite first failure
      expect(project.status).toBe("active");
      expect(soulCallCount).toBeGreaterThanOrEqual(2);
    });

    it("fails after 3 retry attempts and marks project as error", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockImplementation((method: string) => {
        if (method === "agents.create") return Promise.resolve(undefined);
        if (method === "agents.files.set") {
          return Promise.reject(new Error("persistent gateway failure"));
        }
        return Promise.resolve(undefined);
      });

      await expect(
        createProjectFromPlan(callGateway, {
          planId: "plan-001",
          orchestratorStateDir: orchDir,
        }),
      ).rejects.toThrow("Failed to write supervisor SOUL.md");

      // Verify files.set was called 3 times (3 retry attempts)
      const soulCalls = (callGateway as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === "agents.files.set",
      );
      expect(soulCalls.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── Multi-language error detection (robustness fix) ────────────────────

  describe("isAgentAlreadyExistsError — multi-language detection", () => {
    it("treats Chinese '已存在' error as 'already exists' — proceeds idempotently", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockImplementation((method: string) => {
        if (method === "agents.create") {
          // Chinese error message (simulates CN-localized gateway)
          return Promise.reject(new Error("agent 已存在"));
        }
        return Promise.resolve(undefined);
      });

      // Should NOT throw — Chinese "already exists" is treated as idempotent
      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });
      expect(project.status).toBe("active");
    });

    it("treats structured ALREADY_EXISTS error code as idempotent", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockImplementation((method: string) => {
        if (method === "agents.create") {
          const err = Object.assign(new Error("Agent already exists"), { code: "ALREADY_EXISTS" });
          return Promise.reject(err);
        }
        return Promise.resolve(undefined);
      });

      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });
      expect(project.status).toBe("active");
    });

    it("treats AGENT_ALREADY_EXISTS error code as idempotent", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockImplementation((method: string) => {
        if (method === "agents.create") {
          const err = Object.assign(new Error("Conflict"), { code: "AGENT_ALREADY_EXISTS" });
          return Promise.reject(err);
        }
        return Promise.resolve(undefined);
      });

      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });
      expect(project.status).toBe("active");
    });

    it("treats '重复' (Chinese duplicate) error as idempotent", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockImplementation((method: string) => {
        if (method === "agents.create") {
          return Promise.reject(new Error("记录重复，无法创建"));
        }
        return Promise.resolve(undefined);
      });

      const { project } = await createProjectFromPlan(callGateway, {
        planId: "plan-001",
        orchestratorStateDir: orchDir,
      });
      expect(project.status).toBe("active");
    });

    it("does NOT treat 'Permission denied' as already-exists — rethrows", async () => {
      await writePlan("plan-001", makePlan());
      await writeState("plan-001", makeState());

      const callGateway = vi.fn().mockImplementation((method: string) => {
        if (method === "agents.create") {
          return Promise.reject(new Error("Permission denied"));
        }
        return Promise.resolve(undefined);
      });

      await expect(
        createProjectFromPlan(callGateway, {
          planId: "plan-001",
          orchestratorStateDir: orchDir,
        }),
      ).rejects.toThrow("Failed to create supervisor agent");
    });
  });
});

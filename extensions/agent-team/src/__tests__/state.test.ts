import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  deleteProject,
  initProjectStateDir,
  listProjectIds,
  loadActivity,
  loadAllProjects,
  loadProject,
  loadProjectState,
  saveActivity,
  saveProject,
  saveProjectState,
} from "../state.js";
import type { Project, ProjectState } from "../types.js";

let tmpDir: string;

function makeProject(id: string): Project {
  return {
    projectId: id,
    name: `Test Project ${id}`,
    description: "Test",
    status: "active",
    version: 1,
    createdAt: "2026-02-27T00:00:00Z",
    updatedAt: "2026-02-27T00:00:00Z",
    supervisorId: "supervisor",
    memberIds: ["supervisor", "member-1"],
    members: [
      { id: "supervisor", name: "Supervisor", role: "Coordination" },
      { id: "member-1", name: "Member 1", role: "Tasks" },
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

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `agent-team-test-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  initProjectStateDir(tmpDir);
});

afterEach(async () => {
  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
  } catch {
    // cleanup best-effort
  }
});

describe("state", () => {
  describe("saveProject + loadProject", () => {
    it("roundtrips project data", async () => {
      const project = makeProject("proj-test-001");
      await saveProject(project);

      const loaded = await loadProject("proj-test-001");
      expect(loaded).not.toBeNull();
      expect(loaded!.projectId).toBe("proj-test-001");
      expect(loaded!.name).toBe("Test Project proj-test-001");
      expect(loaded!.memberIds).toEqual(["supervisor", "member-1"]);
    });

    it("returns null for missing project", async () => {
      const loaded = await loadProject("nonexistent");
      expect(loaded).toBeNull();
    });
  });

  describe("deleteProject", () => {
    it("removes project from disk", async () => {
      const project = makeProject("proj-delete-me");
      await saveProject(project);
      expect(await loadProject("proj-delete-me")).not.toBeNull();

      await deleteProject("proj-delete-me");
      expect(await loadProject("proj-delete-me")).toBeNull();
    });

    it("does not throw for nonexistent project", async () => {
      await expect(deleteProject("nonexistent")).resolves.not.toThrow();
    });
  });

  describe("listProjectIds", () => {
    it("returns empty array initially", async () => {
      const ids = await listProjectIds();
      expect(ids).toEqual([]);
    });

    it("lists saved projects", async () => {
      await saveProject(makeProject("proj-a"));
      await saveProject(makeProject("proj-b"));

      const ids = await listProjectIds();
      expect(ids).toContain("proj-a");
      expect(ids).toContain("proj-b");
      expect(ids.length).toBe(2);
    });

    it("returns sorted list", async () => {
      await saveProject(makeProject("proj-z"));
      await saveProject(makeProject("proj-a"));

      const ids = await listProjectIds();
      expect(ids[0]).toBe("proj-a");
      expect(ids[1]).toBe("proj-z");
    });
  });

  describe("loadAllProjects", () => {
    it("loads all projects", async () => {
      await saveProject(makeProject("proj-1"));
      await saveProject(makeProject("proj-2"));

      const projects = await loadAllProjects();
      expect(projects.length).toBe(2);
    });
  });

  describe("project state", () => {
    it("roundtrips state data", async () => {
      // Need project dir to exist
      await saveProject(makeProject("proj-state-test"));

      const state: ProjectState = {
        projectId: "proj-state-test",
        memberHealth: [
          {
            agentId: "supervisor",
            state: "healthy",
            consecutiveFailures: 0,
            consecutiveSuccesses: 5,
            totalFailures: 1,
            totalSuccesses: 10,
          },
        ],
        activeSessions: 2,
        lastActivityAt: "2026-02-27T12:00:00Z",
      };

      await saveProjectState(state);
      const loaded = await loadProjectState("proj-state-test");
      expect(loaded).not.toBeNull();
      expect(loaded!.activeSessions).toBe(2);
      expect(loaded!.memberHealth[0].agentId).toBe("supervisor");
    });

    it("returns null for missing state", async () => {
      expect(await loadProjectState("nonexistent")).toBeNull();
    });
  });

  describe("path traversal protection", () => {
    it("returns null for malicious project IDs (sanitize catches traversal)", async () => {
      // loadProject catches the sanitization error and returns null
      const result = await loadProject("../../../etc/passwd");
      expect(result).toBeNull();
    });

    it("sanitizeProjectId throws for malicious IDs", async () => {
      const { sanitizeProjectId } = await import("../project-id.js");
      expect(() => sanitizeProjectId("../../../etc/passwd")).toThrow("Invalid projectId");
    });
  });

  // ── async initProjectStateDir (robustness fix) ────────────────────────

  describe("async initProjectStateDir", () => {
    it("creates the projects sub-directory", async () => {
      const crypto = await import("node:crypto");
      const os = await import("node:os");
      const path = await import("node:path");
      const fs = await import("node:fs/promises");

      const freshDir = path.join(
        os.tmpdir(),
        `agent-team-init-test-${crypto.randomUUID().slice(0, 8)}`,
      );
      try {
        // initProjectStateDir should create both the dir and projects/ subdir
        await initProjectStateDir(freshDir);

        const stat = await fs.stat(path.join(freshDir, "projects"));
        expect(stat.isDirectory()).toBe(true);
      } finally {
        await fs.rm(freshDir, { recursive: true, force: true });
      }
    });

    it("is idempotent — calling twice does not throw", async () => {
      const crypto = await import("node:crypto");
      const os = await import("node:os");
      const path = await import("node:path");
      const fs = await import("node:fs/promises");

      const dir = path.join(
        os.tmpdir(),
        `agent-team-idempotent-${crypto.randomUUID().slice(0, 8)}`,
      );
      try {
        await initProjectStateDir(dir);
        // Second call should not throw
        await expect(initProjectStateDir(dir)).resolves.not.toThrow();
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });

    it("saves and loads project after initProjectStateDir", async () => {
      // After init, state operations should work immediately (no lazy-mkdir needed)
      const project = makeProject("init-test-proj");
      await saveProject(project);

      const loaded = await loadProject("init-test-proj");
      expect(loaded).not.toBeNull();
      expect(loaded!.projectId).toBe("init-test-proj");
    });
  });

  // ── activity persistence ───────────────────────────────────────────────

  describe("saveActivity + loadActivity", () => {
    it("roundtrips activity events", async () => {
      await saveProject(makeProject("proj-activity"));
      const events = [
        { id: "act-1", timestamp: Date.now(), agentId: "agent-x", method: "keyword" },
        { id: "act-2", timestamp: Date.now(), agentId: "agent-y", method: "affinity" },
      ];

      await saveActivity("proj-activity", events);
      const loaded = await loadActivity("proj-activity");
      expect(loaded).toHaveLength(2);
      expect((loaded[0] as { id: string }).id).toBe("act-1");
    });

    it("returns empty array for missing activity file", async () => {
      const result = await loadActivity("no-such-project");
      expect(result).toEqual([]);
    });
  });
});

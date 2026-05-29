import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
/**
 * Crash Recovery & Data Integrity Tests
 *
 * Tests resilience to:
 * - Corrupted files on disk
 * - Missing directories
 * - Partial writes
 * - Invalid JSON
 * - Graceful degradation
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  readSharedProfile,
  writeSharedProfile,
  withSharedProfileLock,
  upsertSharedEntry,
  resetSharedProfileCache,
  resetSharedProfileLocks,
} from "../shared-profile-store.js";
import {
  initProjectStateDir,
  saveProject,
  loadProject,
  loadAllProjects,
  loadProjectState,
  saveProjectState,
  listProjectIds,
  deleteProject,
} from "../state.js";
import type { ProjectState } from "../types.js";
import { makeProject } from "./test-helpers.js";

describe("crash-recovery — state.ts", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `crash-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    initProjectStateDir(tmpDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* cleanup */
    }
  });

  it("loadProject: empty file returns null", async () => {
    const projectDir = path.join(tmpDir, "projects", "proj-empty");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(path.join(projectDir, "project.json"), "");

    const result = await loadProject("proj-empty");
    expect(result).toBeNull();
  });

  it("loadProject: truncated JSON returns null", async () => {
    const projectDir = path.join(tmpDir, "projects", "proj-truncated");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, "project.json"),
      '{"projectId": "proj-truncated", "name": "Tru',
    );

    const result = await loadProject("proj-truncated");
    expect(result).toBeNull();
  });

  it("loadProject: binary garbage returns null", async () => {
    const projectDir = path.join(tmpDir, "projects", "proj-binary");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, "project.json"),
      Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02]),
    );

    const result = await loadProject("proj-binary");
    expect(result).toBeNull();
  });

  it("loadProjectState: corrupted state returns null", async () => {
    const project = makeProject({ projectId: "proj-state-corrupt" });
    await saveProject(project);

    // Manually corrupt state file
    const stateDir = path.join(tmpDir, "projects", "proj-state-corrupt");
    await fs.writeFile(path.join(stateDir, "state.json"), "CORRUPTED");

    const result = await loadProjectState("proj-state-corrupt");
    expect(result).toBeNull();
  });

  it("loadAllProjects: recovers when some projects are corrupted", async () => {
    // Three projects: first valid, second corrupted, third valid
    await saveProject(makeProject({ projectId: "proj-good-1" }));

    const corruptDir = path.join(tmpDir, "projects", "proj-bad");
    await fs.mkdir(corruptDir, { recursive: true });
    await fs.writeFile(path.join(corruptDir, "project.json"), "{INVALID");

    await saveProject(makeProject({ projectId: "proj-good-2" }));

    const projects = await loadAllProjects();
    expect(projects).toHaveLength(2);
    const ids = projects.map((p) => p.projectId).sort();
    expect(ids).toEqual(["proj-good-1", "proj-good-2"]);
  });

  it("listProjectIds: returns empty when projects directory missing", async () => {
    // Don't create the projects directory
    const freshDir = path.join(tmpDir, "fresh-state");
    initProjectStateDir(freshDir);

    const ids = await listProjectIds();
    expect(ids).toEqual([]);
  });

  it("deleteProject: safe when project directory already removed", async () => {
    await expect(deleteProject("nonexistent-proj")).resolves.not.toThrow();
  });

  it("saveProject: creates nested directory structure", async () => {
    const project = makeProject({ projectId: "proj-nested" });
    await saveProject(project);

    const filePath = path.join(tmpDir, "projects", "proj-nested", "project.json");
    const exists = await fs
      .access(filePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("saveProjectState: creates directory if project was deleted between save calls", async () => {
    const project = makeProject({ projectId: "proj-state-race" });
    await saveProject(project);

    // Delete the project directory
    await deleteProject("proj-state-race");

    // Saving state should re-create the directory
    const state: ProjectState = {
      projectId: "proj-state-race",
      memberHealth: [],
      activeSessions: 0,
      lastActivityAt: new Date().toISOString(),
    };
    await saveProjectState(state);
    const loaded = await loadProjectState("proj-state-race");
    expect(loaded).not.toBeNull();
  });

  it("saveProject preserves data integrity across overwrite", async () => {
    const project = makeProject({ projectId: "proj-integrity" });
    await saveProject(project);

    const updated = { ...project, name: "Updated", version: 2 };
    await saveProject(updated);

    const loaded = await loadProject("proj-integrity");
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Updated");
    expect(loaded!.version).toBe(2);
    // All other fields should be preserved
    expect(loaded!.memberIds).toEqual(project.memberIds);
    expect(loaded!.supervisorId).toBe(project.supervisorId);
  });
});

describe("crash-recovery — shared-profile-store", () => {
  let tmpDir: string;
  const projectId = "proj-crash-sp";

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `crash-sp-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    initProjectStateDir(tmpDir);
    resetSharedProfileCache();
    resetSharedProfileLocks();
  });

  afterEach(async () => {
    resetSharedProfileCache();
    resetSharedProfileLocks();
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* cleanup */
    }
  });

  it("readSharedProfile: missing directory returns empty profile", () => {
    const profile = readSharedProfile(projectId);
    expect(profile.version).toBe(1);
    expect(profile.entries).toEqual([]);
  });

  it("readSharedProfile: empty file returns empty profile", () => {
    const profileDir = path.join(tmpDir, "projects", projectId, "shared-memory");
    fsSync.mkdirSync(profileDir, { recursive: true });
    fsSync.writeFileSync(path.join(profileDir, "profile.json"), "");

    const profile = readSharedProfile(projectId);
    expect(profile.entries).toEqual([]);
  });

  it("readSharedProfile: valid JSON but missing entries field returns empty", () => {
    const profileDir = path.join(tmpDir, "projects", projectId, "shared-memory");
    fsSync.mkdirSync(profileDir, { recursive: true });
    fsSync.writeFileSync(path.join(profileDir, "profile.json"), JSON.stringify({ version: 1 }));

    const profile = readSharedProfile(projectId);
    expect(profile.entries).toEqual([]);
  });

  it("writeSharedProfile creates directory if missing", () => {
    const profile = { version: 1, entries: [] };
    writeSharedProfile(projectId, profile);

    const read = readSharedProfile(projectId);
    expect(read.version).toBe(1);
  });

  it("withSharedProfileLock recovers after fn throws", async () => {
    // First call throws
    await expect(
      withSharedProfileLock(projectId, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // Second call should still work (lock released)
    const result = await withSharedProfileLock(projectId, (profile) => {
      const updated = upsertSharedEntry(profile, {
        category: "fact",
        key: "recovery",
        value: "works",
        sourceAgentId: "agent",
      });
      return { profile: updated, result: "ok" };
    });

    expect(result).toBe("ok");

    const profile = readSharedProfile(projectId);
    expect(profile.entries).toHaveLength(1);
    expect(profile.entries[0].key).toBe("recovery");
  });

  it("readSharedProfile returns deep copy: mutations don't affect cache", () => {
    writeSharedProfile(projectId, {
      version: 1,
      entries: [
        {
          category: "fact",
          key: "name",
          value: "Alice",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          hits: 1,
          sourceAgentId: "a",
        },
      ],
    });

    const read1 = readSharedProfile(projectId);
    read1.entries[0].value = "MUTATED";
    read1.entries.length = 0;

    const read2 = readSharedProfile(projectId);
    expect(read2.entries).toHaveLength(1);
    expect(read2.entries[0].value).toBe("Alice");
  });

  it("leftover tmp files do not corrupt reads", async () => {
    // Write a valid profile
    writeSharedProfile(projectId, {
      version: 1,
      entries: [
        {
          category: "fact",
          key: "real",
          value: "data",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          hits: 1,
          sourceAgentId: "a",
        },
      ],
    });

    // Simulate a leftover tmp file (as if a previous write crashed)
    const profileDir = path.join(tmpDir, "projects", projectId, "shared-memory");
    fsSync.writeFileSync(
      path.join(profileDir, "profile.json.abcd1234.tmp"),
      '{"version":1,"entries":[{"category":"fact","key":"BAD","value":"crash"}]}',
    );

    resetSharedProfileCache();
    const profile = readSharedProfile(projectId);
    // Should read the real profile.json, not the tmp file
    expect(profile.entries).toHaveLength(1);
    expect(profile.entries[0].key).toBe("real");
  });
});

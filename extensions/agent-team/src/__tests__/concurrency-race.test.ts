import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
/**
 * Concurrency & Race Condition Tests
 *
 * Tests that shared state is safe under concurrent access:
 * - Shared profile lock serialization
 * - State persistence under concurrent writes
 * - Cache consistency during read-write interleaving
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
import type { SharedProfile } from "../shared-profile-store.js";
import { initProjectStateDir, saveProject, loadProject } from "../state.js";
import { makeProject } from "./test-helpers.js";

describe("concurrency — shared-profile-store", () => {
  let tmpDir: string;
  const projectId = "proj-concurrent";

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `concurrency-test-${Date.now()}`);
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

  it("concurrent withSharedProfileLock calls are serialized (no lost updates)", async () => {
    // Each writer adds one entry. With 10 concurrent writers,
    // the final profile should have exactly 10 entries.
    const N = 10;
    const promises = Array.from({ length: N }, (_, i) =>
      withSharedProfileLock(projectId, (profile) => {
        const updated = upsertSharedEntry(profile, {
          category: "fact",
          key: `key-${i}`,
          value: `value-${i}`,
          sourceAgentId: `agent-${i}`,
        });
        return { profile: updated, result: i };
      }),
    );

    await Promise.all(promises);
    const final = readSharedProfile(projectId);
    expect(final.entries).toHaveLength(N);
  });

  it("concurrent upserts to same key: last writer wins, hits accumulate", async () => {
    const N = 5;
    const promises = Array.from({ length: N }, (_, i) =>
      withSharedProfileLock(projectId, (profile) => {
        const updated = upsertSharedEntry(profile, {
          category: "fact",
          key: "shared-key",
          value: `value-${i}`,
          sourceAgentId: `agent-${i}`,
        });
        return { profile: updated, result: i };
      }),
    );

    await Promise.all(promises);
    const final = readSharedProfile(projectId);
    // Only one entry with key "shared-key"
    const entries = final.entries.filter((e) => e.key === "shared-key");
    expect(entries).toHaveLength(1);
    // Hits should be N (1 create + N-1 updates)
    expect(entries[0].hits).toBe(N);
  });

  it("different projectIds have independent locks (no cross-blocking)", async () => {
    const results: number[] = [];

    const p1 = withSharedProfileLock("proj-a", (profile) => {
      results.push(1);
      return { profile, result: 1 };
    });

    const p2 = withSharedProfileLock("proj-b", (profile) => {
      results.push(2);
      return { profile, result: 2 };
    });

    await Promise.all([p1, p2]);
    // Both should complete (no deadlock)
    expect(results).toContain(1);
    expect(results).toContain(2);
  });

  it("read-after-write within lock sees fresh data", async () => {
    // Write an entry
    await withSharedProfileLock(projectId, (profile) => {
      const updated = upsertSharedEntry(profile, {
        category: "identity",
        key: "name",
        value: "Alice",
        sourceAgentId: "agent-a",
      });
      return { profile: updated, result: null };
    });

    // Read immediately — should see updated data (cache was updated by write)
    const profile = readSharedProfile(projectId);
    expect(profile.entries).toHaveLength(1);
    expect(profile.entries[0].key).toBe("name");
  });

  it("writeSharedProfile updates cache so subsequent read gets fresh data", () => {
    // Write directly (bypass lock for testing)
    const profile: SharedProfile = {
      version: 1,
      entries: [
        {
          category: "fact",
          key: "test",
          value: "value",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          hits: 1,
          sourceAgentId: "agent",
        },
      ],
    };
    writeSharedProfile(projectId, profile);

    // Read should hit cache and return fresh data
    const read1 = readSharedProfile(projectId);
    expect(read1.entries).toHaveLength(1);

    // Mutating the read copy should NOT affect cache
    read1.entries.push({
      category: "fact",
      key: "injected",
      value: "bad",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hits: 1,
      sourceAgentId: "evil",
    });

    const read2 = readSharedProfile(projectId);
    expect(read2.entries).toHaveLength(1); // Still 1, not 2
  });
});

describe("concurrency — state.ts", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `state-concurrency-${Date.now()}`);
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

  it("concurrent saveProject calls for same project: last write wins", async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      saveProject(
        makeProject({
          projectId: "proj-race",
          name: `Version ${i}`,
          version: i + 1,
        }),
      ),
    );

    await Promise.all(promises);
    const loaded = await loadProject("proj-race");
    expect(loaded).not.toBeNull();
    // One of the versions should win — we can't predict which,
    // but the project should be valid JSON
    expect(loaded!.projectId).toBe("proj-race");
    expect(typeof loaded!.version).toBe("number");
  });

  it("concurrent saveProject for different projects: all succeed", async () => {
    const N = 10;
    const promises = Array.from({ length: N }, (_, i) =>
      saveProject(makeProject({ projectId: `proj-${i}` })),
    );

    await Promise.all(promises);

    for (let i = 0; i < N; i++) {
      const loaded = await loadProject(`proj-${i}`);
      expect(loaded).not.toBeNull();
    }
  });
});

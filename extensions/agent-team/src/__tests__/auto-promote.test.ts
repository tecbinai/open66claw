import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { autoPromoteEntries } from "../auto-promote.js";
import {
  readSharedProfile,
  writeSharedProfile,
  resetSharedProfileCache,
  resetSharedProfileLocks,
  resolveSharedProfileDir,
  type SharedProfileEntry,
} from "../shared-profile-store.js";
import { initProjectStateDir } from "../state.js";
// Inline types — originally from src/memory/profile-store.ts (upstream internal)
type ProfileEntry = { key: string; value: string; updatedAt?: string };
type UserProfile = { version: number; entries: ProfileEntry[] };

let tmpDir: string;
let workspaceDir: string;

function writePrivateProfile(workspace: string, entries: ProfileEntry[]): void {
  const memoryDir = path.join(workspace, "memory");
  fs.mkdirSync(memoryDir, { recursive: true });
  const profile: UserProfile = { version: 1, entries };
  fs.writeFileSync(path.join(memoryDir, "profile.json"), JSON.stringify(profile), "utf-8");
}

function makePrivateEntry(overrides?: Partial<ProfileEntry>): ProfileEntry {
  return {
    category: "fact",
    key: "test_key",
    value: "test_value",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hits: 1,
    source: "extraction",
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auto-promote-test-"));
  initProjectStateDir(tmpDir);
  workspaceDir = path.join(tmpDir, "workspace-agent-a");
  fs.mkdirSync(workspaceDir, { recursive: true });
  resetSharedProfileCache();
  resetSharedProfileLocks();
});

afterEach(() => {
  resetSharedProfileCache();
  resetSharedProfileLocks();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

const TEST_PROJECT_ID = "proj-20260227-promote";

describe("auto-promote", () => {
  it("promotes high-hit fact entries", async () => {
    writePrivateProfile(workspaceDir, [
      makePrivateEntry({
        category: "fact",
        key: "vip_status",
        value: "Gold VIP",
        hits: 5,
      }),
    ]);

    const count = await autoPromoteEntries({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
      workspaceDir,
    });

    expect(count).toBe(1);

    resetSharedProfileCache();
    const shared = readSharedProfile(TEST_PROJECT_ID);
    expect(shared.entries).toHaveLength(1);
    expect(shared.entries[0].key).toBe("vip_status");
    expect(shared.entries[0].sourceAgentId).toBe("agent-a");
  });

  it("promotes identity entries", async () => {
    writePrivateProfile(workspaceDir, [
      makePrivateEntry({
        category: "identity",
        key: "user_name",
        value: "Zhang San",
        hits: 3,
      }),
    ]);

    const count = await autoPromoteEntries({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
      workspaceDir,
    });

    expect(count).toBe(1);
  });

  it("skips entries below hit threshold", async () => {
    writePrivateProfile(workspaceDir, [
      makePrivateEntry({ category: "fact", key: "low_hits", hits: 2 }),
    ]);

    const count = await autoPromoteEntries({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
      workspaceDir,
    });

    expect(count).toBe(0);
  });

  it("skips non-shareable categories", async () => {
    writePrivateProfile(workspaceDir, [
      makePrivateEntry({
        category: "correction",
        key: "dont_call_me",
        value: "XiaoZhang",
        hits: 10,
      }),
      makePrivateEntry({
        category: "todo",
        key: "task1",
        value: "do something",
        hits: 10,
      }),
      makePrivateEntry({
        category: "procedure",
        key: "workflow",
        value: "step 1",
        hits: 10,
      }),
    ]);

    const count = await autoPromoteEntries({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
      workspaceDir,
    });

    expect(count).toBe(0);
  });

  it("skips entries already in shared pool", async () => {
    // Pre-populate shared pool
    const sharedDir = resolveSharedProfileDir(TEST_PROJECT_ID);
    fs.mkdirSync(sharedDir, { recursive: true });
    writeSharedProfile(TEST_PROJECT_ID, {
      version: 1,
      entries: [
        {
          category: "fact",
          key: "already_shared",
          value: "existing",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          hits: 1,
          sourceAgentId: "agent-b",
        },
      ],
    });

    writePrivateProfile(workspaceDir, [
      makePrivateEntry({
        category: "fact",
        key: "already_shared",
        value: "from private",
        hits: 5,
      }),
    ]);

    const count = await autoPromoteEntries({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
      workspaceDir,
    });

    expect(count).toBe(0);
  });

  it("respects maxPromotions limit", async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makePrivateEntry({
        key: `fact_${i}`,
        value: `value_${i}`,
        hits: 5 + i,
      }),
    );
    writePrivateProfile(workspaceDir, entries);

    const count = await autoPromoteEntries({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
      workspaceDir,
      maxPromotions: 3,
    });

    expect(count).toBe(3);

    resetSharedProfileCache();
    const shared = readSharedProfile(TEST_PROJECT_ID);
    expect(shared.entries).toHaveLength(3);
    // Should promote highest-hit entries first
    const keys = shared.entries.map((e) => e.key).sort();
    expect(keys).toContain("fact_9"); // hits=14 (highest)
    expect(keys).toContain("fact_8"); // hits=13
    expect(keys).toContain("fact_7"); // hits=12
  });

  it("returns 0 for empty private profile", async () => {
    writePrivateProfile(workspaceDir, []);

    const count = await autoPromoteEntries({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
      workspaceDir,
    });

    expect(count).toBe(0);
  });

  it("supports custom sharedCategories", async () => {
    writePrivateProfile(workspaceDir, [
      makePrivateEntry({
        category: "preference",
        key: "reply_style",
        value: "brief",
        hits: 5,
      }),
      makePrivateEntry({
        category: "fact",
        key: "some_fact",
        value: "data",
        hits: 5,
      }),
    ]);

    // Only promote preferences
    const count = await autoPromoteEntries({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
      workspaceDir,
      sharedCategories: ["preference"],
    });

    expect(count).toBe(1);

    resetSharedProfileCache();
    const shared = readSharedProfile(TEST_PROJECT_ID);
    expect(shared.entries[0].category).toBe("preference");
  });
});

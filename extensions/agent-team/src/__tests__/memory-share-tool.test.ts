import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createMemoryShareTool } from "../memory-share-tool.js";
import {
  readSharedProfile,
  resetSharedProfileCache,
  resetSharedProfileLocks,
  SHARED_MAX_KEY_LENGTH,
  SHARED_MAX_VALUE_LENGTH,
} from "../shared-profile-store.js";
import { initProjectStateDir } from "../state.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-share-tool-test-"));
  initProjectStateDir(tmpDir);
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

const TEST_PROJECT_ID = "proj-20260227-tooltest";

describe("memory-share-tool", () => {
  it("creates a tool with correct name and description", () => {
    const tool = createMemoryShareTool({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
    });

    expect(tool.name).toBe("memory_share");
    expect(tool.description).toContain("team");
  });

  it("successfully shares a fact", async () => {
    const tool = createMemoryShareTool({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
    });

    const result = await tool.execute("call-1", {
      category: "fact",
      key: "vip_status",
      value: "Gold VIP customer",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(true);
    expect(parsed.category).toBe("fact");
    expect(parsed.key).toBe("vip_status");
    expect(parsed.shared).toBe(true);
    expect(parsed.totalSharedEntries).toBe(1);

    // Verify it's in the shared profile
    resetSharedProfileCache();
    const profile = readSharedProfile(TEST_PROJECT_ID);
    expect(profile.entries).toHaveLength(1);
    expect(profile.entries[0].key).toBe("vip_status");
    expect(profile.entries[0].sourceAgentId).toBe("agent-a");
  });

  it("rejects empty key", async () => {
    const tool = createMemoryShareTool({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
    });

    const result = await tool.execute("call-1", {
      category: "fact",
      key: "",
      value: "something",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("required");
  });

  it("rejects empty value", async () => {
    const tool = createMemoryShareTool({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
    });

    const result = await tool.execute("call-1", {
      category: "fact",
      key: "test",
      value: "",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(false);
  });

  it("rejects key exceeding max length", async () => {
    const tool = createMemoryShareTool({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
    });

    const result = await tool.execute("call-1", {
      category: "fact",
      key: "x".repeat(SHARED_MAX_KEY_LENGTH + 1),
      value: "value",
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("key too long");
  });

  it("rejects value exceeding max length", async () => {
    const tool = createMemoryShareTool({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
    });

    const result = await tool.execute("call-1", {
      category: "fact",
      key: "test",
      value: "x".repeat(SHARED_MAX_VALUE_LENGTH + 1),
    });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("value too long");
  });

  it("shares identity and preference categories", async () => {
    const tool = createMemoryShareTool({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
    });

    for (const cat of ["identity", "preference"] as const) {
      const result = await tool.execute(`call-${cat}`, {
        category: cat,
        key: `${cat}_key`,
        value: `${cat}_value`,
      });
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.success).toBe(true);
      expect(parsed.category).toBe(cat);
    }

    resetSharedProfileCache();
    const profile = readSharedProfile(TEST_PROJECT_ID);
    expect(profile.entries).toHaveLength(2);
  });

  it("updates existing entry on second share with same category+key", async () => {
    const tool = createMemoryShareTool({
      projectId: TEST_PROJECT_ID,
      agentId: "agent-a",
    });

    await tool.execute("call-1", {
      category: "fact",
      key: "status",
      value: "basic",
    });

    await tool.execute("call-2", {
      category: "fact",
      key: "status",
      value: "premium",
    });

    resetSharedProfileCache();
    const profile = readSharedProfile(TEST_PROJECT_ID);
    expect(profile.entries).toHaveLength(1);
    expect(profile.entries[0].value).toBe("premium");
    expect(profile.entries[0].hits).toBe(2);
  });
});

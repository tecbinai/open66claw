import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
/**
 * Integration Flow Tests — Cross-Module Scenarios
 *
 * Tests realistic end-to-end scenarios that exercise multiple modules together:
 * - Full routing lifecycle
 * - Memory sharing pipeline
 * - Health tracking → routing impact
 * - Project lifecycle (create → use → pause → resume → delete)
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { routeMessage, setRouteTable, resetAllRouteTables } from "../fast-path-router.js";
import { buildRoutesFromMembers, matchKeywordRoute } from "../keyword-router.js";
import {
  createInitialMemberHealth,
  recordMemberSuccess,
  recordMemberFailure,
  isRoutable,
} from "../member-health.js";
import {
  createInitialMemberStats,
  recordMemberCall,
  computeAverageDuration,
} from "../member-stats.js";
import {
  setAffinity,
  resetAllAffinities,
  getAffinity,
  clearProjectAffinities,
  resolveAffinityAgent,
} from "../session-affinity.js";
import {
  readSharedProfile,
  writeSharedProfile,
  withSharedProfileLock,
  upsertSharedEntry,
  formatSharedProfileForPrompt,
  resetSharedProfileCache,
  resetSharedProfileLocks,
} from "../shared-profile-store.js";
import {
  initProjectStateDir,
  saveProject,
  loadProject,
  deleteProject,
  saveProjectState,
  loadProjectState,
} from "../state.js";
import { generateSupervisorSoul } from "../supervisor-soul.js";
import { buildTeamContextBlock, isTeamMember, isSupervisor } from "../system-prompt.js";
import type { MemberHealth, MemberInfo, MemberStats, ProjectState } from "../types.js";
import { rewriteOutboundMessage } from "../visibility-rewriter.js";
import { makeProject } from "./test-helpers.js";

// ── Full Routing Lifecycle ───────────────────────────────────────────────

describe("integration — full routing lifecycle", () => {
  beforeEach(() => {
    resetAllRouteTables();
    resetAllAffinities();
  });

  it("first message: keyword route → sets affinity → second message uses affinity", () => {
    const project = makeProject();
    const members = project.members.filter((m) => m.id !== project.supervisorId);
    const routes = buildRoutesFromMembers(members);
    setRouteTable(project.projectId, routes);

    const healthMap = new Map<string, MemberHealth>();

    // First message: should route by keyword
    const result1 = routeMessage({
      message: "I need Customer Support help",
      project,
      peerId: "peer-1",
      healthMap,
    });

    expect(result1).not.toBeNull();
    expect(result1!.method).toBe("keyword");
    expect(result1!.agentId).toBe("agent-a"); // Alice = Customer Support

    // Simulate setting affinity (as index.ts hook does)
    setAffinity(project.projectId, "peer-1", result1!.agentId);

    // Second message: should route by affinity (even though keywords match different agent)
    const result2 = routeMessage({
      message: "I need Technical Expert advice", // Would match agent-b by keyword
      project,
      peerId: "peer-1",
      healthMap,
    });

    expect(result2).not.toBeNull();
    expect(result2!.method).toBe("affinity");
    expect(result2!.agentId).toBe("agent-a"); // Sticky to agent-a
  });

  it("agent goes down → affinity bypassed → routes to different agent", () => {
    const project = makeProject();
    const routes = buildRoutesFromMembers(
      project.members.filter((m) => m.id !== project.supervisorId),
    );
    setRouteTable(project.projectId, routes);

    // Set affinity to agent-a
    setAffinity(project.projectId, "peer-1", "agent-a");

    // Mark agent-a as down
    let health = createInitialMemberHealth("agent-a");
    for (let i = 0; i < 5; i++) health = recordMemberFailure(health);
    expect(health.state).toBe("down");

    const healthMap = new Map([["agent-a", health]]);

    // Route message — affinity should be skipped because agent-a is down
    const result = routeMessage({
      message: "I need Technical Expert help",
      project,
      peerId: "peer-1",
      healthMap,
    });

    // Should fall through to keyword match → agent-b (Technical Expert)
    if (result) {
      expect(result.agentId).toBe("agent-b");
      expect(result.method).toBe("keyword");
    }
    // Or null if no keyword match (supervisor LLM fallback)
  });

  it("all agents down → returns null (supervisor LLM fallback)", () => {
    const project = makeProject();
    const routes = buildRoutesFromMembers(
      project.members.filter((m) => m.id !== project.supervisorId),
    );
    setRouteTable(project.projectId, routes);

    const healthMap = new Map<string, MemberHealth>();
    for (const id of ["agent-a", "agent-b"]) {
      let h = createInitialMemberHealth(id);
      for (let i = 0; i < 5; i++) h = recordMemberFailure(h);
      healthMap.set(id, h);
    }

    const result = routeMessage({
      message: "Help me please",
      project,
      peerId: "peer-1",
      healthMap,
    });

    expect(result).toBeNull();
  });
});

// ── Health + Stats Integration ───────────────────────────────────────────

describe("integration — health and stats tracking", () => {
  it("full health lifecycle with stats accumulation", () => {
    let health = createInitialMemberHealth("agent-a");
    let stats = createInitialMemberStats("agent-a");

    // 5 successful calls
    for (let i = 0; i < 5; i++) {
      health = recordMemberSuccess(health);
      stats = recordMemberCall(stats, 100);
    }
    expect(health.state).toBe("healthy");
    expect(stats.callCount).toBe(5);
    expect(computeAverageDuration(stats)).toBe(100);

    // 2 failures → degraded
    health = recordMemberFailure(health, "timeout");
    stats = recordMemberCall(stats, 30000); // timeout
    health = recordMemberFailure(health, "timeout");
    stats = recordMemberCall(stats, 30000);
    expect(health.state).toBe("degraded");
    expect(isRoutable(health)).toBe(true);

    // 3 more failures → down
    for (let i = 0; i < 3; i++) {
      health = recordMemberFailure(health);
      stats = recordMemberCall(stats, 0);
    }
    expect(health.state).toBe("down");
    expect(isRoutable(health)).toBe(false);
    expect(stats.callCount).toBe(10);

    // Recovery: 1 success → degraded
    health = recordMemberSuccess(health);
    stats = recordMemberCall(stats, 200);
    expect(health.state).toBe("degraded");

    // 2 more successes → healthy
    for (let i = 0; i < 2; i++) {
      health = recordMemberSuccess(health);
      stats = recordMemberCall(stats, 150);
    }
    expect(health.state).toBe("healthy");
    expect(stats.callCount).toBe(13);
  });

  it("persists health state to disk and reloads", async () => {
    const tmpDir = path.join(os.tmpdir(), `health-persist-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    initProjectStateDir(tmpDir);

    const project = makeProject({ projectId: "proj-health-test" });
    await saveProject(project);

    let health = createInitialMemberHealth("agent-a");
    health = recordMemberFailure(health);
    health = recordMemberFailure(health);

    const state: ProjectState = {
      projectId: "proj-health-test",
      memberHealth: [health],
      activeSessions: 1,
      lastActivityAt: new Date().toISOString(),
    };

    await saveProjectState(state);
    const loaded = await loadProjectState("proj-health-test");

    expect(loaded).not.toBeNull();
    expect(loaded!.memberHealth).toHaveLength(1);
    expect(loaded!.memberHealth[0].state).toBe("degraded");
    expect(loaded!.memberHealth[0].consecutiveFailures).toBe(2);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

// ── Memory Sharing Pipeline ──────────────────────────────────────────────

describe("integration — memory sharing pipeline", () => {
  let tmpDir: string;
  const projectId = "proj-memory-pipeline";

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `memory-pipeline-${Date.now()}`);
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
    } catch {}
  });

  it("agent writes → shared pool → other agent reads in context", async () => {
    // Agent A writes a fact
    await withSharedProfileLock(projectId, (profile) => {
      const updated = upsertSharedEntry(profile, {
        category: "identity",
        key: "user_name",
        value: "Alice Chen",
        sourceAgentId: "agent-a",
      });
      return { profile: updated, result: null };
    });

    // Agent B reads the shared pool
    const profile = readSharedProfile(projectId);
    expect(profile.entries).toHaveLength(1);

    // Format for agent-b's prompt (excluding agent-b's own entries)
    const formatted = formatSharedProfileForPrompt(profile, 1500, "agent-b");
    expect(formatted).toContain("user_name");
    expect(formatted).toContain("Alice Chen");
    expect(formatted).toContain("@agent-a");
  });

  it("multiple agents contribute → merged shared pool", async () => {
    // Agent A shares identity
    await withSharedProfileLock(projectId, (profile) => {
      const updated = upsertSharedEntry(profile, {
        category: "identity",
        key: "user_name",
        value: "Bob",
        sourceAgentId: "agent-a",
      });
      return { profile: updated, result: null };
    });

    // Agent B shares preference
    await withSharedProfileLock(projectId, (profile) => {
      const updated = upsertSharedEntry(profile, {
        category: "preference",
        key: "language",
        value: "Chinese",
        sourceAgentId: "agent-b",
      });
      return { profile: updated, result: null };
    });

    // Agent C shares fact
    await withSharedProfileLock(projectId, (profile) => {
      const updated = upsertSharedEntry(profile, {
        category: "fact",
        key: "company",
        value: "Acme Corp",
        sourceAgentId: "agent-c",
      });
      return { profile: updated, result: null };
    });

    const profile = readSharedProfile(projectId);
    expect(profile.entries).toHaveLength(3);

    // All 3 categories should appear in formatted output
    const formatted = formatSharedProfileForPrompt(profile);
    expect(formatted).toContain("Identity");
    expect(formatted).toContain("Facts");
    expect(formatted).toContain("Preferences");
  });

  it("shared memory integrates with system prompt for read-shared mode", async () => {
    const project = makeProject({
      projectId,
      memory: { mode: "read-shared" },
    });

    // Write shared entry
    await withSharedProfileLock(projectId, (profile) => {
      const updated = upsertSharedEntry(profile, {
        category: "identity",
        key: "name",
        value: "Test User",
        sourceAgentId: "agent-a",
      });
      return { profile: updated, result: null };
    });

    // System prompt should mention shared memory tool
    const context = buildTeamContextBlock(project, "agent-b");
    expect(context).toContain("memory_share");
  });
});

// ── Project Lifecycle ────────────────────────────────────────────────────

describe("integration — project lifecycle", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `lifecycle-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    initProjectStateDir(tmpDir);
    resetAllAffinities();
    resetAllRouteTables();
  });

  afterEach(async () => {
    resetAllAffinities();
    resetAllRouteTables();
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("create → route → update members → route again", async () => {
    // 1. Create project
    const project = makeProject({ projectId: "proj-lifecycle" });
    await saveProject(project);

    // 2. Build routes and route a message
    const routes1 = buildRoutesFromMembers(
      project.members.filter((m) => m.id !== project.supervisorId),
    );
    setRouteTable(project.projectId, routes1);

    const result1 = routeMessage({
      message: "Customer Support question",
      project,
      peerId: "peer-1",
      healthMap: new Map(),
    });
    expect(result1).not.toBeNull();
    expect(result1!.agentId).toBe("agent-a");

    // 3. Update project: add new member
    const updatedProject = {
      ...project,
      memberIds: [...project.memberIds, "agent-c"],
      members: [...project.members, { id: "agent-c", name: "Carol", role: "Billing specialist" }],
      version: 2,
    };
    await saveProject(updatedProject);

    // 4. Rebuild routes
    const routes2 = buildRoutesFromMembers(
      updatedProject.members.filter((m) => m.id !== updatedProject.supervisorId),
    );
    setRouteTable(updatedProject.projectId, routes2);

    // 5. Route to new member
    const result2 = routeMessage({
      message: "I have a Billing question",
      project: updatedProject,
      peerId: "peer-2",
      healthMap: new Map(),
    });
    expect(result2).not.toBeNull();
    expect(result2!.agentId).toBe("agent-c");
  });

  it("delete project cleans up affinities", async () => {
    const project = makeProject({ projectId: "proj-cleanup" });
    await saveProject(project);

    // Set some affinities
    setAffinity("proj-cleanup", "peer-1", "agent-a");
    setAffinity("proj-cleanup", "peer-2", "agent-b");
    expect(getAffinity("proj-cleanup", "peer-1")).not.toBeNull();

    // Delete project
    await deleteProject("proj-cleanup");
    clearProjectAffinities("proj-cleanup");

    // Affinities should be gone
    expect(getAffinity("proj-cleanup", "peer-1")).toBeNull();
    expect(getAffinity("proj-cleanup", "peer-2")).toBeNull();
  });
});

// ── Visibility + Routing Integration ─────────────────────────────────────

describe("integration — visibility modes end-to-end", () => {
  it("unified mode: routing + rewrite produces seamless experience", () => {
    const project = makeProject({
      visibility: { mode: "unified", displayName: "AI Helper" },
    });

    // Supervisor context hides team structure
    const supervisorCtx = buildTeamContextBlock(project, "supervisor");
    expect(supervisorCtx).toContain("AI Helper");
    expect(supervisorCtx).toContain("Never reveal");

    // Member context also uses unified persona
    const memberCtx = buildTeamContextBlock(project, "agent-a");
    expect(memberCtx).toContain("AI Helper");

    // Outbound rewrite: no prefix in unified mode
    const result = rewriteOutboundMessage({
      content: "Here's your answer",
      project,
      agentId: "agent-a",
    });
    expect(result.content).toBe("Here's your answer");
  });

  it("transparent mode: routing + rewrite shows agent identity", () => {
    const project = makeProject({
      visibility: { mode: "transparent" },
    });

    // Member context shows individual identity
    const memberCtx = buildTeamContextBlock(project, "agent-a");
    expect(memberCtx).toContain("Alice");

    // Outbound rewrite: prefixed with [@AgentName]
    const result = rewriteOutboundMessage({
      content: "Here's your answer",
      project,
      agentId: "agent-a",
    });
    expect(result.content).toBe("[@Alice] Here's your answer");
  });

  it("team mode with displayName: routing + rewrite shows team brand", () => {
    const project = makeProject({
      visibility: { mode: "team", displayName: "TechBot" },
    });

    const result = rewriteOutboundMessage({
      content: "Here's your answer",
      project,
      agentId: "agent-a",
    });
    expect(result.content).toBe("[TechBot] Here's your answer");
  });
});

// ── SOUL + Context Consistency ───────────────────────────────────────────

describe("integration — SOUL and context consistency", () => {
  it("SOUL routing table matches system prompt routing table", () => {
    const project = makeProject();
    const nonSupervisorMembers = project.members.filter((m) => m.id !== project.supervisorId);

    const soul = generateSupervisorSoul(project, nonSupervisorMembers);
    const context = buildTeamContextBlock(project, "supervisor");

    // Both should contain the same member info
    for (const m of nonSupervisorMembers) {
      expect(soul).toContain(m.name);
      expect(context).toContain(m.name);
    }
  });

  it("constraints appear in both SOUL and system prompt", () => {
    const project = makeProject({
      constraints: {
        brandRules: {
          userAddress: "Dear Customer",
          forbidden: ["competitor"],
          safetyRules: ["Never share pricing"],
        },
      },
    });

    const soul = generateSupervisorSoul(
      project,
      project.members.filter((m) => m.id !== project.supervisorId),
    );
    const supervisorCtx = buildTeamContextBlock(project, "supervisor");
    const memberCtx = buildTeamContextBlock(project, "agent-a");

    // Constraints in SOUL
    expect(soul).toContain("Dear Customer");
    expect(soul).toContain("competitor");

    // Constraints in supervisor context
    expect(supervisorCtx).toContain("Dear Customer");

    // Constraints in member context
    expect(memberCtx).toContain("Dear Customer");
  });
});

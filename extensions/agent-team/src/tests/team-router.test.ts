/**
 * Agent Team Router Tests — keyword-router, fast-path-router, visibility-rewriter
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  routeMessage,
  setRouteTable,
  clearRouteTable,
  resetAllRouteTables,
} from "../fast-path-router.js";
import {
  matchKeywordRoute,
  extractKeywordsFromRole,
  buildRoutesFromMembers,
} from "../keyword-router.js";
import { createInitialMemberHealth } from "../member-health.js";
import { setAffinity, resetAllAffinities } from "../session-affinity.js";
import type { Project, MemberHealth, KeywordRoute } from "../types.js";
import { rewriteOutboundMessage } from "../visibility-rewriter.js";

// ── Test Helpers ─────────────────────────────────────────────────────────

function makeProject(overrides?: Partial<Project>): Project {
  return {
    projectId: "proj-test-001",
    name: "Test Team",
    description: "A test team",
    status: "active",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    supervisorId: "supervisor",
    memberIds: ["supervisor", "coder", "writer"],
    members: [
      { id: "supervisor", name: "Supervisor", role: "Team supervisor" },
      { id: "coder", name: "Coder", role: "编程 代码 软件开发" },
      { id: "writer", name: "Writer", role: "写作 文案 翻译" },
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
    ...overrides,
  };
}

function makeHealthMap(memberIds: string[]): Map<string, MemberHealth> {
  const map = new Map<string, MemberHealth>();
  for (const id of memberIds) {
    map.set(id, createInitialMemberHealth(id));
  }
  return map;
}

// ── Keyword Router ───────────────────────────────────────────────────────

describe("keyword-router", () => {
  describe("matchKeywordRoute", () => {
    it("returns null for empty message", () => {
      const routes: KeywordRoute[] = [{ pattern: "hello", agentId: "a1" }];
      expect(matchKeywordRoute("", routes)).toBeNull();
    });

    it("returns null for empty routes", () => {
      expect(matchKeywordRoute("hello", [])).toBeNull();
    });

    it("matches exact keyword", () => {
      const routes: KeywordRoute[] = [{ pattern: "编程", agentId: "coder" }];
      const result = matchKeywordRoute("帮我编程", routes);
      expect(result).not.toBeNull();
      expect(result!.agentId).toBe("coder");
    });

    it("matches case-insensitively", () => {
      const routes: KeywordRoute[] = [{ pattern: "Hello", agentId: "a1" }];
      const result = matchKeywordRoute("say hello world", routes);
      expect(result).not.toBeNull();
      expect(result!.agentId).toBe("a1");
    });

    it("selects higher priority (lower number)", () => {
      const routes: KeywordRoute[] = [
        { pattern: "code", agentId: "a1", priority: 50 },
        { pattern: "code", agentId: "a2", priority: 10 },
      ];
      const result = matchKeywordRoute("help me code", routes);
      expect(result!.agentId).toBe("a2");
    });

    it("returns null for no match", () => {
      const routes: KeywordRoute[] = [{ pattern: "xyz", agentId: "a1" }];
      expect(matchKeywordRoute("hello world", routes)).toBeNull();
    });
  });

  describe("extractKeywordsFromRole", () => {
    it("extracts Chinese keywords", () => {
      const keywords = extractKeywordsFromRole("编程 代码 软件开发");
      expect(keywords).toContain("编程");
      expect(keywords).toContain("代码");
      expect(keywords).toContain("软件开发");
    });

    it("filters stop words", () => {
      const keywords = extractKeywordsFromRole("负责 管理 处理 代码");
      // "负责", "管理", "处理" are stop words, "代码" remains
      expect(keywords).toContain("代码");
      expect(keywords).not.toContain("负责");
    });

    it("returns empty for empty input", () => {
      expect(extractKeywordsFromRole("")).toEqual([]);
    });

    it("deduplicates keywords", () => {
      const keywords = extractKeywordsFromRole("代码、代码、编程");
      expect(keywords.filter((k) => k === "代码")).toHaveLength(1);
    });

    it("splits CJK-Latin boundaries", () => {
      const keywords = extractKeywordsFromRole("负责customer服务");
      expect(keywords).toContain("customer");
    });
  });

  describe("buildRoutesFromMembers", () => {
    it("builds routes from member names and roles", () => {
      const members = [
        { id: "coder", name: "Coder", role: "编程 代码" },
        { id: "writer", name: "Writer", role: "写作 文案" },
      ];
      const routes = buildRoutesFromMembers(members);
      expect(routes.length).toBeGreaterThan(0);

      // Name routes have priority 10
      const nameRoute = routes.find((r) => r.pattern === "Coder");
      expect(nameRoute).toBeDefined();
      expect(nameRoute!.priority).toBe(10);

      // Role keyword routes have priority 50
      const roleRoute = routes.find((r) => r.pattern === "编程");
      expect(roleRoute).toBeDefined();
      expect(roleRoute!.priority).toBe(50);
    });

    it("includes pre-defined keywords at priority 30", () => {
      const members = [
        { id: "a1", name: "Agent", role: "support", keywords: ["billing", "refund"] },
      ];
      const routes = buildRoutesFromMembers(members);
      const kwRoute = routes.find((r) => r.pattern === "billing");
      expect(kwRoute).toBeDefined();
      expect(kwRoute!.priority).toBe(30);
    });
  });
});

// ── Fast Path Router ─────────────────────────────────────────────────────

describe("fast-path-router", () => {
  beforeEach(() => {
    resetAllRouteTables();
    resetAllAffinities();
  });

  it("returns null for empty message", () => {
    const project = makeProject();
    const healthMap = makeHealthMap(project.memberIds);
    const result = routeMessage({
      message: "  ",
      project,
      peerId: "user1",
      healthMap,
    });
    expect(result).toBeNull();
  });

  it("routes via keyword match", () => {
    const project = makeProject();
    const routes = buildRoutesFromMembers(project.members.filter((m) => m.id !== "supervisor"));
    setRouteTable(project.projectId, routes);
    const healthMap = makeHealthMap(project.memberIds);

    const result = routeMessage({
      message: "帮我写一段代码",
      project,
      peerId: "user1",
      healthMap,
    });

    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("coder");
    expect(result!.method).toBe("keyword");
  });

  it("routes via session affinity when set", () => {
    const project = makeProject({
      coordination: {
        ...makeProject().coordination,
        fastPath: {
          sessionAffinityEnabled: true,
          affinityTimeoutMinutes: 30,
          keywordConfidenceThreshold: 0.15,
        },
      },
    });
    const healthMap = makeHealthMap(project.memberIds);

    // Set affinity
    setAffinity(project.projectId, "user1", "writer");

    const result = routeMessage({
      message: "随便什么消息",
      project,
      peerId: "user1",
      healthMap,
    });

    expect(result).not.toBeNull();
    expect(result!.agentId).toBe("writer");
    expect(result!.method).toBe("affinity");
  });

  it("returns null when no routable members", () => {
    const project = makeProject({
      memberIds: ["supervisor"],
      members: [{ id: "supervisor", name: "Supervisor", role: "supervisor" }],
    });
    const healthMap = makeHealthMap(project.memberIds);

    const result = routeMessage({
      message: "hello",
      project,
      peerId: "user1",
      healthMap,
    });

    expect(result).toBeNull();
  });

  it("skips down agents", () => {
    const project = makeProject();
    const routes = buildRoutesFromMembers(project.members.filter((m) => m.id !== "supervisor"));
    setRouteTable(project.projectId, routes);
    const healthMap = makeHealthMap(project.memberIds);

    // Mark coder as down
    const coderHealth = healthMap.get("coder")!;
    healthMap.set("coder", { ...coderHealth, state: "down" });

    const result = routeMessage({
      message: "帮我写代码",
      project,
      peerId: "user1",
      healthMap,
    });

    // Should not route to downed coder
    if (result) {
      expect(result.agentId).not.toBe("coder");
    }
  });
});

// ── Visibility Rewriter ──────────────────────────────────────────────────

describe("visibility-rewriter", () => {
  it("unified mode: pass-through", () => {
    const project = makeProject({ visibility: { mode: "unified" } });
    const result = rewriteOutboundMessage({
      content: "Hello!",
      project,
      agentId: "coder",
    });
    expect(result.content).toBe("Hello!");
  });

  it("transparent mode: prefix with @name", () => {
    const project = makeProject({ visibility: { mode: "transparent" } });
    const result = rewriteOutboundMessage({
      content: "Hello!",
      project,
      agentId: "coder",
    });
    expect(result.content).toBe("[@Coder] Hello!");
  });

  it("team mode with displayName: prefix", () => {
    const project = makeProject({
      visibility: { mode: "team", displayName: "MyBot" },
    });
    const result = rewriteOutboundMessage({
      content: "Hello!",
      project,
      agentId: "coder",
    });
    expect(result.content).toBe("[MyBot] Hello!");
  });

  it("team mode without displayName: no prefix", () => {
    const project = makeProject({ visibility: { mode: "team" } });
    const result = rewriteOutboundMessage({
      content: "Hello!",
      project,
      agentId: "coder",
    });
    expect(result.content).toBe("Hello!");
  });

  it("empty content: pass-through", () => {
    const project = makeProject({ visibility: { mode: "transparent" } });
    const result = rewriteOutboundMessage({
      content: "",
      project,
      agentId: "coder",
    });
    expect(result.content).toBe("");
  });
});
